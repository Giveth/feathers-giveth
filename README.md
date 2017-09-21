# feathers-giveth

> Real-time json cache for blockchain data.

## About

feathers-giveth uses [Feathersjs](http://feathersjs.com) as a json cache for blockchain transaction history.  The purpose is to ameliorate user wait times.  

Feathersjs provides both a rest and websocket interface to database.  Data itself is stored on the server file system use NeDB.  

While this does nothing to speedup blockchain responses, it allows everyone connected to receive aggregate updates immediately via socketio push (aka pub/sub).  This should hopefully simplify the code for the MVP, as it will not have worry about polling for all updates.

## Getting Started

Getting up and running is as easy as 1, 2, 3.

1. Make sure you have [NodeJS](https://nodejs.org/) and [yarn](https://www.yarnpkg.com/) installed.
2. Install your dependencies

    ```
    cd path/to/feathers-giveth; npm install
    ```
    note: due to a bug in yarn, `yarn install` currently does not work
    
3. feathers will need to connect to an ethereum node via websockets. Typically this will be a local TestRPC instance. 
The configuration param `blockchain.nodeUrl` is used to establish a connection. The default nodeUrl is `ws://localhost:8546`

  * we provide an easy way to start a TestRPC instance...
  
    1. `mkdir data/testrpc` -- this will contain the TestRPC database 
    2. `yarn testrpc` -- this will start testrpc with some default parameters
    
4. Start your app

    ```
    yarn start
    ```
    
## Deploying

1. start a production server

    ```
    yarn serve
    ```

## Testing

Simply run `yarn test` and all your tests in the `test/` directory will be run.

## Usage

Each of these services are available via rest or websocket:

```
campaigns
dacs
donations
donationsHistory
milestones
uploads
users
```

To add another service use (after installing the [feathers cli](https://docs.feathersjs.com/guides/step-by-step/generators/readme.html)):

```
feathers generate service
```

Choose defaults for options as described [here](https://docs.feathersjs.com/guides/chat/service.html)

# Rest calls using curl

Example to store new json object:

```
curl 'http://secret.com:3030/skunkworks/' -H 'Content-Type: application/json' --data-binary '{ "name": "Curler", "text": "Hello from the command line!" }'
```

Example to remove all json objects:

```
curl 'http://secret.com:3030/skunkworks/' -X "DELETE"
```

# WebSocket calls using javascript

You may call these services from client web app using the  [feathers api](https://docs.feathersjs.com/api/databases/common.html#service-methods).

Example to connect to donations service:

```javascript
const socket = io();
const client = feathers();
client.configure(feathers.socketio(socket));
const donations = client.service('donations');
```

Example to get donation data from server db and do something for each stored json object (notice pagination):

```javascript
donations.find().then(page => page.data.forEach(doSomethingWithJsonObject));
```

Example to subscribe to donations service create event assign it to named function:
```javascript
donations.on('created', doSomethingWithJsonObject);
```

## Data schemas

Using a microservice approach, services are seperated into seperate json databases (which are really just json data files on the server).

Currenlty there are no enforced fields for json objects.  Required fields and types may be introduced later with hooks.

## Hooks
Currently there are no [hooks](https://docs.feathersjs.com/api/hooks.html) but they can and will be added as a convenient way to execute operations that must occur on all requests (e.g. authorization, validation).



## Help

Checkout Feathersjs api [service methods](https://docs.feathersjs.com/api/databases/common.html#service-methods) and [service events](https://docs.feathersjs.com/api/events.html#service-events) and [database querying](https://docs.feathersjs.com/api/databases/querying.html).


## Changelog

__0.1.0__

- Initial release

## License

Copyright (c) 2016

Licensed under the [MIT license](LICENSE).
