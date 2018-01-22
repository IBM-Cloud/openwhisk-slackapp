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
var registration;

function initServices(args) {
  // connect to the Cloudant database
  var cloudant = require('cloudant')({url: args.CLOUDANT_URL});
  console.log("Cloudant connected.");
  
  botsDb = cloudant.use(args.REGISTRATIONS_DB);
  console.log("BotsDb connected.");

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
      }
      if (err) {
        console.log('Error getSlackUser: ', err);
      } else if (body && !body.ok) {
        console.log('Error getSlackUser: ', body.error);
      }
      reject("Unable to get Slack user.");
    });
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
  request({
    url: 'https://slack.com/api/chat.postMessage',
    method: 'POST',
    form: {
      token: accessToken,
      channel: channel,
      text: text
    }
  }, function (error, response, body) {
    callback(error, body);
  });
}

function postResponseArray(response, event) {
  return new Promise(function(resolve, reject) {
    response.reverse();
    response.forEach(text => {
      if (text != '')
        postMessage(registration.bot.bot_access_token, event.event.channel,
          text,
          function (err, result) {
            console.log('Error postSlackMessage: ', err);
            reject("Did not end postResponseArray");
          }
        );
    });
    resolve();
  });
}

function processSlackEvent(event, user, args) {
  console.log('Processing message from ', user.name);
  return new Promise(function(resolve, reject) {
    if (event.event.type === 'message' || event.event.type === 'app_mention') {
      if (event.event.type === 'app_mention') {
        event.event.text = event.event.text.replace(/<\/?[^>]+(>|$)/g, "");
      }
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
        }
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
        }
        resolve(response);
      });
    } else {
      reject("Bot wasn't properly called");
    }
  });
}

function main(args) {
  console.log('Processing new bot event from Slack');

  // avoid calls from unknown
  if (args.token !== args.SLACK_VERIFICATION_TOKEN) {
    return {
      statusCode: 401
    }
  }
  
  // handle the registration of the Event Subscription callback
  // Slack will send us an initial POST
  // https://api.slack.com/events/url_verification
  if (args.__ow_method === 'post' &&
      args.type === 'url_verification' &&
      args.token === args.SLACK_VERIFICATION_TOKEN &&
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

  initServices(args);

  // get the event to process
  var event = {
    team_id: args.team_id,
    event: args.event
  };

  return getBotInfos(event)
    .then(() => getSlackUser(registration.bot.bot_access_token, event.event.user))
    .then(user => processSlackEvent(event, user, args))
    .then(response => postResponseArray(response, event))
    .then(() => {
      return {
        statusCode: 200
      }
    })
    .catch(err => {
      console.log('Error: ',err);
      reject({
        statusCode: 500
      });
    });

}
