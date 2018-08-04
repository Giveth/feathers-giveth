/* eslint-disable no-param-reassign */
const { checkContext, getItems } = require('feathers-hooks-common');

module.exports = () => context => {
  checkContext(context, 'after');

  const { requiredConfirmations } = context.app.get('blockchain');

  const attachConfirmation = item => {
    item.requiredConfirmations = requiredConfirmations;
    if (!item.txHash) return Promise.resolve(item);

    return context.app
      .service('events')
      .find({ paginate: false, query: { transactionHash: item.txHash } })
      .then(events => {
        item.confirmations = events.length > 0 ? events[0].confirmations : 0;
        return item;
      });
  };

  const items = getItems(context);

  if (!Array.isArray(items)) {
    return attachConfirmation(items).then(() => context);
  }

  return Promise.all(items.map(i => attachConfirmation(i))).then(() => context);
};
