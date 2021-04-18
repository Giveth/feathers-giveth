const { JWTStrategy } = require('@feathersjs/authentication');
const { expressOauth } = require('@feathersjs/authentication-oauth');
const { MyAuthenticationService } = require('./authenticationService');
const { Web3Strategy } = require('./Web3Strategy');

module.exports = app => {
  const authentication = new MyAuthenticationService(app);

  authentication.register('jwt', new JWTStrategy());
  // authentication.register('local', new LocalStrategy());
  authentication.register('web3', new Web3Strategy());

  app.use('/authentication', authentication);
  app.configure(expressOauth());
};
