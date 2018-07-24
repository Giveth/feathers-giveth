const logger = require('winston');
const queue = require('./queue');

const processingQueue = target => {
  const q = queue(target);
  let processing = false;

  const origPurge = q.purge;

  return Object.assign(q, {
    async purge() {
      processing = true;
      await origPurge.call(this);
      if (this.get().length === 0) processing = false;
    },
    isProcessing() {
      return processing;
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
    if (q.get().length > 0) {
      logger.info(
        `current "${name}" QUEUE -> isProcessing: ${q.isProcessing()} -> status:`,
        JSON.stringify(q.get(), null, 2),
      );
    }
  }, 1000 * 60 * 5);
  return q;
};

module.exports = factory;
