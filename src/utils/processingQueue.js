const logger = require('winston');
const queue = require('./queue');
const processor = require('./processor');

const processingQueue = target => {
  const q = queue(target);
  const p = processor({});

  const origPurge = q.purge;

  return Object.assign(q, {
    async purge(id) {
      p.startProcessing(id);
      await origPurge.call(this, id);
      if (this.get(id).length === 0) p.finishedProcessing(id);
    },
    isProcessing(id) {
      return p.isProcessing(id);
    },
  });
};

/**
 * create a new ProcessingQueue
 */
const factory = name => {
  const q = processingQueue({});

  // for debugging purposes. check if there are any stuck txs every 5 mins
  setInterval(() => {
    if (Object.keys(q.get()).length > 0) {
      logger.info(`current "${name}" QUEUE status ->`, JSON.stringify(q.get(), null, 2));
    }
  }, 1000 * 60 * 5);
  return q;
};

module.exports = factory;
