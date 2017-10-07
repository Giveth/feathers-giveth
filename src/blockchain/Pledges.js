import { pledgePaymentStatus } from "./helpers";

const BreakSignal = () => {
};

class Pledges {
  constructor(app, liquidPledging, eventQueue) {
    this.app = app;
    this.web3 = liquidPledging.$web3;
    this.liquidPledging = liquidPledging;
    this.queue = eventQueue;
    this.blockTimes = {};
    this.fetchingBlocks = {};
  }

  // handle liquidPledging Transfer event
  transfer(event) {
    if (event.event !== 'Transfer') throw new Error('transfer only handles Transfer events');

    const { from, to, amount } = event.returnValues;
    const txHash = event.transactionHash;

    this._getBlockTimestamp(event.blockNumber)
      .then(ts => {
        const processEvent = () => {
          if (from === '0') return this._newDonation(to, amount, ts, txHash)
            .then(() => this.queue.purge(txHash));

          return this._transfer(from, to, amount, ts, txHash)
            .then(() => this.queue.purge(txHash));
        };

        if (event.logIndex > 0) {
          console.log('adding to queue ->', event);
          this.queue.add(
            event.transactionHash,
            processEvent
          );
        } else {
          return processEvent();
        }
      });
  }

  _newDonation(pledgeId, amount, ts, txHash, retry = false) {
    const donations = this.app.service('donations');
    const pledgeAdmins = this.app.service('pledgeAdmins');

    const findDonation = () => donations.find({ query: { txHash } })
      .then(resp => {
        return (resp.data.length > 0) ? resp.data[ 0 ] : undefined;
      });

    return this.liquidPledging.getPledge(pledgeId)
      .then((pledge) => Promise.all([ pledgeAdmins.get(pledge.owner), pledge, findDonation() ]))
      .then(([ giver, pledge, donation ]) => {
        const mutation = {
          giverAddress: giver.admin.address, // giver is a user
          amount,
          pledgeId,
          createdAt: ts,
          owner: pledge.owner,
          ownerId: giver.typeId,
          ownerType: giver.type,
          status: 'waiting', // waiting for delegation by owner or delegate
          paymentStatus: pledgePaymentStatus(pledge.paymentState),
        };

        if (!donation) {
          if (retry) return donations.create(Object.assign(mutation, { txHash }));

          // this is really only useful when instant mining. Other then that, the donation should always be
          // created before the tx was mined.
          setTimeout(() => this._newDonation(pledgeId, amount, ts, txHash, true), 5000);
          throw new BreakSignal();
        }

        return donations.patch(donation._id, mutation);
      })
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        if (err.name === 'NotFound') {
          // most likely the from pledgeAdmin hasn't been registered yet.
          // this can happen b/c when donating in liquidPledging, if the giverId === 0, the donate method will create a
          // giver. Thus the tx will emit 3 events. AddGiver, and 2 x Transfer. Since these are processed asyncrounously
          // calling pledgeAdmins.get(from) could result in a 404 as the AddGiver event hasn't finished processing
          setTimeout(() => this._newDonation(pledgeId, amount, ts, txHash, true), 5000);
          return;
        }
        console.error(err); // eslint-disable-line no-console
      });

  }

  _transfer(from, to, amount, ts, txHash) {
    const donations = this.app.service('donations');
    const pledgeAdmins = this.app.service('pledgeAdmins');

    const getDonation = () => {
      return donations.find({ query: { pledgeId: from } })
        .then(donations => {
          if (donations.data.length === 1) return donations.data[ 0 ];

          // check for any donations w/ matching txHash
          // this won't work when confirmPayment is called on the vault
          const filteredDonationsByTxHash = donations.data.filter(donation => donation.txHash === txHash);

          if (filteredDonationsByTxHash.length === 1) return filteredDonationsByTxHash[ 0 ];

          const filteredDonationsByAmount = donations.data.filter(donation => donation.amount === amount);

          // possible to have 2 donations w/ same pledgeId & amount. This would happen if a giver makes
          // a donation to the same delegate/project w/ for the same amount multiple times. Currently there
          // no way to tell which donation was acted on, so we just return the first
          if (filteredDonationsByAmount.length > 0) return filteredDonationsByAmount[ 0 ];

          // this is probably a split which happened outside of the ui
          throw new Error('unable to determine what donations entity to update', from, to, amount, ts, txHash);
        });
    };

    return Promise.all([ this.liquidPledging.getPledge(from), this.liquidPledging.getPledge(to) ])
      .then(([ fromPledge, toPledge ]) => {
        const promises = [
          pledgeAdmins.get(fromPledge.owner),
          pledgeAdmins.get(toPledge.owner),
          fromPledge,
          toPledge,
          getDonation(),
        ];

        // In lp any delegate in the chain can delegate (bug prevents that currently), but we only want the last delegate
        // to have that ability
        if (toPledge.nDelegates > 0) {
          promises.push(
            this.liquidPledging.getPledgeDelegate(to, toPledge.nDelegates)
              .then(delegate => pledgeAdmins.get(delegate.idDelegate))
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
      .then(([ fromPledgeAdmin, toPledgeAdmin, fromPledge, toPledge, donation, delegate, intendedProject ]) => {

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

        if (!donation) console.error('missing donation for ->', JSON.stringify(transferInfo, null, 2));

        return this._doTransfer(transferInfo);

        // if donation doesn't exist where pledgeId === from, then add to transferQueue.
        // this.queue.add(
        //   from,
        //   () => getDonation()
        //     .then(d => {
        //       transferInfo.donation = d;
        //       return this._doTransfer(transferInfo);
        //     }),
        // );

      })
      .catch((err) => {
        // if (err.name === 'NotFound') {
        //   // most likely the from pledgeAdmin hasn't been registered yet.
        //   // this can happen b/c when donating in liquidPledging, if the giverId === 0, the donate method will create a
        //   // giver. Thus the tx will emit 3 events. AddGiver, and 2 x Transfer. Since these are processed asyncrounously
        //   // calling pledgeAdmins.get(from) could result in a 404 as the AddGiver event hasn't finished processing
        //   console.log('retrying in 10 seconds, missing pledgeAdmin fromPledgeId:', from);
        //   setTimeout(() => this._transfer(from, to, amount, ts, txHash), 10000);
        //   return;
        // }
        console.error(err);
      });
  }

  _doTransfer(transferInfo) {
    const donations = this.app.service('donations');
    const { fromPledgeAdmin, toPledgeAdmin, fromPledge, toPledge, toPledgeId, delegate, intendedProject, donation, amount, ts } = transferInfo;

    let status;
    if (toPledge.paymentState === '1') status = 'paying';
    else if (toPledge.paymentState === '2') status = 'paid';
    else if (intendedProject) status = 'to_approve';
    else if (toPledgeAdmin.type === 'giver' || delegate) status = 'waiting';
    else status = 'committed';

    if (donation.amount === amount) {
      // this is a complete pledge transfer

      const mutation = {
        amount,
        paymentStatus: pledgePaymentStatus(toPledge.paymentState),
        updatedAt: ts,
        owner: toPledge.owner,
        ownerId: toPledgeAdmin.typeId,
        ownerType: toPledgeAdmin.type,
        intendedProject: toPledge.intendedProject,
        pledgeId: toPledgeId,
        commitTime: (toPledge.commitTime) ? new Date(toPledge.commitTime * 1000) : ts,
        status,
      };

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
            intendedProjectType: true
          }
        });
      }

      if (delegate) {
        Object.assign(mutation, {
          delegate: delegate.id,
          delegateId: delegate.typeId,
        });
      }

      // if the paymentState === 'Paying', this means that the owner is withdrawing and the delegates can no longer
      // delegate the pledge, so we drop them
      if ((!delegate || toPledge.paymentState === '1') && donation.delegate) {
        Object.assign(mutation, {
          $unset: {
            delegate: true,
            delegateId: true,
            delegateType: true
          }
        });
      }

      // update milestone status if toPledge == paying or paid
      if (['1', '2'].includes(toPledge.paymentState) && toPledgeAdmin.type === 'milestone') {
        this.app.service('milestones').patch(toPledgeAdmin.typeId, {
          status: (toPledge.paymentState === '1') ? 'Paying' : 'CanWithdraw',
          mined: true
        });
      }

      //TODO donationHistory entry
      return donations.patch(donation._id, mutation)
        .then(() => this._updateDonationHistory(transferInfo));
    } else {
      // this is a split

      //TODO donationHistory entry
      // donations.patch(donation._id, {
      //     amount: donation.amount - amount,
      //   })
      //   //TODO update this
      //   .then(() => donations.create({
      //     giverAddress: donation.giverAddress,
      //     amount,
      //     toPledgeId,
      //     createdAt: ts,
      //     owner: toPledgeAdmin.typeId,
      //     ownerType: toPledgeAdmin.type,
      //     intendedProject: toPledge.intendedProject,
      //     paymentState: this._paymentStatus(toPledge.paymentState),
      //   }))
      //   // now that this donation has been added, we can purge the transfer queue for this pledgeId
      //   .then(() => this.queue.purge(toPledgeId));
    }

  }

  _updateDonationHistory(transferInfo) {
    const donationsHistory = this.app.service('donations/history');
    const { fromPledgeAdmin, toPledgeAdmin, fromPledge, toPledge, toPledgeId, delegate, intendedProject, donation, amount, ts } = transferInfo;

    // only handling new donations for now
    if (fromPledge.oldPledge === '0' && toPledge.nDelegates === '1' && toPledge.intendedProject === '0') {
      const history = {
        ownerId: toPledgeAdmin.typeId,
        ownerType: toPledgeAdmin.type,
        createdAt: ts,
        amount,
        txHash: donation.txHash,
        donationId: donation._id,
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

  _getBlockTimestamp(blockNumber) {
    if (this.blockTimes[ blockNumber ]) return Promise.resolve(this.blockTimes[ blockNumber ]);

    // if we are already fetching the block, don't do it twice
    if (this.fetchingBlocks[ blockNumber ]) {
      return new Promise(resolve => {
        // attach a listener which is executed when we get the block ts
        this.fetchingBlocks[ blockNumber ].push(resolve);
      });
    }

    this.fetchingBlocks[ blockNumber ] = [];

    return this.web3.eth.getBlock(blockNumber)
      .then(block => {
        const ts = new Date(block.timestamp * 1000);

        this.blockTimes[ blockNumber ] = ts;

        // only keep 50 block ts cached
        if (Object.keys(this.blockTimes).length > 50) {
          Object.keys(this.blockTimes)
            .sort((a, b) => b - a)
            .forEach(key => delete this.blockTimes[ key ]);
        }

        // execute any listeners for the block
        this.fetchingBlocks[ blockNumber ].forEach(resolve => resolve(ts));
        delete this.fetchingBlocks[ blockNumber ];

        return ts;
      });
  }
}

export default Pledges;
