const ForeignGivethBridgeArtifact = require('giveth-bridge/build/ForeignGivethBridge.json');
const LiquidPledgingArtifact = require('giveth-liquidpledging/build/LiquidPledging.json');
const logger = require('winston');
const { toBN } = require('web3-utils');
const eventDecodersFromArtifact = require('./lib/eventDecodersFromArtifact');
const topicsFromArtifacts = require('./lib/topicsFromArtifacts');
const { getBlockTimestamp, executeRequestsAsBatch, ANY_TOKEN } = require('./lib/web3Helpers');
const { CampaignStatus } = require('../models/campaigns.model');
const { DonationStatus } = require('../models/donations.model');
const { MilestoneStatus, MilestoneTypes } = require('../models/milestones.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const toWrapper = require('../utils/to');
const reprocess = require('../utils/reprocess');
const notify = require('../utils/sendPledgeNotifications');
const semaphore = require('semaphore');

function isOlderThenAMin(ts) {
  return Date.now() - ts > 1000 * 60;
}

// only log necessary transferInfo
function logTransferInfo(transferInfo) {
  const info = Object.assign({}, transferInfo, {
    donations: transferInfo.donations.slice().map(d => {
      // eslint-disable-next-line no-param-reassign
      delete d.ownerEntity;
      return d;
    }),
    fromPledgeAdmin: Object.assign({}, transferInfo.fromPledgeAdmin),
    toPledgeAdmin: Object.assign({}, transferInfo.toPledgeAdmin),
  });
  delete info.fromPledgeAdmin.admin;
  delete info.toPledgeAdmin.admin;
  logger.error('missing from donation ->', JSON.stringify(info, null, 2));
}

const lpDecoders = eventDecodersFromArtifact(LiquidPledgingArtifact);
const transferTopics = topicsFromArtifacts([LiquidPledgingArtifact], ['Transfer']);
/**
 * Check if a 'Transfer' is an initial transfer. That is, is this
 * 'Transfer' originate from the original donation call?
 *
 * Liquidpledging only emits transfer events. When a donation happens,
 * first a Transfer event will be emitted from the 0 pledge to the givers
 * pledge. Then a subsequent Transfer event will be emitted from the givers
 * pledge to the receivers pledge.
 *
 * @param {number|string} from 'Transfer' event "from" param
 * @param {number|string} amount amount of the transfer
 * @param {object} receipt the transactionReceipt to check
 */
function isInitialTransfer(from, amount, receipt) {
  if (!receipt) {
    logger.error('isInitialTransfer called w/o receipt: ', receipt);
    return false;
  }

  // get logs we're interested in.
  const logs = receipt.logs.filter(log => transferTopics.some(t => t.hash === log.topics[0]));

  if (logs.length === 0) return false;

  const events = logs.map(l => {
    const topic = transferTopics.find(t => t.hash === l.topics[0]);
    return lpDecoders[topic.name](l);
  });

  // check if we have a transfer from pledge 0 to "from" w/ matching amount
  // this indicates that this was a new donation
  const hasZeroPledgeTransfer = events.some(
    ({ returnValues }) =>
      returnValues.from === '0' && returnValues.to === from && returnValues.amount === amount,
  );

  return hasZeroPledgeTransfer;
}

function _retreiveTokenFromPledge(app, pledge) {
  const tokenWhitelist = app.get('tokenWhitelist');
  let token;

  if (pledge.token === ANY_TOKEN.address) {
    token = ANY_TOKEN;
  } else if (Array.isArray(tokenWhitelist)) {
    token = tokenWhitelist.find(t => t.foreignAddress.toLowerCase() === pledge.token.toLowerCase());
  } else {
    throw new Error('Could not get tokenWhitelist or it is not defined');
  }

  if (!token)
    throw new Error(
      `Token address ${pledge.token} was not found in whitelist for pledge ${pledge}`,
    );

  return token;
}

// sort donations by pendingAmountRemaining (asc with undefined coming last)
function donationSort(a, b) {
  const { pendingAmountRemaining: aVal } = a;
  const { pendingAmountRemaining: bVal } = b;
  if (aVal !== undefined) {
    if (bVal === undefined) return -1;
    // both are '0'
    if (aVal === bVal) return 0;
    if (aVal === '0') return -1;
    if (bVal === '0') return 1;
    // if both are defined, at least 1 value should be 0
    logger.warn(
      'donation sort detected 2 donations where pendingAmountRemaining was defined & > 0. Only 1 donation should have pendingAmountRemaining > 0',
    );
  } else if (bVal !== undefined) {
    return 1;
  }
  return 0;
}

/**
 * @param {object} transferInfo
 */
const isCommittedDelegation = ({ fromPledge, toPledge }) =>
  Number(fromPledge.intendedProject) > 0 && fromPledge.intendedProject === toPledge.owner;

/**
 * @param {object} transferInfo
 */
const isRejectedDelegation = ({ fromPledge, toPledge }) =>
  Number(fromPledge.intendedProject) > 0 && fromPledge.intendedProject !== toPledge.owner;

/**
 * @param {object} transferInfo
 */
const isLPMilestonePayout = ({ fromPledgeAdmin }) =>
  fromPledgeAdmin.type === AdminTypes.MILESTONE &&
  fromPledgeAdmin.admin.type === MilestoneTypes.LPMilestone;

/**
 * @param {object} transferInfo
 */
const isDelegation = ({ intendedProject }) => !!intendedProject;

const getDonationStatus = transferInfo => {
  const { toPledgeAdmin, delegate } = transferInfo;
  const { pledgeState } = transferInfo.toPledge;
  if (pledgeState === '1') return DonationStatus.PAYING;
  if (pledgeState === '2') return DonationStatus.PAID;
  if (isDelegation(transferInfo)) return DonationStatus.TO_APPROVE;
  if (toPledgeAdmin.type === AdminTypes.GIVER || !!delegate) return DonationStatus.WAITING;
  return DonationStatus.COMMITTED;
};

/**
 * @param {number|string} commitTime liquidPledging `commitTime`
 * @param {number} ts default commitTime
 */
const getCommitTime = (commitTime, ts) =>
  // * 1000 is to convert evm ts to js ts
  Number(commitTime) > 0 ? new Date(commitTime * 1000) : ts;

/**
 *
 * @param {object} app feathers app instance
 * @param {object} liquidPledging liquidPledging contract instance
 */
const pledges = (app, liquidPledging) => {
  const web3 = app.getWeb3();
  const donationService = app.service('donations');
  const pledgeAdmins = app.service('pledgeAdmins');

  /**
   * Attempts to fetch the homeTxHash for an initial donation into lp.
   *
   * b/c we are using the bridge, we expect the ForeignGivethBridge Deposit event
   * to occur in the same tx as the initial donation.
   *
   * @param {string} txHash txHash of the initialDonation to attempt to fetch a homeTxHash for
   * @returns {string|undefined} homeTxHash if found
   */
  async function getHomeTxHash(txHash) {
    const decoders = eventDecodersFromArtifact(ForeignGivethBridgeArtifact);

    const [err, receipt] = await toWrapper(web3.eth.getTransactionReceipt(txHash));

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

  /**
   * generate a mutation object used to create/update the `to` donation
   *
   * @param {object} transferInfo object containing information regarding the Transfer event
   */
  async function createToDonationMutation(transferInfo, returnTransfer) {
    const {
      toPledgeAdmin,
      toPledge,
      toPledgeId,
      fromPledge,
      delegate,
      intendedProject,
      donations,
      amount,
      ts,
      txHash,
      initialTransfer,
    } = transferInfo;

    // find token
    const token = _retreiveTokenFromPledge(app, fromPledge);

    const mutation = {
      amount,
      amountRemaining: amount,
      giverAddress: donations[0].giverAddress, // all donations should have same giverAddress
      ownerId: toPledge.owner,
      ownerTypeId: toPledgeAdmin.typeId,
      ownerType: toPledgeAdmin.type,
      pledgeId: toPledgeId,
      commitTime: getCommitTime(toPledge.commitTime, ts),
      status: getDonationStatus(transferInfo),
      createdAt: ts,
      parentDonations: donations.map(d => d._id),
      txHash,
      mined: true,
      token,
    };

    if (initialTransfer) {
      // always set homeTx on mutation b/c ui checks if homeTxHash exists to check for initial donations
      mutation.homeTxHash = (await getHomeTxHash(txHash)) || 'unknown';
    }

    // lp keeps the delegation chain, but we want to ignore it
    if (![DonationStatus.PAYING, DonationStatus.PAID].includes(mutation.status) && delegate) {
      Object.assign(mutation, {
        delegateId: delegate.id,
        delegateTypeId: delegate.typeId,
        delegateType: delegate.type,
      });
    }

    if (intendedProject) {
      Object.assign(mutation, {
        intendedProjectId: intendedProject.id,
        intendedProjectTypeId: intendedProject.typeId,
        intendedProjectType: intendedProject.type,
      });
    }

    if (returnTransfer || isRejectedDelegation(transferInfo)) {
      mutation.isReturn = true;
    }

    return mutation;
  }

  /**
   * fetch donations for a pledge needed to fulfill the transfer amount
   *
   * lp will aggregate multiple donations by the same person to another entity
   * into a single pledge. We keep them separated by donation. Here we fetch
   * all donations needed to fulfill the amount being transferred from the pledge.
   * Donations are spent in a FIFO order.
   *
   * @param {number|string} pledgeId lp pledgeId
   * @param {number|string} amount amount that is being transferred
   * @param {boolean} initialTransfer should be true if this is the 2nd 'Transfer' event
   *    that occurs in a donation. 1st 'Transfer' event is pledge 0 -> pledge x. 2nd 'Transfer'
   *    event is pledge x -> donation_recipient_pledge
   * @param {number|string} txHash (should be provided when initialTransfer = true). the transactionHash
   *    the donations occurred in. Used as a tie breaker in edge cases where multiple unspent donations exist
   *    w/ the exact same pledgeId & amount
   */
  async function getDonations(pledgeId, amount, initialTransfer = false, txHash = undefined) {
    const query = {
      $sort: { createdAt: 1 },
      pledgeId,
      amountRemaining: { $ne: 0 },
    };
    if (initialTransfer) {
      query.amount = amount;
    }

    const donations = await donationService.find({
      paginate: false,
      schema: 'includeTypeAndGiverDetails',
      query,
    });

    if (initialTransfer) {
      if (donations.length <= 1) return donations;
      // return most recent donation
      const filteredDonations = donations.filter(d => d.txHash === txHash);
      return filteredDonations.slice(filteredDonations.length - 1);
    }

    donations.sort(donationSort);
    let remaining = toBN(amount);

    return donations.filter(d => {
      if (remaining.gtn(0)) {
        remaining = remaining.sub(toBN(d.amountRemaining));
        return true;
      }
      return false;
    });
  }

  function getPledgeAdmin(id) {
    return pledgeAdmins.find({ paginate: false, query: { id } }).then(data => data[0]);
  }

  async function createDonation(mutation, initialTransfer = false, retry = false) {
    const query = {
      $limit: 1,
      giverAddress: mutation.giverAddress,
      amount: mutation.amount,
      mined: false,
      'token.symbol': mutation.token.symbol,
      $or: [{ pledgeId: '0' }, { pledgeId: mutation.pledgeId }],
    };
    if (initialTransfer) {
      if (mutation.homeTxHash !== 'unknown') query.homeTxHash = mutation.homeTxHash;
      else {
        // if we don't have a homeTxHash, attempt to find the 1st donation where all other params are the same
        Object.assign(query, {
          status: DonationStatus.PENDING,
          ownerId: { $in: [0, mutation.ownerId] }, // w/ donateAndCreateGiver, ownerId === 0
          delegateId: mutation.delegateId,
          intendedProjectId: mutation.intendedProjectId,
          txHash: undefined,
          homeTxHash: { $exists: true },
          $sort: {
            createdAt: 1,
          },
        });
      }
    } else {
      query.txHash = mutation.txHash;
    }

    const donations = await donationService.find({
      paginate: false,
      query,
    });

    if (donations.length === 0) {
      // if this is the second attempt, then create a donation object
      // otherwise, try and process the event later, giving time for
      // the donation entity to be created via REST api first
      // this is really only useful when instant mining. and re-syncing feathers w/ past events.
      // Other then that, the donation should always be created before the tx was mined.

      if (retry) {
        let parameters = {};
        if (
          mutation.status === DonationStatus.PAID &&
          mutation.ownerType === AdminTypes.MILESTONE
        ) {
          const transaction = await web3.eth.getTransaction(mutation.txHash);

          parameters = {
            from: transaction.from,
          };
        }
        return donationService.create(mutation, parameters);
      }
      return reprocess(createDonation.bind(this, mutation, initialTransfer, true), 5000);
    }

    return donationService.patch(donations[0]._id, mutation);
  }

  async function newDonation(pledgeId, amount, ts, txHash) {
    const pledge = await liquidPledging.getPledge(pledgeId);
    const giver = await getPledgeAdmin(pledge.owner);
    const token = _retreiveTokenFromPledge(app, pledge);

    const mutation = {
      giverAddress: giver.admin.address, // giver is a user type
      amount,
      amountRemaining: amount,
      pledgeId,
      ownerId: pledge.owner,
      ownerTypeId: giver.typeId,
      ownerType: giver.type,
      status: DonationStatus.WAITING, // waiting for delegation by owner
      mined: true,
      createdAt: ts,
      token,
      intendedProjectId: pledge.intendedProject,
      txHash,
      homeTxHash: (await getHomeTxHash(txHash)) || 'unknown',
    };

    // we pass true to retry b/c we never create a donation that needs to be updated
    // for the new donation Transfer event. The created donation that needs to be updated
    // is for the 2nd Transfer event that occurs
    return createDonation(mutation, true, true);
  }

  /**
   * Determine if this transfer was a return of excess funds of an over-funded milestone
   * @param {object} transferInfo
   */
  async function isReturnTransfer(transferInfo) {
    const { fromPledge, fromPledgeAdmin, toPledgeId, txHash, donations } = transferInfo;
    // currently only milestones will can be over-funded
    if (fromPledgeAdmin.type !== AdminTypes.MILESTONE) return false;

    const from = donations[0].pledgeId; // all donations will have same pledgeId
    const transferEventsInTx = await app
      .service('events')
      .find({ paginate: false, query: { transactionHash: txHash, event: 'Transfer' } });

    // ex events in return case:
    // Transfer(from: 1, to: 2, amount: 1000)
    // Transfer(from: 2, to: 1, amount: < 1000)
    return transferEventsInTx.some(
      e =>
        // it may go directly to fromPledge.oldPledge if this was delegated funds
        // being returned b/c the intermediary pledge is the pledge w/ the intendedProject
        [e.returnValues.from, fromPledge.oldPledge].includes(toPledgeId) &&
        e.returnValues.to === from,
    );
  }

  /**
   * create a new donation for the `to` pledge
   *
   * @param {object} transferInfo
   */
  async function createToDonation(transferInfo) {
    const mutation = await createToDonationMutation(
      transferInfo,
      await isReturnTransfer(transferInfo),
    );

    // if tx is older then 1 min, set retry = true to instantly create the donation if necessary
    const r = createDonation(
      mutation,
      transferInfo.initialTransfer,
      isOlderThenAMin(transferInfo.ts),
    );
    notify(app, mutation);
    return r;
  }

  /**
   * patch existing donations we are transferring
   *
   * @param {object} transferInfo
   */
  async function spendAndUpdateExistingDonations(transferInfo) {
    const { donations, amount } = transferInfo;
    let total = toBN(amount);

    await Promise.all(
      donations.map(async d => {
        if (total.eqn(0)) {
          logger.warn('too many donations fetched. total is already 0');
          return;
        }

        // calculate remaining total & donation amountRemaining
        let a = toBN(d.amountRemaining);
        if (a.gte(total)) {
          a = a.sub(total);
          total = toBN(0);
        } else {
          total = total.sub(a);
          a = toBN(0);
        }

        if (a.ltn(0)) {
          throw new Error(`donation.amountRemaining is < 0: ${JSON.stringify(d)}`);
        }

        const mutation = {
          amountRemaining: a.toString(),
          pendingAmountRemaining: undefined,
        };

        if (isCommittedDelegation(transferInfo)) {
          mutation.status = DonationStatus.COMMITTED;
        } else if (isRejectedDelegation(transferInfo)) {
          mutation.status = DonationStatus.REJECTED;
        } else if (isLPMilestonePayout(transferInfo)) {
          mutation.status = DonationStatus.PAID;
        }

        await donationService.patch(d._id, mutation);
      }),
    );
  }

  const transferSem = semaphore();

  async function hasSimilarDonation(transferInfo) {
    const {
      toPledgeAdmin,
      toPledge,
      toPledgeId,
      fromPledge,
      donations,
      amount,
      txHash,
    } = transferInfo;

    // find token
    const token = _retreiveTokenFromPledge(app, fromPledge);
    const status = getDonationStatus(transferInfo);
    let similarDonation;
    try {
      similarDonation = await donationService.find({
        query: {
          $limit: 1,
          amount,
          amountRemaining: amount,
          giverAddress: donations[0].giverAddress,
          ownerId: toPledge.owner,
          ownerTypeId: toPledgeAdmin.typeId,
          ownerType: toPledgeAdmin.type,
          pledgeId: toPledgeId,
          status,
          txHash,
          mined: true,
          'token.symbol': token.symbol,
        },
      });
    } catch (e) {
      logger.error(e);
    }

    return similarDonation ? similarDonation.data.length > 0 : false;
  }

  // fetches all necessary data to determine what happened for this Transfer event
  async function transfer(from, to, amount, ts, txHash) {
    try {
      const [fromPledge, toPledge, receipt] = await executeRequestsAsBatch(web3, [
        liquidPledging.$contract.methods.getPledge(from).call.request,
        liquidPledging.$contract.methods.getPledge(to).call.request,
        web3.eth.getTransactionReceipt.request.bind(null, txHash),
      ]);

      const fromPledgeAdmin = await getPledgeAdmin(fromPledge.owner);

      if (
        (fromPledgeAdmin.type === AdminTypes.MILESTONE &&
          fromPledgeAdmin.admin.status === MilestoneStatus.CANCELED) ||
        (fromPledgeAdmin.type === AdminTypes.CAMPAIGN &&
          fromPledgeAdmin.admin.status === CampaignStatus.CANCELED)
      ) {
        // When a project is canceled in lp, the pledges are not "reverted" until they
        // are normalized. This normalization function can be called, but it is also
        // run on before every transfer. Thus we update the donations when handling
        // the `CancelProject` event so the cache contains the appropriate info to
        // normalize & transfer the pledge in a single call
        return;
      }

      const initialTransfer = isInitialTransfer(from, amount, receipt);

      const promises = [
        getPledgeAdmin(toPledge.owner),
        getDonations(from, amount, initialTransfer, txHash),
      ];

      // In lp any delegate in the chain can delegate, but currently we only allow last delegate
      // to have that ability
      if (toPledge.nDelegates > 0) {
        promises.push(
          liquidPledging
            .getPledgeDelegate(to, toPledge.nDelegates)
            .then(delegate => getPledgeAdmin(delegate.idDelegate)),
        );
      } else {
        promises.push(undefined);
      }

      // fetch intendedProject pledgeAdmin
      if (Number(toPledge.intendedProject) > 0) {
        promises.push(getPledgeAdmin(toPledge.intendedProject));
      } else {
        promises.push(undefined);
      }

      const [toPledgeAdmin, donations, delegate, intendedProject] = await Promise.all(promises);

      const transferInfo = {
        fromPledgeAdmin,
        toPledgeAdmin,
        fromPledge,
        toPledge,
        toPledgeId: to,
        initialTransfer,
        delegate,
        intendedProject,
        donations,
        amount,
        ts,
        txHash,
      };

      if (donations.length === 0) {
        logTransferInfo(transferInfo);
        // if from donation is missing, we can't do anything
        return;
      }

      transferSem.take(async () => {
        try {
          // Search for similar donation
          const hasSimilar = await hasSimilarDonation(transferInfo);
          if (!hasSimilar) {
            await spendAndUpdateExistingDonations(transferInfo);
            await createToDonation(transferInfo);
          } else {
            logger.warn('Ignore repetitive transfer:', transferInfo);
          }
        } catch (e) {
          logger.error(e);
        } finally {
          transferSem.leave();
        }
      });
    } catch (err) {
      logger.error(err);
    }
  }

  return {
    /**
     * handle `Transfer` events
     *
     * @param {object} event Web3 event object
     */
    async transfer(event) {
      if (event.event !== 'Transfer') throw new Error('transfer only handles Transfer events');

      const { from, to, amount } = event.returnValues;
      const txHash = event.transactionHash;
      const ts = await getBlockTimestamp(web3, event.blockNumber);
      if (Number(from) === 0) {
        const [err] = await toWrapper(newDonation(to, amount, ts, txHash));

        if (err) {
          logger.error('newDonation error ->', err);
        }
      } else {
        await transfer(from, to, amount, ts, txHash);
      }
    },
  };
};

module.exports = pledges;
