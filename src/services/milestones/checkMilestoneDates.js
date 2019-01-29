const errors = require('@feathersjs/errors');

/**
 * This function checks that milestones and items are not created in the future, which we disallow at the moment
 * */
const checkMilestoneDates = () => context => {
  // abort check for internal calls
  if (!context.params.provider) return context;

  const { data } = context;
  const { items } = data;

  const today = new Date().setUTCHours(0, 0, 0, 0);
  const todaysTimestamp = Math.round(today) / 1000;

  const checkFutureTimestamp = requestedDate => {
    const date = new Date(requestedDate);
    const timestamp = Math.round(date) / 1000;

    if (todaysTimestamp - timestamp < 0) {
      throw new errors.Forbidden('Future items are not allowed');
    }
  };

  if ((Array.isArray(items) && items.length) > 0) {
    items.forEach(item => checkFutureTimestamp(item.date));
  } else {
    checkFutureTimestamp(data.date);
  }
  return context;
};

module.exports = checkMilestoneDates;
