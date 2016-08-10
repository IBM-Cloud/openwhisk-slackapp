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

CURRENT_NAMESPACE=`wsk property get --namespace | awk '{print $3}'`
echo "Current namespace is $CURRENT_NAMESPACE."

function usage() {
  echo "Usage: $0 [--install,--uninstall,--update,--env]"
}

function install() {
  echo "Adding app registration command"
  wsk action create slackapp-register actions/slackapp-register.js\
    -p cloudantUrl $CLOUDANT_url\
    -p cloudantDb $CLOUDANT_db
    
  echo "Adding app event processing"
  wsk action create slackapp-event actions/slackapp-event.js\
    -p cloudantUrl $CLOUDANT_url\
    -p cloudantDb $CLOUDANT_db
    
  echo "Adding app command processing"
  wsk action create slackapp-command actions/slackapp-command.js\
    -p cloudantUrl $CLOUDANT_url\
    -p cloudantDb $CLOUDANT_db
}

function uninstall() {
  echo "Removing actions..."
  wsk action delete slackapp-register
  wsk action delete slackapp-command
  wsk action delete slackapp-event
  
  echo "Done"
  wsk list
}

function update() {
  wsk action update slackapp-register actions/slackapp-register.js
  wsk action update slackapp-event    actions/slackapp-event.js
  wsk action update slackapp-command  actions/slackapp-command.js
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
* )
usage
;;
esac
