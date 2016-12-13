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
ECHO Adding app registration command
wsk action create slackapp-register actions\slackapp-register.js -p cloudantUrl %CLOUDANT_url% -p cloudantDb %CLOUDANT_db%

ECHO Adding app event processing
wsk action create slackapp-event actions\slackapp-event.js -p cloudantUrl %CLOUDANT_url% -p cloudantDb %$CLOUDANT_db%

ECHO Adding app command processing
wsk action create slackapp-command actions\slackapp-command.js -p cloudantUrl %CLOUDANT_url% -p cloudantDb %CLOUDANT_db%
EXIT /B 0

:uninstall
ECHO Removing actions...
wsk action delete slackapp-register
wsk action delete slackapp-command
wsk action delete slackapp-event

ECHO Done
wsk list
EXIT /B 0

:update
wsk action update slackapp-register actions\slackapp-register.js
wsk action update slackapp-event    actions\slackapp-event.js
wsk action update slackapp-command  actions\slackapp-command.js
EXIT /B 0

:showenv
ECHO CLOUDANT_url=%CLOUDANT_url%
ECHO CLOUDANT_db=%CLOUDANT_db%
EXIT /B 0
