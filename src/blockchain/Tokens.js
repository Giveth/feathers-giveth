import logger from 'winston';
import Contract from 'web3-eth-contract';
import { toBN } from 'web3-utils';

import { getTokenInformation } from './helpers';

const GenerateTokenEvent = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'liquidPledging', type: 'address' },
    { indexed: false, name: 'addr', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ],
  name: 'GenerateTokens',
  type: 'event',
  signature: '0xf8a6cdb77a67632a46c21be3e7ca9b2519ecd39d21e514f9222c5b2f19ce23ed',
};

const DestroyTokenEvent = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'liquidPledging', type: 'address' },
    { indexed: false, name: 'addr', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ],
  name: 'DestroyTokens',
  type: 'event',
  signature: '0xeb3ddd2dc2528a35014fadbf1007ad1329899f52b19ea27ed3815208721f47bc',
};

/**
 * class to track donation token balances
 */
class Tokens {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;
    this.tokens = this.app.service('tokens');
  }

  tokensGenerated(event) {
    if (event.event !== 'GenerateTokens')
      throw new Error('tokensGenerated only handles GenerateTokens events');
    const { address } = event;

    const find = service =>
      service.find({
        query: { plugin: address },
        paginate: false,
      });

    find(this.app.service('dacs'))
      .then(data => {
        if (data.length === 0) {
          return find(this.app.service('campaigns')).then(d => (d.length > 0 ? d[0] : undefined));
        }

        return data[0];
      })
      .then(entity => {
        if (!entity) {
          logger.error(`Couldn't find dac or campaign with plugin address of ${address}`);
          return;
        }
        this.updateTokens(entity.tokenAddress, event.returnValues.addr, event.returnValues.amount);
      })
      .catch(logger.error);
  }

  tokensDestroyed(event) {
    if (event.event !== 'DestroyTokens')
      throw new Error('tokensDestroyed only handles DestroyTokens events');

    const { address } = event;

    this.app
      .service('dacs')
      .find({
        query: { plugin: address },
        paginate: false,
      })
      .then(data => (data.length > 0 ? data[0] : undefined))
      .then(dac => {
        if (!dac) {
          logger.error(`Couldn't find dac with plugin address of ${address}`);
          return;
        }
        this.updateTokens(
          dac.tokenAddress,
          event.returnValues.addr,
          event.returnValues.amount,
          false,
        );
      })
      .catch(logger.error);
  }

  updateTokens(tokenAddress, addr, amount, generated = true) {
    return this.tokens
      .find({
        query: { tokenAddress, userAddress: addr },
        paginate: false,
      })
      .then(data => {
        if (data.length === 0) {
          return getTokenInformation(this.web3, tokenAddress).then(tokenInfo =>
            this.tokens.create({
              tokenAddress,
              tokenName: tokenInfo.name,
              tokenSymbol: tokenInfo.symbol,
              balance: amount,
              userAddress: addr,
            }),
          );
        }
        const t = data[0];

        const balance = generated
          ? toBN(t.balance)
              .add(toBN(amount))
              .toString()
          : toBN(t.balance)
              .sub(toBN(amount))
              .toString();

        return this.tokens.patch(t._id, { balance });
      });
  }

  static decodeGenerateTokensEventABI(event) {
    return Contract.prototype._decodeEventABI.bind(GenerateTokenEvent)(event);
  }

  static decodeDestroyTokensEventABI(event) {
    return Contract.prototype._decodeEventABI.bind(DestroyTokenEvent)(event);
  }
}

export default Tokens;
