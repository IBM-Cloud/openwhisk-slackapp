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

function main(args) {
  console.log('Processing new bot command from Slack', args);

  // avoid calls from unknown
  if (args.token !== args.slackVerificationToken) {
    return {
      statusCode: 401
    }
  }

  // connect to the Cloudant database
  var cloudant = require('@cloudant/cloudant')({url: args.cloudantUrl});
  var botsDb = cloudant.use(args.cloudantDb);

  // the command to process
  var command = {
    team_id: args.team_id,
    user_id: args.user_id,
    // the response url could be used to send the response later as part of another
    // action in the case we need to do more processing before being able to reply.
    response_url: args.response_url,
    text: args.text
  };

  return new Promise(function(resolve, reject) {
    async.waterfall([
      // find the token for this bot
      function (callback) {
          console.log('Looking up bot info for team', command.team_id);
          botsDb.view('bots', 'by_team_id', {
            keys: [command.team_id],
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
          console.log('Looking up user info for user', command.user_id);
          usersInfo(registration.access_token, command.user_id, function (err, user) {
            callback(err, registration, user);
          });
      },
      // reply to the message
      function (registration, user, callback) {
        callback(null, `Hey ${user.real_name}, you said ${command.text}`);
      }],
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
