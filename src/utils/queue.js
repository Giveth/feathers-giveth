const logger = require('winston');

function queueMixin() {
  const queue = {};

  return Object.assign(this, {
    /**
     * Add a function to the queue at the given id
     * @param {id} id The id of the queue to add to
     * @param {function} fn The function to place in the queue
     */
    add(id, fn) {
      if (!fn) throw new Error('fn must not be null for id:', id);
      logger.debug('adding to queue ->', id);

      if (queue[id]) {
        queue[id].push(fn);
      } else {
        queue[id] = [fn];
      }
    },

    /**
     * Get the queue for a given id. If id is undefined, returns the entire queue
     *
     * @param {string} id (optional)
     */
    get(id) {
      if (id) {
        return queue[id] ? queue[id].slice() : [];
      }
      return Object.assign({}, queue);
    },

    /**
     * Purge the next function in the queue at the given id
     *
     * @param {string} id The id of the queue to purge
     */
    async purge(id) {
      if (!queue[id]) return;

      const queued = queue[id];

      if (queued.length > 0) {
        logger.debug('purging queue ->', id);

        await queued.splice(0, 1)[0](); // remove first function from list and run it

        logger.debug('returned from purge');
        if (queue[id] && queue[id].length === 0) delete queue[id];
      }
    },
  });
}

// queue factory function
const queue = target => queueMixin.call(target);

module.exports = queue;
