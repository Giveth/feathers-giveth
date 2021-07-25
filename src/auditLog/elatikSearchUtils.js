const axios = require('axios');
const config = require('config');
const logger = require('winston');
const Sentry = require('@sentry/node');

const createBasicAuthentication = ({ username, password }) => {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
};
const removeUdefinedFieldFromObject = object => {
  // eslint-disable-next-line no-restricted-syntax
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) {
      delete object[key];
    }
  }
};
const sendEventToElasticSearch = async data => {
  const basicAuthentication = createBasicAuthentication({
    username: config.elasticSearchUsername,
    password: config.elasticSearchPassword,
  });
  // if sending some data undefined may cause elastic search index dont work properly
  removeUdefinedFieldFromObject(data);
  try {
    await axios.post(config.elasticSearchUrl, data, {
      headers: {
        Authorization: basicAuthentication,
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    logger.info('sendEventToElasticSearch error', { e, message: e.message });
    Sentry.captureException(e);
  }
};

module.exports = {
  createBasicAuthentication,
  sendEventToElasticSearch,
};
