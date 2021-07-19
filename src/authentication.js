const { JWTStrategy } = require('@feathersjs/authentication');
const { expressOauth } = require('@feathersjs/authentication-oauth');
const { MyAuthenticationService } = require('./authenticationService');
const { Web3Strategy } = require('./Web3Strategy');

module.exports = app => {
  const authentication = new MyAuthenticationService(app);

  authentication.register('jwt', new JWTStrategy());
  // authentication.register('local', new LocalStrategy());
  authentication.register('web3', new Web3Strategy());
  authentication.docs = {
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: false,
      create: {
        description: 'Currently I dont know how should use this endpoint',
      },
    },
    definition: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
        },
        signature: {
          type: 'string',
        },
        startegy: {
          schema: {
            type: 'string',
            enum: ['web3', 'jwt'],
          },
        },
      },
      example: {
        strategy: 'web3',
        address: '0x0eE4c971343808A8771F7154D07d9CC17FE35152',
      },
    },
  };

  app.use('/authentication', authentication);
  app.configure(expressOauth());
};
