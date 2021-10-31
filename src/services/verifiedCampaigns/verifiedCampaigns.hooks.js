const { authorizeGivethio } = require('../../hooks/authorizeGivethio');

module.exports = {
  before: {
    update: [authorizeGivethio()],
  },
};
