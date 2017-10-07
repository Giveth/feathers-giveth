class EventQueue {
  constructor() {
    this.queue = {};
  }

  add(txHash, fn) {
    if (fn.then) throw new Error('queue fn must be a promise');

    console.log('adding to queue ->', txHash);
    (this.queue[ txHash ]) ? this.queue[ txHash ].push(fn) : this.queue[ txHash ] = [ fn ];
  }

  purge(txHash) {

    if (!this.queue[ txHash ]) return Promise.resolve();

    const queued = this.queue[ txHash ];

    if (queued.length > 0) {
      console.log('purging queue ->', txHash);
      return queued.splice(0, 1)[ 0 ]() // remove first function from list and run it
        .then(() => {
          console.log('returned from purge');
          return this.purge(txHash);
        });
    }

    return Promise.resolve();
  }

}

export default EventQueue;
