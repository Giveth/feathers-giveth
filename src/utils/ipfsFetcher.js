const isIPFS = require('is-ipfs');
const rp = require('request-promise');
const url = require('url');
const logger = require('winston');

module.exports = function init() {
  const app = this;
  const ipfsGateway = app.get('ipfsGateway');
  if (!ipfsGateway || ipfsGateway === '') {
    logger.info('Missing ipfsGateway url. We will not be able to fetch files from ipfs.');
    app.ipfsFetcher = () => Promise.resolve();
    return;
  }

  app.ipfsFetcher = path => {
    if (!isIPFS.path(path)) throw new Error(`${path} is not a valid ipfs path`);

    return rp({
      uri: url.resolve(ipfsGateway, path),
      json: true,
    });
  };
};
