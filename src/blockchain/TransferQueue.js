class TransferQueue {
  constructor() {
    this.queue = {};
  }

  add(pledgeId, fn) {
    console.log('adding to queue ->', pledgeId);
    (this.queue[ pledgeId ]) ? this.queue[ pledgeId ].push(fn) : this.queue[ pledgeId ] = [ fn ];
  }

  purge(pledgeId) {

    if (!this.queue[ pledgeId ]) return;

    console.log('purging queue ->', pledgeId);
    this.queue[ pledgeId ].forEach(fn => fn());
  }

}

export default TransferQueue;
