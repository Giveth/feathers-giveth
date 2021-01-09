/* eslint-disable no-continue */
/* eslint-disable no-console */
/*  eslint-disable no-await-in-loop */
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('config');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const yargs = require('yargs');
const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
const cliProgress = require('cli-progress');
const _colors = require('colors');
const Web3WsProvider = require('web3-providers-ws');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');
const { Kernel, AppProxyUpgradeable } = require('giveth-liquidpledging/build/contracts');
const ForeignGivethBridgeArtifact = require('giveth-bridge/build/ForeignGivethBridge.json');
const { Types } = require('mongoose');
const toFn = require('../../src/utils/to');
const DonationUsdValueUtility = require('./DonationUsdValueUtility');
const { getTokenByAddress } = require('./tokenUtility');
const { createProjectHelper } = require('../../src/common-utils/createProjectHelper');
const topicsFromArtifacts = require('../../src/blockchain/lib/topicsFromArtifacts');
const eventDecodersFromArtifact = require('../../src/blockchain/lib/eventDecodersFromArtifact');
const toWrapper = require('../../src/utils/to');

// const { getTransaction } = require('../../src/blockchain/lib/web3Helpers');

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
  .version(false)
  .help();

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
let foreignWeb3;
let liquidPledging;

const instantiateWeb3 = async url => {
  const options = {
    timeout: 30000, // ms

    clientConfig: {
      // Useful if requests are large
      maxReceivedFrameSize: 100000000, // bytes - default: 1MiB
      maxReceivedMessageSize: 100000000, // bytes - default: 8MiB

      // Useful to keep a connection alive
      keepalive: true,
      keepaliveInterval: 45000, // ms
    },

    // Enable auto reconnection
    reconnect: {
      auto: true,
      delay: 5000, // ms
      maxAttempts: 5,
      onTimeout: false,
    },
  };

  const provider = url && url.startsWith('ws') ? new Web3WsProvider(url, options) : url;
  return new Promise(resolve => {
    // foreignWeb3 = Object.assign(new Web3(provider), EventEmitter.prototype);
    foreignWeb3 = new Web3(provider);
    if (provider.on) {
      provider.on('connect', () => {
        console.log('connected');
        liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);
        resolve();
      });
    } else {
      liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);
      resolve();
    }
  });
};

async function getKernel() {
  const kernelAddress = await liquidPledging.kernel();
  return new Kernel(foreignWeb3, kernelAddress);
}

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

const { MilestoneStatus, createModel } = require('../../src/models/milestones.model');

const Milestones = createModel(app);
const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const Donations = require('../../src/models/donations.model').createModel(app);
const PledgeAdmins = require('../../src/models/pledgeAdmins.model').createModel(app);
const Dacs = require('../../src/models/dacs.model').createModel(app);
const ConversationRates = require('../../src/models/conversionRates.model')(app);
// const Transaction = require('../../src/models/transactions.model').createModel(app);

const { DonationStatus } = require('../../src/models/donations.model');
const { AdminTypes } = require('../../src/models/pledgeAdmins.model');
const { CampaignStatus } = require('../../src/models/campaigns.model');

const donationUsdValueUtility = new DonationUsdValueUtility(ConversationRates, config);

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

const createProgressBar = ({ title }) => {
  return new cliProgress.SingleBar({
    format: `${title} |${_colors.cyan('{bar}')}| {percentage}% || {value}/{total} events`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
};

// Gets status of liquidpledging storage
const fetchBlockchainData = async () => {
  await instantiateWeb3(nodeUrl);
  console.log('fetchBlockchainData ....',{
    updateEvents,
    updateState,
  });
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir);
    }
  } catch (e) {
    terminateScript(e.stack);
  }
  const stateFile = path.join(cacheDir, `./liquidPledgingState_${process.env.NODE_ENV}.json`);
  const eventsFile = path.join(cacheDir, `./liquidPledgingEvents_${process.env.NODE_ENV}.json`);

  let state = {};

  if (!updateState) state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {};
  events = fs.existsSync(eventsFile) ? JSON.parse(fs.readFileSync(eventsFile)) : [];

  if (updateState || updateEvents) {
    let fromBlock = 0;
    let fetchBlockNum = 'latest';
    if (updateEvents) {
      fromBlock = events.length > 0 ? events[events.length - 1].blockNumber + 1 : 0;
      fetchBlockNum =
        (await foreignWeb3.eth.getBlockNumber()) - config.blockchain.requiredConfirmations;
    }

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
      let result;
      // eslint-disable-next-line no-await-in-loop
      [error, result] = await toFn(
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
      if (result) [state, newEvents] = result;
      if (error && error instanceof Error) {
        logger.error(`Error on fetching network info\n${error.stack}`);
      }
      firstTry = false;
    }

    state.pledges = state.pledges.map(pledge => {
      // the first Item of pledge is always null so I have to check
      if (pledge) {
        delete pledge.amount;
      }
      return pledge;
    });
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

async function getHomeTxHash(txHash) {
  const decoders = eventDecodersFromArtifact(ForeignGivethBridgeArtifact);

  const [err, receipt] = await toWrapper(foreignWeb3.eth.getTransactionReceipt(txHash));

  if (err || !receipt) {
    logger.error('Error fetching transaction, or no tx receipt found ->', err, receipt);
    return undefined;
  }

  const topics = topicsFromArtifacts([ForeignGivethBridgeArtifact], ['Deposit']);

  // get logs we're interested in.
  const logs = receipt.logs.filter(log => topics.some(t => t.hash === log.topics[0]));

  if (logs.length === 0) return undefined;

  const log = logs[0];

  const topic = topics.find(t => t.hash === log.topics[0]);
  const event = decoders[topic.name](log);

  return event.returnValues.homeTx;
}

async function getHomeTxHashForDonation({ txHash, parentDonations, from }) {
  if (from === '0') {
    return getHomeTxHash(txHash);
  }
  if (parentDonations && parentDonations.length === 1) {
    const parentDonationWithHomeTxHash = await Donations.findOne({
      _id: Types.ObjectId(parentDonations[0]),
      txHash,
      homeTxHash: { $exists: true },
    });
    if (parentDonationWithHomeTxHash) {
      return parentDonationWithHomeTxHash.homeTxHash;
    }
  }
  return null;
}

// Update createdAt date of donations based on transaction date
// @params {string} startDate
// eslint-disable-next-line no-unused-vars
const updateDonationsCreatedDate = async startDate => {
  const web3 = foreignWeb3;
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
        const d = await Donations.findOne({ _id });
        d.createdAt = newCreatedAt;
        await d.save();
      }
    });
};
//
// const getTransactionTimeStamp = async txHash => {
//   const mockApp = {
//     get: key => {
//       if (key === 'transactionsModel') return Transaction;
//       return null;
//     },
//   };
//   const { timestamp } = getTransaction(mockApp, txHash, false);
//   return timestamp;
// };

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
        tokenAddress,
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
          savedStatus: status,
          mined,
          parentDonations: parentDonations.map(id => id.toString()),
          ownerId,
          ownerType,
          ownerTypeId,
          intendedProjectId: String(intendedProjectId),
          giverAddress,
          pledgeId: pledgeId.toString(),
          tokenAddress,
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
  if (fromPledgeId === '0' || !fromPledgeAdmin || fromPledgeAdmin.type !== AdminTypes.MILESTONE) {
    return false;
  }

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
          await Donations.updateOne(
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
          fromAmount = fromAmount.minus(min);

          if (item.amountRemaining.isZero()) {
            consumedCandidates += 1;

            // It's approve or reject
            if (item.status === DonationStatus.TO_APPROVE) {
              item.status =
                toPledge.owner === item.intendedProjectId
                  ? DonationStatus.COMMITTED
                  : DonationStatus.REJECTED;
            }
          }
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
        terminateScript(`from delegate ${from} donations don't have enough amountRemaining!`);
      }
    } else {
      logger.error(`There is no donation for transfer from ${from} to ${to}`);
      // I think we should not terminate script
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
  const fromPledge = pledges[Number(from)];
  const toPledge = pledges[Number(to)];

  const toOwnerId = toPledge.owner;
  const fromOwnerId = from !== '0' ? fromPledge.owner : 0;

  const toOwnerAdmin = admins[Number(toOwnerId)];
  const fromOwnerAdmin = from !== '0' ? admins[Number(fromOwnerId)] : {};

  const fromPledgeAdmin = await PledgeAdmins.findOne({ id: Number(fromOwnerId) }).exec();

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
  const toNotFilledDonationList = pledgeNotUsedDonationListMap[to] || []; // List of donations which are candidates to be charged

  const toIndex = toNotFilledDonationList.findIndex(
    item =>
      item.txHash === transactionHash && item.amountRemaining.eq(0) && item.isReturn === isReturn,
  );

  const toDonation = toIndex !== -1 ? toNotFilledDonationList.splice(toIndex, 1)[0] : undefined;

  // It happens when a donation is cancelled, we choose the first one (created earlier)
  // if (toDonationList.length > 1) {
  //   console.log('toDonationList length is greater than 1');
  //   process.exit();
  // }

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
    const homeTxHash = await getHomeTxHashForDonation({
      txHash: transactionHash,
      parentDonations: usedFromDonations,
      from,
    });
    if (homeTxHash) {
      expectedToDonation.homeTxHash = homeTxHash;
    }

    if (fixConflicts) {
      let toPledgeAdmin = await PledgeAdmins.findOne({ id: Number(toOwnerId) });
      if (!toPledgeAdmin) {
        if (toOwnerAdmin.type !== 'Giver') {
          terminateScript(
            `No PledgeAdmin record exists for non user admin ${JSON.stringify(
              toOwnerAdmin,
              null,
              2,
            )}`,
          );
          logger.error(
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
        logger.error(`No token found for address ${toPledge.token}`);
        terminateScript(`No token found for address ${toPledge.token}`);
        return;
      }
      expectedToDonation.tokenAddress = token.address;
      const delegationInfo = {};
      // It's delegated to a DAC
      if (toPledge.delegates.length > 0) {
        const [delegate] = toPledge.delegates;
        const dacPledgeAdmin = await PledgeAdmins.findOne({ id: Number(delegate.id) });
        if (!dacPledgeAdmin) {
          // This is wrong, why should we terminate if there is no dacPledgeAdmin
          logger.error(`No dac found for id: ${delegate.id}`);
          terminateScript(`No dac found for id: ${delegate.id}`);
          return;
        }
        delegationInfo.delegateId = dacPledgeAdmin.id;
        delegationInfo.delegateTypeId = dacPledgeAdmin.typeId;
        delegationInfo.delegateType = dacPledgeAdmin.type;

        // Has intended project
        const { intendedProject } = toPledge;
        if (intendedProject !== '0') {
          const intendedProjectPledgeAdmin = await PledgeAdmins.findOne({
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
          logger.error('Cannot set giverAddress');
          terminateScript(`Cannot set giverAddress`);
          return;
        }
        giverAddress = toPledgeAdmin.typeId;
        expectedToDonation.giverAddress = giverAddress;
      }

      if (status === null) {
        logger.error(`Pledge status ${toPledge.pledgeState} is unknown`);
        terminateScript(`Pledge status ${toPledge.pledgeState} is unknown`);
        return;
      }

      const { timestamp } = await foreignWeb3.eth.getBlock(blockNumber);

      const model = {
        ...expectedToDonation,
        tokenAddress: token.address,
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
      donationMap[_id] = { ...expectedToDonation };
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
      logger.error(`Pledge status ${toPledge.pledgeState} is unknown`);
      terminateScript(`Pledge status ${toPledge.pledgeState} is unknown`);
      return;
    }

    if (toDonation.mined === false) {
      logger.error(`Donation ${toDonation._id} mined flag should be true`);
      logger.debug('Updating...');
      await Donations.updateOne({ _id: toDonation._id }, { mined: true }).exec();
      toDonation.mined = true;
    }

    toDonation.status = expectedStatus;

    const { parentDonations } = toDonation;
    if (
      usedFromDonations.length !== parentDonations.length ||
      usedFromDonations.some(id => !parentDonations.includes(id))
    ) {
      logger.error(`Parent of ${toDonation._id} should be updated to ${usedFromDonations}`);
      if (fixConflicts) {
        logger.debug('Updating...');
        toDonation.parentDonations = usedFromDonations;
        await Donations.updateOne(
          { _id: toDonation._id },
          { parentDonations: usedFromDonations },
        ).exec();
      }
    }

    if (toDonation.isReturn !== isReturn) {
      logger.error(`Donation ${toDonation._id} isReturn flag should be ${isReturn}`);
      logger.debug('Updating...');
      await Donations.updateOne({ _id: toDonation._id }, { isReturn }).exec();
      toDonation.isReturn = isReturn;
    }

    const { usdValue } = toDonation;
    await donationUsdValueUtility.setDonationUsdValue(toDonation);
    if (toDonation.usdValue !== usdValue) {
      logger.error(
        `Donation ${toDonation._id} usdValue is ${usdValue} but should be updated to ${toDonation.usdValue}`,
      );
      logger.debug('Updating...');
      await Donations.updateOne({ _id: toDonation._id }, { usdValue: toDonation.usdValue }).exec();
    }

    toDonation.txHash = transactionHash;
    toDonation.from = from;
    toDonation.pledgeId = to;
    toDonation.pledgeState = toPledge.pledgeState;
    toDonation.amountRemaining = new BigNumber(amount);

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

const revertProjectDonations = async projectId => {
  const donations = ownerPledgeAdminIdChargedDonationMap[projectId] || {};
  const values = Object.values(donations);
  const revertExceptionStatus = [DonationStatus.PAYING, DonationStatus.PAID];

  for (let i = 0; i < values.length; i += 1) {
    const donation = values[i];
    if (!donation.amountRemaining.isZero() && !revertExceptionStatus.includes(donation.status)) {
      donation.status = DonationStatus.CANCELED;
    }

    // Remove all donations of same pledgeId from charged donation list that are not Paying or Paid
    // because all will be reverted
  }
};

const cancelProject = async projectId => {
  admins[projectId].isCanceled = true;
  await revertProjectDonations(projectId);

  const projectIdStr = String(projectId);
  for (let index = 1; index < admins.length; index += 1) {
    const admin = admins[index];

    if (admin.parentProject === projectIdStr) {
      admin.isCanceled = true;
      // eslint-disable-next-line no-await-in-loop
      await revertProjectDonations(index);
    }
  }
};

const fixConflictInDonations = unusedDonationMap => {
  const promises = [];
  Object.values(donationMap).forEach(
    ({
      _id,
      amount,
      amountRemaining,
      savedAmountRemaining,
      status,
      savedStatus,
      pledgeId,
      txHash,
      tokenAddress,
    }) => {
      if (status === DonationStatus.FAILED) return;

      const pledge = pledges[Number(pledgeId)] || {};

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
      } else {
        if (savedAmountRemaining && !amountRemaining.eq(savedAmountRemaining)) {
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
            const { cutoff } = symbolDecimalsMap[getTokenByAddress(tokenAddress).symbol];
            promises.push(
              Donations.updateOne(
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

        if (savedStatus !== status) {
          logger.error(
            `Below donation status should be ${status} but is ${savedStatus}\n${JSON.stringify(
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
          if (fixConflicts) {
            logger.debug('Updating...');
            promises.push(Donations.updateOne({ _id }, { status }).exec());
          }
        }
      }
    },
  );
  return Promise.all(promises);
};

const syncEventWithDb = async ({ event, transactionHash, logIndex, returnValues, blockNumber }) => {
  if (ignoredTransactions.some(it => it.txHash === transactionHash && it.logIndex === logIndex)) {
    logger.debug('Event ignored.');
    return;
  }

  if (event === 'Transfer') {
    const { from, to, amount } = returnValues;
    logger.debug(`Transfer from ${from} to ${to} amount ${amount}`);

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
    await cancelProject(idProject);
  }
};

const syncDonationsWithNetwork = async () => {
  // Map from pledge id to list of donations belonged to the pledge and are not used yet!
  await fetchDonationsInfo();
  const startTime = new Date();
  // create new progress bar
  const progressBar = createProgressBar({ title: 'Syncing donations with events.' });
  progressBar.start(events.length, 0);

  // Simulate transactions by events
  for (let i = 0; i < events.length; i += 1) {
    progressBar.update(i);
    const { event, transactionHash, logIndex, returnValues, blockNumber } = events[i];
    logger.debug(
      `-----\nProcessing event ${i}:\nLog Index: ${logIndex}\nEvent: ${event}\nTransaction hash: ${transactionHash}`,
    );
    // eslint-disable-next-line no-await-in-loop
    await syncEventWithDb({ event, transactionHash, logIndex, returnValues, blockNumber });
  }
  progressBar.update(events.length);
  progressBar.stop();
  const spentTime = (new Date().getTime() - startTime.getTime()) / 1000;
  console.log(`events donations synced end.\n spentTime :${spentTime} seconds`);

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

const createMilestoneForPledgeAdmin = async ({
  project,
  getMilestoneDataForCreate,
  idProject,
  milestoneType,
  transactionHash,
}) => {
  const campaign = await Campaigns.findOne({ projectId: project.parentProject });
  if (!campaign) {
    logger.error(`Campaign doesn't exist -> projectId:${idProject}`);
    return undefined;
  }
  const createMilestoneData = await getMilestoneDataForCreate({
    milestoneType,
    project,
    projectId: idProject,
    txHash: transactionHash,
  });
  return new Milestones({
    ...createMilestoneData,
    status: MilestoneStatus.CANCELED,
    campaignId: campaign._id,
  }).save();
};
const createCampaignForPledgeAdmin = async ({
  project,
  idProject,
  transactionHash,
  getCampaignDataForCreate,
}) => {
  const createCampaignData = await getCampaignDataForCreate({
    project,
    projectId: idProject,
    txHash: transactionHash,
  });
  return new Campaigns({
    ...createCampaignData,
    status: CampaignStatus.CANCELED,
  }).save();
};

// Creates PledgeAdmins entity for a project entity
// Requires corresponding project entity has been saved holding correct value of txHash
// eslint-disable-next-line no-unused-vars
const syncPledgeAdmins = async () => {
  console.log('syncPledgeAdmins called', { fixConflicts });
  if (!fixConflicts) return;
  const {
    getMilestoneTypeByProjectId,
    getCampaignDataForCreate,
    getMilestoneDataForCreate,
  } = await createProjectHelper({
    web3: foreignWeb3,
    liquidPledging,
    kernel: await getKernel(),
    AppProxyUpgradeable,
  });

  const startTime = new Date();
  const progressBar = createProgressBar({ title: 'Syncing PledgeAdmins with events' });
  progressBar.start(events.length, 0);
  for (let i = 0; i < events.length; i += 1) {
    progressBar.update(i);
    try {
      const { event, transactionHash, returnValues } = events[i];
      if (event !== 'ProjectAdded') continue;
      const { idProject } = returnValues;
      const pledgeAdmin = await PledgeAdmins.findOne({ id: Number(idProject) }).exec();

      if (pledgeAdmin) {
        continue;
      }
      logger.error(`No pledge admin exists for ${idProject}`);
      logger.info('Transaction Hash:', transactionHash);

      const { project, milestoneType, isCampaign } = await getMilestoneTypeByProjectId(idProject);
      let entity = isCampaign
        ? await Campaigns.findOne({ txHash: transactionHash })
        : await Milestones.findOne({ txHash: transactionHash });
      // Not found any
      if (!entity && !isCampaign) {
        try {
          entity = await createMilestoneForPledgeAdmin({
            project,
            idProject,
            milestoneType,
            transactionHash,
            getMilestoneDataForCreate,
          });
        } catch (e) {
          logger.error('createMilestoneForPledgeAdmin error', { idProject, e });
          new PledgeAdmins({
            id: Number(idProject),
            type: AdminTypes.MILESTONE,
          }).save();
          logger.error('create pledgeAdmin without creating milestone', { idProject });
        }
      } else if (!entity && isCampaign) {
        entity = await createCampaignForPledgeAdmin({
          project,
          idProject,
          transactionHash,
          getCampaignDataForCreate,
        });
      }
      if (!entity) {
        continue;
      }

      logger.info('created entity ', entity);
      const type = isCampaign ? AdminTypes.CAMPAIGN : AdminTypes.MILESTONE;
      logger.info(`a ${type} found with id ${entity._id.toString()} and status ${entity.status}`);
      logger.info(`Title: ${entity.title}`);
      const newPledgeAdmin = new PledgeAdmins({
        id: Number(idProject),
        type,
        typeId: entity._id.toString(),
      });
      const result = await newPledgeAdmin.save();
      logger.info('pledgeAdmin saved', result);
    } catch (e) {
      logger.error('error in creating pledgeAdmin', e);
    }
  }
  progressBar.update(events.length);
  progressBar.stop();
  const spentTime = (new Date().getTime() - startTime.getTime()) / 1000;
  console.log(`pledgeAdmin events synced end.\n spentTime :${spentTime} seconds`);
};

const syncDacs = async () => {
  console.log('syncDacs called', { fixConflicts });
  if (!fixConflicts) return;
  const { getDacDataForCreate } = await createProjectHelper({
    web3: foreignWeb3,
    liquidPledging,
    kernel: await getKernel(),
    AppProxyUpgradeable,
  });

  const startTime = new Date();
  const progressBar = createProgressBar({ title: 'Syncing Dacs with events' });
  progressBar.start(events.length, 0);
  for (let i = 0; i < events.length; i += 1) {
    progressBar.update(i);
    try {
      const { event, transactionHash, returnValues } = events[i];
      if (event !== 'DelegateAdded') continue;
      const { idDelegate } = returnValues;
      const pledgeAdmin = await PledgeAdmins.findOne({ id: Number(idDelegate) });
      if (pledgeAdmin) {
        continue;
      }
      const { from, blockNumber } = await foreignWeb3.eth.getTransaction(transactionHash);
      const delegateId = idDelegate;
      let dac = await Dacs.findOne({ delegateId });
      if (!dac) {
        const dacData = await getDacDataForCreate({
          from,
          txHash: transactionHash,
          delegateId,
          blockNumber,
        });
        dac = await new Dacs(dacData).save();
        logger.info('created dac ', dac);
      }
      await new PledgeAdmins({ id: Number(delegateId), type: 'dac', typeId: dac._id }).save();
    } catch (e) {
      logger.error('error in creating dac', e);
    }
  }
  progressBar.update(events.length);
  progressBar.stop();
  const spentTime = (new Date().getTime() - startTime.getTime()) / 1000;
  console.log(`dac/delegate events synced end.\n spentTime :${spentTime} seconds`);
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

    db.once('open', async () => {
      logger.info('Connected to Mongo');
      await syncPledgeAdmins();
      await syncDacs();
      await syncDonationsWithNetwork();
      terminateScript(null, 0);
    });
  } catch (e) {
    logger.error(e);
    throw e;
  }
};

main()
  .then(() => {})
  .catch(e => terminateScript(e, 1));
