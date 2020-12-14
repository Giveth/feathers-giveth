const logger = require('winston');

const queueMixin = target => {
  const queue = [];

  return Object.assign(target, {
    /**
     * Add a function to the queue
     * @param {function} fn The function to place in the queue
     */
    add(fn) {
      if (!fn) throw new Error('fn must not be null');
      logger.debug('adding to queue ->', fn.name);
      queue.push(fn);
    },

    /**
     * Get the queue
     */
    get() {
      return queue.slice();
    },

    /**
     * Purge the next function in the queue
     */
    // eslint-disable-next-line consistent-return
    async purge() {
      if (queue.length > 0) {
        logger.debug('purging queue');

        const val = await queue.splice(0, 1)[0](); // remove first function from list and run it

        logger.debug('returned from purge');
        return val;
      }
    },
  });
};

module.exports = queueMixin;
