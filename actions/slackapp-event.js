/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
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
var request = require('request');
var Conversation = require('watson-developer-cloud/conversation/v1'); // watson sdk
var redis = require('redis');

var conversation;
var redisClient;
var context = {};
var botsDb;
var usersDb;
var registration;

function initServices(args) {
  // connect to the Cloudant database
  var cloudant = require('cloudant')({url: args.CLOUDANT_URL});
  console.log("Cloudant connected.");
  
  botsDb = cloudant.use(args.REGISTRATIONS_DB);
  console.log("BotsDb connected.");

  usersDb = cloudant.use(args.USERS_DB);
  console.log("UsersDb connected.");

  redisClient = redis.createClient(args.REDIS_URL);
  console.log("Redis connected.");

  conversation = new Conversation({
    'username': args.CONVERSATION_USERNAME,
    'password': args.CONVERSATION_PASSWORD,
    'version_date': '2017-05-26',
    'url' : 'https://gateway-fra.watsonplatform.net/conversation/api'
  });
  console.log("Watson Conversation connected.");
}

function getBotInfos(event) {
  console.log('Looking up bot info for team ', event.team_id);
  return new Promise(function(resolve,reject) {
    botsDb.view('bots', 'by_team_id', {
      keys: [event.team_id],
      limit: 1,
      include_docs: true
    }, function (err, body) {
      if (body.rows && body.rows.length > 0) {
        registration = body.rows[0].doc.registration;
        resolve();
      }
      if (err) {
        console.log('Error getBotInfos: ', err);
      }
      reject("Unable to get bot infos from Cloudant.");
    });
  });
}

/**
 * Gets the details of a given user through the Slack Web API
 *
 * @param accessToken - authorization token
 * @param userId - the id of the user to retrieve info from
 */
function getSlackUser(accessToken, userId) {
  return new Promise(function(resolve,reject) {
    request({
      url: 'https://slack.com/api/users.info',
      method: 'POST',
      form: {
        token: accessToken,
        user: userId
      },
      json: true
    }, function (err, response, body) {
      if (body && body.ok) {
        resolve(body.user);
      } else {
        if (err) {
          console.log('Error getSlackUser: ', err);
        }
        if (body && !body.ok) {
          console.log('Error getSlackUser: ', body.error);
        }
        reject("Unable to get Slack user.");
      }
    });
  });
}

function getUserContext(userId) {
  console.log('get context for user: ', userId);
  return new Promise(function(resolve, reject) {
      if (userId)
        redisClient.get(userId, function(err, value) {
          if (err) {
            console.error(err);
            reject('Error getting context from Redis.');
          } else {
            // if we found a context into redis db
            if (value) {
              context = JSON.parse(value);
              console.log('retrieved context (redis): ', value);
              resolve();
            } // else we try to find a persisted context into Cloudant db 
            else {
              getSavedContextRows(userId)
                .then(rows => {
                  context = (
                    rows && rows.length > 0 && rows[0].doc.context
                  ) ? rows[0].doc.context : {};
                  console.log('retrieved context (cloudant): ', JSON.stringify(context));
                  resolve();
                })
                .catch(err => reject(err));
            }
          }
        });
      else
        reject("This is not an user.");
  });
}

function setUserContext(userId, args) {
  console.log('set context for user: ', userId);
  // Save the context in Redis. Can do this after resolve(response).
  if (context && userId) {
      const newContextString = JSON.stringify(context);
      // Saved context will expire in 600 secs.
      redisClient.set(userId, newContextString, 'EX', 600);
      console.log('saved context in Redis: ', newContextString);
      // Persist some attributes into a long term database
      return getSavedContextRows(userId) 
        .then(rows => deleteSavedContext(rows))
        .then(() => saveContext(userId, args))
        .catch(err => {
          console.log('Error while persisting context into Cloudant: ', err);
        });
  }
}

function getSavedContextRows(userId) {
  console.log("Getting previous context from Cloudant...");
  return new Promise(function(resolve,reject) {
    usersDb.view('users', 'by_id', {
      keys: [userId],
      include_docs: true
    }, function (err, body) {
      if (err) {
        reject(err);
      } else {
        resolve(body.rows);
      }
    });
  });
}

function deleteSavedContext(rows) {
  console.log("Deleting previous context from Cloudant...");
  return new Promise(function(resolve,reject) {
    var toBeDeleted = {
      docs: rows.map(function (row) {
        return {
          _id: row.doc._id,
          _rev: row.doc._rev,
          _deleted: true
        }
      })
    };
    if (rows.length > 0) {
      usersDb.bulk(toBeDeleted, function (err, result) {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

function saveContext(userId, args) {
  console.log("Saving new context to Cloudant...");
  return new Promise(function(resolve,reject) {
    // Context to save : which attributes to persist in long term database
    var cts = {};
    const persist_attr = JSON.parse(args.PERSISTED_ATTR);
    persist_attr.forEach(attr => {
      if (context[attr])
        cts[attr] = context[attr];
    });
    // Persist it in database
    usersDb.insert({
      _id: userId,
      type: 'user-context',
      context: cts
    }, function (err, user) {
      if (user) {
        console.log("Context persisted into Cloudant DB.");
        resolve(user);
      } else {
        reject(err);
      }
    });
  });
}

function processSlackEvent(event, user, args) {
  console.log('Processing message from ', user.name);
  return new Promise(function(resolve, reject) {
    if (event.event.type === 'message' || event.event.type === 'app_mention') {
      if (event.event.type === 'app_mention') {
        event.event.text = event.event.text.replace(/<\/?[^>]+(>|$)/g, "");
      }
      // Save context informations
      if (user.profile && user.profile.first_name) context.first_name = user.profile.first_name;
      if (user.profile && user.profile.last_name) context.last_name = user.profile.last_name;
      if (user.name) context.username = user.name;
      if (user.is_admin) context.is_admin = user.is_admin;
      // Input data 
      var payload = {
        workspace_id: args.CONVERSATION_WORKSPACE_ID,
        context: context,
        input: {
          'text': event.event.text
        }
      };
      // Send the input to the conversation service
      conversation.message(payload, function(err, data) {
        if (err) {
          console.log('Error conversation: ', err);
          reject("Error calling conversation service.");
        } else {
          // Default answer
          var response = [`Je n'ai pas compris votre demande...`];
          // Watson Conversation answer
          if (data.output && data.output.text) {
            response = data.output.text;
          }
          // Check confidence
          if (data.intents && data.intents[0]) {
            var intent = data.intents[0];
            if (intent.confidence < 0.5)
              response = ['Je ne suis pas sûr d\'avoir saisi le sens de votre message...'];
            else
              context = data.context;
          }
          resolve(response);
        }
      });
    } else {
      reject("Bot wasn't properly called");
    }
  });
}

/**
 * Posts a message to a channel with Slack Web API
 *
 * @param accessToken - authorization token
 * @param channel - the channel to post to
 * @param text - the text to post
 * @param callback - function(err, responsebody)
 */
function postMessage(accessToken, channel, text, callback) {
  return new Promise(function(resolve, reject) {
    request({
      url: 'https://slack.com/api/chat.postMessage',
      method: 'POST',
      form: {
        token: accessToken,
        channel: channel,
        text: text
      }
    }, function (error, response, body) {
      if (error)
        reject(error);
      else
        resolve(body);
    });
  });
}

function postResponseArray(response, event) {
  return new Promise(function(resolve, reject) {
    response.reverse();
    response.forEach(text => {
      if (event.event.type === 'app_mention' && event.event.user)
        text = '<@'+event.event.user+'> '+text;
      if (text != '')
        postMessage(registration.bot.bot_access_token, event.event.channel,text)
          .catch(err => {
            console.log('Error postSlackMessage: ', err);
            reject("Did not end postResponseArray");
          });
    });
    resolve();
  });
}

function main(args) {
  console.log('Processing new bot event from Slack : ', args.event.type);

  // avoid calls from unknown
  if (args.token !== args.SLACK_VERIFICATION_TOKEN) {
    console.log('Unauthorized (token not verified).');
    return {
      statusCode: 401
    }
  }

  if (!args.event.user) {
    console.log('Forbidden (not an user).');
    return {
      statusCode: 403
    }
  }
  
  // handle the registration of the Event Subscription callback
  // Slack will send us an initial POST
  // https://api.slack.com/events/url_verification
  if (args.__ow_method === 'post' &&
      args.type === 'url_verification' &&
      args.challenge) {
    console.log('URL verification from Slack');
    return {
      headers: {
        'Content-Type': 'application/json'
      },
      body: new Buffer(JSON.stringify({
        challenge: args.challenge
      })).toString('base64'),
    };
  }

  // initialize cloud services : Watson, Redis, Cloudant
  initServices(args);

  // get the event to process
  var event = {
    team_id: args.team_id,
    event: args.event
  };

  return getBotInfos(event)
    .then(() => getUserContext(event.event.user))
    .then(() => getSlackUser(registration.bot.bot_access_token, event.event.user))
    .then(user => processSlackEvent(event, user, args))
    .then(response => postResponseArray(response, event))
    .then(() => setUserContext(event.event.user, args))
    .then(() => {
      console.log('Event processed.');
      return {
        statusCode: 200
      }
    })
    .catch(err => {
      console.log('Error: ',err);
      return {
        statusCode: 500
      };
    });

}
