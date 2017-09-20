import TransferQueue from './TransferQueue';

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
        if (from === '0') return this._newDonation(to, amount, ts);

        return this._transfer(from, to, amount, ts);
      });
  }

  _newDonation(noteId, amount, ts) {
    const donations = this.app.service('donations');
    const noteManagers = this.app.service('noteManagers');

    this.liquidPledging.getNote(noteId).call()
      .then((note) => Promise.all([ noteManagers.get(note.owner), note ]))
      .then(([ donor, note ]) => donations.create({
        donorAddress: donor.manager.address, // donor is a user
        amount,
        noteId,
        createdAt: ts,
        owner: donor.typeId,
        ownerType: donor.type,
        paymentState: note.paymentState,
      }))
      // now that this donation has been added, we can purge the transfer queue for this noteId
      .then(() => this.queue.purge(noteId));
  }

  _transfer(from, to, amount, ts) {
    const donations = this.app.service('donations');
    const noteManagers = this.app.service('noteManagers');

    const getDonation = () => {
      return donations.find({ query: { noteId: from } })
        .then(donations => (donations) ? donations[ 0 ] : undefined);
    };

    Promise.all([ this.liquidPledging.getNote(from).call(), this.liquidPledging.getNote(to).call() ])
      .then(([ fromNote, toNote ]) =>
        Promise.all([ noteManagers.get(fromNote.owner), noteManagers.get(toNote.owner), fromNote, toNote, getDonation() ]))
      .then(([ fromNoteManager, toNoteManager, fromNote, toNote, donation ]) => {

        const transferInfo = {
          fromNoteManager,
          toNoteManager,
          fromNote,
          toNote,
          toNoteId: to,
          donation,
          amount,
          ts
        };

        if (donation) return this._doTransfer(transferInfo);

        // if donation doesn't exist where noteId === from, then add to transferQueue.
        this.queue.add(
          from,
          () => getDonation()
            .then(d => {
              transferInfo.donation = d;
              return this._doTransfer(transferInfo);
            })
        );

      })
      .catch(console.error);
  }

  _doTransfer(transferInfo) {
    const donations = this.app.service('donations');
    const { fromNoteManager, toNoteManager, fromNote, toNote, toNoteId, donation, amount, ts } = transferInfo;

    if (donation.amount === amount) {
      // this is a transfer

      // if (fromNote.owner === toNote.owner) {
      // this is a delegation

      const mutation = {
        // delegates: toNote.delegates,
        amount: amount,
        paymentState: toNote.paymentState,
        updatedAt: ts,
        owner: toNoteManager.typeId,
        ownerType: toNoteManager.type,
        proposedProject: toNote.proposedProject,
        noteId: toNoteId
      };

      // In lp any delegate in the chain can delegate (bug prevents that currently), but we only want the last delegate
      // to have that ability
      if (toNote.delegates) {
        // only last delegate in chain can delegate?
        mutation.delegateId = toNote.delegates[ toNote.delegates.length - 1 ];
      }

      //TODO donationHistory entry
      donations.patch(donation._id, mutation)
        .then(this._updateDonationHistory(transferInfo));

      return;
      // }
    } else {
      // this is a split

      //TODO donationHistory entry
      donations.patch(donation._id, {
        amount: donation.amount - amount
      })
        .then(() => donations.create({
          donorAddress: donation.donorAddress,
          amount,
          toNoteId,
          createdAt: ts,
          owner: toNoteManager.typeId,
          ownerType: toNoteManager.type,
          proposedProject: toNote.proposedProject,
          paymentState: toNote.paymentState,
        }))
        // now that this donation has been added, we can purge the transfer queue for this noteId
        .then(() => this.queue.purge(toNoteId));
    }

  }

  _updateDonationHistory(transferInfo) {
    const donationsHistory = this.app.service('donations/:donationId/history');
    const { fromNoteManager, toNoteManager, fromNote, toNote, toNoteId, donation, amount, ts } = transferInfo;

    if (toNote.paymentStatus === 'Paying' || toNote.paymentStatus === 'Paid') {
      // payment has been initiated/completed in vault
      return donationsHistory.create({
        status: (toNote.paymentStatus === 'Paying') ? 'Payment Initiated' : 'Payment Completed',
        createdAt: ts,
      }, { donationId: donation._id });
    }

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

export default Notes;
