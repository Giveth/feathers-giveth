const { authorizeGivethio } = require('../../hooks/authorizeGivethio');

module.exports = {
  before: {
    create: [
      authorizeGivethio()
    ],
  },
};
