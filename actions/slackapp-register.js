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

function main(args) {
  console.log("Registering new bot from Slack");
  console.log(args);

  // connect to the Cloudant database
  var nano = require("nano")(args.cloudantUrl);
  var botsDb = nano.use(args.cloudantDb);

  async.waterfall([
    // find previous registrations for this team
    function (callback) {
      console.log("Looking for previous registrations for the team", args.registration.team_id);
      botsDb.view("bots", "by_team_id", {
        keys: [args.registration.team_id],
        include_docs: true
      }, function (err, body) {
        if (err) {
          callback(err);
        } else {
          callback(null, body.rows);
        }
      });
    },
    // delete them all
    function (rows, callback) {
      console.log("Removing previous registrations for the team", args.registration.team_id, rows);
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
        botsDb.bulk(toBeDeleted, function (err, result) {
          callback(err);
        });
      } else {
        callback(null);
      }
    },
    // register the bot
    function (callback) {
      console.log("Registering the bot for the team", args.registration.team_id);
      botsDb.insert({
        _id: args.registration.team_id,
        type: "bot-registration",
        registration: args.registration
      }, function (err, bot) {
        console.log("Registered bot", bot);
        callback(err, args.registration);
      });
    },
    // mark as active
    function (registration, callback) {
      console.log("Marking the bot as active");
      request({
        url: "https://slack.com/api/users.setActive",
        method: "POST",
        form: {
          token: registration.bot.bot_access_token
        }
      }, function (err, response, body) {
        if (!err) {
          console.log("Bot is active!");
        }
        callback(err);
      });
    }
  ], function (err, result) {
    if (err) {
      whisk.error(err);
    } else {
      whisk.done({
        status: "Registered"
      }, null);
    }
  });

  return whisk.async();
}
