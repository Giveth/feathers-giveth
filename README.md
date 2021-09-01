![CI/CD](https://github.com/Giveth/feathers-giveth/workflows/CI/CD/badge.svg)

![Feathers Giveth](readme-header.png)

> Real-time json cache server for blockchain data

Note: Please use `develop` branch for contributing.

Welcome to the server code for Giveth's [dapp](https://github.com/Giveth/giveth-dapp). The dapp uses [feathers](http://feathersjs.com) as a cache for its blockchain transactions. By utilizing websockets on both the blockchain and client devices, we can receive and push updates simultaneously to all users in real time.

## Table of content

- [Table of content](#table-of-content)
- [Getting Started](#getting-started)
  - [Install](#install)
  - [Run server](#run-server)
  - [Kill Ganache](#kill-ganache)
  - [IPFS Support](#ipfs-support)
  - [Video Walkthrough](#video-walkthrough)
- [Deploying](#deploying)
- [Scripts](#scripts)
- [Testing](#testing)
- [Debugging](#debugging)
- [Usage](#usage)
- [Production](#production)
- [RSK](#rsk)
- [Help](#help)

## Getting Started

### Install

- #### Linux
  If your operative system is any distrubution of linux you can use an All in One installation scripts special thanks to Dapp contributor Jurek Brisbane, available [here](https://github.com/Giveth/giveth-dapp/files/3674808/givethBuildStartScripts_2019-09-29.zip) along with a youtube [video](https://www.youtube.com/watch?v=rzLhxxAz73k&feature=youtu.be)


- #### Any OS
  1. Click **Star** on this repo near the top-right corner of this web page (if you want to).
  2. Join our [slack](http://slack.giveth.io) if you haven't already.
  3. Fork this repo by clicking **Fork** button in top-right corner of this web page. Continue to follow instruction steps from your own feathers-giveth repo.
  5. The rest of these steps must be done from your machine's command line. Clone your own "feathers-giveth" repo. Copy the link from the "Clone or download" button near the top right of this repo's home page.
      ```
      git clone {paste your own repo link here}
      ```
  6. Change directories to feathers-giveth:
      ```
      cd feathers-giveth
      ```
  5. Make sure you have [NodeJS](https://nodejs.org/) (v10.24.0 or higher), [yarn](https://www.yarnpkg.com/) (v0.27.5 or higher), and npm (5.4.1 or higher) installed.
  6. Install dependencies from within feathers-giveth directory:
      ```
      npm install
      ```
      * note: due to a bug in yarn, `yarn install` currently does not work
  7. Install Mongo (we recommend installing via [Brew](https://treehouse.github.io/installation-guides/mac/mongo-mac.html))
  8. Run Mongo in a terminal window `mongod` or in the background `mongod --fork --syslog`
  9. Install Redis (we recommend install via Brew `brew install redis`)   
  10. Run Redis in terminal window `redis-server` or in the background `redis-server --daemonize yes`   
  11. (optionally) Install [IPFS](https://ipfs.io/docs/install/) (we recommend installing via [Brew](https://brew.sh/))
    - If you don't install ipfs, image uploading will be affected. You can update the config `ipfsGateway` value to use a public ipfs gateway ex. [https://ipfs.io/ipfs/](https://ipfs.io/ipfs/), however your uploads will be removed at some point

### Run server
The feathers server will need to connect to an ethereum node via websockets. Typically this will be a local TestRPC instance. 
The configuration param `blockchain.nodeUrl` is used to establish a connection. The default nodeUrl is `ws://localhost:8545`

1. We need to deploy any contract to that we intend to call. *NOTE:* The following cmd will clear the `data` dir, thus starting off in a clean state.

   ```
   yarn deploy-local
   ```

   After deploying local, make sure to copy-paste the MiniMeToken address in default.json

2. We provide an easy way to start the bridge & 2 ganache-cli instances. *VERY IMPORTANT:* this command enables Home Ganache and Foreign Ganache networks, if you are using MetaMask you will need to **add a Custom RPC** to your networks config,`http://localhost:8546` will be Foreign Ganache, and Home Ganache is normally added by default which is `http://localhost:8545` if needed.
  
    ``` 
    yarn start:networks
    ```
3. Since the bridge & ganache-cli is now running, open a new terminal window and navigate to the same feathers-giveth directory.

4. Optionally open a new terminal window and start the ipfs daemon

   ```
   ipfs daemon
   ```
5. Run db migration files ( if this the first time you want to start application, it's not needed to run migrations)
   ```
    ./node_modules/.bin/migrate-mongo up
   ```
5. Start your app

    ```
    yarn start
    ```

### Kill Ganache
If you run into errors like wallet balance not loading, it is very likely that Ganache is stuck
`netstat -vanp tcp | grep 8545`
Find the process that is listening on `*.8545` and `127.0.0.1.8545` and kill it with `kill -9 PID` (which is in the last colomn)
    
### IPFS Support
If the `ipfsApi` is a valid ipfs node that we can connect to, we will pin every ipfs hash that is stored in feathers. We currently do not remove any orphaned (hashes with no references in feathers) ipfs hashs. In the future we will provide a script that you can run as a cronjob to unpin any orphaned hashes.

### Video Walkthrough
Video tutorial walkthrough here: https://tinyurl.com/y9lx6jrl

## Deploying

1. Start a production server

    ```
    yarn serve
    ```
    
## Scripts

The `feathers-giveth/scripts` directory contains a few scripts to help development.

* `deploy.js` - deploys a new vault & liquidPledging contract

* `getState.js` - prints the current state of the deployed vault & liquidPledging contracts.

* `confirm.js` - confirms any payments that are pending in the vault

* `makeUserAdmin.js` - make a user admin

## Testing

Simply run `yarn test` and all your tests in the `/src` directory will be run.
It's included some integration tests so for running tests, you need to run a mongodb in your local system (on port 27017)

## Debugging

You can control the logging level with the `LOG_LEVEL` env variable. Available levels can be found at: https://github.com/winstonjs/winston/tree/2.x#logging-levels

To enable debug logging simply start the server with `LOG_LEVEL=debug yarn start`

## Usage

Each of these services are available via rest or websockets:

```
campaigns
communities
donations
donationsHistory
traces
uploads
users
emails
homePaymentsTransactions
subscriptions
```
If the server is using default configurations, you can see data for any of these services through your web browser at `http://localhost:3030/SERVICE_NAME`

PS: For accessing all features like creating `communities` and `campaigns` it's suggested to 
make `isAdmin` field true, for your user in you local MongoDb 


## Production

We use pm2 to manage our production servers. You can start the server using the `yarn serve` cmd. You will need to create an `ecosystem.config.js` file with the following contents:

```
module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps: [
    // First application
    {
      name: 'feathers',
      script: 'src/index.js',
      log_date_format: 'YYYY-MM-DD HH:mm',
      env: {
        COMMON_VARIABLE: 'true',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```
PS: It's good to see [Github Actions config](./.github/workflows/CI-CD.yml) to better understanding of deploy structure
## RSK

1. You will need to download the [rsk node](https://github.com/rsksmart/rskj/wiki/Install-RskJ-and-join-the-RSK-Orchid-Mainnet-Beta). After installing, you will run the node w/ the `regtest` network for local development.

  ```
  java -jar rskj-core-0.5.2-ORCHID-all.jar co.rsk.Start --regtest
  ```
  or 
  ```
  java -Drsk.conf.file=rsk.conf -jar rskj-core-0.5.2-ORCHID-all.jar co.rsk.Start
  ```

2. We need to deploy any contracts that we intend to call. *NOTE:* You will also need to ensure that your rsk node is in a clean state (reset) for the configured addresses to be correct.

   ```
   npm run deploy-local:rsk
   ```

3. Optionally open a new terminal window and start the ipfs daemon

   ```
   ipfs daemon
   ```
    
4. Start your app

    ```
    yarn start:rsk
    ```

## Audit Log
The Audit log system logs every Create, Update, Patch and 
Remove on **Campaigns**, **Traces**, **Events**, **Users**,
**PledgeAdmins**, **Communities**, **Donations**
For enabling audit log locally you should change `enableAuditLog`
in config to `true`, then 
* cd elk
* docker-compose up

And then after logging in `localhost:5601` with user:`elastic`, password: `changeme`
you can see the logs

## Donations Diagram
This diagram demonstrates how donations are created and how status will be changed, 
if you want to edit diagram just change `https://mermaid.ink/img/` to `https://mermaid-js.github.io/mermaid-live-editor/edit/#` in below link

A Solid arrow mean a new donation will be created after this action, and dotted arrows are used when existing donations are modified.

[![](https://mermaid.ink/img/eyJjb2RlIjoiZ3JhcGggVERcbiAgICBEb25vcltEb25vcl0gPT0-fERvbmF0ZXwgR2l2ZXJQZW5kaW5nKEdpdmVyL1BlbmRpbmcpXG4gICAgR2l2ZXJQZW5kaW5nIC0uLT4gRG9uYXRlVGFyZ2V0e1RhcmdldH1cbiAgICBHaXZlclBlbmRpbmcgLS4tPiB8VHJhbnNhY3Rpb24gaXMgbWluZWR8IEdpdmVyQ29tbWl0dGVkKEdpdmVyL0NvbW1pdHRlZCkgXG4gICAgRG9uYXRlVGFyZ2V0ID09PiB8RG9uYXRlIHRvIHRyYWNlfCBUcmFjZVBlbmRpbmcoVHJhY2UvUGVuZGluZylcbiAgICBEb25hdGVUYXJnZXQgPT0-IHxEb25hdGUgdG8gY2FtcGFpZ258IENhbXBhaWduUGVuZGluZyhDYW1wYWlnbi9QZW5kaW5nKVxuICAgIERvbmF0ZVRhcmdldCA9PT4gfERvbmF0ZSB0byBDb21tdW5pdHl8IENvbW11bml0eVBlbmRpbmcoQ29tbXVuaXR5L1BlbmRpbmcpXG4gICAgVHJhY2VQZW5kaW5nIC0uLT4gfCBUcmFuc2FjdGlvbiBpcyBtaW5lZCB8IFRyYWNlQ29tbWl0dGVkKFRyYWNlL0NvbW1pdHRlZClcbiAgICBDb21tdW5pdHlQZW5kaW5nIC0uLT58VHJhbnNhY3Rpb24gaXMgbWluZWQgfCBDb21tdW5pdHlXYWl0aW5nKENvbW11bml0eS9XYWl0aW5nKVxuICAgIENhbXBhaWduUGVuZGluZyAtLi0-IHxUcmFuc2FjdGlvbiBpcyBtaW5lZCB8Q2FtcGFpZ25Db21taXR0ZWQoQ2FtcGFpZ24vQ29taXR0ZWQpXG4gICAgVHJhY2VDb21taXR0ZWQgLS4tPnxDb2xsZWN0L0Rpc2J1cnNlfCBEZWNpc2lvbntUcmFjZSByZWNpcGllbnQgaXMgY2FtcGFpZ259XG4gICAgQ2FtcGFpZ25Db21taXR0ZWQgPT0-fERlbGVnYXRlIHRvIHRyYWNlfCBUcmFjZUNvbW1pdHRlZFxuICAgIENhbXBhaWduQ29tbWl0dGVkIC0uLT4gfENhbmNlbCBjYW1wYWlnbnxDYW1wYWlnbkNhbmNlbGxlZHtDYW1wYWlnbi9DYW5jZWxsZWR9XG4gICAgQ2FtcGFpZ25DYW5jZWxsZWQgPT0-IHxDb21tdW5pdHkgaXMgZG9uYXRpb24gcGFyZW50IG93bmVyfCBDb21tdW5pdHlXYWl0aW5nXG4gICAgQ2FtcGFpZ25DYW5jZWxsZWQgPT0-IHxEb25hdGlvbiBjb21lcyBmcm9tIGRpcmVjdCBkb25hdGlvbnwgR2l2ZXJDb21taXR0ZWRcbiAgICBEZWNpc2lvbiA9PT58Tm98IFBheWluZ1xuICAgIERlY2lzaW9uID09PnxZZXN8IENhbXBhaWduQ29tbWl0dGVkXG4gICAgUGF5aW5nID09PiBQYWlkXG4gICAgUGFpZCAtLi0-IEJyaWRnZVxuICAgIEJyaWRnZSAtLi0-IHxBdXRob3JpemVQYXltZW50ICYgUGF5bWVudEV4ZWN1dGVkfCBNYWluTmV0V2FsbGV0KE1haW5uZXQgV2FsbGV0KVxuICAgIENvbW11bml0eVdhaXRpbmcgPT0-IHxkZWxlZ2F0ZSB0byBjYW1wYWlnbiBvciB0cmFjZXwgVG9BcHByb3Zle1RvQXBwcm92ZX1cbiAgICBUb0FwcHJvdmUgLS4tPiB8RG9ub3IgY29uZmlybSB0cmFjZSBkZWxlZ2F0aW9ufCBUcmFjZUNvbW1pdHRlZFxuICAgIFRvQXBwcm92ZSAtLi0-IHxEb25vciBjb25maXJtIGNhbXBhaWduIGRlbGVnYXRpb258IENhbXBhaWduQ29tbWl0dGVkXG4gICAgVG9BcHByb3ZlIC0uLT4gQ29tbXVuaXR5UmVqZWN0ZWQoQ29tbXVuaXR5L1JlamVjdGVkKVxuICAgIENvbW11bml0eVJlamVjdGVkID09PiAgQ29tbXVuaXR5V2FpdGluZ1xuICAgIFRyYWNlQ29tbWl0dGVkIC0uLT4gfENhbmNlbCB0cmFjZXxUcmFjZUNhbmNlbGVke1RyYWNlL0NhbmNlbGVkfVxuICAgIFRyYWNlQ2FuY2VsZWQgPT0-fERvbmF0aW9uIGNvbWVzIGZyb20gY29tbXVuaXR5fCBDb21tdW5pdHlXYWl0aW5nXG4gICAgVHJhY2VDYW5jZWxlZCA9PT4gIHxDYW1wYWlnbiBpcyBkb25hdGlvbiBwYXJlbnQgb3duZXJ8Q2FtcGFpZ25Db21taXR0ZWRcbiAgICBUcmFjZUNhbmNlbGVkID09PiAgfERvbmF0aW9uIGNvbWVzIGZyb20gRGlyZWN0IGRvbmF0aW9uc3xHaXZlckNvbW1pdHRlZFxuICAgICIsIm1lcm1haWQiOnsidGhlbWUiOiJkZWZhdWx0In0sInVwZGF0ZUVkaXRvciI6ZmFsc2UsImF1dG9TeW5jIjp0cnVlLCJ1cGRhdGVEaWFncmFtIjpmYWxzZX0)](https://mermaid-js.github.io/mermaid-live-editor/edit/##eyJjb2RlIjoiZ3JhcGggVERcbiAgICBEb25vcltEb25vcl0gPT0-fERvbmF0ZXwgR2l2ZXJQZW5kaW5nKEdpdmVyL1BlbmRpbmcpXG4gICAgR2l2ZXJQZW5kaW5nIC0uLT4gRG9uYXRlVGFyZ2V0e1RhcmdldH1cbiAgICBHaXZlclBlbmRpbmcgLS4tPiB8VHJhbnNhY3Rpb24gaXMgbWluZWR8IEdpdmVyQ29tbWl0dGVkKEdpdmVyL0NvbW1pdHRlZCkgXG4gICAgRG9uYXRlVGFyZ2V0ID09PiB8RG9uYXRlIHRvIHRyYWNlfCBUcmFjZVBlbmRpbmcoVHJhY2UvUGVuZGluZylcbiAgICBEb25hdGVUYXJnZXQgPT0-IHxEb25hdGUgdG8gY2FtcGFpZ258IENhbXBhaWduUGVuZGluZyhDYW1wYWlnbi9QZW5kaW5nKVxuICAgIERvbmF0ZVRhcmdldCA9PT4gfERvbmF0ZSB0byBDb21tdW5pdHl8IENvbW11bml0eVBlbmRpbmcoQ29tbXVuaXR5L1BlbmRpbmcpXG4gICAgVHJhY2VQZW5kaW5nIC0uLT4gfCBUcmFuc2FjdGlvbiBpcyBtaW5lZCB8IFRyYWNlQ29tbWl0dGVkKFRyYWNlL0NvbW1pdHRlZClcbiAgICBDb21tdW5pdHlQZW5kaW5nIC0uLT58VHJhbnNhY3Rpb24gaXMgbWluZWQgfCBDb21tdW5pdHlXYWl0aW5nKENvbW11bml0eS9XYWl0aW5nKVxuICAgIENhbXBhaWduUGVuZGluZyAtLi0-IHxUcmFuc2FjdGlvbiBpcyBtaW5lZCB8Q2FtcGFpZ25Db21taXR0ZWQoQ2FtcGFpZ24vQ29taXR0ZWQpXG4gICAgVHJhY2VDb21taXR0ZWQgLS4tPnxDb2xsZWN0L0Rpc2J1cnNlfCBEZWNpc2lvbntUcmFjZSByZWNpcGllbnQgaXMgY2FtcGFpZ259XG4gICAgQ2FtcGFpZ25Db21taXR0ZWQgPT0-fERlbGVnYXRlIHRvIHRyYWNlfCBUcmFjZUNvbW1pdHRlZFxuICAgIENhbXBhaWduQ29tbWl0dGVkIC0uLT4gfENhbmNlbCBjYW1wYWlnbnxDYW1wYWlnbkNhbmNlbGxlZHtDYW1wYWlnbi9DYW5jZWxsZWR9XG4gICAgQ2FtcGFpZ25DYW5jZWxsZWQgPT0-IHxDb21tdW5pdHkgaXMgZG9uYXRpb24gcGFyZW50IG93bmVyfCBDb21tdW5pdHlXYWl0aW5nXG4gICAgQ2FtcGFpZ25DYW5jZWxsZWQgPT0-IHxEb25hdGlvbiBjb21lcyBmcm9tIGRpcmVjdCBkb25hdGlvbnwgR2l2ZXJDb21taXR0ZWRcbiAgICBEZWNpc2lvbiA9PT58Tm98IFBheWluZ1xuICAgIERlY2lzaW9uID09PnxZZXN8IENhbXBhaWduQ29tbWl0dGVkXG4gICAgUGF5aW5nID09PiBQYWlkXG4gICAgUGFpZCAtLi0-IEJyaWRnZVxuICAgIEJyaWRnZSAtLi0-IHxBdXRob3JpemVQYXltZW50ICYgUGF5bWVudEV4ZWN1dGVkfCBNYWluTmV0V2FsbGV0KE1haW5uZXQgV2FsbGV0KVxuICAgIENvbW11bml0eVdhaXRpbmcgPT0-IHxkZWxlZ2F0ZSB0byBjYW1wYWlnbiBvciB0cmFjZXwgVG9BcHByb3Zle1RvQXBwcm92ZX1cbiAgICBUb0FwcHJvdmUgLS4tPiB8RG9ub3IgY29uZmlybSB0cmFjZSBkZWxlZ2F0aW9ufCBUcmFjZUNvbW1pdHRlZFxuICAgIFRvQXBwcm92ZSAtLi0-IHxEb25vciBjb25maXJtIGNhbXBhaWduIGRlbGVnYXRpb258IENhbXBhaWduQ29tbWl0dGVkXG4gICAgVG9BcHByb3ZlIC0uLT4gQ29tbXVuaXR5UmVqZWN0ZWQoQ29tbXVuaXR5L1JlamVjdGVkKVxuICAgIENvbW11bml0eVJlamVjdGVkIC0uLT4gIENvbW11bml0eVdhaXRpbmdcbiAgICBUcmFjZUNvbW1pdHRlZCAtLi0-IHxDYW5jZWwgdHJhY2V8VHJhY2VDYW5jZWxlZHtUcmFjZS9DYW5jZWxlZH1cbiAgICBUcmFjZUNhbmNlbGVkID09PnxEb25hdGlvbiBjb21lcyBmcm9tIGNvbW11bml0eXwgQ29tbXVuaXR5V2FpdGluZ1xuICAgIFRyYWNlQ2FuY2VsZWQgPT0-ICB8Q2FtcGFpZ24gaXMgZG9uYXRpb24gcGFyZW50IG93bmVyfENhbXBhaWduQ29tbWl0dGVkXG4gICAgVHJhY2VDYW5jZWxlZCA9PT4gIHxEb25hdGlvbiBjb21lcyBmcm9tIERpcmVjdCBkb25hdGlvbnN8R2l2ZXJDb21taXR0ZWRcbiAgICAiLCJtZXJtYWlkIjoie1xuICBcInRoZW1lXCI6IFwiZGVmYXVsdFwiXG59IiwidXBkYXRlRWRpdG9yIjpmYWxzZSwiYXV0b1N5bmMiOnRydWUsInVwZGF0ZURpYWdyYW0iOmZhbHNlfQ)
## Help

For more info on how to work with feathers checkout out their docs on [service methods](https://docs.feathersjs.com/api/databases/common.html#service-methods), [service events](https://docs.feathersjs.com/api/events.html#service-events), and [database querying](https://docs.feathersjs.com/api/databases/querying.html).

Also feel free to reach out to us on [slack](http://slack.giveth.io) for any help or to share ideas.
