/* eslint-disable no-continue */
/* eslint-disable no-console */
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const yargs = require('yargs');
const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');
const toFn = require('../../src/utils/to');
const DonationUsdValueUtility = require('./DonationUsdValueUtility');

const { argv } = yargs
  .option('dry-run', {
    describe: 'enable dry run',
    type: 'boolean',
    default: false,
  })
  .option('update-network-cache', {
    describe: 'update network state and events cache',
    type: 'boolean',
    default: false,
  })
  .option('config', {
    describe: 'basename of a json config file name. e.g. default, production, develop',
    type: 'string',
    demand: true,
  })
  .option('cache-dir', {
    describe: 'directory to create cache file inside',
    type: 'string',
    default: path.join(os.tmpdir(), 'simulation-script'),
  })
  .option('log-dir', {
    describe: 'directory to save logs inside, if empty logs will be write to stdout',
    type: 'string',
  })
  .option('debug', {
    describe: 'produce debugging log',
    type: 'boolean',
  })
  .demandOption(
    ['config'],
    'Please provide config file holds network gateway and DB connection URI',
  )
  .version(false)
  .help();

const configFileName = argv.config;
const cacheDir = argv['cache-dir'];
const logDir = argv['log-dir'];
const updateState = argv['update-network-cache'];
const updateEvents = argv['update-network-cache'];
const findConflicts = !argv['dry-run'];
const fixConflicts = !argv['dry-run'];

console.log(cacheDir);
const winstonTransports = [];
if (logDir) {
  winstonTransports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'simulation-error-%DATE%.log',
      maxFiles: '30d',
    }),
  );
} else {
  winstonTransports.push(new winston.transports.Console());
}

const logger = winston.createLogger({
  level: argv.debug ? 'debug' : 'error',
  format: winston.format.simple(),
  transports: winstonTransports,
});

const terminateScript = (message = '', code = 0) => {
  if (message) {
    logger.error(`Exit message: ${message}`);
  }

  logger.on('finish', () => {
    setTimeout(() => process.exit(code), 5 * 1000);
  });

  logger.end();
};

if (!argv.config) {
  terminateScript('config file name cannot be empty ');
}

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName.toString()}.json`);

const { ignoredTransactions } = require('./eventProcessingHelper.json');

// Create output log file

// Map token symbol to foreign address
const tokenSymbolToForeignAddress = {};
config.tokenWhitelist.forEach(token => {
  tokenSymbolToForeignAddress[token.symbol] = token.foreignAddress.toLowerCase();
});

const symbolDecimalsMap = {};

config.tokenWhitelist.forEach(({ symbol, decimals }) => {
  symbolDecimalsMap[symbol] = {
    cutoff: new BigNumber(10 ** (18 - Number(decimals))),
  };
});

const { nodeUrl, liquidPledgingAddress } = config.blockchain;

const appFactory = () => {
  const data = {};
  return {
    get(key) {
      return data[key];
    },
    set(key, val) {
      data[key] = val;
    },
  };
};

const app = appFactory();
app.set('mongooseClient', mongoose);

const Milestones = require('../../src/models/milestones.model').createModel(app);
const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const DACs = require('../../src/models/dacs.model').createModel(app);
const Donations = require('../../src/models/donations.model').createModel(app);
const PledgeAdmins = require('../../src/models/pledgeAdmins.model').createModel(app);
const ConversationRates = require('../../src/models/conversionRates.model')(app);

const { DonationStatus } = require('../../src/models/donations.model');
const { AdminTypes } = require('../../src/models/pledgeAdmins.model');
const { DacStatus } = require('../../src/models/dacs.model');
const { CampaignStatus } = require('../../src/models/campaigns.model');
const { MilestoneStatus } = require('../../src/models/milestones.model');

const donationUsdValueUtility = new DonationUsdValueUtility(ConversationRates);

// Blockchain data
let events;
let pledges;
let admins;

// Map from pledge id to list of donations which are charged and can be used to move money from
const chargedDonationListMap = {};
// Map from pledge id to list of donations belonged to the pledge and are not used yet!
const pledgeNotUsedDonationListMap = {};
// Map from _id to list of donations
const donationMap = {};
// Map from txHash to list of included events
const txHashTransferEventMap = {};
// Map from owner pledge admin ID to dictionary of charged donations
const ownerPledgeAdminIdChargedDonationMap = {};

const instantiateWeb3 = url => {
  const provider =
    url && url.startsWith('ws')
      ? new Web3.providers.WebsocketProvider(url, {
          clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
          },
        })
      : url;
  return new Web3(provider);
};

let foreignWeb3;
const getForeignWeb3 = () => {
  if (!foreignWeb3) {
    foreignWeb3 = instantiateWeb3(nodeUrl);
  }
  return foreignWeb3;
};

// Gets status of liquidpledging storage
const fetchBlockchainData = async () => {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir);
    }
  } catch (e) {
    terminateScript(e.stack);
  }
  const stateFile = path.join(cacheDir, `./liquidPledgingState_${configFileName}.json`);
  const eventsFile = path.join(cacheDir, `./liquidPledgingEvents_${configFileName}.json`);

  let state = {};

  if (!updateState) state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {};
  events = fs.existsSync(eventsFile) ? JSON.parse(fs.readFileSync(eventsFile)) : [];

  if (updateState || updateEvents) {
    const web3 = getForeignWeb3();
    let fromBlock = 0;
    let fetchBlockNum = 'latest';
    if (updateEvents) {
      fromBlock = events.length > 0 ? events[events.length - 1].blockNumber + 1 : 0;
      fetchBlockNum = (await web3.eth.getBlockNumber()) - config.blockchain.requiredConfirmations;
    }

    const liquidPledging = new LiquidPledging(web3, liquidPledgingAddress);
    const liquidPledgingState = new LiquidPledgingState(liquidPledging);

    let newEvents = [];
    let error = null;
    let firstTry = true;
    while (
      error ||
      !Array.isArray(state.pledges) ||
      state.pledges.length <= 1 ||
      !Array.isArray(state.admins) ||
      state.admins.length <= 1 ||
      !Array.isArray(newEvents)
    ) {
      if (!firstTry) {
        logger.error('Some problem on fetching network info... Trying again!');
        if (!Array.isArray(state.pledges) || state.pledges.length <= 1) {
          logger.debug(`state.pledges: ${state.pledges}`);
        }
        if (!Array.isArray(state.admins) || state.admins.length <= 1) {
          logger.debug(`state.admins: ${state.admins}`);
        }
      }
      // eslint-disable-next-line no-await-in-loop
      [error, [state, newEvents]] = await toFn(
        Promise.all([
          updateState ? liquidPledgingState.getState() : Promise.resolve(state),
          updateEvents
            ? liquidPledging.$contract.getPastEvents('allEvents', {
                fromBlock,
                toBlock: fetchBlockNum,
              })
            : Promise.resolve([]),
        ]),
      );
      if (error && error instanceof Error) {
        logger.error(`Error on fetching network info\n${error.stack}`);
      }
      firstTry = false;
    }

    if (updateState) fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    if (updateEvents && newEvents) {
      events = [...events, ...newEvents];
      fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
    }
  }

  events.forEach(e => {
    if (e.event === 'Transfer') {
      const { transactionHash } = e;
      const list = txHashTransferEventMap[transactionHash] || [];
      if (list.length === 0) {
        txHashTransferEventMap[transactionHash] = list;
      }
      list.push(e);
    }
  });

  pledges = state.pledges;
  admins = state.admins;
};

// Update createdAt date of donations based on transaction date
// @params {string} startDate
// eslint-disable-next-line no-unused-vars
const updateDonationsCreatedDate = async startDate => {
  const web3 = getForeignWeb3();
  await Donations.find({
    createdAt: {
      $gte: startDate.toISOString(),
    },
  })
    .cursor()
    .eachAsync(async ({ _id, txHash, createdAt }) => {
      const { blockNumber } = await web3.eth.getTransaction(txHash);
      const { timestamp } = await web3.eth.getBlock(blockNumber);
      const newCreatedAt = new Date(timestamp * 1000);
      if (createdAt.toISOString() !== newCreatedAt.toISOString()) {
        logger.info(
          `Donation ${_id.toString()} createdAt is changed from ${createdAt.toISOString()} to ${newCreatedAt.toISOString()}`,
        );
        logger.info('Updating...');
        const [d] = await Donations.find({ _id }).exec();
        d.createdAt = newCreatedAt;
        await d.save();
      }
    });
};

// Fills pledgeNotUsedDonationListMap map to contain donation items for each pledge
// Fills donationMap to map id to donation item
const fetchDonationsInfo = async () => {
  // TODO: pendingAmountRemaining is not considered in updating, it should be removed for successful transactions
  await Donations.find({})
    .sort({ createdAt: 1 })
    .cursor()
    .eachAsync(
      ({
        _id,
        amount,
        amountRemaining,
        pledgeId,
        status,
        mined,
        txHash,
        parentDonations,
        ownerId,
        ownerType,
        ownerTypeId,
        intendedProjectId,
        giverAddress,
        token,
        isReturn,
        usdValue,
        createdAt,
      }) => {
        const list = pledgeNotUsedDonationListMap[pledgeId.toString()] || [];
        if (list.length === 0) {
          pledgeNotUsedDonationListMap[pledgeId.toString()] = list;
        }

        const item = {
          _id: _id.toString(),
          amount: amount.toString(),
          savedAmountRemaining: amountRemaining.toString(),
          amountRemaining: new BigNumber(0),
          txHash,
          status,
          mined,
          parentDonations: parentDonations.map(id => id.toString()),
          ownerId,
          ownerType,
          ownerTypeId,
          intendedProjectId,
          giverAddress,
          pledgeId: pledgeId.toString(),
          token,
          isReturn,
          usdValue,
          createdAt,
        };

        list.push(item);
        donationMap[_id.toString()] = item;
      },
    );
};

const convertPledgeStateToStatus = (pledge, pledgeAdmin) => {
  const { pledgeState, delegates, intendedProject } = pledge;
  switch (pledgeState) {
    case 'Paying':
    case '1':
      return DonationStatus.PAYING;

    case 'Paid':
    case '2':
      return DonationStatus.PAID;

    case 'Pledged':
    case '0':
      if (intendedProject !== '0') return DonationStatus.TO_APPROVE;
      if (pledgeAdmin.type === 'Giver' || delegates.length > 0) return DonationStatus.WAITING;
      return DonationStatus.COMMITTED;

    default:
      return null;
  }
};

/**
 * Determine if this transfer was a return of excess funds of an over-funded milestone
 * @param {object} transferInfo
 */
async function isReturnTransfer(transferInfo) {
  const { fromPledge, fromPledgeAdmin, toPledgeId, txHash, fromPledgeId } = transferInfo;
  // currently only milestones will can be over-funded
  if (fromPledgeId === '0' || fromPledgeAdmin.type !== AdminTypes.MILESTONE) return false;

  const transferEventsInTx = txHashTransferEventMap[txHash];

  // ex events in return case:
  // Transfer(from: 1, to: 2, amount: 1000)
  // Transfer(from: 2, to: 1, amount: < 1000)
  return transferEventsInTx.some(
    e =>
      // it may go directly to fromPledge.oldPledge if this was delegated funds
      // being returned b/c the intermediary pledge is the pledge w/ the intendedProject
      [e.returnValues.from, fromPledge.oldPledge].includes(toPledgeId) &&
      e.returnValues.to === fromPledgeId,
  );
}

const isRejectedDelegation = ({ fromPledge, toPledge }) =>
  !!fromPledge &&
  Number(fromPledge.intendedProject) > 0 &&
  fromPledge.intendedProject !== toPledge.owner;

const addChargedDonation = donation => {
  const candidates = chargedDonationListMap[donation.pledgeId] || [];
  if (candidates.length === 0) {
    chargedDonationListMap[donation.pledgeId] = candidates;
  }
  candidates.push(donation);

  const ownerEntityDonations = ownerPledgeAdminIdChargedDonationMap[donation.ownerId] || {};
  if (Object.keys(ownerEntityDonations).length === 0) {
    ownerPledgeAdminIdChargedDonationMap[donation.ownerId] = ownerEntityDonations;
  }
  ownerEntityDonations[donation._id] = donation;
};

const handleFromDonations = async (from, to, amount, transactionHash) => {
  const usedFromDonations = []; // List of donations which could be parent of the donation
  let giverAddress;

  const toUnusedDonationList = pledgeNotUsedDonationListMap[to] || []; // List of donations which are candidates to be charged

  const toPledge = pledges[Number(to)];
  const toOwnerId = toPledge.owner;

  const toOwnerAdmin = admins[Number(toOwnerId)];

  if (from !== '0') {
    const candidateChargedParents = chargedDonationListMap[from] || [];

    // Trying to find the matching donation from DB
    let candidateToDonationList = toUnusedDonationList.filter(
      item => item.txHash === transactionHash && item.amountRemaining.eq(0),
    );

    if (candidateToDonationList.length > 1) {
      logger.debug('candidateToDonationList length is greater than one!');
    } else if (candidateToDonationList.length === 0) {
      // Try to find donation among failed ones!
      const failedDonationList = pledgeNotUsedDonationListMap['0'] || [];
      const matchingFailedDonationIndex = failedDonationList.findIndex(item => {
        if (item.txHash === transactionHash && item.amount === amount) {
          const { parentDonations } = item;
          if (from === '0') {
            return parentDonations.length === 0;
          } // It should not have parent
          // Check whether parent pledgeId equals from
          if (parentDonations.length === 0) return false;
          const parent = donationMap[item.parentDonations[0]];
          return parent.pledgeId === from;
        }
        return false;
      });

      // A matching failed donation found, it's not failed and should be updated with correct value
      if (matchingFailedDonationIndex !== -1) {
        const toFixDonation = failedDonationList[matchingFailedDonationIndex];
        logger.error(`Donation ${toFixDonation._id} hasn't failed, it should be updated`);

        // Remove from failed donations
        failedDonationList.splice(matchingFailedDonationIndex, 1);

        toFixDonation.status = convertPledgeStateToStatus(toPledge, toOwnerAdmin);
        toFixDonation.pledgeId = to;
        toFixDonation.mined = true;
        toUnusedDonationList.push(toFixDonation);

        candidateToDonationList = [toFixDonation];

        logger.debug('Will update to:');
        logger.debug(JSON.stringify(toFixDonation, null, 2));

        if (fixConflicts) {
          logger.debug('Updating...');
          await Donations.update(
            { _id: toFixDonation._id },
            { status: toFixDonation.status, pledgeId: to },
          ).exec();
        }
      }
    }

    // Reduce money from parents one by one
    if (candidateChargedParents.length > 0) {
      let fromAmount = new BigNumber(amount);

      // If this is a return transfer, last donate added to charged parents has the same
      // transaction hash and greater than or equal amount remaining than this transfer amount
      // Money should be removed from that donation for better transparency
      const lastInsertedCandidate = candidateChargedParents[candidateChargedParents.length - 1];
      if (
        lastInsertedCandidate.txHash === transactionHash &&
        lastInsertedCandidate.amountRemaining.gte(amount)
      ) {
        giverAddress = lastInsertedCandidate.giverAddress;
        lastInsertedCandidate.amountRemaining = lastInsertedCandidate.amountRemaining.minus(amount);

        fromAmount = new BigNumber(0);
        logger.debug(
          `Amount ${amount} is reduced from ${JSON.stringify(
            {
              ...lastInsertedCandidate,
              amountRemaining: lastInsertedCandidate.amountRemaining.toFixed(),
            },
            null,
            2,
          )}`,
        );

        if (lastInsertedCandidate._id) {
          usedFromDonations.push(lastInsertedCandidate._id);
        }

        if (lastInsertedCandidate.amountRemaining.isZero()) {
          candidateChargedParents.pop();
        }
      } else {
        let consumedCandidates = 0;
        for (let j = 0; j < candidateChargedParents.length; j += 1) {
          const item = candidateChargedParents[j];

          if (item.giverAddress) {
            giverAddress = item.giverAddress;
          }

          const min = BigNumber.min(item.amountRemaining, fromAmount);
          item.amountRemaining = item.amountRemaining.minus(min);
          if (item.amountRemaining.isZero()) {
            consumedCandidates += 1;
          }
          fromAmount = fromAmount.minus(min);
          logger.debug(
            `Amount ${min.toFixed()} is reduced from ${JSON.stringify(
              { ...item, amountRemaining: item.amountRemaining.toFixed() },
              null,
              2,
            )}`,
          );
          if (item._id) {
            usedFromDonations.push(item._id);
          }
          if (fromAmount.eq(0)) break;
        }

        chargedDonationListMap[from] = candidateChargedParents.slice(consumedCandidates);
      }

      if (!fromAmount.eq(0)) {
        logger.debug(`from delegate ${from} donations don't have enough amountRemaining!`);
        logger.debug(`Deficit amount: ${fromAmount.toFixed()}`);
        logger.debug('Not used candidates:');
        candidateChargedParents.forEach(candidate =>
          logger.debug(JSON.stringify(candidate, null, 2)),
        );
        terminateScript();
      }
    } else {
      terminateScript(`There is no donation for transfer from ${from} to ${to}`);
    }
  }

  return { usedFromDonations, giverAddress };
};

const handleToDonations = async ({
  from,
  to,
  amount,
  transactionHash,
  blockNumber,
  usedFromDonations,
  giverAddress,
  isReverted = false,
}) => {
  const toNotFilledDonationList = pledgeNotUsedDonationListMap[to] || []; // List of donations which are candidates to be charged

  const toIndex = toNotFilledDonationList.findIndex(
    item => item.txHash === transactionHash && item.amountRemaining.eq(0),
  );

  const toDonation = toIndex !== -1 ? toNotFilledDonationList.splice(toIndex, 1)[0] : undefined;

  // It happens when a donation is cancelled, we choose the first one (created earlier)
  // if (toDonationList.length > 1) {
  //   console.log('toDonationList length is greater than 1');
  //   process.exit();
  // }

  const fromPledge = pledges[Number(from)];
  const toPledge = pledges[Number(to)];

  const toOwnerId = toPledge.owner;
  const fromOwnerId = from !== '0' ? fromPledge.owner : 0;

  const toOwnerAdmin = admins[Number(toOwnerId)];
  const fromOwnerAdmin = from !== '0' ? admins[Number(fromOwnerId)] : {};

  const [fromPledgeAdmin] = await PledgeAdmins.find({ id: Number(fromOwnerId) }).exec();

  let isReturn = isReverted;
  if (!isReturn) {
    const returnedTransfer = await isReturnTransfer({
      fromPledge,
      fromPledgeAdmin,
      fromPledgeId: from,
      toPledgeId: to,
      txHash: transactionHash,
    });
    isReturn = isReturn || returnedTransfer;
  }

  if (!isReturn) {
    const rejectedDelegation = isRejectedDelegation({ toPledge, fromPledge });
    isReturn = isReturn || rejectedDelegation;
  }

  if (toDonation === undefined) {
    // If parent is cancelled, this donation is not needed anymore
    const status = convertPledgeStateToStatus(toPledge, toOwnerAdmin);
    let expectedToDonation = {
      txHash: transactionHash,
      parentDonations: usedFromDonations,
      from,
      pledgeId: to,
      pledgeState: toPledge.pledgeState,
      amount,
      amountRemaining: new BigNumber(amount),
      ownerId: toOwnerId,
      status,
      giverAddress,
      isReturn,
    };

    if (fixConflicts) {
      let [toPledgeAdmin] = await PledgeAdmins.find({ id: Number(toOwnerId) }).exec();
      if (toPledgeAdmin === undefined) {
        if (toOwnerAdmin.type !== 'Giver') {
          terminateScript(
            `No PledgeAdmin record exists for non user admin ${JSON.stringify(
              toOwnerAdmin,
              null,
              2,
            )}`,
          );
          return;
        }

        // Create user pledge admin
        toPledgeAdmin = new PledgeAdmins({
          id: Number(toOwnerId),
          type: AdminTypes.GIVER,
          typeId: toOwnerAdmin.addr,
        });
        await toPledgeAdmin.save();
        logger.info(`pledgeAdmin crated: ${toPledgeAdmin._id.toString()}`);
      }

      expectedToDonation = {
        ...expectedToDonation,
        ownerId: toPledgeAdmin.id,
        ownerTypeId: toPledgeAdmin.typeId,
        ownerType: toPledgeAdmin.type,
      };

      // Create donation
      const token = config.tokenWhitelist.find(
        t => t.foreignAddress.toLowerCase() === toPledge.token.toLowerCase(),
      );
      if (token === undefined) {
        terminateScript(`No token found for address ${toPledge.token}`);
        return;
      }
      expectedToDonation.token = token;

      const delegationInfo = {};
      // It's delegated to a DAC
      if (toPledge.delegates.length > 0) {
        const [delegate] = toPledge.delegates;
        const [dacPledgeAdmin] = await PledgeAdmins.find({ id: Number(delegate.id) }).exec();
        if (dacPledgeAdmin === undefined) {
          terminateScript(`No dac found for id: ${delegate.id}`);
          return;
        }
        delegationInfo.delegateId = dacPledgeAdmin.id;
        delegationInfo.delegateTypeId = dacPledgeAdmin.typeId;
        delegationInfo.delegateType = dacPledgeAdmin.type;

        // Has intended project
        const { intendedProject } = toPledge;
        if (intendedProject !== '0') {
          const [intendedProjectPledgeAdmin] = await PledgeAdmins.find({
            id: Number(intendedProject),
          });
          if (intendedProjectPledgeAdmin === undefined) {
            terminateScript(`No project found for id: ${intendedProject}`);
            return;
          }
          delegationInfo.intendedProjectId = intendedProjectPledgeAdmin.id;
          delegationInfo.intendedProjectTypeId = intendedProjectPledgeAdmin.typeId;
          delegationInfo.intendedProjectType = intendedProjectPledgeAdmin.type;
        }
      }
      expectedToDonation = {
        ...expectedToDonation,
        ...delegationInfo,
      };

      // Set giverAddress to owner address if is a Giver
      if (giverAddress === undefined) {
        if (toOwnerAdmin.type !== 'Giver') {
          terminateScript(`Cannot set giverAddress`);
          return;
        }
        giverAddress = toPledgeAdmin.typeId;
        expectedToDonation.giverAddress = giverAddress;
      }

      if (status === null) {
        terminateScript(`Pledge status ${toPledge.pledgeState} is unknown`);
        return;
      }

      const web3 = getForeignWeb3();
      const { timestamp } = await web3.eth.getBlock(blockNumber);

      const model = {
        ...expectedToDonation,
        amountRemaining: expectedToDonation.amountRemaining.toFixed(),
        mined: true,
        createdAt: new Date(timestamp * 1000),
      };

      const { cutoff } = symbolDecimalsMap[token.symbol];
      model.lessThanCutoff = cutoff.gt(model.amountRemaining);

      const donation = new Donations(model);

      await donationUsdValueUtility.setDonationUsdValue(donation);

      await donation.save();

      const _id = donation._id.toString();
      expectedToDonation._id = _id;
      expectedToDonation.savedAmountRemaining = model.amountRemaining;
      donationMap[_id] = expectedToDonation;
      logger.info(
        `donation created: ${JSON.stringify(
          {
            ...expectedToDonation,
            amountRemaining: expectedToDonation.amountRemaining.toFixed(),
          },
          null,
          2,
        )}`,
      );
    } else {
      logger.info(
        `this donation should be created: ${JSON.stringify(
          {
            ...expectedToDonation,
            amountRemaining: expectedToDonation.amountRemaining.toFixed(),
          },
          null,
          2,
        )}`,
      );
      logger.debug('--------------------------------');
      logger.debug(`From owner: ${fromOwnerAdmin}`);
      logger.debug(`To owner:${toOwnerAdmin}`);
      logger.debug('--------------------------------');
      logger.debug(`From pledge: ${fromPledge}`);
      logger.debug(`To pledge: ${toPledge}`);
    }
    addChargedDonation(expectedToDonation);
  } else {
    // Check toDonation has correct status and mined flag
    const expectedStatus = convertPledgeStateToStatus(toPledge, toOwnerAdmin);
    if (expectedStatus === null) {
      terminateScript(`Pledge status ${toPledge.pledgeState} is unknown`);
      return;
    }

    if (toDonation.mined === false) {
      logger.error(`Donation ${toDonation._id} mined flag should be true`);
      logger.debug('Updating...');
      await Donations.update({ _id: toDonation._id }, { mined: true }).exec();
      toDonation.mined = true;
    } else if (toDonation.status !== expectedStatus) {
      logger.error(
        `Donation ${toDonation._id} status should be ${expectedStatus} but is ${toDonation.status}`,
      );
      logger.debug('Updating...');
      await Donations.update({ _id: toDonation._id }, { status: expectedStatus }).exec();
    }

    const { parentDonations } = toDonation;
    if (
      usedFromDonations.length !== parentDonations.length ||
      usedFromDonations.some(id => !parentDonations.includes(id))
    ) {
      logger.error(`Parent of ${toDonation._id} should be updated to ${usedFromDonations}`);
      if (fixConflicts) {
        logger.debug('Updating...');
        toDonation.parentDonations = usedFromDonations;
        await Donations.update(
          { _id: toDonation._id },
          { parentDonations: usedFromDonations },
        ).exec();
      }
    }

    if (toDonation.isReturn !== isReturn) {
      logger.error(`Donation ${toDonation._id} isReturn flag should be ${isReturn}`);
      logger.debug('Updating...');
      await Donations.update({ _id: toDonation._id }, { isReturn }).exec();
      toDonation.isReturn = isReturn;
    }

    const { usdValue } = toDonation;
    await donationUsdValueUtility.setDonationUsdValue(toDonation);
    if (toDonation.usdValue !== usdValue) {
      logger.error(
        `Donation ${toDonation._id} usdValue is ${usdValue} but should be updated to ${toDonation.usdValue}`,
      );
      logger.debug('Updating...');
      await Donations.update({ _id: toDonation._id }, { usdValue: toDonation.usdValue }).exec();
    }

    toDonation.txHash = transactionHash;
    toDonation.from = from;
    toDonation.pledgeId = to;
    toDonation.pledgeState = toPledge.pledgeState;
    toDonation.amountRemaining = new BigNumber(amount);
    const { PAYING, FAILED, PAID } = DonationStatus;
    // Just update Paying, Paid and Failed donations at this stage, other status may be changed
    // by future events
    if (
      [PAID, PAYING, FAILED].includes(toDonation.status) ||
      [PAYING, PAID].includes(expectedStatus)
    ) {
      if (expectedStatus !== toDonation.status) {
        logger.error(`Donation status is ${toDonation.status}, but should be ${expectedStatus}`);
        if (fixConflicts) {
          logger.debug('Updating...');
          await Donations.update({ _id: toDonation._id }, { status: expectedStatus }).exec();
          toDonation.status = expectedStatus;
        }
      }
    }

    addChargedDonation(toDonation);

    logger.debug(
      `Amount added to ${JSON.stringify(
        {
          _id: toDonation._id,
          amountRemaining: toDonation.amountRemaining.toFixed(),
          amount: toDonation.amount,
          status: toDonation.status,
        },
        null,
        2,
      )}`,
    );
  }
};

const getMostRecentDonationNotCanceled = donationId => {
  const donation = donationMap[donationId];

  // givers can never be canceled
  if (donation.ownerType === AdminTypes.GIVER && !donation.intendedProjectId) {
    return donation;
  }

  const pledgeOwnerAdmin = admins[Number(donation.ownerId)];

  // if pledgeOwnerAdmin is canceled or donation is a delegation, go back 1 donation
  if (pledgeOwnerAdmin.isCanceled || donation.intendedProjectId > 0) {
    // we use the 1st parentDonation b/c the owner of all parentDonations
    // is the same
    return getMostRecentDonationNotCanceled(donation.parentDonations[0]);
  }

  return donation;
};

const revertProjectDonations = async (projectId, transactionHash, blockNumber) => {
  const donations = ownerPledgeAdminIdChargedDonationMap[projectId] || {};
  const values = Object.values(donations);
  const revertExceptionStatus = [DonationStatus.PAYING, DonationStatus.PAID];

  for (let i = 0; i < values.length; i += 1) {
    const donation = values[i];
    if (!donation.amountRemaining.isZero() && !revertExceptionStatus.includes(donation.status)) {
      const revertToDonation = getMostRecentDonationNotCanceled(donation._id);
      logger.debug(`Revert donation ${JSON.stringify(donation, null, 2)}`);
      logger.debug(
        `To a donation like: ${JSON.stringify(
          {
            pledgeId: revertToDonation.pledgeId,
            giverAddress: revertToDonation.giverAddress,
          },
          null,
          2,
        )}`,
      );
      // eslint-disable-next-line no-await-in-loop
      await handleToDonations({
        from: donation.pledgeId,
        to: revertToDonation.pledgeId,
        amount: donation.amountRemaining.toFixed(),
        transactionHash,
        blockNumber,
        usedFromDonations: [donation._id],
        giverAddress: revertToDonation.giverAddress,
        isReverted: true,
      });
      donation.amountRemaining = new BigNumber(0);
    }

    // Remove all donations of same pledgeId from charged donation list that are not Paying or Paid
    // because all will be reverted
    chargedDonationListMap[donation.pledgeId] = chargedDonationListMap[
      donation.pledgeId
    ].filter(({ status }) => revertExceptionStatus.includes(status));
  }
};

const cancelProject = async (projectId, transactionHash, blockNumber) => {
  admins[projectId].isCanceled = true;
  await revertProjectDonations(projectId, transactionHash, blockNumber);

  const projectIdStr = String(projectId);
  for (let index = 1; index < admins.length; index += 1) {
    const admin = admins[index];

    if (admin.parentProject === projectIdStr) {
      admin.isCanceled = true;
      // eslint-disable-next-line no-await-in-loop
      await revertProjectDonations(index, transactionHash, blockNumber);
    }
  }
};

const fixConflictInDonations = unusedDonationMap => {
  const promises = [];
  Object.values(donationMap).forEach(
    ({ _id, amount, amountRemaining, savedAmountRemaining, status, pledgeId, txHash, token }) => {
      if (pledgeId === '0') return;

      const pledge = pledges[Number(pledgeId)];

      if (unusedDonationMap.has(_id.toString())) {
        logger.error(
          `Donation was unused!\n${JSON.stringify(
            {
              _id,
              amount: amount.toString(),
              amountRemaining: amountRemaining.toString(),
              status,
              pledgeId: pledgeId.toString(),
              pledgeOwner: pledge.owner,
              txHash,
            },
            null,
            2,
          )}`,
        );
        if (fixConflicts) {
          logger.debug('Deleting...');
          promises.push(Donations.findOneAndDelete({ _id }).exec());
        }
      } else if (savedAmountRemaining && !amountRemaining.eq(savedAmountRemaining)) {
        logger.error(
          `Below donation should have remaining amount ${amountRemaining.toFixed()} but has ${savedAmountRemaining}\n${JSON.stringify(
            {
              _id,
              amount: amount.toString(),
              amountRemaining: amountRemaining.toFixed(),
              status,
              pledgeId: pledgeId.toString(),
              txHash,
            },
            null,
            2,
          )}`,
        );
        if (Number(pledgeId) !== 0) {
          logger.info(`Pledge Amount: ${pledge.amount}`);
        }
        if (fixConflicts) {
          logger.debug('Updating...');
          const { cutoff } = symbolDecimalsMap[token.symbol];
          promises.push(
            Donations.update(
              { _id },
              {
                $set: {
                  amountRemaining: amountRemaining.toFixed(),
                  lessThanCutoff: cutoff.gt(amountRemaining),
                },
              },
            ).exec(),
          );
        }
      }
    },
  );
  return Promise.all(promises);
};

const syncDonationsWithNetwork = async () => {
  // Map from pledge id to list of donations belonged to the pledge and are not used yet!
  await fetchDonationsInfo();

  // Simulate transactions by events
  for (let i = 0; i < events.length; i += 1) {
    const { event, transactionHash, logIndex, returnValues, blockNumber } = events[i];
    logger.debug(
      `-----\nProcessing event ${i}:\nLog Index: ${logIndex}\nEvent: ${event}\nTransaction hash: ${transactionHash}`,
    );

    if (ignoredTransactions.some(it => it.txHash === transactionHash && it.logIndex === logIndex)) {
      logger.debug('Event ignored.');
      continue;
    }

    if (event === 'Transfer') {
      const { from, to, amount } = returnValues;
      logger.debug(`Transfer from ${from} to ${to} amount ${amount}`);

      if (from !== '0') {
        const fromPledge = pledges[Number(from)];
        const fromPledgeOwner = admins[Number(fromPledge.owner)];

        // Ignore transfer money from canceled projects, they have been reverted already
        if (fromPledgeOwner.isCanceled) {
          logger.debug(`From pledge owner ${fromPledge.owner} is canceled...
Transfer is ignored`);
          continue;
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const { usedFromDonations, giverAddress } = await handleFromDonations(
        from,
        to,
        amount,
        transactionHash,
        logIndex,
      );

      // eslint-disable-next-line no-await-in-loop
      await handleToDonations({
        from,
        to,
        amount,
        transactionHash,
        blockNumber,
        usedFromDonations,
        giverAddress,
      });
    } else if (event === 'CancelProject') {
      const { idProject } = returnValues;
      logger.debug(
        `Cancel project ${idProject}: ${JSON.stringify(admins[Number(idProject)], null, 2)}`,
      );
      // eslint-disable-next-line no-await-in-loop
      await cancelProject(idProject, transactionHash, blockNumber);
    }
  }

  // Find conflicts in donations and pledges!
  Object.keys(chargedDonationListMap).forEach(pledgeId => {
    const list = chargedDonationListMap[pledgeId];
    const reducer = (totalAmountRemaining, chargedDonation) => {
      return totalAmountRemaining.plus(chargedDonation.amountRemaining);
    };
    const totalAmountRemaining = list.reduce(reducer, new BigNumber(0));
    const { amount: pledgeAmount, owner, oldPledge, pledgeState } = pledges[Number(pledgeId)];
    const admin = admins[Number(owner)];
    const { isCanceled, canceled } = admin;

    if (!totalAmountRemaining.eq(pledgeAmount)) {
      logger.error(
        `Pledge ${pledgeId} amount ${pledgeAmount} does not equal total amount remaining ${totalAmountRemaining.toFixed()}`,
      );
      logger.debug(
        JSON.stringify(
          {
            PledgeState: pledgeState,
            'Old Pledge': oldPledge,
            Owner: owner,
            'Owner canceled': !!canceled,
            'Owner isCanceled': !!isCanceled,
          },
          null,
          2,
        ),
      );
    }
  });

  const unusedDonationMap = new Map();
  Object.values(pledgeNotUsedDonationListMap).forEach((list = []) =>
    list.forEach(item => unusedDonationMap.set(item._id, item)),
  );
  await fixConflictInDonations(unusedDonationMap);
};

// Creates PledgeAdmins entity for a project entity
// Requires corresponding project entity has been saved holding correct value of txHash
// eslint-disable-next-line no-unused-vars
const syncPledgeAdmins = async () => {
  if (!fixConflicts) return;

  for (let i = 9000; i < events.length; i += 1) {
    const { event, transactionHash, returnValues } = events[i];

    if (event !== 'ProjectAdded') continue;

    const { idProject } = returnValues;

    // eslint-disable-next-line no-await-in-loop
    const [pledgeAdmin] = await PledgeAdmins.find({ id: Number(idProject) }).exec();

    if (pledgeAdmin === undefined) {
      logger.error(`No pledge admin exists for ${idProject}`);
      logger.info('Transaction Hash:', transactionHash);

      const projectModelTypeField = [
        {
          type: AdminTypes.DAC,
          model: DACs,
          idFieldName: 'delegateId',
          expectedStatus: DacStatus.ACTIVE,
        },
        {
          type: AdminTypes.CAMPAIGN,
          model: Campaigns,
          idFieldName: 'projectId',
          expectedStatus: CampaignStatus.ACTIVE,
        },
        {
          type: AdminTypes.MILESTONE,
          model: Milestones,
          idFieldName: 'projectId',
          expectedStatus: MilestoneStatus.IN_PROGRESS,
        },
      ];

      let entityFound = false;
      for (let j = 0; j < projectModelTypeField.length; j += 1) {
        const { type, model, idFieldName, expectedStatus } = projectModelTypeField[j];
        // eslint-disable-next-line no-await-in-loop
        const [entity] = await model.find({ txHash: transactionHash }).exec();

        // Not found any
        if (entity === undefined) continue;

        logger.info(`a ${type} found with id ${entity._id.toString()} and status ${entity.status}`);
        logger.info(`Title: ${entity.title}`);
        const newPledgeAdmin = new PledgeAdmins({
          id: Number(idProject),
          type,
          typeId: entity._id.toString(),
        });
        // eslint-disable-next-line no-await-in-loop
        await newPledgeAdmin.save();
        logger.info(`pledgeAdmin crated: ${newPledgeAdmin._id.toString()}`);

        const mutation = {};
        mutation[idFieldName] = Number(idProject);

        // eslint-disable-next-line no-await-in-loop
        await model
          .update(
            { _id: entity.id },
            {
              status: expectedStatus,
              prevStatus: entity.status,
              $set: {
                ...mutation,
              },
            },
          )
          .exec();

        entityFound = true;
        break;
      }

      if (!entityFound) {
        logger.error("Couldn't found appropriate entity");
      }
    }
  }
};

const main = async () => {
  try {
    await fetchBlockchainData();

    if (!findConflicts && !fixConflicts) {
      terminateScript(null, 0);
      return;
    }

    /*
     Find conflicts in milestone donation counter
    */
    const mongoUrl = config.mongodb;
    mongoose.connect(mongoUrl);
    const db = mongoose.connection;

    db.on('error', err => logger.error(`Could not connect to Mongo:\n${err.stack}`));

    db.once('open', () => {
      logger.info('Connected to Mongo');

      Promise.all([
        syncDonationsWithNetwork(),
        // syncPledgeAdmins(),
        // updateDonationsCreatedDate(new Date('2020-02-01')),
      ]).then(() => terminateScript(null, 0));
    });
  } catch (e) {
    logger.error(e);
    throw e;
  }
};

main()
  .then(() => {})
  .catch(e => terminateScript(e, 1));
