const { AuthenticationService } = require('@feathersjs/authentication');

class MyAuthenticationService extends AuthenticationService {
  async getPayload(authResult, params) {
    await super.getPayload(authResult, params);
    return { userId: authResult.user.address };
  }
}
module.exports = { MyAuthenticationService };
