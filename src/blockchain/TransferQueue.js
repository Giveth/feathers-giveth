class TransferQueue {
  constructor() {
    this.queue = {};
  }

  add(noteId, fn) {
    console.log('adding to queue ->', noteId);
    (this.queue[ noteId ]) ? this.queue[ noteId ].push(fn) : this.queue[ noteId ] = [ fn ];
  }

  purge(noteId) {

    if (!this.queue[ noteId ]) return;

    console.log('purging queue ->', noteId);
    this.queue[ noteId ].forEach(fn => fn());
  }

}

export default TransferQueue;
