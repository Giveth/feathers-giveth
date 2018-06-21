/* eslint-disable import/no-extraneous-dependencies, prefer-destructuring */
const bridge = require('giveth-bridge/bridge');
const startNetworks = require('./startNetworks');
const logger = require('winston');

const BLOCK_TIME = 5;

const bridgeConfig = {
  dataDir: './data/bridge',
  homeNodeUrl: 'http://localhost:8545',
  homeBridge: '0x8fed3F9126e7051DeA6c530920cb0BAE5ffa17a8',
  homeGasPrice: 1000000000,
  homeConfirmations: 1,
  foreignNodeUrl: 'http://localhost:8546',
  foreignBridge: '0x8fed3F9126e7051DeA6c530920cb0BAE5ffa17a8',
  foreignGasPrice: 1000000000,
  foreignConfirmations: 1,
  pollTime: 15 * 1000, // 15 seconds
  liquidPledging: '0xBeFdf675cb73813952C5A9E4B84ea8B866DBA592',
  pk: '0x77c5495fbb039eed474fc940f29955ed0531693cc9212911efd35dff0373153f', // ganache account 11
  isTest: false,
};

let homeNetwork;
let foreignNetwork;

const start = async () => {
  const networks = await startNetworks(BLOCK_TIME);
  homeNetwork = networks.homeNetwork;
  foreignNetwork = networks.foreignNetwork;

  await homeNetwork.waitForStart();
  await foreignNetwork.waitForStart();

  bridge(bridgeConfig);
  logger.level = 'debug';
};

process.on('SIGINT', () => {
  if (homeNetwork) homeNetwork.close();
  if (foreignNetwork) foreignNetwork.close();
  process.exit();
});

start();
