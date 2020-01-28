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

const configFileName = 'default'; // default or beta

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

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
const Donations = require('../../src/models/donations.model').createModel(app);
const PledgeAdmins = require('../../src/models/pledgeAdmins.model').createModel(app);

const { DonationStatus } = require('../../src/models/donations.model');
const { AdminTypes } = require('../../src/models/pledgeAdmins.model');

const terminateScript = (message = '', code = 0) =>
  process.stdout.write(message, () => process.exit(code));

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
// @param {boolean} updateCache whether get new status from blockchain or load from cached file
const getBlockchainData = async updateCache => {
  const cacheFile = `./liquidPledgingState_${configFileName}.json`;
  const eventsFile = `./liquidPledgingEvents_${configFileName}.json`;

  if (updateCache) {
    const foreignWeb3 = instantiateWeb3(nodeUrl);
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

    const [status, events] = await Promise.all([
      liquidPledgingState.getState(),
      // Just transfer events
      liquidPledging.$contract.getPastEvents('allEvents', {
        fromBlock: 0,
        toBlock: 'latest',
      }),
    ]);

    fs.writeFileSync(cacheFile, JSON.stringify(status, null, 2));
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));

    return { status, events };
  }
  return {
    status: JSON.parse(fs.readFileSync(cacheFile)),
    events: JSON.parse(fs.readFileSync(eventsFile)),
  };
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
        pledgeId,
        status,
        txHash,
        parentDonations,
        ownerId,
        ownerType,
        intendedProjectId,
      }) => {
        if (pledgeId === '0') return;

        let list = pledgeDonationListMap.get(pledgeId.toString());
        if (list === undefined) {
          list = [];
          pledgeDonationListMap.set(pledgeId.toString(), list);
        }

        const item = {
          _id: _id.toString(),
          amount: amount.toString(),
          amountRemaining: new BigNumber(0),
          txHash,
          status,
          parentDonations: parentDonations.map(id => id.toString()),
          ownerId,
          ownerType,
          intendedProjectId,
          pledgeId: pledgeId.toString(),
        };

        list.push(item);
        donationMap.set(_id.toString(), item);
      },
    );
  return { pledgeDonationListMap, donationMap };
};

const handleFromDonations = (
  from,
  to,
  amount,
  transactionHash,
  pledges,
  admins,
  pledgeUnusedDonations,
  chargedDonationList,
) => {
  const usedFromDonations = []; // List of donations which could be parent of the donation
  let parentIsCancelled = false;

  let toUnusedDonationList = pledgeUnusedDonations.get(to); // List of donations which are candidates to be charged
  if (toUnusedDonationList === undefined) {
    console.log(`There is no donation for pledgeId ${to}`);
    toUnusedDonationList = [];
    pledgeUnusedDonations.set(to, toUnusedDonationList);
  }

  const toOwnerId = pledges[Number(to)].owner;
  const fromOwnerId = from !== '0' ? pledges[Number(from)].owner : null;

  const toOwnerAdmin = admins[Number(toOwnerId)];
  const fromOwnerAdmin = from !== '0' ? admins[Number(fromOwnerId)] : {};

  if (from !== '0') {
    const candidateChargedParents = chargedDonationList.get(from) || [];

    // Trying to find the best parent from DB
    const candidateToDonationList = toUnusedDonationList.filter(
      item => item.txHash === transactionHash && item.amountRemaining.eq(0),
    );

    if (candidateToDonationList.length > 1) {
      console.log('candidateToDonationList length is greater than one!');
    }

    const candidateParentsFromDB = [];
    if (candidateToDonationList.length > 0) {
      const { parentDonations } = candidateToDonationList[0];
      parentDonations.forEach(parent => candidateParentsFromDB.push(parent));
    }

    // Reduce money from parents one by one
    if (candidateParentsFromDB.length > 0) {
      let fromAmount = new BigNumber(amount);
      candidateParentsFromDB.forEach(parentId => {
        const index = candidateChargedParents.findIndex(item => item._id && item._id === parentId);
        if (index === -1) {
          terminateScript('no appropriate parent found');
        }
        const d = candidateChargedParents[index];
        const min = BigNumber.min(d.amountRemaining, fromAmount);
        fromAmount = fromAmount.minus(min);

        console.log(
          `Amount ${min} is reduced from ${JSON.stringify(
            { ...d, amountRemaining: d.amountRemaining.toFixed() },
            null,
            2,
          )}`,
        );
        d.amountRemaining = d.amountRemaining.minus(min);

        if (d._id) {
          usedFromDonations.push(d._id);
        }

        // Remove donation from candidate if it's drained
        if (d.amountRemaining.eq(0)) {
          candidateChargedParents.splice(index, 1);
        }

        if (d.status === DonationStatus.CANCELED) {
          parentIsCancelled = true;
        }
      });
    } else if (toOwnerAdmin.canceled === true) {
      console.log('To owner is canceled, transfer is ignored');
    } else if (fromOwnerAdmin.canceled === true) {
      console.log('From owner is canceled, transfer is ignored');
    } else if (candidateChargedParents.length > 0) {
      let fromAmount = new BigNumber(amount);
      let consumedCandidates = 0;
      for (let j = 0; j < candidateChargedParents.length; j += 1) {
        const item = candidateChargedParents[j];

        if (item.status === DonationStatus.CANCELED) {
          parentIsCancelled = true;
        }

        const min = BigNumber.min(item.amountRemaining, fromAmount);
        item.amountRemaining = item.amountRemaining.minus(min);
        if (item.amountRemaining.eq(0)) {
          consumedCandidates += 1;
        }
        fromAmount = fromAmount.minus(min);
        console.log(`Amount ${min} is reduced from ${JSON.stringify(item, null, 2)}`);
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
      terminateScript(`There is no donation for transfer from ${from} to ${to}`);
    }
  }

  return { usedFromDonations, parentIsCancelled };
};

const handleToDonations = (
  from,
  to,
  amount,
  transactionHash,
  pledges,
  admins,
  pledgeUnusedDonations,
  candidateDonationList,
  chargedDonationList,
  usedFromDonations,
  parentIsCancelled,
) => {
  let toUnusedDonationList = pledgeUnusedDonations.get(to); // List of donations which are candidates to be charged
  if (toUnusedDonationList === undefined) {
    console.log(`There is no donation for pledgeId ${to}`);
    toUnusedDonationList = [];
    pledgeUnusedDonations.set(to, toUnusedDonationList);
  }

  const toIndex = toUnusedDonationList.findIndex(
    item =>
      item.txHash === transactionHash &&
      item.amountRemaining.eq(0) &&
      item.parentDonations.length === usedFromDonations.length &&
      item.parentDonations.every(parent =>
        usedFromDonations.some(value => value.toString() === parent),
      ),
  );

  const toDonation = toIndex !== -1 ? toUnusedDonationList.splice(toIndex, 1)[0] : undefined;

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
    if (!toOwnerAdmin.canceled && !fromOwnerAdmin.canceled) {
      const fromOwnerId = from !== '0' ? pledges[Number(from)].owner : 0;
      const expectedToDonation = {
        txHash: transactionHash,
        parentDonations: usedFromDonations,
        from,
        pledgeId: to,
        pledgeState: toPledge.pledgeState,
        amount,
        amountRemaining: new BigNumber(amount),
        ownerId: toOwnerId,
      };
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
      console.log(
        `this donation should be created: ${JSON.stringify(expectedToDonation, null, 2)}`,
      );
      console.log('--------------------------------');
      console.log('From owner:', fromOwnerAdmin);
      console.log('To owner:', toOwnerAdmin);
      console.log('--------------------------------');
      console.log('From pledge:', fromPledge);
      console.log('To pledge:', toPledge);
    }
  } else {
    toDonation.amountRemaining = toDonation.amountRemaining.plus(amount);
    const chargedDonation = {
      ...toDonation,
      txHash: transactionHash,
      from,
      pledgeId: to,
      pledgeState: toPledge.pledgeState,
      amountRemaining: new BigNumber(amount),
    };

    let candidates = chargedDonationList.get(to);

    if (candidates === undefined) {
      candidates = [];
      chargedDonationList.set(to, candidates);
    }

    candidates.push(chargedDonation);

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
    //   let fromUnusedDonationList = pledgeUnusedDonations.get(from); // List of donations which are candidates to money return to
    //   if (fromUnusedDonationList === undefined) {
    //     console.log(`There is no donation for pledgeId ${from}`);
    //     fromUnusedDonationList = [];
    //     pledgeUnusedDonations.set(from, fromUnusedDonationList);
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

const revertDonation = (
  donation,
  transactionHash,
  donationMap,
  pledgeUnusedDonations,
  toCreateDonationListMap,
  chargedDonationListMap,
  admins,
) => {
  const revertToDonation = getMostRecentDonationNotCanceled(donation, donationMap, admins);
  const toPledgeUnusedDonationList = pledgeUnusedDonations.get(revertToDonation.pledgeId);
  if (toPledgeUnusedDonationList === undefined) {
    terminateScript(`No pledge found to move money to\n`);
    return;
  }
  const toIndex = toPledgeUnusedDonationList.findIndex(
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

  const toDonation = toPledgeUnusedDonationList[toIndex];

  toDonation.amountRemaining = toDonation.amountRemaining.plus(donation.amountRemaining);
  donation.amountRemaining = new BigNumber(0);

  if (toDonation.amountRemaining.gt(toDonation.amount)) {
    terminateScript(
      `Donation amountRemaining exceeds its amount!\n${JSON.stringify(toDonation, null, 2)}\n`,
    );
    return;
  }

  if (toDonation.amountRemaining.eq(toDonation.amount)) {
    toPledgeUnusedDonationList.splice(toDonation, 1);
  }

  const chargedDonation = {
    ...toDonation,
    txHash: transactionHash,
    from: donation.pledgeId,
  };

  let chargedDonationList = chargedDonationListMap.get(toDonation.pledgeId);

  if (chargedDonationList === undefined) {
    chargedDonationList = [];
    chargedDonationListMap.set(toDonation.pledgeId, chargedDonationList);
  }

  chargedDonationList.push(chargedDonation);

  chargedDonationList = chargedDonationListMap.get(donation.pledgeid) || [];

  const fromIndex = chargedDonationList.findIndex(item => item._id === donation._id);
  if (fromIndex !== -1) chargedDonationList.splice(fromIndex, 1);

  console.log(
    `Revert money from ${donation.pledgeId} to ${
      toDonation.pledgeId
    } amount ${toDonation.amountRemaining.toFixed()}`,
  );
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
};

const revertProjectDonations = (
  projectId,
  transactionHash,
  donationMap,
  ownerPledgeList,
  pledgeUnusedDonations,
  toCreateDonationListMap,
  chargedDonationListMap,
  admins,
) => {
  const projectPledgesList = ownerPledgeList.get(projectId.toString()) || [];
  projectPledgesList.forEach(pledgeId => {
    const chargedDonationList = chargedDonationListMap.get(String(pledgeId)) || [];
    chargedDonationList.forEach(chargedDonation =>
      revertDonation(
        chargedDonation,
        transactionHash,
        donationMap,
        pledgeUnusedDonations,
        toCreateDonationListMap,
        chargedDonationListMap,
        admins,
      ),
    );
  });
};

const cancelProject = async (
  projectId,
  transactionHash,
  donationMap,
  ownerPledgeList,
  campaignMilestoneListMap,
  pledgeUnusedDonations,
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
    milestoneList.forEach(id => {
      revertProjectDonations(
        id,
        transactionHash,
        donationMap,
        ownerPledgeList,
        pledgeUnusedDonations,
        toCreateDonationListMap,
        chargedDonationListMap,
        admins,
      );
    });
  }

  revertProjectDonations(
    projectId,
    transactionHash,
    donationMap,
    ownerPledgeList,
    pledgeUnusedDonations,
    toCreateDonationListMap,
    chargedDonationListMap,
    admins,
  );
};

const findConflictInDonations = donationMap => {
  return Donations.find({})
    .sort({ createdAt: 1 })
    .cursor()
    .eachAsync(({ _id, amount, amountRemaining, status }) => {
      const donationItem = donationMap(_id.toString());
      if (!donationItem.amountRemaining.eq(amountRemaining.toString())) {
        terminateScript(
          `Below donation should have remaining amount ${donationItem.amountRemaining.toFixed()} but has ${amountRemaining.toString()}
          ${JSON.stringify({ _id, amount, amountRemaining, status }, null, 2)}`,
        );
      }
    });
};

const syncDonationsWithNetwork = async (fixConflicts, events, pledges, admins) => {
  // Map from pledge id to list of donations belongs to which are not used yet!
  const {
    pledgeDonationListMap: pledgeUnusedDonations,
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

  // Simulate transactions by events
  for (let i = 0; i < events.length; i += 1) {
    const { event, transactionHash, returnValues } = events[i];
    console.log(
      `-----\nProcessing event ${i}:\nEvent: ${event}\nTransaction hash: ${transactionHash}`,
    );
    if (event === 'Transfer') {
      const { from, to, amount } = returnValues;
      console.log(`Transfer from ${from} to ${to} amount ${amount}`);

      // Ignore transfer if from owner is canceled
      if (from !== '0' && admins[Number(pledges[Number(from)].owner)].isCanceled) {
        console.log('Transfer ignored');
        continue;
      }

      const { usedFromDonations, parentIsCancelled } = handleFromDonations(
        from,
        to,
        amount,
        transactionHash,
        pledges,
        admins,
        pledgeUnusedDonations,
        chargedDonationListMap,
      );

      handleToDonations(
        from,
        to,
        amount,
        transactionHash,
        pledges,
        admins,
        pledgeUnusedDonations,
        toCreateDonationListMap,
        chargedDonationListMap,
        usedFromDonations,
        parentIsCancelled,
      );
    } else if (event === 'CancelProject') {
      const { idProject } = returnValues;
      console.log(`Cancel project ${idProject}: ${JSON.stringify(admins[Number(idProject)])}`);
      // eslint-disable-next-line no-await-in-loop
      await cancelProject(
        idProject,
        transactionHash,
        donationMap,
        ownerPledgeList,
        campaignMilestoneListMap,
        pledgeUnusedDonations,
        toCreateDonationListMap,
        chargedDonationListMap,
        admins,
      );
    }
  }

  // Find conflicts between simulated values and db values
  await findConflictInDonations(donationMap);
};

const main = async (updateCache, findConflict, fixConflicts = false) => {
  try {
    const { status, events } = await getBlockchainData(updateCache);

    if (!findConflict) return;

    const { pledges, admins } = status;

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
        syncDonationsWithNetwork(fixConflicts, events, pledges, admins),
        // findProjectsConflict(fixConflicts, admins, pledges)]
      ]).then(() => terminateScript());
    });
  } catch (e) {
    console.log(e);
    throw e;
  }
};

main(false, true, false)
  .then(() => {})
  .catch(e => terminateScript(e, 1));
