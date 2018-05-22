/* eslint-disable import/no-extraneous-dependencies, prefer-destructuring */
const { bridge } = require('giveth-bridge');
const startNetworks = require('./startNetworks');

const BLOCK_TIME = 5;

const bridgeConfig = {
  dataDir: './data/bridge',
  homeNodeUrl: 'http://localhost:8545',
  homeBridge: '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab',
  homeGasPrice: 1000000000,
  homeConfirmations: 3,
  foreignNodeUrl: 'http://localhost:8546',
  foreignBridge: '0xD86C8F0327494034F60e25074420BcCF560D5610',
  foreignGasPrice: 1000000000,
  foreignConfirmations: 3,
  pollTime: 30 * 1000, // 30 seconds
  liquidPledging: '0xBeFdf675cb73813952C5A9E4B84ea8B866DBA592',
  pk: '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d', // ganache account 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1
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
};

process.on('SIGINT', () => {
  if (homeNetwork) homeNetwork.close();
  if (foreignNetwork) foreignNetwork.close();
  process.exit();
});

start();
