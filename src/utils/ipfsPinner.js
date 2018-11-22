const ipfsAPI = require('ipfs-api');
const logger = require('winston');

const to = require('./to');

module.exports = async function init() {
  const app = this;
  const ipfsApiUrl = app.get('ipfsApi');

  app.ipfsPinner = () => Promise.resolve();

  if (!ipfsApiUrl || ipfsApiUrl === '') {
    logger.info('Missing ipfsApi url. We will not be able to fetch files from ipfs.');
    return;
  }

  const ipfs = ipfsAPI(ipfsApiUrl);

  const [err] = await to(ipfs.id());

  if (err) {
    logger.error(
      'Error attempting to connect to ipfsApi. We will not be able to manage file pinning',
      err,
    );
    return;
  }

  app.ipfsPinner = hash => ipfs.pin.add(hash).catch(logger.error);
};
