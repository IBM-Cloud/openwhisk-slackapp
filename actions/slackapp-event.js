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
var async = require("async");
var request = require("request");

/**
 * Gets the details of a given user through the Slack Web API
 *
 * @param accessToken - authorization token
 * @param userId - the id of the user to retrieve info from
 * @param callback - function(err, user)
 */
function usersInfo(accessToken, userId, callback) {
  request({
    url: "https://slack.com/api/users.info",
    method: "POST",
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
      callback("unknown response");
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
  request({
    url: "https://slack.com/api/chat.postMessage",
    method: "POST",
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
  console.log("Processing new bot event from Slack", args);

  // connect to the Cloudant database
  var nano = require("nano")(args.cloudantUrl);
  var botsDb = nano.use(args.cloudantDb);

  // get the event to process
  var event = args.event;

  async.waterfall([
    // find the token for this bot
    function (callback) {
        console.log("Looking up bot info for team", event.team_id);
        botsDb.view("bots", "by_team_id", {
          keys: [event.team_id],
          limit: 1,
          include_docs: true
        }, function (err, body) {
          if (err) {
            callback(err);
          } else if (body.rows && body.rows.length > 0) {
            callback(null, body.rows[0].doc.registration)
          } else {
            callback("team not found");
          }
        });
    },
    // grab info about the user
    function (registration, callback) {
        console.log("Looking up user info for user", event.event.user);
        usersInfo(registration.bot.bot_access_token, event.event.user, function (err, user) {
          callback(err, registration, user);
        });
    },
    // reply to the message
    function (registration, user, callback) {
        console.log("Processing message from", user.name);
        if (event.event.type === "message") {
          postMessage(registration.bot.bot_access_token, event.event.channel,
            "Hey " + user.real_name + ", you said " + event.event.text,
            function (err, result) {
              callback(err);
            });
        } else {
          callback(null);
        }
      }
    ],
    function (err, result) {
      if (err) {
        console.log("Error", err);
        whisk.error(err);
      } else {
        whisk.done({
          status: "Registered"
        }, null);
      }
    });

  return whisk.async();
}
