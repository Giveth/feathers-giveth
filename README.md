# feathers-giveth

> Real-time json cache for blockchain data.

## About

This is the server code for Giveth's [dapp](https://github.com/Giveth/giveth-dapp). The dapp uses [feathersjs](http://feathersjs.com) as a cache for its blockchain transactions. By utilizing websockets on both the blockchain and client devices, we can receive and push updates simultaneously to all users in real time.

## Getting Started

### Installation
1. Click "Star" on this repo near the top-right corner of this web page.
2. Join our [slack](http://slack.giveth.io) if you haven't already.
3. Fork this repo by clicking "Fork" button in top-right corner of this web page.
   
   Note: the rest of these steps must be done from your machine's command line.
5. Clone your personal "feathers-giveth" repo: 
    ```
    git clone https://github.com/GITHUB_USERNAME/feathers-giveth.git
    ```
6. Change directories to feathers-giveth:
    ```
    cd feathers-giveth
    ```
5. Make sure you have [NodeJS](https://nodejs.org/) and [yarn](https://www.yarnpkg.com/) installed.
6. Install dependencies from within feathers-giveth directory:
    ```
    npm install
    ```
    * note: due to a bug in yarn, `yarn install` currently does not work

### Running server
The feathers server will need to connect to an ethereum node via websockets. Typically this will be a local TestRPC instance. 
The configuration param `blockchain.nodeUrl` is used to establish a connection. The default nodeUrl is `ws://localhost:8546`

1. We provide an easy way to start a TestRPC instance.
  
    ``` 
    yarn testrpc
    ```
2. Since TestRPC is now running, open a new terminal window and navigate to the same feathers-giveth directory.
    
3. The TestRPC instance simulates a new blockchain. So we must deploy any contracts we intend to call.

    ```
    node --harmony scripts/deploy.js
    ```
    
4. Start your app

    ```
    yarn start
    ```
    * note: due to a bug somewhere (testrpc? web3? websocket?) the subscription events may not always be picked-up in feathers.
    especially the first time you run ```yarn start```. It appears that testrpc is emitting the event correctly, but web3 Subscription
    is not recieving the message. **If this happens, just restart feathers** and all past events will be picked up.
    
## Deploying

1. Start a production server

    ```
    yarn serve
    ```
    
## Scripts

The `feathers-giveth/scripts` directory contains a few scripts to help development.

`deploy.js` - deploys a new vault & liquidPledging contract

`getState.js` - prints the current state of the deployed vault & liquidPledging contracts.

`confirm.js` - confirms any payments that are pending in the vault 

## Testing

Simply run `yarn test` and all your tests in the `test/` directory will be run.

## Usage

Each of these services are available via rest or websockets:

```
campaigns
dacs
donations
donationsHistory
milestones
uploads
users
```

## Help

Checkout Feathersjs api [service methods](https://docs.feathersjs.com/api/databases/common.html#service-methods) and [service events](https://docs.feathersjs.com/api/events.html#service-events) and [database querying](https://docs.feathersjs.com/api/databases/querying.html).
