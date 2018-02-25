import logger from 'winston';
import { hexToNumber, toBN } from 'web3-utils';
import { pledgeState } from './helpers';
import Notifications from './../utils/dappMailer';

const ReProcessEvent = () => {};

const has = Object.prototype.hasOwnProperty;

function getDonationStatus({ toPledge, toPledgeAdmin, intendedProject, delegate }) {
  if (toPledge.pledgeState === '1') return 'paying';
  if (toPledge.pledgeState === '2') return 'paid';
  if (intendedProject) return 'to_approve';
  if (toPledgeAdmin.type === 'giver' || delegate) return 'waiting';
  return 'committed';
}

class Pledges {
  constructor(app, liquidPledging, eventQueue) {
    this.app = app;
    this.web3 = liquidPledging.$web3;
    this.liquidPledging = liquidPledging;
    this.queue = eventQueue;
    this.blockTimes = {};
    this.fetchingBlocks = {};
    this.processing = {};
  }

  // handle liquidPledging Transfer event
  transfer(event) {
    if (event.event !== 'Transfer') throw new Error('transfer only handles Transfer events');

    const { from, to, amount } = event.returnValues;
    const txHash = event.transactionHash;

    const processEvent = (retry = false) => {
      this.queue.startProcessing(txHash);
      return this._getBlockTimestamp(event.blockNumber)
        .then(ts => {
          if (from === '0') {
            return this._newDonation(to, amount, ts, txHash, retry)
              .then(() => this.queue.purge(txHash))
              .catch(err => {
                if (err instanceof ReProcessEvent) {
                  // this is really only useful when instant mining. Other then that, the
                  // donation should always be created before the tx was mined.
                  setTimeout(() => processEvent(true), 5000);
                  return;
                }

                logger.error('_newDonation error ->', err);
              });
          }

          return this._transfer(from, to, amount, ts, txHash).then(() => this.queue.purge(txHash));
        })
        .then(() => this.queue.finishedProcessing(txHash));
    };

    // parity uses transactionLogIndex
    const logIndex = has.call(event, 'transactionLogIndex') ? event.transactionLogIndex : undefined;

    // there will be multiple events in a single transaction
    // we need to process them in order so we use a queue
    // if logIndex is not undefined, then use that otherwise
    // b/c geth doesn't include transactionLogIndex, we are
    // making the assumption that events will be passed in order.
    if ((logIndex !== undefined && hexToNumber(logIndex) > 0) || this.queue.isProcessing(txHash)) {
      this.queue.add(event.transactionHash, processEvent);
    } else {
      return processEvent();
    }
  }

  _newDonation(pledgeId, amount, ts, txHash, retry = false) {
    const donations = this.app.service('donations');
    const pledgeAdmins = this.app.service('pledgeAdmins');

    const findDonation = () =>
      donations
        .find({ query: { txHash } })
        .then(resp => (resp.data.length > 0 ? resp.data[0] : undefined));

    return this.liquidPledging
      .getPledge(pledgeId)
      .then(pledge => Promise.all([pledgeAdmins.get(pledge.owner), pledge, findDonation()]))
      .then(([giver, pledge, donation]) => {
        const mutation = {
          giverAddress: giver.admin.address, // giver is a user type
          amount,
          pledgeId,
          createdAt: ts,
          owner: pledge.owner,
          ownerId: giver.typeId,
          ownerType: giver.type,
          status: 'waiting', // waiting for delegation by owner or delegate
          paymentStatus: pledgeState(pledge.pledgeState),
        };

        if (!donation) {
          // if this is the second attempt, then create a donation object
          // otherwise, try an process the event later, giving time for
          // the donation entity to be created via REST api first
          if (retry) {
            return donations.create(Object.assign(mutation, { txHash }));
          }

          // this is really only useful when instant mining. and re-syncing feathers w/ past events.
          // Other then that, the donation should always be created before the tx was mined.
          throw new ReProcessEvent();
        }

        return donations.patch(donation._id, mutation);
      });
  }

  _transfer(from, to, amount, ts, txHash) {
    const donations = this.app.service('donations');
    const pledgeAdmins = this.app.service('pledgeAdmins');

    const getDonation = () =>
      donations
        .find({ schema: 'includeTypeAndGiverDetails', query: { pledgeId: from } })
        .then(donations => {
          if (donations.data.length === 1) return donations.data[0];

          // check for any donations w/ matching txHash
          // this won't work when confirmPayment is called on the vault
          const filteredDonationsByTxHash = donations.data.filter(
            donation => donation.txHash === txHash,
          );

          if (filteredDonationsByTxHash.length === 1) return filteredDonationsByTxHash[0];

          const filteredDonationsByAmount = donations.data.filter(
            donation => donation.amount === amount,
          );

          // possible to have 2 donations w/ same pledgeId & amount. This would happen if a giver makes
          // a donation to the same delegate/project for the same amount multiple times. Currently there
          // no way to tell which donation was acted on if the txHash didn't match, so we just return the first
          if (filteredDonationsByAmount.length > 0) return filteredDonationsByAmount[0];

          // TODO is this comment only applicable while we don't support splits?
          // this is probably a split which happened outside of the ui
          throw new Error(
            `unable to determine what donations entity to update -> from: ${from}, to: ${to}, amount: ${amount}, ts: ${ts}, txHash: ${txHash}`,
          );
        });

    // fetches all necessary data to determine what happened for this Transfer event and calls _doTransfer
    return Promise.all([this.liquidPledging.getPledge(from), this.liquidPledging.getPledge(to)])
      .then(([fromPledge, toPledge]) => {
        const promises = [
          pledgeAdmins.get(fromPledge.owner),
          pledgeAdmins.get(toPledge.owner),
          fromPledge,
          toPledge,
          getDonation(),
        ];

        // In lp any delegate in the chain can delegate, but currently we only allow last delegate
        // to have that ability
        if (toPledge.nDelegates > 0) {
          promises.push(
            this.liquidPledging
              .getPledgeDelegate(to, toPledge.nDelegates)
              .then(delegate => pledgeAdmins.get(delegate.idDelegate)),
          );
        } else {
          promises.push(undefined);
        }

        // fetch intendedProject pledgeAdmin
        if (toPledge.intendedProject > 0) {
          promises.push(pledgeAdmins.get(toPledge.intendedProject));
        } else {
          promises.push(undefined);
        }

        return Promise.all(promises);
      })
      .then(
        ([
          fromPledgeAdmin,
          toPledgeAdmin,
          fromPledge,
          toPledge,
          donation,
          delegate,
          intendedProject,
        ]) => {
          const transferInfo = {
            fromPledgeAdmin,
            toPledgeAdmin,
            fromPledge,
            toPledge,
            toPledgeId: to,
            delegate,
            intendedProject,
            donation,
            amount,
            ts,
          };

          if (!donation)
            logger.error('missing donation for ->', JSON.stringify(transferInfo, null, 2));

          return this._doTransfer(transferInfo);
        },
      )
      .catch(logger.error);
  }

  /**
   * generate a mutation object used to update the current donation based off of the
   * given transferInfo
   *
   * @param transferInfo object containing information regarding the Transfer event
   * @private
   */
  _createDonationMutation(transferInfo) {
    const {
      toPledgeAdmin,
      toPledge,
      toPledgeId,
      delegate,
      intendedProject,
      donation,
      amount,
      ts,
    } = transferInfo;

    const status = getDonationStatus(transferInfo);

    const mutation = {
      amount,
      paymentStatus: pledgeState(toPledge.pledgeState),
      updatedAt: ts,
      owner: toPledge.owner,
      ownerId: toPledgeAdmin.typeId,
      ownerType: toPledgeAdmin.type,
      intendedProject: toPledge.intendedProject,
      pledgeId: toPledgeId,
      commitTime: toPledge.commitTime > 0 ? new Date(toPledge.commitTime * 1000) : ts, // * 1000 is to convert evm ts to js ts
      status,
    };

    // intendedProject logic

    if (intendedProject) {
      Object.assign(mutation, {
        intendedProjectId: intendedProject.typeId,
        intendedProjectType: intendedProject.type,
      });
    }

    if (!intendedProject && donation.intendedProject) {
      Object.assign(mutation, {
        $unset: {
          intendedProject: true,
          intendedProjectId: true,
          intendedProjectType: true,
        },
      });
    }

    // delegate logic

    if (delegate) {
      Object.assign(mutation, {
        delegate: delegate.id,
        delegateId: delegate.typeId,
      });
    }

    // withdraw logic

    // if the pledgeState === 'Paying', this means that the owner is withdrawing and the delegates can no longer
    // delegate the pledge, so we drop them
    if ((!delegate || toPledge.pledgeState === '1') && donation.delegate) {
      Object.assign(mutation, {
        $unset: {
          delegate: true,
          delegateId: true,
          delegateType: true,
        },
      });
    }

    // if the toPledge is paying or paid and the owner is a milestone, then
    // we need to update the milestones status
    if (['1', '2'].includes(toPledge.pledgeState) && toPledgeAdmin.type === 'milestone') {
      this.app.service('milestones').patch(toPledgeAdmin.typeId, {
        status: toPledge.pledgeState === '1' ? 'Paying' : 'CanWithdraw',
        mined: true,
      });
    }

    return mutation;
  }

  _doTransfer(transferInfo) {
    const donations = this.app.service('donations');
    const {
      toPledgeAdmin,
      toPledge,
      toPledgeId,
      delegate,
      intendedProject,
      donation,
      amount,
      ts,
    } = transferInfo;

    if (donation.amount === amount) {
      // this is a complete pledge transfer
      const mutation = this._createDonationMutation(transferInfo);

      // TODO fix the logic here so it sends the correct notifications
      // if (mutation.status === 'committed' || mutation.status === 'waiting' && delegate) {
      //
      //   if (donation.ownerEntity.email) {
      //     // send a receipt to the donor, if donor isn't anonymous
      //     Notifications.donation(this.app, {
      //       recipient: donation.ownerEntity.email,
      //       user: donation.ownerEntity.name,
      //       txHash: donation.txHash,
      //       donationType: toPledgeAdmin.type, // dac / campaign / milestone
      //       donatedToTitle: toPledgeAdmin.admin.title,
      //       amount: donation.amount
      //     });
      //   }
      //
      //   /**
      //    * send a notification to the admin of the dac / campaign / milestone
      //    **/
      //
      //   // if this is a DAC or a campaign, then the donation needs delegation
      //   if(toPledgeAdmin.type === 'campaign' || mutation.status === 'waiting') {
      //     let donatedToTitle;
      //     if (toPledgeAdmin.type === 'campaign') {
      //       donatedToTitle = toPledgeAdmin.admin.title;
      //     } else {
      //       donatedToTitle = donation.delegateEntity.title;
      //     }
      //
      //     Notifications.delegationRequired(this.app, {
      //       recipient: toPledgeAdmin.admin.email,
      //       user: toPledgeAdmin.admin.name,
      //       txHash: donation.txHash,
      //       donationType: toPledgeAdmin.type, // dac / campaign
      //       donatedToTitle: toPledgeAdmin.admin.title,
      //       amount: donation.amount
      //     });
      //   } else if (toPledgeAdmin.type === 'milestone') {
      //     // if this is a milestone then no action is required
      //     Notifications.donationReceived(this.app, {
      //       recipient: toPledgeAdmin.admin.email,
      //       user: toPledgeAdmin.admin.name,
      //       txHash: donation.txHash,
      //       donationType: toPledgeAdmin.type, // milestone
      //       donatedToTitle: toPledgeAdmin.admin.title,
      //       amount: donation.amount
      //     });
      //   }
      // }

      return donations
        .patch(donation._id, mutation)
        .then(() => this._trackDonationHistory(transferInfo));
    }
    // this is a split

    // update the current donation. only change is the amount
    const updateDonation = () =>
      donations.patch(donation._id, {
        amount: toBN(donation.amount)
          .sub(toBN(amount))
          .toString(),
      });

    // create a new donation
    const newDonation = Object.assign({}, donation, this._createDonationMutation(transferInfo));
    delete newDonation._id;
    delete newDonation.$unset;

    const createDonation = () => donations.create(newDonation);

    return Promise.all([updateDonation(), createDonation()]).then(([updated, created]) => {
      // TODO track donation histories
    });
  }

  _trackDonationHistory(transferInfo) {
    const donationsHistory = this.app.service('donations/history');
    const {
      fromPledgeAdmin,
      toPledgeAdmin,
      fromPledge,
      toPledge,
      _toPledgeId,
      delegate,
      _intendedProject,
      donation,
      amount,
      ts,
    } = transferInfo;

    const isNewDonation = () =>
      fromPledge.oldPledge === '0' &&
      (toPledgeAdmin.type !== 'giver' || toPledge.nDelegates === '1') &&
      toPledge.intendedProject === '0';
    const isCommittedDelegation = () =>
      fromPledge.intendedProject !== '0' && fromPledge.intendedProject === toPledge.owner;
    const isCampaignToMilestone = () =>
      fromPledgeAdmin.type === 'campaign' && toPledgeAdmin.type === 'milestone';

    // only handling new donations & committed delegations for now
    if (
      toPledge.pledgeState === '0' &&
      (isNewDonation() || isCommittedDelegation() || isCampaignToMilestone())
    ) {
      const history = {
        ownerId: toPledgeAdmin.typeId,
        ownerType: toPledgeAdmin.type,
        createdAt: ts,
        amount,
        txHash: donation.txHash,
        donationId: donation._id,
        giverAddress: donation.giverAddress,
      };

      if (delegate) {
        Object.assign(history, {
          delegateType: delegate.type,
          delegateId: delegate.typeId,
        });
      }

      return donationsHistory.create(history);
    }
    // if (toPledge.paymentStatus === 'Paying' || toPledge.paymentStatus === 'Paid') {
    //   // payment has been initiated/completed in vault
    //   return donationsHistory.create({
    //     status: (toPledge.paymentStatus === 'Paying') ? 'Payment Initiated' : 'Payment Completed',
    //     createdAt: ts,
    //   }, { donationId: donation._id });
    // }

    // canceled payment from vault

    // vetoed delegation

    // regular transfer
  }

  /**
   * fetches the ts for the given blockNumber.
   *
   * caches the last 50 ts
   *
   * first checks if the ts is in the cache.
   * if it misses, we fetch the block using web3 and cache the result.
   *
   * if we are currently fetching a given block, we will not fetch it twice.
   * instead, we resolve the promise after we fetch the ts for the block.
   *
   * @param blockNumber the blockNumber to fetch the ts of
   * @return Promise with a single ts value
   * @private
   */
  _getBlockTimestamp(blockNumber) {
    if (this.blockTimes[blockNumber]) return Promise.resolve(this.blockTimes[blockNumber]);

    // if we are already fetching the block, don't do it twice
    if (this.fetchingBlocks[blockNumber]) {
      return new Promise(resolve => {
        // attach a listener which is executed when we get the block ts
        this.fetchingBlocks[blockNumber].push(resolve);
      });
    }

    this.fetchingBlocks[blockNumber] = [];

    return this.web3.eth.getBlock(blockNumber).then(block => {
      const ts = new Date(block.timestamp * 1000);

      this.blockTimes[blockNumber] = ts;

      // only keep 50 block ts cached
      if (Object.keys(this.blockTimes).length > 50) {
        Object.keys(this.blockTimes)
          .sort((a, b) => b - a)
          .forEach(key => delete this.blockTimes[key]);
      }

      // execute any listeners for the block
      this.fetchingBlocks[blockNumber].forEach(resolve => resolve(ts));
      delete this.fetchingBlocks[blockNumber];

      return ts;
    });
  }
}

export default Pledges;
