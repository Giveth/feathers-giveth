/* eslint-disable no-continue */
/* eslint-disable no-console */
const Web3 = require('web3');
const fs = require('fs');
const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');
const web3Helper = require('../../src/blockchain/lib/web3Helpers');

const configFileName = 'beta'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

const {
  verifiedTransfers,
  revertExemptedDonations,
  ignoredTransactions,
  corruptedParentPledgeIds,
} = require('./eventProcessingHelper.json');

// Create output log file

// Map token symbol to foreign address
const tokenSymbolToForeignAddress = {};
config.tokenWhitelist.forEach(token => {
  tokenSymbolToForeignAddress[token.symbol] = token.foreignAddress.toLowerCase();
});

const tokensForeignAddress = config.tokenWhitelist.map(t => t.foreignAddress.toLowerCase());

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

const { DonationStatus } = require('../../src/models/donations.model');
const { AdminTypes } = require('../../src/models/pledgeAdmins.model');
const { DacStatus } = require('../../src/models/dacs.model');
const { CampaignStatus } = require('../../src/models/campaigns.model');
const { MilestoneStatus } = require('../../src/models/milestones.model');

const terminateScript = (message = '', code = 0) =>
  process.stdout.write(`Exit message: ${message}`, () => process.exit(code));

// Instantiate Web3 module
// @params {string} url blockchain node url address
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

// Gets status of liquidpledging storage
const getBlockchainData = async ({ updateState, updateEvents }) => {
  const stateFile = `./liquidPledgingState_${configFileName}.json`;
  const eventsFile = `./liquidPledgingEvents_${configFileName}.json`;

  let state;
  let events;

  if (!updateState) state = JSON.parse(fs.readFileSync(stateFile));
  events = fs.existsSync(eventsFile) ? JSON.parse(fs.readFileSync(eventsFile)) : [];

  if (updateState || updateEvents) {
    const foreignWeb3 = instantiateWeb3(nodeUrl);
    let fromBlock = 0;
    let fetchBlockNum = 'latest';
    if (updateEvents) {
      fromBlock = events.length > 0 ? events[events.length - 1].blockNumber + 1 : 0;
      fetchBlockNum =
        (await foreignWeb3.eth.getBlockNumber()) - config.blockchain.requiredConfirmations;
    }

    const liquidPledging = new LiquidPledging(foreignWeb3, liquidPledgingAddress);
    const liquidPledgingState = new LiquidPledgingState(liquidPledging);

    const [numberOfPledges, numberOfPledgeAdmins] = await web3Helper.executeRequestsAsBatch(
      foreignWeb3,
      [
        liquidPledging.$contract.methods.numberOfPledges().call.request,
        liquidPledging.$contract.methods.numberOfPledgeAdmins().call.request,
      ],
    );
    console.log('Number of pledges', numberOfPledges);
    console.log('Number of pledge admins', numberOfPledgeAdmins);

    let newEvents;
    [state, newEvents] = await Promise.all([
      updateState ? liquidPledgingState.getState() : Promise.resolve(state),
      updateEvents
        ? liquidPledging.$contract.getPastEvents('allEvents', {
            fromBlock,
            toBlock: fetchBlockNum,
          })
        : Promise.resolve([]),
    ]);

    if (updateState) fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    if (updateEvents) {
      events = [...events, ...newEvents];
      fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
    }
  }
  return {
    state,
    events,
  };
};

// Update createdAt date of donations based on transaction date
// @params {string} url blockchain node url address
const updateDonationsCreatedDate = async startDate => {
  const foreignWeb3 = instantiateWeb3(nodeUrl);
  await Donations.find({
    createdAt: {
      $gte: startDate.toISOString(),
    },
  })
    .cursor()
    .eachAsync(async ({ _id, txHash, createdAt }) => {
      const { blockNumber } = await foreignWeb3.eth.getTransaction(txHash);
      const { timestamp } = await foreignWeb3.eth.getBlock(blockNumber);
      const newCreatedAt = new Date(timestamp * 1000);
      if (createdAt.toISOString() !== newCreatedAt.toISOString()) {
        console.log(
          `Donation ${_id.toString()} createdAt is changed from ${createdAt.toISOString()} to ${newCreatedAt.toISOString()}`,
        );
        console.log('Updating...');
        const [d] = await Donations.find({ _id }).exec();
        d.createdAt = newCreatedAt;
        await d.save();
      }
    });
};

const findEntityConflicts = (model, projectPledgeMap, fixConflicts = false, pledges) => {
  const cursor = model
    .find({
      projectId: { $exists: true },
    })
    .cursor();

  return cursor.eachAsync(async entity => {
    const balance = projectPledgeMap.get(String(entity.projectId)) || {};

    const balancePledged = balance.Pledged || {};

    const { donationCounters } = entity;

    let conflictFound = false;
    const setObject = {};

    /*
     Update entity donationCounters
    */
    donationCounters.forEach((dc, index) => {
      const { symbol, currentBalance: dbBalance } = dc;
      const foreignAddress = tokenSymbolToForeignAddress[symbol];
      const tokenBalance = balancePledged[foreignAddress];

      if (tokenBalance === undefined) {
        console.log(
          `There is no balance for token ${symbol} in blockchain for ${model.modelName} ${entity._id}`,
        );
        return;
      }

      if (dbBalance.toString() !== tokenBalance.amount.toFixed(0)) {
        const dbBalanceFromWei = Web3.utils.fromWei(dbBalance.toString());
        const blockchainBalanceFromWei = Web3.utils.fromWei(tokenBalance.amount.toFixed(0));

        console.log(
          'conflict found on',
          model.modelName,
          entity.title,
          entity._id,
          ':',
          symbol,
          'value in db',
          dbBalanceFromWei,
          'value in smart contract',
          blockchainBalanceFromWei,
          tokenBalance.pledges,
        );

        if (fixConflicts) {
          conflictFound = true;

          setObject[`donationCounters.${index}.currentBalance`] = tokenBalance.amount.toFixed();
        }
      }
    });

    if (conflictFound) {
      await model
        .update(
          { _id: entity._id },
          {
            $set: {
              ...setObject,
            },
          },
        )
        .exec();
    }

    /*
    Update donations
     */
    const [paidDonations, payingDonations, committedDonations] = await Promise.all(
      [DonationStatus.PAID, DonationStatus.PAYING, DonationStatus.COMMITTED].map(status => {
        return Donations.find({
          ownerTypeId: entity._id,
          status,
        }).exec();
      }),
    );

    // Find conflict in donations
    [
      {
        pledgeStatus: 'Pledged',
        donationStatus: DonationStatus.COMMITTED,
        donations: committedDonations,
      },
      {
        pledgeStatus: 'Paying',
        donationStatus: DonationStatus.PAYING,
        donations: payingDonations,
      },
      {
        pledgeStatus: 'Paid',
        donationStatus: DonationStatus.PAID,
        donations: paidDonations,
      },
    ].forEach(item => {
      const { pledgeStatus, donationStatus, donations } = item;

      tokensForeignAddress.forEach(tokenAddress => {
        if (!balance[pledgeStatus]) return;

        const thisBalance = balance[pledgeStatus][tokenAddress];
        if (!thisBalance) return;

        thisBalance.pledges.forEach(pledgeId => {
          const pledge = pledges[pledgeId];

          const pledgeDonations = donations.filter(d => d.pledgeId.toNumber() === pledgeId);

          let donationsAmount = new BigNumber(0);

          pledgeDonations.forEach(d => {
            if (d.status !== donationStatus)
              console.log(
                `Donation ${d._id} status should be ${donationStatus} but is ${d.status}`,
              );
            donationsAmount = donationsAmount.plus(d.amount.toString());
          });

          if (pledge.amount !== donationsAmount.toFixed()) {
            console.log(
              `Pledge ${pledgeId} amount is ${pledge.amount} but sum of ${
                pledgeDonations.length
              } donations is ${donationsAmount.toFixed()}`,
            );
          }
        });
      });
    });
  });
};

const findProjectsConflict = (fixConflicts, admins, pledges) => {
  const projectAdmins = new Set();
  for (let i = 1; i < admins.length; i += 1) {
    if (admins[i].type === 'Project') {
      projectAdmins.add(i);
    }
  }

  const projectPledgeMap = new Map();

  for (let i = 1; i < pledges.length; i += 1) {
    const pledge = pledges[i];
    const { amount, owner, pledgeState } = pledge;

    if (!projectAdmins.has(Number(owner))) {
      // console.log(`owner ${owner} is not a project`);
      continue;
    }

    const token = pledge.token.toLowerCase();
    const balance = projectPledgeMap.get(owner) || { Pledged: {}, Paying: {}, Paid: {} };
    const donationCounter = balance[pledgeState][token] || {
      pledges: [],
      amount: new BigNumber(0),
    };
    donationCounter.pledges.push(i);
    donationCounter.amount = donationCounter.amount.plus(amount);
    balance[pledgeState][token] = donationCounter;
    projectPledgeMap.set(owner, balance);
  }

  return Promise.all([
    findEntityConflicts(Milestones, projectPledgeMap, fixConflicts, pledges),
    findEntityConflicts(Campaigns, projectPledgeMap, fixConflicts, pledges),
  ]);
};

// Returns a map contains empty donation items for each pledge
const getPledgeDonationItems = async () => {
  const pledgeDonationListMap = new Map();
  // Map from _id to donation
  const donationMap = new Map();
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
        intendedProjectId,
        giverAddress,
      }) => {
        // if (pledgeId === '0') return;

        let list = pledgeDonationListMap.get(pledgeId.toString());
        if (list === undefined) {
          list = [];
          pledgeDonationListMap.set(pledgeId.toString(), list);
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
          intendedProjectId,
          giverAddress,
          pledgeId: pledgeId.toString(),
        };

        list.push(item);
        donationMap.set(_id.toString(), item);
      },
    );
  return { pledgeDonationListMap, donationMap };
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

const handleFromDonations = async (
  fixConflicts,
  from,
  to,
  amount,
  transactionHash,
  logIndex,
  pledges,
  admins,
  pledgeNotFilledDonations,
  chargedDonationList,
  donationMap,
) => {
  const usedFromDonations = []; // List of donations which could be parent of the donation
  let isIgnored = false;
  let giverAddress;

  let toUnusedDonationList = pledgeNotFilledDonations.get(to); // List of donations which are candidates to be charged
  if (toUnusedDonationList === undefined) {
    console.log(`There is no donation for pledgeId ${to}`);
    toUnusedDonationList = [];
    pledgeNotFilledDonations.set(to, toUnusedDonationList);
  }

  const toPledge = pledges[Number(to)];
  const toOwnerId = toPledge.owner;
  const fromOwnerId = from !== '0' ? pledges[Number(from)].owner : null;

  const toOwnerAdmin = admins[Number(toOwnerId)];
  const fromOwnerAdmin = from !== '0' ? admins[Number(fromOwnerId)] : {};

  if (from !== '0') {
    const candidateChargedParents = chargedDonationList.get(from) || [];

    // Trying to find the best parent from DB
    let candidateToDonationList = toUnusedDonationList.filter(
      item => item.txHash === transactionHash && item.amountRemaining.eq(0),
    );

    if (candidateToDonationList.length > 1) {
      console.log('candidateToDonationList length is greater than one!');
    } else if (candidateToDonationList.length === 0) {
      // Try to find donation among failed ones!
      const failedDonationList = pledgeNotFilledDonations.get('0') || [];
      const matchingFailedDonationIndex = failedDonationList.findIndex(item => {
        if (item.txHash === transactionHash && item.amount === amount) {
          const { parentDonations } = item;
          if (from === '0') {
            return parentDonations.length === 0;
          } // It should not have parent
          // Check whether parent pledgeId equals from
          if (parentDonations.length === 0) return false;
          const parent = donationMap.get(item.parentDonations[0]);
          return parent.pledgeId === from;
        }
        return false;
      });

      // A matching failed donation found, it's not failed and should be updated with correct value
      if (matchingFailedDonationIndex !== -1) {
        const toFixDonation = failedDonationList[matchingFailedDonationIndex];
        console.log(`Donation ${toFixDonation._id} hasn't failed, it should be updated`);

        // Remove from failed donations
        failedDonationList.splice(matchingFailedDonationIndex, 1);

        toFixDonation.status = convertPledgeStateToStatus(toPledge, toOwnerAdmin);
        toFixDonation.pledgeId = to;
        toUnusedDonationList.push(toFixDonation);

        candidateToDonationList = [toFixDonation];

        console.log('Will update to:');
        console.log(JSON.stringify(toFixDonation, null, 2));

        if (fixConflicts) {
          console.log('Updating...');
          await Donations.update(
            { _id: toFixDonation._id },
            { status: toFixDonation.status, pledgeId: to },
          ).exec();
        }
      }
    }

    const updateParents = corruptedParentPledgeIds.includes(from);

    const candidateParentsFromDB = [];
    if (!updateParents && candidateToDonationList.length > 0) {
      const { parentDonations } = candidateToDonationList[0];
      parentDonations.forEach(parent => candidateParentsFromDB.push(parent));
    }

    const transfer = verifiedTransfers.find(
      tt => tt.txHash === transactionHash && tt.logIndex === logIndex,
    );
    // Paid donations should be created (Not creating Paid donations is a common mistake!)
    const isVerified = transfer !== undefined || toPledge.pledgeState === 'Paid';

    // Reduce money from parents one by one
    if (candidateParentsFromDB.length > 0) {
      let fromAmount = new BigNumber(amount);
      candidateParentsFromDB.forEach(parentId => {
        if (fromAmount.eq(0)) {
          console.log(`No money is moved from parent ${parentId}`);
          return;
        }
        const index = candidateChargedParents.findIndex(item => item._id && item._id === parentId);
        if (index === -1) {
          if (toOwnerAdmin.isCanceled || toOwnerAdmin.canceled) {
            console.log('To owner is canceled, transfer is ignored');
            isIgnored = true;
            return;
          }
          if (fromOwnerAdmin.isCanceled || fromOwnerAdmin.canceled) {
            console.log('From owner is canceled, transfer is ignored');
            isIgnored = true;
            return;
          }

          candidateChargedParents.forEach(p => {
            console.log(`Parent ${p._id} amount remaining ${p.amountRemaining.toFixed()}`);
          });

          terminateScript('no appropriate parent found');
        }
        const d = candidateChargedParents[index];
        if (d.giverAddress) giverAddress = d.giverAddress;

        const min = BigNumber.min(d.amountRemaining, fromAmount);
        fromAmount = fromAmount.minus(min);
        d.amountRemaining = d.amountRemaining.minus(min);

        console.log(
          `Amount ${min.toFixed()} is reduced from ${JSON.stringify(
            { ...d, amountRemaining: d.amountRemaining.toFixed() },
            null,
            2,
          )}`,
        );

        if (d._id) {
          usedFromDonations.push(d._id);
        }

        // Remove donation from candidate if it's drained
        if (d.amountRemaining.eq(0)) {
          candidateChargedParents.splice(index, 1);
        }

        // if (d.status === DonationStatus.CANCELED) {
        //   parentIsCancelled = true;
        // }
      });
      if (!fromAmount.eq(0) && !isIgnored) {
        terminateScript('All money is not moved\n');
      }
    } else if (!isVerified && (toOwnerAdmin.isCanceled || toOwnerAdmin.canceled)) {
      console.log('To owner is canceled, transfer is ignored');
      isIgnored = true;
    } else if (!isVerified && (fromOwnerAdmin.isCanceled || fromOwnerAdmin.canceled)) {
      console.log('From owner is canceled, transfer is ignored');
      isIgnored = true;
    } else if (candidateChargedParents.length > 0) {
      let fromAmount = new BigNumber(amount);
      let consumedCandidates = 0;
      for (let j = 0; j < candidateChargedParents.length; j += 1) {
        const item = candidateChargedParents[j];

        if (item.giverAddress) {
          giverAddress = item.giverAddress;
        }
        // if (item.status === DonationStatus.CANCELED) {
        //   parentIsCancelled = true;
        // }

        const min = BigNumber.min(item.amountRemaining, fromAmount);
        item.amountRemaining = item.amountRemaining.minus(min);
        if (item.amountRemaining.eq(0)) {
          consumedCandidates += 1;
        }
        fromAmount = fromAmount.minus(min);
        console.log(
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

      chargedDonationList.set(from, candidateChargedParents.slice(consumedCandidates));

      if (!fromAmount.eq(0)) {
        console.log(`from delegate ${from} donations don't have enough amountRemaining!`);
        console.log(`Deficit amount: ${fromAmount.toFixed()}`);
        console.log('Not used candidates:');
        candidateChargedParents.forEach(candidate =>
          console.log(JSON.stringify(candidate, null, 2)),
        );
        terminateScript();
      }
    } else {
      terminateScript(`There is no donation for transfer from ${from} to ${to}\n`);
    }
  }

  return { usedFromDonations, isIgnored, giverAddress };
};

const handleToDonations = async (
  { fixConflicts, fixStatus },
  from,
  to,
  amount,
  foreignWeb3,
  transactionHash,
  blockNumber,
  logIndex,
  pledges,
  admins,
  pledgeNotFilledDonations,
  candidateDonationList,
  chargedDonationList,
  usedFromDonations,
  isIgnored,
  giverAddress,
  donationMap,
) => {
  if (isIgnored) return;

  let toNotFilledDonationList = pledgeNotFilledDonations.get(to); // List of donations which are candidates to be charged
  if (toNotFilledDonationList === undefined) {
    console.log(`There is no donation for pledgeId ${to}`);
    toNotFilledDonationList = [];
    pledgeNotFilledDonations.set(to, toNotFilledDonationList);
  }

  const updateParents = corruptedParentPledgeIds.includes(from);
  const toIndex = toNotFilledDonationList.findIndex(
    item =>
      item.txHash === transactionHash &&
      item.amountRemaining.eq(0) &&
      (updateParents ||
        (item.parentDonations.length === usedFromDonations.length &&
          item.parentDonations.every(parent =>
            usedFromDonations.some(value => value.toString() === parent),
          ))),
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

  if (toDonation === undefined) {
    // If parent is cancelled, this donation is not needed anymore
    if (!isIgnored) {
      const status = convertPledgeStateToStatus(toPledge, toOwnerAdmin);

      const expectedToDonation = {
        txHash: transactionHash,
        parentDonations: usedFromDonations,
        from,
        pledgeId: to,
        pledgeState: toPledge.pledgeState,
        amount,
        amountRemaining: new BigNumber(amount),
        ownerId: toOwnerId,
        status,
      };

      // If it is a verified transaction that should be added to database
      let transfer = verifiedTransfers.find(
        tt => tt.txHash === transactionHash && tt.logIndex === logIndex,
      );

      // Paid donations should be created (Not creating Paid donations is a common mistake!)
      const isVerified = transfer !== undefined || toPledge.pledgeState === 'Paid';
      if (transfer === undefined) {
        transfer = {};
      }

      if (isVerified && fixConflicts) {
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
          console.log('pledgeAdmin crated:', toPledgeAdmin._id.toString());
        }

        // Create donation
        const token = config.tokenWhitelist.find(t => t.foreignAddress === toPledge.token);
        if (token === undefined) {
          terminateScript(`No token found for address ${toPledge.token}\n`);
          return;
        }

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

        // Set giverAddress to owner address if is a Giver
        if (giverAddress === undefined) {
          if (toOwnerAdmin.type !== 'Giver') {
            terminateScript(`Cannot set giverAddress\n`);
            return;
          }
          giverAddress = toPledgeAdmin.typeId;
          expectedToDonation.giverAddress = giverAddress;
        }

        if (status === null) {
          terminateScript(`Pledge status ${toPledge.pledgeState} is unknown\n`);
          return;
        }

        const { timestamp } = await foreignWeb3.eth.getBlock(blockNumber);

        const model = {
          status,
          mined: true,
          parentDonations: expectedToDonation.parentDonations,
          isReturn: false,
          giverAddress,
          amount: expectedToDonation.amount,
          amountRemaining: transfer.amountRemaining
            ? transfer.amountRemaining
            : expectedToDonation.amountRemaining.toFixed(),
          pledgeId: to,
          ownerId: toPledgeAdmin.id,
          ownerTypeId: toPledgeAdmin.typeId,
          ownerType: toPledgeAdmin.type,
          token,
          txHash: transactionHash,
          createdAt: new Date(timestamp * 1000),
          ...delegationInfo,
        };
        if (transfer._id) {
          model._id = transfer._id;
        }
        const donation = new Donations(model);

        await donation.save();

        const _id = donation._id.toString();
        expectedToDonation._id = _id;
        expectedToDonation.savedAmountRemaining = model.amountRemaining;
        donationMap.set(_id, expectedToDonation);
        console.log(
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
        console.log(
          `this donation should be created: ${JSON.stringify(
            {
              ...expectedToDonation,
              amountRemaining: expectedToDonation.amountRemaining.toFixed(),
            },
            null,
            2,
          )}`,
        );
        console.log('--------------------------------');
        console.log('From owner:', fromOwnerAdmin);
        console.log('To owner:', toOwnerAdmin);
        console.log('--------------------------------');
        console.log('From pledge:', fromPledge);
        console.log('To pledge:', toPledge);
      }
      let candidates = candidateDonationList.get(to);
      if (candidates === undefined) {
        candidates = [];
        candidateDonationList.set(to, candidates);
      }
      candidates.push(expectedToDonation);
      candidates = chargedDonationList.get(to);
      if (candidates === undefined) {
        candidates = [];
        chargedDonationList.set(to, candidates);
      }
      candidates.push(expectedToDonation);
    }
  } else {
    // Check toDonation has correct status and mined flag
    const expectedStatus = convertPledgeStateToStatus(toPledge, toOwnerAdmin);
    if (expectedStatus === null) {
      terminateScript(`Pledge status ${toPledge.pledgeState} is unknown\n`);
      return;
    }

    if (toDonation.mined === false) {
      console.log(`Donation ${toDonation._id} mined flag should be true`);
    } else if (toDonation.status !== expectedStatus) {
      // console.log(
      //   `Donation ${toDonation._id} status should be ${status} but is ${toDonation.status}`,
      // );
    }

    const { parentDonations } = toDonation;
    if (
      updateParents &&
      (usedFromDonations.length !== parentDonations.length ||
        usedFromDonations.some(id => !parentDonations.includes(id)))
    ) {
      console.log(`Parent of ${toDonation._id} should be updated to ${usedFromDonations}`);
      if (fixConflicts) {
        console.log('Updating...');
        toDonation.parentDonations = usedFromDonations;
        await Donations.update(
          { _id: toDonation._id },
          { parentDonations: usedFromDonations },
        ).exec();
      }
    }

    toDonation.amountRemaining = toDonation.amountRemaining.plus(amount);
    toDonation.txHash = transactionHash;
    toDonation.from = from;
    toDonation.pledgeId = to;
    toDonation.pledgeState = toPledge.pledgeState;
    toDonation.amountRemaining = new BigNumber(amount);
    const { PAYING, FAILED, PAID } = DonationStatus;
    if (
      [PAID, PAYING, FAILED].includes(toDonation.status) ||
      [PAYING, PAID].includes(expectedStatus)
    ) {
      if (expectedStatus !== toDonation.status) {
        console.log(`Donation status is ${toDonation.status}, but should be ${expectedStatus}`);
        if (fixStatus) {
          console.log('Updating...');
          await Donations.update({ _id: toDonation._id }, { status: expectedStatus }).exec();
          toDonation.status = expectedStatus;
        }
      }
    }

    let candidates = chargedDonationList.get(to);

    if (candidates === undefined) {
      candidates = [];
      chargedDonationList.set(to, candidates);
    }

    candidates.push(toDonation);

    console.log(
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

    // The project is cancelled, the donatoin should be reverted
    // if (toDonation.status === DonationStatus.CANCELED) {
    //   console.log(`Reverting donation to ${from}`);
    //   let fromUnusedDonationList =  pledgeNotFilledDonations.get(from); // List of donations which are candidates to money return to
    //   if (fromUnusedDonationList === undefined) {
    //     console.log(`There is no donation for pledgeId ${from}`);
    //     fromUnusedDonationList = [];
    //      pledgeNotFilledDonations.set(from, fromUnusedDonationList);
    //   }
    //
    //   const returnIndex = fromUnusedDonationList.findIndex(
    //     item =>
    //       item.amountRemaining.eq(0) &&
    //       item.amount === amount &&
    //       item.parentDonations.length === 1 &&
    //       item.parentDonations[0].toString() === toDonation._id.toString(),
    //   );
    //
    //   const returnDonation =
    //     returnIndex !== -1 ? fromUnusedDonationList.splice(returnIndex, 1)[0] : undefined;
    //   if (returnDonation === undefined) {
    //     process.stdout.write("could'nt find return donation", () => {
    //       process.exit();
    //     });
    //   }
    //   returnDonation.amountRemaining = returnDonation.amountRemaining.plus(amount);
    //   const returnChargedDonation = {
    //     _id: returnDonation._id,
    //     status: returnDonation.status,
    //     txHash: transactionHash,
    //     parentDonations: returnDonation.parentDonations,
    //     from,
    //     pledgeId: to,
    //     pledgeState: toPledge.pledgeState,
    //     amount,
    //     amountRemaining: new BigNumber(amount),
    //   };
    //
    //   let fromChargedDonationList = chargedDonationList.get(from);
    //
    //   if (fromChargedDonationList === undefined) {
    //     fromChargedDonationList = [];
    //     chargedDonationList.set(to, fromChargedDonationList);
    //   }
    //
    //   fromChargedDonationList.push(returnChargedDonation);
    //
    //   console.log(
    //     `Amount added to ${JSON.stringify(
    //       {
    //         _id: returnDonation._id,
    //         amountRemaining: returnDonation.amountRemaining.toFixed(),
    //         amount: returnDonation.amount,
    //         status: returnDonation.status,
    //       },
    //       null,
    //       2,
    //     )}`,
    //   );
    // }
  }
};
const getMostRecentDonationNotCanceled = (donation, donationMap, admins) => {
  // givers can never be canceled
  if (donation.ownerType === AdminTypes.GIVER && !donation.intendedProjectId) {
    return donation;
  }

  const pledgeOwnerAdmin = admins[Number(donation.ownerId)];

  // if pledgeOwnerAdmin is canceled or donation is a delegation, go back 1 donation
  if (pledgeOwnerAdmin.isCanceled || Number(donation.intendedProjectId) > 0) {
    // we use the 1st parentDonation b/c the owner of all parentDonations
    // is the same
    return getMostRecentDonationNotCanceled(
      donationMap.get(donation.parentDonations[0]),
      donationMap,
      admins,
    );
  }

  return donation;
};

const revertDonation = async (
  { fixStatus, fixReturnedDonationAmount },
  donation,
  transactionHash,
  donationMap,
  pledgeNotFilledDonations,
  toCreateDonationListMap,
  chargedDonationListMap,
  admins,
) => {
  // They should not be processed in regular donation reverting process
  if (revertExemptedDonations.includes(donation._id)) return;
  if ([DonationStatus.PAYING, DonationStatus.PAID].includes(donation.status)) return;

  const revertToDonation = getMostRecentDonationNotCanceled(donation, donationMap, admins);
  const toPledgeNotFilledDonationList = pledgeNotFilledDonations.get(revertToDonation.pledgeId);
  if (toPledgeNotFilledDonationList === undefined) {
    terminateScript(`No pledge found to move money to\n`);
    return;
  }
  const toIndex = toPledgeNotFilledDonationList.findIndex(
    item =>
      item.txHash === transactionHash &&
      item.parentDonations.length === 1 &&
      (donation._id === undefined || item.parentDonations[0] === donation._id),
  );

  if (toIndex === -1) {
    terminateScript(
      `Couldn't find donation to move money of ${JSON.stringify(donation, null, 2)}\n`,
    );
    return;
  }

  const toDonation =
    toIndex !== -1 ? toPledgeNotFilledDonationList.splice(toIndex, 1)[0] : undefined;

  toDonation.amountRemaining = toDonation.amountRemaining.plus(donation.amountRemaining);
  donation.amountRemaining = new BigNumber(0);

  // TODO: It happens and should be fixed
  // if (toDonation.amountRemaining.gt(toDonation.amount)) {
  //   terminateScript(
  //     `Donation amountRemaining exceeds its amount!\n${JSON.stringify(
  //       { ...toDonation, amountRemaining: toDonation.amountRemaining.toFixed() },
  //       null,
  //       2,
  //     )}\n`,
  //   );
  //   return;
  // }

  toDonation.from = donation.pledgeId;

  let chargedDonationList = chargedDonationListMap.get(toDonation.pledgeId);

  if (chargedDonationList === undefined) {
    chargedDonationList = [];
    chargedDonationListMap.set(toDonation.pledgeId, chargedDonationList);
  }

  chargedDonationList.push(toDonation);

  chargedDonationList = chargedDonationListMap.get(donation.pledgeId) || [];

  const fromIndex = chargedDonationList.findIndex(item => item._id === donation._id);
  if (fromIndex !== -1) chargedDonationList.splice(fromIndex, 1);

  console.log(
    `Revert money from ${donation.pledgeId} to ${
      toDonation.pledgeId
    } amount ${toDonation.amountRemaining.toFixed()}`,
  );
  if (donation.status !== DonationStatus.CANCELED) {
    console.log(`Donation status should be ${DonationStatus.CANCELED}, but is ${donation.status}`);
    if (fixStatus) {
      console.log('Updating...');
      await Donations.update({ _id: donation._id }, { status: DonationStatus.CANCELED }).exec();
      toDonation.status = DonationStatus.CANCELED;
    }
  }

  const { _id, amount, amountRemaining } = toDonation;
  if (!amountRemaining.eq(amount)) {
    console.log(`Donation ${_id} amount should be ${amountRemaining.toFixed()} but is ${amount}`);
    if (fixReturnedDonationAmount) {
      console.log('Updating...');
      await Donations.update({ _id }, { amount: amountRemaining.toFixed() }).exec();
      toDonation.amount = amountRemaining.toFixed();
    }
  }

  console.log(
    `Amount added to ${JSON.stringify(
      {
        ...toDonation,
        amountRemaining: toDonation.amountRemaining.toFixed(),
      },
      null,
      2,
    )}`,
  );
};

const revertProjectDonations = (
  { fixStatus, fixReturnedDonationAmount },
  projectId,
  transactionHash,
  donationMap,
  ownerPledgeList,
  pledgeNotFilledDonations,
  toCreateDonationListMap,
  chargedDonationListMap,
  admins,
) => {
  const projectPledgesList = ownerPledgeList.get(projectId.toString()) || [];
  return Promise.all(
    projectPledgesList.map(pledgeId => {
      const chargedDonationList = chargedDonationListMap.get(String(pledgeId)) || [];
      return Promise.all(
        [...chargedDonationList].map(chargedDonation =>
          revertDonation(
            { fixStatus, fixReturnedDonationAmount },
            chargedDonation,
            transactionHash,
            donationMap,
            pledgeNotFilledDonations,
            toCreateDonationListMap,
            chargedDonationListMap,
            admins,
          ),
        ),
      );
    }),
  );
};

const cancelProject = async (
  { fixStatus, fixReturnedDonationAmount },
  projectId,
  transactionHash,
  donationMap,
  ownerPledgeList,
  campaignMilestoneListMap,
  pledgeNotFilledDonations,
  toCreateDonationListMap,
  chargedDonationListMap,
  admins,
) => {
  admins[projectId].isCanceled = true;
  const projectIdStr = String(projectId);
  admins.slice(1).forEach(admin => {
    if (admin.parentProject === projectIdStr) {
      admin.isCanceled = true;
    }
  });

  // Cancel campaign milestones
  if (campaignMilestoneListMap.has(projectId)) {
    const milestoneList = campaignMilestoneListMap.get(projectId) || [];
    await Promise.all(
      milestoneList.map(id => {
        return revertProjectDonations(
          { fixStatus, fixReturnedDonationAmount },
          id,
          transactionHash,
          donationMap,
          ownerPledgeList,
          pledgeNotFilledDonations,
          toCreateDonationListMap,
          chargedDonationListMap,
          admins,
        );
      }),
    );
  }

  await revertProjectDonations(
    { fixStatus, fixReturnedDonationAmount },
    projectId,
    transactionHash,
    donationMap,
    ownerPledgeList,
    pledgeNotFilledDonations,
    toCreateDonationListMap,
    chargedDonationListMap,
    admins,
  );
};

const fixConflictInDonations = (fixConflicts, donationMap, pledges, unusedDonationMap) => {
  const promises = [];
  donationMap.forEach(
    ({ _id, amount, amountRemaining, savedAmountRemaining, status, pledgeId, txHash }) => {
      if (pledgeId === '0') return;

      const pledge = pledges[Number(pledgeId)];

      if (unusedDonationMap.has(_id.toString())) {
        console.log('---------------------------------------------');
        console.log('Donation was unused!');
        console.log(
          JSON.stringify(
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
          ),
        );
        if (fixConflicts) {
          console.log('Deleting...');
          promises.push(Donations.findOneAndDelete({ _id }).exec());
        }
      } else if (savedAmountRemaining && !amountRemaining.eq(savedAmountRemaining)) {
        console.log('---------------------------------------------');
        console.log(
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
          console.log('Pledge Amount:', pledge.amount);
        }
        if (fixConflicts) {
          console.log('Updating...');
          promises.push(
            Donations.update(
              { _id },
              {
                $set: {
                  amountRemaining: amountRemaining.toFixed(),
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

const syncDonationsWithNetwork = async (
  { fixConflicts, fixStatus, fixReturnedDonationAmount },
  events,
  pledges,
  admins,
) => {
  // Map from pledge id to list of donations belongs to which are not used yet!
  const {
    pledgeDonationListMap: pledgeNotFilledDonations,
    donationMap,
  } = await getPledgeDonationItems();

  // Donations which are candidate to be created
  const toCreateDonationListMap = new Map();
  // Donations which are charged and can be used to move money from
  const chargedDonationListMap = new Map();
  // Map from owner to list of its pledges
  const ownerPledgeList = new Map();
  // Map from campaign to list of its milestones
  const campaignMilestoneListMap = new Map();

  for (let i = 1; i < pledges.length; i += 1) {
    const { owner } = pledges[i];
    let list = ownerPledgeList.get(owner);
    if (list === undefined) {
      list = [];
      ownerPledgeList.set(owner, list);
    }
    list.push(i);
  }

  for (let i = 1; i < admins.length; i += 1) {
    const { parentProject } = admins[i];
    if (parentProject !== '0') {
      let list = campaignMilestoneListMap.get(parentProject);
      if (list === undefined) {
        list = [];
        campaignMilestoneListMap.set(parentProject, list);
      }
      list.push(i);
    }
  }

  const foreignWeb3 = instantiateWeb3(nodeUrl);
  // Simulate transactions by events
  for (let i = 0; i < events.length; i += 1) {
    const { event, transactionHash, logIndex, returnValues, blockNumber } = events[i];
    console.log(
      `-----\nProcessing event ${i}:\nLog Index: ${logIndex}\nEvent: ${event}\nTransaction hash: ${transactionHash}`,
    );

    if (ignoredTransactions.some(it => it.txHash === transactionHash && it.logIndex === logIndex)) {
      console.log('Event ignored.');
      continue;
    }

    if (event === 'Transfer') {
      const { from, to, amount } = returnValues;
      console.log(`Transfer from ${from} to ${to} amount ${amount}`);

      // Ignore transfer if from owner is canceled
      // if (from !== '0' && admins[Number(pledges[Number(from)].owner)].isCanceled) {
      //   console.log('Transfer ignored');
      //   continue;
      // }

      // eslint-disable-next-line no-await-in-loop
      const { usedFromDonations, isIgnored, giverAddress } = await handleFromDonations(
        fixConflicts,
        from,
        to,
        amount,
        transactionHash,
        logIndex,
        pledges,
        admins,
        pledgeNotFilledDonations,
        chargedDonationListMap,
        donationMap,
      );

      // eslint-disable-next-line no-await-in-loop
      await handleToDonations(
        { fixConflicts, fixStatus },
        from,
        to,
        amount,
        foreignWeb3,
        transactionHash,
        blockNumber,
        logIndex,
        pledges,
        admins,
        pledgeNotFilledDonations,
        toCreateDonationListMap,
        chargedDonationListMap,
        usedFromDonations,
        isIgnored,
        giverAddress,
        donationMap,
      );
    } else if (event === 'CancelProject') {
      const { idProject } = returnValues;
      console.log(`Cancel project ${idProject}: ${JSON.stringify(admins[Number(idProject)])}`);
      // eslint-disable-next-line no-await-in-loop
      await cancelProject(
        { fixStatus, fixReturnedDonationAmount },
        idProject,
        transactionHash,
        donationMap,
        ownerPledgeList,
        campaignMilestoneListMap,
        pledgeNotFilledDonations,
        toCreateDonationListMap,
        chargedDonationListMap,
        admins,
      );
    }
  }

  // Find conflicts in donations and pledges!
  chargedDonationListMap.forEach((list, pledgeId) => {
    const reducer = (totalAmountRemaining, chargedDonation) => {
      return totalAmountRemaining.plus(chargedDonation.amountRemaining);
    };
    const totalAmountRemaining = list.reduce(reducer, new BigNumber(0));
    const { amount: pledgeAmount, owner, oldPledge, pledgeState } = pledges[Number(pledgeId)];
    const admin = admins[Number(owner)];
    const { isCanceled, canceled } = admin;

    if (!totalAmountRemaining.eq(pledgeAmount)) {
      console.log('-----------------------');
      console.log(
        `Pledge ${pledgeId} amount ${pledgeAmount} does not equal total amount remaining ${totalAmountRemaining.toFixed()}`,
      );
      console.log('PledgeState:', pledgeState);
      console.log('Old Pledge:', oldPledge);
      console.log('Owner:', owner);
      console.log('Owner canceled:', !!canceled);
      console.log('Owner isCanceled:', !!isCanceled);
    } else if (isCanceled && !['Paying', 'Paid'].includes(pledgeState)) {
      console.log('#######################');
      console.log(
        `Pledge ${pledgeId} owner is canceled and its amount equals total amount remaining ${totalAmountRemaining.toFixed()}`,
      );
      console.log('PledgeState:', pledgeState);
      console.log('Old Pledge:', oldPledge);
      console.log('Owner:', owner);
      console.log('Owner canceled:', !!canceled);
      console.log('Owner isCanceled:', !!isCanceled);
    }
  });

  const unusedDonationMap = new Map();
  pledgeNotFilledDonations.forEach(list =>
    list.forEach(item => unusedDonationMap.set(item._id, item)),
  );
  await fixConflictInDonations(fixConflicts, donationMap, pledges, unusedDonationMap);
};

const syncPledgeAdmins = async (fixAdminConflicts, events) => {
  if (!fixAdminConflicts) return;

  for (let i = 9000; i < events.length; i += 1) {
    const { event, transactionHash, returnValues } = events[i];

    if (event !== 'ProjectAdded') continue;

    const { idProject } = returnValues;

    // eslint-disable-next-line no-await-in-loop
    const [pledgeAdmin] = await PledgeAdmins.find({ id: Number(idProject) }).exec();

    if (pledgeAdmin === undefined) {
      console.log('---------------------------');
      console.log(`No pledge admin exists for ${idProject}`);
      console.log('Transaction Hash:', transactionHash);

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

        console.log(`a ${type} found with id ${entity._id.toString()} and status ${entity.status}`);
        console.log(`Title: ${entity.title}`);
        const newPledgeAdmin = new PledgeAdmins({
          id: Number(idProject),
          type,
          typeId: entity._id.toString(),
        });
        // eslint-disable-next-line no-await-in-loop
        await newPledgeAdmin.save();
        console.log('pledgeAdmin crated:', newPledgeAdmin._id.toString());

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
        console.log("Couldn't found appropriate entity");
      }
    }
  }
};

const main = async ({
  updateState,
  updateEvents,
  findConflicts,
  fixConflicts,
  fixReturnedDonationAmount,
  fixStatus,
  fixAdminConflicts,
}) => {
  try {
    const { state, events } = await getBlockchainData({ updateState, updateEvents });

    if (!findConflicts && !fixAdminConflicts) return;

    const { pledges, admins } = state;

    /*
     Find conflicts in milestone donation counter
    */
    const mongoUrl = config.mongodb;
    console.log('url:', mongoUrl);
    mongoose.connect(mongoUrl);
    const db = mongoose.connection;

    db.on('error', err => console.error('Could not connect to Mongo', err));

    db.once('open', () => {
      console.log('Connected to Mongo');

      Promise.all([
        syncDonationsWithNetwork(
          { fixConflicts, fixStatus, fixReturnedDonationAmount },
          events,
          pledges,
          admins,
        ),
        // syncPledgeAdmins(fixAdminConflicts, events, admins),
        // findProjectsConflict(fixConflicts, admins, pledges)]
        // updateDonationsCreatedDate(new Date('2020-02-01')),
      ]).then(() => terminateScript('Finished', 0));
    });
  } catch (e) {
    console.log(e);
    throw e;
  }
};

main({
  updateState: false,
  updateEvents: false,
  findConflicts: true,
  fixConflicts: true,
  fixStatus: true,
  fixAdminConflicts: true,
  fixReturnedDonationAmount: true,
})
  .then(() => {})
  .catch(e => terminateScript(e, 1));
