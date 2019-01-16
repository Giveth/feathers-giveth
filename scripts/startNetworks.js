/* eslint-disable import/no-extraneous-dependencies */
const path = require('path');
const mkdirp = require('mkdirp');
const Ganache = require('ganache-cli');
const { utils } = require('web3');

const attachWaitForStart = server => {
  // eslint-disable-next-line no-param-reassign
  server.waitForStart = () =>
    new Promise((resolve, reject) => {
      if (server.listening) {
        resolve();
        return;
      }

      server.on('listening', () => resolve());
      server.on('close', () => reject(new Error('closed')));
    });
};

process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

module.exports = async (blockTime = 0) => {
  const homeDbPath = path.join(__dirname, '../data/ganache-cli/homeNetwork');
  const foreignDbPath = path.join(__dirname, '../data/ganache-cli/foreignNetwork');

  mkdirp.sync(homeDbPath);
  mkdirp.sync(foreignDbPath);

  // start networks
  const homeNetwork = Ganache.server({
    gasLimit: utils.toHex(8000000),
    total_accounts: 11,
    ws: true,
    seed: 'TestRPC is awesome!',
    db_path: homeDbPath,
    network_id: 66,
    logger: {
      log: val => console.log('Home Network: ', val),
    },
    blockTime,
  });

  const foreignNetwork = Ganache.server({
    gasLimit: utils.toHex(7400000),
    ws: true,
    total_accounts: 11,
    db_path: foreignDbPath,
    network_id: 67,
    seed: 'TestRPC is awesome!',
    logger: {
      log: val => console.log('Foreign Network: ', val),
    },
    blockTime,
  });

  homeNetwork.listen(8545, '127.0.0.1', () => {});
  foreignNetwork.listen(8546, '127.0.0.1', () => {});

  attachWaitForStart(homeNetwork);
  attachWaitForStart(foreignNetwork);

  return {
    homeNetwork,
    foreignNetwork,
  };
};
