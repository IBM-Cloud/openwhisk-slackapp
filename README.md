# A serverless Slack app built with IBM Cloud Functions and Slack Events API

This sample shows how to build a serverless Slack app using Slack Events API to receive events,
with IBM Cloud Functions to process these events.

<img src="xdocs/app-created.png" width="200"/><img src="xdocs/team-botchat.png" width="200"/><img src="xdocs/team-customcommandoutput.png" width="200"/>

> A previous version of this sample was using API Connect to expose the actions as HTTP endpoints. With the introduction of web actions in Cloud Functions this was no longer needed. You can browse [this tag](https://github.com/IBM-Cloud/openwhisk-slackapp/tree/using-api-connect) to view the code using API Connect.

## Overview

Built using IBM Cloud, the app uses:
* Cloud Functions - to implement the app bot and commands
* Cloudant - to keep track of app installations
* and Slack Events API.

When a user installs the app in a Slack team, or interacts with a bot user, or uses a custom command, Slack calls the app implementation. Slack will talk directly with IBM Cloud Functions.

From the perspective of the developer of the Slack app, there is no server involved, only actions in a serverless environment. Furthermore the code is not running if no user interacts with the app and if the app gets popular, it will benefit from IBM Cloud Functions scalability.

![Architecture](https://g.gravizo.com/source/architecture_diagram?https%3A%2F%2Fraw.githubusercontent.com%2FIBM-Cloud%2Fopenwhisk-slackapp%2Fmaster%2FREADME.md)
<details>
<summary></summary>
architecture_diagram
  digraph G {
    node [fontname = "helvetica"]
    rankdir=LR
    user -> slack
    slack -> openwhisk
    openwhisk -> cloudant
    slack [shape=square style=filled color="%23e9a820" fontcolor=white label="%23 Slack"]
    openwhisk [shape=circle style=filled color="%23325c80" fontcolor=white label="Cloud Functions"]
    cloudant [shape=circle style=filled color="%2372c7e7" fontcolor=white label="Cloudant"]
  }
architecture_diagram
)
</details>

In this sample, we will:
* create the Slack app in Slack,
* prepare the Cloud Functions environment, creating the actions implementing our Slack app,
* complete the integration by updating the endpoints in the Slack app,
* add our Slack app to a Slack team,
* test our Slack app.

## Requirements

To deploy this app, you need:
* IBM Cloud account. [Sign up](https://cloud.ibm.com/?cm_mmc=GitHubReadMe) for IBM Cloud, or use an existing account.
* Slack account
* The [IBM Cloud CLI](https://cloud.ibm.com/docs/cli/index.html) and the [Cloud Functions plugin](https://cloud.ibm.com/docs/cli?topic=cloud-functions-cli-plugin-functions-cli)

Your own Slack team is recommended if you want to play with the integration without impacting others.

## Create the Slack app

1. Proceed to the [new app creation](https://api.slack.com/apps/new) in Slack

1. Type a name for your app, select your Slack team.

1. Click Create

   ![](xdocs/app-created.png)

1. View the App Credentials

   ![](xdocs/app-verificationtoken.png)

We will need the Client ID, Client Secret and Verification Token in the next steps.

At this stage, we will put the configuration of the Slack app on hold.
For the next app configuration steps to work we need to have our actions up and running.

## Deploy the IBM Cloud Functions

### Get the code

* Clone the app to your local environment from your terminal using the following command:

   ```
   git clone https://github.com/IBM-Cloud/openwhisk-slackapp.git
   ```

* or Download and extract the source code from [this archive](https://github.com/IBM-Cloud/openwhisk-slackapp/archive/master.zip)

### Create the IBM Cloud Cloudant service

1. Open the IBM Cloud console

1. Create a Cloudant instance named **cloudant-for-slackapp**.

1. Open the Cloudant service dashboard and create a new database named **registrations**

1. Select the database

1. Create a new document.

1. Replace the default JSON with the content of the file [cloudant-designs.json](cloudant-designs.json)

   ![](xdocs/cloudant-adddesigndoc.png)

### Deploy from Linux or macOS

1. Copy the file named **template.local.env** into **local.env**

   ```
   cp template.local.env local.env
   ```

1. Get the service credentials for the Cloudant service created above and set CLOUDANT_url, CLOUDANT_apikey in `local.env` to the corresponding value (url and apikey).

1. Set the values for SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_VERIFICATION_TOKEN - these are the App Credentials we've seen in the previous steps.

1. Ensure your `ibmcloud fn` command line interface is property configured with:

   ```
   ibmcloud fn list
   ```

   This shows the packages, actions, triggers and rules currently deployed in your namespace.

1. Create the actions:

   ```
   ./deploy.sh --install
   ```

   If all goes well it outputs:

   ```
   Creating slackapp package
   ok: created package slackapp
   Adding app registration command
   ok: created action slackapp/slackapp-register
   Adding app event processing
   ok: created action slackapp/slackapp-event
   Adding app command processing
   ok: created action slackapp/slackapp-command
   OAuth URL:
   https://us-south.functions.cloud.ibm.com/api/v1/web/<your-namespace-id>/slackapp/slackapp-register
   Command URL:
   https://us-south.functions.cloud.ibm.com/api/v1/web/<your-namespace-id>/slackapp/slackapp-command
   Event Subscription Request URL:
   https://us-south.functions.cloud.ibm.com/api/v1/web/<your-namespace-id>/slackapp/slackapp-event
   ```

   > Note: the script can also be used to *--uninstall* the Cloud Functions artifacts to *--update* the artifacts if you change the action code, or simply with *--env* to show the environment variables set in **local.env**.

### Deploy from Windows

1. Copy the file named **template.local.cmd** into **local.cmd**

   ```
   copy template.local.cmd local.cmd
   ```

1. Get the service credentials for the Cloudant service created above and set CLOUDANT_url
in `local.cmd` to the corresponding value (url). Make sure you take the full url including the username and password https://username:password@hostname.cloudant.com.

1. Set the values for SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_VERIFICATION_TOKEN - these are the App Credentials we've seen in the previous steps.

1. Ensure your `ibmcloud fn` command line interface is property configured with:

   ```
   ibmcloud fn list
   ```

   This shows the packages, actions, triggers and rules currently deployed in your namespace.

1. Create the actions:

   ```
   deploy.cmd --install
   ```

   If all goes well it outputs:

   ```
   Creating slackapp package
   ok: created package slackapp
   Adding app registration command
   ok: created action slackapp/slackapp-register
   Adding app event processing
   ok: created action slackapp/slackapp-event
   Adding app command processing
   ok: created action slackapp/slackapp-command
   ```

   > Note: the script can also be used to *--uninstall* the Cloud Functions artifacts to *--update* the artifacts if you change the action code, or simply with *--env* to show the environment variables set in **local.cmd**.

Our actions are ready. Back to the Slack app configuration.

## Complete the Slack app configuration

### Add an Event Subscription

1. Go to the **Event Subscriptions** section of your app

1. Enable Events

1. Set the Request URL to the URL of the `slack-event` web action. The URL should look like `https://us-south.functions.cloud.ibm.com/api/v1/web/your-namespace-id/slackapp/slackapp-event`

   ![](xdocs/app-challengeaccepted.png)

   > Slack will contact this URL immediately. It should turn to **Verified** if the Cloud Functions configuration steps worked.

### Listen to Bot messages

1. Add a new Bot User Event for **message.im**

   ![](xdocs/app-addbotevent.png)

   > This allows us to react to direct messages sent to a bot. We could select more event type but for our simple app will only deal with this one today.

1. Save the changes

### Set the callback URL for authentication

1. Under OAuth and Permissions, add a new Redirect URL. This URL will be called when a user installs your application in a team. It should point to the `slackapp-register` web action. The URL should look like `https://us-south.functions.cloud.ibm.com/api/v1/web/your-namespace-id/slackapp/slackapp-register`

   ![](xdocs/app-setoauth.png)

1. Click **Save URLs**

### Create a new command

1. Under Slash Commands, **Create New Command**

   ![](xdocs/app-newcommand.png)

1. Set the values

   1. Command: **/myserverlessapp**

   1. Request URL: URL of the `slackapp-command` web action. The URL should look like `https://us-south.functions.cloud.ibm.com/api/v1/web/your-namespace-id/slackapp/slackapp-command`

   1. Short Description: **A test command**

   1. Usage Hint: **[param1] [param2]**

   ![](xdocs/app-commandsettings.png)

1. Save. This automatically creates a bot for the app.

### Give the bot the permission to talk

1. Go to **OAuth & Permissions**.
1. Under **Scopes** / **Bot Token Scopes**, add the two OAuth Scopes: **chat:write** and **users:read**

Our app is finally ready to be installed!

## Add the app to your team

1. To see what's happening behind the scene as Slack calls our actions, open a new command prompt and run

   ```
   ibmcloud fn activation poll
   ```

   > Leave it running. Actions triggered by Slack will show up there

1. Go to **Manage Distribution**

   ![](xdocs/app-managedistribution.png)

1. Click the **Add the Slack** button

1. Authorize the app

   ![](xdocs/app-authorize.png)

   After a few seconds, the app is installed. You should see logs appearing in the activation   polling as Slack will be sending the registration info we will use later to interact with Slack channels and users.

   In your web browser, you should see `Registration was successful. You can try the command in Slack or send a direct message to the bot.`

   Ideally you would redirect to another page once the registration is completed.

## Test the integration

1. Go into your team in Slack

1. Send a direct message to our new bot friend

   ![](xdocs/team-newbot.png)

   ![](xdocs/team-startchatwithbot.png)

1. The bot replies

   ![](xdocs/team-botchat.png)

1. Go to the #general channel (although this could work from any place in Slack) and type ```/my``` you should see the custom command

   ![](xdocs/team-customcommand.png)

1. Try the command ```/myserverless two params``` as example

   ![](xdocs/team-customcommandoutput.png)

## Code Structure

### Cloud Functions - Deployment Script

| File | Description |
| ---- | ----------- |
|[**deploy.cmd**](deploy.cmd)<br/>[**deploy.sh**](deploy.sh)|Helper script to install, uninstall, update the actions.|

### Cloud Functions - Actions

| File | Description |
| ---- | ----------- |
|[**slackapp-register.js**](actions/slackapp-register.js)|Handles the installation of the app in a team. It stores the authorization token in Cloudant for future use by the bot and commands.|
|[**slackapp-event.js**](actions/slackapp-event.js)|Handles events triggered by the Events API. In this sample, it handles messages sent to the bot user and simply echoes the message sent by the user.|
|[**slackapp-command.js**](actions/slackapp-command.js)|Handles custom commands. In this sample, it echoes the command parameters.|

## Contribute

Please create a pull request with your desired changes.

## Troubleshooting

### Cloud Functions

Polling activations is good start to debug the action execution. Run
```
ibmcloud fn activation poll
```
and send a message to the bot or use a custom command.

## License

See [License.txt](License.txt) for license information.
