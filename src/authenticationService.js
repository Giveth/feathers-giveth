const { AuthenticationService } = require('@feathersjs/authentication');

class MyAuthenticationService extends AuthenticationService {
  async getPayload(authResult, params) {
    await super.getPayload(authResult, params);
    return { userId: authResult.info.userId };
  }
}
module.exports = { MyAuthenticationService };
