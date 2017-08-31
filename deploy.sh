#!/bin/bash
#
# Copyright 2016 IBM Corp. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the “License”);
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#  https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an “AS IS” BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# load configuration variables
source local.env
PACKAGE_NAME=slackapp

function usage() {
  echo "Usage: $0 [--install,--uninstall,--update,--env]"
}

function install() {
  echo "Creating $PACKAGE_NAME package"
  bx wsk package create $PACKAGE_NAME\
    -p cloudantUrl $CLOUDANT_url\
    -p cloudantDb $CLOUDANT_db\
    -p slackClientId \"$SLACK_CLIENT_ID\"\
    -p slackClientSecret \"$SLACK_CLIENT_SECRET\"\
    -p slackVerificationToken \"$SLACK_VERIFICATION_TOKEN\"

  echo "Adding app registration command"
  bx wsk action create $PACKAGE_NAME/slackapp-register actions/slackapp-register.js\
    --web true --annotation final true

  echo "Adding app event processing"
  bx wsk action create $PACKAGE_NAME/slackapp-event actions/slackapp-event.js\
    --web true --annotation final true

  echo "Adding app command processing"
  bx wsk action create $PACKAGE_NAME/slackapp-command actions/slackapp-command.js\
    --web true --annotation final true

  showurls
}

function uninstall() {
  echo "Removing actions..."
  bx wsk action delete $PACKAGE_NAME/slackapp-register
  bx wsk action delete $PACKAGE_NAME/slackapp-command
  bx wsk action delete $PACKAGE_NAME/slackapp-event
  bx wsk package delete $PACKAGE_NAME

  echo "Done"
  bx wsk list
}

function showurls() {
  OPENWHISK_API_HOST=$(bx wsk property get --apihost | awk '{print $4}')
  echo OAuth URL:
  echo https://$OPENWHISK_API_HOST/api/v1/web$(bx wsk list | grep 'slackapp/slackapp-register' | awk '{print $1}')
  echo Command URL:
  echo https://$OPENWHISK_API_HOST/api/v1/web$(bx wsk list | grep 'slackapp/slackapp-command' | awk '{print $1}')
  echo Event Subscription Request URL:
  echo https://$OPENWHISK_API_HOST/api/v1/web$(bx wsk list | grep 'slackapp/slackapp-event' | awk '{print $1}')
}

function update() {
  bx wsk action update $PACKAGE_NAME/slackapp-register actions/slackapp-register.js
  bx wsk action update $PACKAGE_NAME/slackapp-event    actions/slackapp-event.js
  bx wsk action update $PACKAGE_NAME/slackapp-command  actions/slackapp-command.js
}

function showenv() {
  echo CLOUDANT_url=$CLOUDANT_url
  echo CLOUDANT_db=$CLOUDANT_db
}

case "$1" in
"--install" )
install
;;
"--uninstall" )
uninstall
;;
"--update" )
update
;;
"--env" )
showenv
;;
"--urls" )
showurls
;;
* )
usage
;;
esac
