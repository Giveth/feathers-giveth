const Debug = require('debug');
const Strategy = require('passport-strategy');

const Accounts = require('web3-eth-accounts');
const { isAddress, toChecksumAddress } = require('web3-utils');

const debug = Debug('passportjs:Web3Strategy');

// TODO clean this up and split to separate package

function recoverAddress(message, signature) {
  const accounts = new Accounts();
  // const address = accounts.recover(accounts.hashMessage(message), signature);
  const address = accounts.recover(message, signature);

  return toChecksumAddress(address);
}

/**
 * The Web3 authentication strategy authenticates requests based on a signed message from an ethereum account.
 *
 * Applications must supply a challenger which implements 3 methods...
 *   - getMessage(address, done)      This is called to get the message the user should have signed to verify their
 *                                    identity. `done` is an error first callback, with the 2nd arg expected to be
 *                                    the message
 *   - createMessage(address, done)   This is called when issuing a challenge and should pass a message that the
 *                                    user needs to sign to authenticate to the done callback. `done` is an error first
 *                                    callback, with the 2nd arg expected to be the message
 *   - verify(address, done)          This is called when a user has successfully signed a message. done is an error
 *                                    first callback, the 2nd arg should be a truthy value if the verification succeeded,
 *                                    and the 3rd arg should be any additional info to pass on.
 *
 * The done callback in the above methods is an error first callback.
 *
 */
class Web3Strategy extends Strategy {
  constructor(challenger) {
    super();
    this.challenger = challenger;

    if (!this.challenger || !this.challenger.getMessage || !this.challenger.generateMessage) {
      throw new Error(
        "Web3Strategy was given an invalid challenger. Expected an object implementing 'verify', 'getMessage' and 'setMessage'",
      );
    }
  }

  // authenticate(req, options) {
  authenticate(req) {
    const { address, signature } = req.query;

    if (!address) return this.fail(400);

    if (!isAddress(address)) {
      debug(`${address} is an invalid address`);
      return this.fail('invalid address', 400);
    }

    // no signature, then they need a challenge msg to sign
    if (!signature) return this.issueChallenge(address);

    return this.challenger.getMessage(address, (err, message) => {
      if (err) {
        if (err.name === 'NotFound') return this.issueChallenge(address);

        return this.fail(err.message, 500);
      }

      // issue a challenge if there is not a valid message
      if (!message) return this.issueChallenge(address);

      const recoveredAddress = recoverAddress(message, signature);
      const cAddress = toChecksumAddress(address);

      if (recoveredAddress !== cAddress)
        return this.fail('Recovered address does not match provided address');

      return this.challenger.verify(cAddress, (e, user, info) => {
        if (!user) return this.fail('Recovered address rejected');

        return this.success(user, info);
      });
    });
  }

  issueChallenge(address) {
    this.challenger.generateMessage(address, (err, message) => {
      if (err) return this.fail('Error generating challenge', 500);

      if (!message) return this.fail('Failed to generate challenge message', 500);

      return this.fail(`Challenge = ${message}`);
    });
  }
}

module.exports = Web3Strategy;
