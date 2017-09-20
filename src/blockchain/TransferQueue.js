class TransferQueue {
  constructor() {
    this.queue = {};
  }

  add(noteId, fn) {
    (this.queue[ noteId ]) ? this.queue[ noteId ].push(fn) : this.queue[ noteId ] = [ fn ];
  }
  
  purge(noteId) {
    
    if (!this.queue[ noteId ]) return;
    
    this.queue[ noteId ].forEach(fn => fn());
  }

}

export default TransferQueue;
