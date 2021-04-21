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
var async = require('async');
var request = require('request');

/**
 * Gets the details of a given user through the Slack Web API
 *
 * @param accessToken - authorization token
 * @param userId - the id of the user to retrieve info from
 * @param callback - function(err, user)
 */
function usersInfo(accessToken, userId, callback) {
  request({
    url: 'https://slack.com/api/users.info',
    method: 'POST',
    form: {
      token: accessToken,
      user: userId
    },
    json: true
  }, function (err, response, body) {
    if (err) {
      callback(err);
    } else if (body && body.ok) {
      callback(null, body.user);
    } else if (body && !body.ok) {
      callback(body.error);
    } else {
      callback('unknown response');
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
  console.log('Sending message');
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

function main(args) {
  console.log('Processing new bot event from Slack', args);

  // avoid calls from unknown
  if (args.token !== args.slackVerificationToken) {
    return {
      statusCode: 401
    }
  }
  
  // handle the registration of the Event Subscription callback
  // Slack will send us an initial POST
  // https://api.slack.com/events/url_verification
  if (args.__ow_method === 'post' &&
      args.type === 'url_verification' &&
      args.token === args.slackVerificationToken &&
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

  // connect to the Cloudant database
  var cloudant = require('@cloudant/cloudant')({
    url: args.cloudantUrl,
    plugins: {
      iamauth: {
        iamApiKey: args.cloudantApiKey
      }
    }
  });
  var botsDb = cloudant.use(args.cloudantDb);

  // ignore response from the bot
  if (args.event.bot_id) {
    console.log('Ignoring incoming bot message');
    return {
      body: "ignored"
    };
  }

  // get the event to process
  var event = {
    team_id: args.team_id,
    event: args.event
  };

  return new Promise(function(resolve, reject) {
    async.waterfall([
      // find the token for this bot
      function (callback) {
          console.log('Looking up bot info for team', event.team_id);
          botsDb.view('bots', 'by_team_id', {
            keys: [event.team_id],
            limit: 1,
            include_docs: true
          }, function (err, body) {
            if (err) {
              callback(err);
            } else if (body.rows && body.rows.length > 0) {
              callback(null, body.rows[0].doc.registration)
            } else {
              callback('team not found');
            }
          });
      },
      // grab info about the user
      function (registration, callback) {
          console.log('Looking up user info for user', event.event.user);
          usersInfo(registration.access_token, event.event.user, function (err, user) {
            callback(err, registration, user);
          });
      },
      // reply to the message
      function (registration, user, callback) {
          console.log('Processing message from', user);
          if (event.event.type === 'message') {
            postMessage(registration.access_token, event.event.channel,
              `Hey ${user.real_name}, you said ${event.event.text}`,
              function (err, result) {
                callback(err);
              });
          } else {
            callback(null);
          }
        }
      ],
      function (err, response) {
        if (err) {
          console.log('Error', err);
          reject({
            body: err
          });
        } else {
          resolve({
            body: response
          });
        }
      }
    );
  });
}
