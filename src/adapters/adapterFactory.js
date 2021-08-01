const config = require('config');
const givethIoAdapter = require('./givethIo/givethIoAdapter');
const givethIoMockAdapter = require('./givethIo/givethIoMockAdapter');

const getGivethIoAdapter = () => {
  if (config.mockGivethIo) {
    return givethIoMockAdapter;
  }
  return givethIoAdapter;
};

module.exports = { getGivethIoAdapter };
