/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the “License”);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an “AS IS” BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Dependencies
let request = require('request');
let Conversation = require('watson-developer-cloud/conversation/v1');
let redis = require('redis');

// Services
var conversation;
var redisClient;
var usersDb;

// Data
var context = {};
// output
var response = {
    headers: {
        'Content-Type': 'application/json'
    },
    statusCode: 500,
    body: {
        version: "1",
        response: [],
        context: context
    }
};
//input
/**
 * {
 *  // to retrieve context from db
 *  filter: 'by_id',
 *  value: 'id',
 *  // contextual informations to add to the request
 *  context: {},
 *  text: 'input_text'
 * }
 */

/**
 * Initialize services : Watson Conversation, Compose Redis, Cloudant NoSQL
 * @param args request arguments
 */
function initServices(args) {
    conversation = new Conversation({
        'username': args.CONVERSATION_USERNAME,
        'password': args.CONVERSATION_PASSWORD,
        'version_date': '2017-05-26',
        'url' : args.CONVERSATION_API_URL
    });
    console.log("Watson Conversation connected.");

    redisClient = redis.createClient(args.REDIS_URI);
    console.log("Redis Connected.");

    // connect to the Cloudant database
    var cloudant = require('cloudant')({url: args.CLOUDANT_URL});
    console.log("Cloudant connected.");

    usersDb = cloudant.use(args.USERS_DB);
    console.log("UsersDb connected.");
}

/**
 * Retrieve context from Redis and Cloudant DB
 */
function getContext(filter, value, persisted_attr, input) {
    return getUserDocument(filter, value)
        .then(doc => getSessionContext(doc, persisted_attr, input));
}

/**
 * Persist context from Redis and Cloudant DB
 */
function setContext(doc, persisted_attr) {
    return setSessionContext(doc)
        .then(() => setUserDocument(doc, persisted_attr));
}

function getUserDocument(filter, value) {
    console.log("Getting user document from Cloudant (",key,",",value,")");
    return new Promise(function(resolve, reject) {
        getSavedContextRows(filter, value)
            .then(rows => {
                if (rows && rows.length > 0) {
                    resolve(rows[0].doc);
                } else {
                    usersDb.insert({
                        type: 'user-context',
                        context: {}
                    }, function (err, doc) {
                        if (doc) {
                            resolve(doc);
                        } else {
                            console.log(err);
                            reject("Error creating document.");
                        }
                    });
                }
            });
    });
}

function getSessionContext(doc, persisted_attr, input) {
    console.log("Getting context from Redis (", doc._id, ")");
    return new Promise(function(resolve, reject) {
        // Cached context
        redisClient.get(doc._id, function(err, value) {
            if (err) {
                console.error(err);
                reject("Error getting context from Redis.");
            } else {
                console.log("retrieved context (redis): ",value);
                console.log("properties from cloudant: ");
                context = value ? JSON.parse(value) : {};
                var ctx = doc.context ? doc.context : {};
                // Persisted context
                persisted_attr.forEach(attr => {
                    if (ctx[attr]) {
                        context[attr] = ctx[attr];
                        console.log(attr,": ",ctx[attr]);
                    }
                });
                console.log("properties from input: ");
                // Request context
                for (var attr in input) {
                    if (input.hasOwnProperty(attr)) {
                        context[attr] = input[attr];
                        console.log(attr,": ",input[attr]);
                    }
                }
                resolve(doc);
            }
        });
    });
}

function setSessionContext(doc) {
    console.log("Setting context to Redis (",doc._id,")");
    return new Promise(function(resolve, reject) {
        if (context) {
            const newContextString = JSON.stringify(context);
            // Saved context will expire in 600 secs.
            redisClient.set(doc._id, newContextString, 'EX', 600);
            console.log('saved context (redis): ', newContextString);
        }
        resolve();
    });
}

function setUserDocument(doc, persisted_attr) {
    console.log("Saving new context to Cloudant (",doc._id,")");
    return new Promise(function(resolve,reject) {
        // Context to save : which attributes to persist in long term database
        var cts = {};
        persisted_attr.forEach(attr => {
            if (context[attr])
                cts[attr] = context[attr];
        });
        // Persist it in database
        usersDb.insert({
            _id: doc._id,
            _rev: doc._rev,
            type: 'user-context',
            context: cts
        }, function (err, user) {
            if (user) {
                console.log("Context persisted into Cloudant DB.");
                resolve(user);
            } else {
                console.log(err);
                reject("Error saving User.");
            }
        });
    });
}

function askWatson(input_text, args) {
    // Input data 
    var payload = {
        workspace_id: context.WORKSPACE_ID || args.WORKSPACE_ID,
        context: context,
        input: {
            'text': input_text
        }
    };
    // Asking Watson
    return new Promise(function (resolve, reject) {
        conversation.message(payload, function(err, output) {
            if (err) {
                console.log(err);
                reject("Error asking Watson.");
            } else {
                resolve(output);
            }
        });
    });
}

function watsonResponse(watsonsaid) {
    response.statusCode = 200;
    response.body.response = watsonsaid;
    response.body.context = context;
    return response;
}

function interpretWatson(data, args) {
    return new Promise(function(resolve, reject) {
        var watsonsaid = [];
        if (data.output && data.output.text)
            watsonsaid = data.output.text;
        if (data.context)
            context = data.context;
        // Execute OW action if needed
        if (context.action) {
            var options = {
                url: args.CF_API_BASE+context.action,
                body: {
                    context: context
                },
                headers: {'Content-Type': 'application/json'},
                json: true
            };
            console.log("Action ", context.action, ": ", options.url);
            function owCallback(err, response, body) {
                if (err) {
                    console.log("Error calling action: ", err);
                } 
                else if (response.statusCode < 200 || response.statusCode >= 300) {
                    console.log("CF action call failed: ", context.action, " ", response.statusCode);
                } 
                else {
                    console.log("CF action call sucess: ", context.action);
                }
                // After execution, delete action instruction to avoid persisting it
                delete context.action;
                resolve(watsonsaid);
            }
            request.post(options, owCallback); 
        } else {
            resolve(watsonsaid);
        }
    });
}

// What to do when action is triggered
function main(args) {
    if (args.value && args.context && args.text) {
        if (!args.filter) args.filter = 'by_id';
        console.log("new converse request: ", args.text);
        // Connect to services
        initServices(args);
        // Get persisted attributes
        const persisted_attr = JSON.parse(args.PERSISTED_ATTR);
        // Process request
        return getContext(args.filter,args.value,persisted_attr,args.context)
        .then(doc => askWatson(args.text,args))
        .then(output => interpretWatson(output,args))
        .then(watsonsaid => watsonResponse(watsonsaid))
        .then(response => setContext(doc,persisted_attr))
        .catch( err => {
            console.error('Error: ', err);
            return response;
        });
    } else {
        response.statusCode = 400;
        return response;
    }
}