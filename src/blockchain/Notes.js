import TransferQueue from './TransferQueue';

const BreakSignal = () => {
};

class Notes {
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

  _newDonation(noteId, amount, ts, txHash, retry = false) {
    const donations = this.app.service('donations');
    const noteManagers = this.app.service('noteManagers');

    const findDonation = () => donations.find({ query: { txHash } })
      .then(resp => {
        return (resp.data.length > 0) ? resp.data[ 0 ] : undefined;
      });

    this.liquidPledging.getNote(noteId)
      .then((note) => Promise.all([ noteManagers.get(note.owner), note, findDonation() ]))
      .then(([ donor, note, donation ]) => {
        const mutation = {
          donorAddress: donor.manager.address, // donor is a user
          amount,
          noteId,
          createdAt: ts,
          owner: note.owner,
          ownerId: donor.typeId,
          ownerType: donor.type,
          status: 'waiting', // waiting for delegation by owner or delegate
          paymentStatus: this._paymentStatus(note.paymentState),
        };

        if (!donation) {
          if (retry) return donations.create(Object.assign(mutation, { txHash }));

          // this is really only useful when instant mining. Other then that, the donation should always be
          // created before the tx was mined.
          setTimeout(() => this._newDonation(noteId, amount, ts, txHash, true), 5000);
          throw new BreakSignal();
        }

        return donations.patch(donation._id, mutation);
      })
      // now that this donation has been added, we can purge the transfer queue for this noteId
      .then(() => this.queue.purge(noteId))
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        if (err.name === 'NotFound') {
          // most likely the from noteManager hasn't been registered yet.
          // this can happen b/c when donating in liquidPledging, if the donorId === 0, the donate method will create a
          // donor. Thus the tx will emit 3 events. AddDonor, and 2 x Transfer. Since these are processed asyncrounously
          // calling noteManagers.get(from) could result in a 404 as the AddDonor event hasn't finished processing
          setTimeout(() => this._newDonation(noteId, amount, ts, txHash, true), 5000);
          return;
        }
        console.error(err); // eslint-disable-line no-console
      });

  }

  _transfer(from, to, amount, ts, txHash) {
    const donations = this.app.service('donations');
    const noteManagers = this.app.service('noteManagers');

    const getDonation = () => {
      return donations.find({ query: { noteId: from, txHash } })
        .then(donations => (donations.data.length > 0) ? donations.data[ 0 ] : undefined);
    };

    Promise.all([ this.liquidPledging.getNote(from), this.liquidPledging.getNote(to) ])
      .then(([ fromNote, toNote ]) => {
        const promises = [
          noteManagers.get(fromNote.owner),
          noteManagers.get(toNote.owner),
          fromNote,
          toNote,
          getDonation(),
        ];

        // In lp any delegate in the chain can delegate (bug prevents that currently), but we only want the last delegate
        // to have that ability
        if (toNote.nDelegates > 0) {
          promises.push(
            this.liquidPledging.getNoteDelegate(to, toNote.nDelegates)
              .then(delegate => noteManagers.get(delegate.idDelegate))
          );
        } else {
          promises.push(undefined);
        }

        // fetch proposedProject noteManager
        if (toNote.proposedProject > 0) {
          promises.push(noteManagers.get(toNote.proposedProject));
        } else {
          promises.push(undefined);
        }

        return Promise.all(promises);
      })
      .then(([ fromNoteManager, toNoteManager, fromNote, toNote, donation, delegate, proposedProject ]) => {

        const transferInfo = {
          fromNoteManager,
          toNoteManager,
          fromNote,
          toNote,
          toNoteId: to,
          delegate,
          proposedProject,
          donation,
          amount,
          ts,
        };

        if (donation) return this._doTransfer(transferInfo);

        // if donation doesn't exist where noteId === from, then add to transferQueue.
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
          // most likely the from noteManager hasn't been registered yet.
          // this can happen b/c when donating in liquidPledging, if the donorId === 0, the donate method will create a
          // donor. Thus the tx will emit 3 events. AddDonor, and 2 x Transfer. Since these are processed asyncrounously
          // calling noteManagers.get(from) could result in a 404 as the AddDonor event hasn't finished processing
          console.log('adding to queue, missing noteManager fromNoteId:', from)
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
    const { fromNoteManager, toNoteManager, fromNote, toNote, toNoteId, delegate, proposedProject, donation, amount, ts } = transferInfo;

    let status;
    if (proposedProject) status = 'to_approve';
    else if (toNoteManager.type === 'user' || delegate) status = 'waiting';
    else status = 'committed';

    if (donation.amount === amount) {
      // this is a complete note transfer

      const mutation = {
        amount,
        paymentStatus: this._paymentStatus(toNote.paymentState),
        updatedAt: ts,
        owner: toNote.owner,
        ownerId: toNoteManager.typeId,
        ownerType: toNoteManager.type,
        proposedProject: toNote.proposedProject,
        noteId: toNoteId,
        commitTime: (toNote.commitTime) ? new Date(toNote.commitTime * 1000) : ts,
        status,
      };

      if (proposedProject) {
        Object.assign(mutation, {
          proposedProjectId: proposedProject.typeId,
          proposedProjectType: proposedProject.type,
        });
      }

      if (!proposedProject && donation.proposedProject) {
        Object.assign(mutation, {
          $unset: {
            proposedProject: true,
            proposedProjectId: true,
            proposedProjectType: true
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
      // delegate the note, so we drop them
      if ((!delegate || toNote.paymentState === 'Paying') && donation.delegate) {
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
      //     donorAddress: donation.donorAddress,
      //     amount,
      //     toNoteId,
      //     createdAt: ts,
      //     owner: toNoteManager.typeId,
      //     ownerType: toNoteManager.type,
      //     proposedProject: toNote.proposedProject,
      //     paymentState: this._paymentStatus(toNote.paymentState),
      //   }))
      //   // now that this donation has been added, we can purge the transfer queue for this noteId
      //   .then(() => this.queue.purge(toNoteId));
    }

  }

  _updateDonationHistory(transferInfo) {
    const donationsHistory = this.app.service('donations/history');
    const { fromNoteManager, toNoteManager, fromNote, toNote, toNoteId, delegate, proposedProject, donation, amount, ts } = transferInfo;

    // only handling new donations for now
    if (fromNote.oldNote === '0' && toNote.nDelegates === '1' && toNote.proposedProject === '0') {
      const history = {
        ownerId: toNoteManager.typeId,
        ownerType: toNoteManager.type,
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
    // if (toNote.paymentStatus === 'Paying' || toNote.paymentStatus === 'Paid') {
    //   // payment has been initiated/completed in vault
    //   return donationsHistory.create({
    //     status: (toNote.paymentStatus === 'Paying') ? 'Payment Initiated' : 'Payment Completed',
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
        return 'NotPaid';
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

export default Notes;
