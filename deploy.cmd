@ECHO OFF
SETLOCAL

rem #
rem # Copyright 2016 IBM Corp. All Rights Reserved.
rem #
rem # Licensed under the Apache License, Version 2.0 (the “License”);
rem # you may not use this file except in compliance with the License.
rem # You may obtain a copy of the License at
rem #
rem #  https://www.apache.org/licenses/LICENSE-2.0
rem #
rem # Unless required by applicable law or agreed to in writing, software
rem # distributed under the License is distributed on an “AS IS” BASIS,
rem # WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
rem # See the License for the specific language governing permissions and
rem # limitations under the License.

rem # load configuration variables
@CALL local.cmd
set PACKAGE_NAME=slackapp

IF "%1"=="--install" (
  CALL :install
) ELSE IF "%1"=="--uninstall" (
  CALL :uninstall
) ELSE IF "%1"=="--update" (
  CALL :update
) ELSE IF "%1"=="--env" (
  CALL :showenv
) ELSE (
  CALL :usage
)

EXIT /B %ERRORLEVEL%

:usage
ECHO Usage: deploy.bat [--install,--uninstall,--update,--env]
EXIT /B 0

:install
ECHO Creating %PACKAGE_NAME% package
ibmcloud fn package create %PACKAGE_NAME% -p cloudantUrl %CLOUDANT_url% -p cloudantApiKey %CLOUDANT_apikey% -p cloudantDb %CLOUDANT_db% -p slackClientId "%SLACK_CLIENT_ID%" -p slackClientSecret "%SLACK_CLIENT_SECRET%" -p slackVerificationToken "%SLACK_VERIFICATION_TOKEN%"

ECHO Adding app registration command
ibmcloud fn action create %PACKAGE_NAME%/slackapp-register actions\slackapp-register.js --web true --annotation final true

ECHO Adding app event processing
ibmcloud fn action create %PACKAGE_NAME%/slackapp-event actions\slackapp-event.js --web true --annotation final true

ECHO Adding app command processing
ibmcloud fn action create %PACKAGE_NAME%/slackapp-command actions\slackapp-command.js --web true --annotation final true
EXIT /B 0

:uninstall
ECHO Removing actions...
ibmcloud fn action delete %PACKAGE_NAME%/slackapp-register
ibmcloud fn action delete %PACKAGE_NAME%/slackapp-command
ibmcloud fn action delete %PACKAGE_NAME%/slackapp-event
ibmcloud fn package delete %PACKAGE_NAME%

ECHO Done
ibmcloud fn list
EXIT /B 0

:update
ibmcloud fn action update %PACKAGE_NAME%/slackapp-register actions\slackapp-register.js
ibmcloud fn action update %PACKAGE_NAME%/slackapp-event    actions\slackapp-event.js
ibmcloud fn action update %PACKAGE_NAME%/slackapp-command  actions\slackapp-command.js
EXIT /B 0

:showenv
ECHO CLOUDANT_url=%CLOUDANT_url%
ECHO CLOUDANT_db=%CLOUDANT_db%
EXIT /B 0
