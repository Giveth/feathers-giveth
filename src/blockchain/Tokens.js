import Contract from 'web3-eth-contract';
import { toBN } from 'web3-utils';
import { LPPCampaign } from 'lpp-campaign';
import { LPPDacs } from 'lpp-dacs';

import { getTokenInformation } from './helpers';

const GenerateTokenEvent = {
  anonymous: false,
  inputs:
    [ { indexed: true, name: 'liquidPledging', type: 'address' },
      { indexed: false, name: 'addr', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' } ],
  name: 'GenerateTokens',
  type: 'event',
  signature: '0xf8a6cdb77a67632a46c21be3e7ca9b2519ecd39d21e514f9222c5b2f19ce23ed',
};

const decodeEventABI = Contract.prototype._decodeEventABI.bind(GenerateTokenEvent);


/**
 * class to track donation token balances
 */
class Tokens {
  constructor(app, web3) {
    this.app = app;
    this.web3 = web3;
    this.tokens = this.app.service('tokens');
  }

  campaignTokensGenerated(event) {
    const decodedEvent = decodeEventABI(event);
    console.log('handling campaign GenerateTokens Event: ', decodedEvent); // eslint-disable-line no-console

    new LPPCampaign(this.web3, decodedEvent.address)
      .token()
      .then(token => this.updateTokens(token, decodedEvent.returnValues.addr, decodedEvent.returnValues.amount))
      .catch(console.error); // eslint-disable-line no-console
  }

  dacTokensGenerated(event) {
    if (event.event !== 'GenerateTokens') throw new Error('dacTokensGenerated only handles GenerateTokens events');

    new LPPDacs(this.web3, this.app.get('blockchain.dacsAddress'))
      .getDac(event.returnValues.idDelegate)
      .then(({ token }) => this.updateTokens(token, event.returnValues.addr, event.returnValues.amount))
      .catch(console.error); // eslint-disable-line no-console
  }

  dacTokensDestroyed(event) {
    if (event.event !== 'DestroyTokens') throw new Error('dacTokensDestroyed only handles DestroyTokens events');

    new LPPDacs(this.web3, this.app.get('blockchain.dacsAddress'))
      .getDac(event.returnValues.idDelegate)
      .then(({ token }) => this.updateTokens(token, event.returnValues.addr, event.returnValues.amount, false))
      .catch(console.error); // eslint-disable-line no-console
  }

  updateTokens(tokenAddress, addr, amount, generated = true) {
    return this.tokens.find({
        query: { tokenAddress, userAddress: addr },
        paginate: false,
      })
      .then((data) => {
        if (data.length === 0) {
          return getTokenInformation(this.web3, tokenAddress)
            .then(tokenInfo => this.tokens.create({
              tokenAddress,
              tokenName: tokenInfo.name,
              tokenSymbol: tokenInfo.symbol,
              balance: amount,
              userAddress: addr,
            }));
        }
        const t = data[ 0 ];

        const balance = (generated) ?
          toBN(t.balance).add(toBN(amount)).toString() :
          toBN(t.balance).sub(toBN(amount)).toString();

        return this.tokens.patch(t._id, { balance });
      });
  }
}

export default Tokens;
