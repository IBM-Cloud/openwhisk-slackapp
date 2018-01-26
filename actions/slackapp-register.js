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

function main(args) {
  console.log('Registering new bot from Slack');
  console.log(args);

  // connect to the Cloudant database
  var cloudant = require('cloudant')({url: args.CLOUDANT_URL});
  var botsDb = cloudant.use(args.REGISTRATIONS_DB);

  return new Promise(function(resolve, reject) {
    async.waterfall([
      // complete the OAuth flow with Slack
      (callback) => {
        request({
          url: `https://slack.com/api/oauth.access?client_id=${args.SLACK_CLIENT_ID}&client_secret=${args.SLACK_CLIENT_SECRET}&code=${args.code}&state=${args.state}`,
          json: true
        }, (err, response, registration) => {
          if (err) {
            callback(err);
          } else if (registration && registration.ok) {
            console.log('Result from Slack', registration);
            callback(null, registration);
          } else {
            console.log(registration);
            callback('Registration failed');
          }
        });
      },
      // find previous registrations for this team
      function (registration, callback) {
        console.log('Looking for previous registrations for the team', registration.team_id);
        botsDb.view('bots', 'by_team_id', {
          keys: [registration.team_id],
          include_docs: true
        }, function (err, body) {
          if (err) {
            callback(err);
          } else {
            callback(null, registration, body.rows);
          }
        });
      },
      // delete them all
      function (registration, rows, callback) {
        console.log('Removing previous registrations for the team', registration.team_id, rows);
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
          callback(null, registration);
        }
      },
      // register the bot
      function (registration, callback) {
        console.log('Registering the bot for the team', registration.team_id);
        botsDb.insert({
          _id: registration.team_id,
          type: 'bot-registration',
          registration: registration
        }, function (err, bot) {
          console.log('Registered bot', bot);
          callback(err, registration);
        });
      }
    ], function (err, result) {
      if (err) {
        reject({
          body: err
        });
      } else {
        resolve({
          body: 'Registration was successful. You can try the command in Slack or send a direct message to the bot.'
        });
      }
    });
  });
}
