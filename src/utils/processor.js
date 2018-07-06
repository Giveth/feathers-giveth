/**
 * Mixin used to manage when something is processing
 */
const processorMixin = target => {
  const processing = {};

  return Object.assign(target, {
    isProcessing(id) {
      return processing[id] || false;
    },

    startProcessing(id) {
      // probably need to make all uses of this to first place in queue and then immediatly purge the queue
      processing[id] = true;
    },

    finishedProcessing(id) {
      if (processing[id]) delete processing[id];
    },
  });
};

module.exports = processorMixin;
