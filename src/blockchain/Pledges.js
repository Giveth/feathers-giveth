import TransferQueue from './TransferQueue';

const BreakSignal = () => {
};

class Pledges {
  constructor(app, liquidPledging) {
    this.app = app;
    this.web3 = liquidPledging.$web3;
    this.liquidPledging = liquidPledging;
    this.queue = new TransferQueue();
    this.blockTimes = {};
    this.fetchingBlocks = {};
  }

  // handle liquidPledging Transfer event
  transfer(event) {
    if (event.event !== 'Transfer') throw new Error('transfer only handles Transfer events');

    const { from, to, amount } = event.returnValues;

    this._getBlockTimestamp(event.blockNumber)
      .then(ts => {
        if (from === '0') return this._newDonation(to, amount, ts, event.transactionHash);

        return this._transfer(from, to, amount, ts, event.transactionHash);
      });
  }

  _newDonation(pledgeId, amount, ts, txHash, retry = false) {
    const donations = this.app.service('donations');
    const pledgeAdmins = this.app.service('pledgeAdmins');

    const findDonation = () => donations.find({ query: { txHash } })
      .then(resp => {
        return (resp.data.length > 0) ? resp.data[ 0 ] : undefined;
      });

    this.liquidPledging.getPledge(pledgeId)
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
          paymentStatus: this._paymentStatus(pledge.paymentState),
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
      // now that this donation has been added, we can purge the transfer queue for this pledgeId
      .then(() => this.queue.purge(pledgeId))
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
      return donations.find({ query: { pledgeId: from, txHash } })
        .then(donations => (donations.data.length > 0) ? donations.data[ 0 ] : undefined);
    };

    Promise.all([ this.liquidPledging.getPledge(from), this.liquidPledging.getPledge(to) ])
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

        if (donation) return this._doTransfer(transferInfo);

        // if donation doesn't exist where pledgeId === from, then add to transferQueue.
        this.queue.add(
          from,
          () => getDonation()
            .then(d => {
              transferInfo.donation = d;
              return this._doTransfer(transferInfo);
            }),
        );

      })
      .catch((err) => {
        if (err.name === 'NotFound') {
          // most likely the from pledgeAdmin hasn't been registered yet.
          // this can happen b/c when donating in liquidPledging, if the giverId === 0, the donate method will create a
          // giver. Thus the tx will emit 3 events. AddGiver, and 2 x Transfer. Since these are processed asyncrounously
          // calling pledgeAdmins.get(from) could result in a 404 as the AddGiver event hasn't finished processing
          console.log('adding to queue, missing pledgeAdmin fromPledgeId:', from)
          this.queue.add(
            from,
            () => this._transfer(from, to, amount, ts, txHash)
          );
          return;
        }
      console.error
      });
  }

  _doTransfer(transferInfo) {
    const donations = this.app.service('donations');
    const { fromPledgeAdmin, toPledgeAdmin, fromPledge, toPledge, toPledgeId, delegate, intendedProject, donation, amount, ts } = transferInfo;

    let status;
    if (intendedProject) status = 'to_approve';
    else if (toPledgeAdmin.type === 'user' || delegate) status = 'waiting';
    else status = 'committed';

    if (donation.amount === amount) {
      // this is a complete pledge transfer

      const mutation = {
        amount,
        paymentStatus: this._paymentStatus(toPledge.paymentState),
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
      if ((!delegate || toPledge.paymentState === 'Paying') && donation.delegate) {
        Object.assign(mutation, {
          $unset: {
            delegate: true,
            delegateId: true,
            delegateType: true
          }
        });
      }

      //TODO donationHistory entry
      donations.patch(donation._id, mutation)
        .then(this._updateDonationHistory(transferInfo));
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

  _paymentStatus(val) {
    switch (val) {
      case '0':
        return 'Pledged';
      case '1':
        return 'Paying';
      case '2':
        return 'Paid';
      default:
        return 'Unknown';
    }
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
