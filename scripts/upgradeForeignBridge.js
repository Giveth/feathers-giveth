/* eslint-disable import/no-extraneous-dependencies */
const Web3 = require('web3');
const { LiquidPledging, Kernel } = require('giveth-liquidpledging');
const { MiniMeToken, MiniMeTokenFactory } = require('minimetoken');
const { ForeignGivethBridge } = require('giveth-bridge');
const { LPPCappedMilestone } = require('lpp-capped-milestone');

const keys = require('./keys.js');

const homeWeb3 = new Web3('https://ropsten.infura.io');
const foreignWeb3 = new Web3('https://rinkeby.infura.io/Id3GoVvLrsO08ZNjxiKz');

const ropstenPK = keys.ropsten;
const rinkebyPK = keys.rinkeby;
const bridgePK = keys.bridge;
const homeAccount = homeWeb3.eth.accounts.privateKeyToAccount(ropstenPK);
const foreignAccount = foreignWeb3.eth.accounts.privateKeyToAccount(rinkebyPK);
const bridgeAccount = foreignWeb3.eth.accounts.privateKeyToAccount(bridgePK);
homeWeb3.eth.accounts.wallet.add(homeAccount);
foreignWeb3.eth.accounts.wallet.add(foreignAccount);
foreignWeb3.eth.accounts.wallet.add(bridgeAccount);

const gasPrice = homeWeb3.utils.toWei('5.5', 'gwei');

async function deploy() {
  const { keccak256 } = foreignWeb3.utils;
  const bridgeAddy = bridgeAccount.address;
  const foreignFrom = foreignAccount.address;

  const liquidPledging = new LiquidPledging(
    foreignWeb3,
    '0x06A6743268EbFb2649301f3Ce651C44AbafCC4f5',
  );
  const kernel = new Kernel(foreignWeb3, await liquidPledging.kernel());

  // deploy milestone plugin
  const milestoneApp = await LPPCappedMilestone.new(foreignWeb3, foreignFrom, {
    from: foreignFrom,
    gasPrice,
  }).on('transactionHash', txHash => console.log('milestoneApp ->', txHash));
  await kernel.setApp(keccak256('base'), keccak256('lpp-capped-milestone'), milestoneApp.$address, {
    from: foreignFrom,
    gasPrice,
  });

  const currentForeignBridge = new ForeignGivethBridge(
    foreignWeb3,
    '0xE91Bf42cb524afa9f01AB56E1804eD162C643d05',
  );
  const tokenFactory = new MiniMeTokenFactory(
    foreignWeb3,
    await currentForeignBridge.tokenFactory(),
  );

  const mainTokens = [];

  await currentForeignBridge.pause({ from: bridgeAddy });

  console.log('bridge is now paused');

  // const tokenEvents = await currentForeignBridge.$contract.getPastEvents('allEvents', {
  // fromBlock: 0,
  // });
  // need to do this b/c we changed the event to index mainToken
  const tokenEvents = await foreignWeb3.eth
    .getPastLogs({
      fromBlock: '0x0',
      topics: ['0xdffbd9ded1c09446f09377de547142dcce7dc541c8b0b028142b1eba7026b9e7'],
      address: currentForeignBridge.$address,
    })
    .then(ev =>
      ev.map(e => {
        e.mainToken = `0x${e.data.slice(26, 66)}`;
        e.sideToken = `0x${e.data.slice(66 + 24)}`;
        return e;
      }),
    );

  let nonce = await foreignWeb3.eth.getTransactionCount(foreignFrom);

  const sideTokens = await Promise.all(
    tokenEvents.map(async e => {
      console.log(e);
      mainTokens.push(e.mainToken);
      const t = new MiniMeToken(foreignWeb3, e.sideToken);
      return t
        .createCloneToken(await t.name(), await t.decimals(), await t.symbol(), 0, true, {
          from: foreignFrom,
          nonce: nonce++,
        })
        .then(r => r.events.NewCloneToken.returnValues._cloneToken);
    }),
  );

  const foreignBridge = await ForeignGivethBridge.new(
    foreignWeb3,
    foreignFrom,
    foreignFrom,
    tokenFactory.$address,
    liquidPledging.$address,
    bridgeAddy,
    mainTokens,
    sideTokens,
    { from: foreignFrom, $extraGas: 100000, gasPrice },
  ).on('transactionHash', txHash => console.log('foreignBridge tx =>', txHash));

  await kernel.setApp(keccak256('app'), keccak256('ForeignGivethBridge'), foreignBridge.$address, {
    from: foreignFrom,
    gasPrice,
  });

  nonce = await foreignWeb3.eth.getTransactionCount(foreignFrom);
  await Promise.all(
    sideTokens.map(t =>
      new MiniMeToken(foreignWeb3, t).changeController(foreignBridge.$address, {
        from: foreignFrom,
        gasPrice,
      }),
    ),
  );

  console.log({
    foreignBridge: foreignBridge.$address,
    mainTokens,
    sideTokens,
  });
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

process.on('unhandledRejection', (reason, p) =>
  console.error('Unhandled Rejection at: Promise ', p, reason),
);

deploy();
