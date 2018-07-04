/**
 * Mixin used to manage when something is processing
 */
function processorMixin() {
  const processing = {};

  return Object.assign(this, {
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
}

const processor = target => processorMixin.call(target);

module.exports = processor;
