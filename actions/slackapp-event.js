/**
 * Copyright 2018 IBM Corp. All Rights Reserved.
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
var botsDb;

var context = {};
var registration;

function initServices(args) {
  // connect to the Cloudant database
  var cloudant = require('cloudant')({url: args.CLOUDANT_URL});
  console.log("Cloudant connected.");
  
  botsDb = cloudant.use(args.REGISTRATIONS_DB);
  console.log("BotsDb connected.");
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
        resolve(registration);
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

function processSlackEvent(event, user, args) {
  console.log('Processing message from ', user.name);
  return new Promise(function(resolve, reject) {
    if (event.event.type === 'message' || event.event.type === 'app_mention') {
      if (event.event.type === 'app_mention') {
        event.event.text = event.event.text.replace(/<\/?[^>]+(>|$)/g, "");
      }
      // Useful context infos from Slack
      if (user.profile && user.profile.first_name) context.first_name = user.profile.first_name;
      if (user.profile && user.profile.last_name) context.last_name = user.profile.last_name;
      if (user.name) context.username = user.name;
      if (user.is_admin) context.is_admin = user.is_admin;
      context.slack_id = event.event.user;
      // Input data
      var payload = {
        filter: 'by_slack_id',
        value: event.event.user,
        context: context,
        text: event.event.text
      };
      var options = {
        url: args.CF_API_BASE+'converse',
        body: payload,
        headers: {'Content-Type': 'application/json'},
        json: true
      };
      function owCallback(err, response, body) {
        if (err) {
            console.log("Error calling converse");
        } 
        else if (response.statusCode < 200 || response.statusCode >= 300) {
            console.log("CF call failed: ", response.statusCode);
        } 
        else {
            console.log("CF call sucess: ", response.statusCode);
        }
        resolve(body.response);
      }
      request.post(options, owCallback);
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
    .then(registration => getSlackUser(registration.bot.bot_access_token, event.event.user))
    .then(user => processSlackEvent(event, user, args))
    .then(response => postResponseArray(response, event))
    .catch(err => {
      console.log('Error: ',err);
      return {
        statusCode: 500
      };
    });

}
