const config = require('config');
const jwt = require('jsonwebtoken');

const testAddress = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';

function getJwt(address = testAddress) {
  const authentication = config.get('authentication');
  const jwtData =  authentication.jwt;
  const token = jwt.sign(
    {
      userId: address,
      aud: jwtData.audience,
    },
    authentication.secret,
      {
        algorithm: jwtData.algorithm,
        expiresIn: jwtData.expiresIn,
        issuer: jwtData.issuer,
        subject: jwtData.subject,
        header: jwtData.header,
      },
    );
  return 'Bearer ' +token;

}

module.exports = {
  getJwt
};
