import logger from 'winston';

const has = Object.prototype.hasOwnProperty;

class EventQueue {
  constructor() {
    this.queue = {};
    this.processing = {};

    // for debugging purposes. check if there are any stuck txs every 5 mins
    setInterval(() => {
      if (Object.keys(this.queue).length > 0) {
        logger.info('current QUEUE status ->', JSON.stringify(this.queue, null, 2));
      }
    }, 1000 * 60 * 5);
  }

  isProcessing(id) {
    return this.processing[id] || false;
  }

  startProcessing(id) {
    this.processing[id] = true;
  }

  finishedProcessing(id) {
    delete this.processing[id];
  }

  add(id, fn) {
    if (!fn) throw new Error('fn must not be null for id:', id);
    logger.debug('adding to queue ->', id);

    if (this.queue[id]) {
      this.queue[id].push(fn);
    } else {
      this.queue[id] = [fn];
    }
  }

  purge(id) {
    if (!this.queue[id]) return Promise.resolve();

    const queued = this.queue[id];

    if (queued.length > 0) {
      logger.debug('purging queue ->', id);
      let result = queued.splice(0, 1)[0](); // remove first function from list and run it

      if (!has.call(result, 'then')) {
        result = Promise.resolve(result);
      }

      return result.then(() => {
        logger.debug('returned from purge');
        if (this.queue[id] && this.queue[id].length === 0) {
          delete this.queue[id];
        }
      });
    }

    return Promise.resolve();
  }
}

export default EventQueue;
