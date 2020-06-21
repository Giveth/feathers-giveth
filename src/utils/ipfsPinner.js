const ipfsAPI = require('ipfs-api');
const logger = require('winston');
const PinataIpfsHelper = require('./pinataIpfsHelper');

const to = require('./to');

module.exports = async function init() {
  const app = this;
  const ipfsApiUrl = app.get('ipfsApi');

  app.ipfsPinner = () => Promise.resolve();

  let validApiUrl = true;
  if (!ipfsApiUrl || ipfsApiUrl === '') {
    logger.info('Missing ipfsApi url. We will not be able to fetch files from ipfs.');
    validApiUrl = false;
  }

  const pinataIpfsKeys = app.get('pinataIpfsKeys') || {};
  const { pinataApiKey, pinataSecretApiKey } = pinataIpfsKeys;

  let validPinataIpfsKeys = true;
  if (!pinataApiKey || !pinataSecretApiKey) {
    logger.info('Missing Pinata needed api keys. We will not be able to pin files to pinata.');
    validPinataIpfsKeys = false;
  }

  if (!validApiUrl && !validPinataIpfsKeys) return;

  let ipfs;
  if (validApiUrl) {
    ipfs = ipfsAPI(ipfsApiUrl);

    const [err] = await to(ipfs.id());

    if (err) {
      logger.error(
        'Error attempting to connect to ipfsApi. We will not be able to manage file pinning',
        err,
      );
      ipfs = null;
    }
  }
  ipfs = ipfs || {
    pin: {
      add: () => Promise.resolve(),
    },
  };

  let pinataIpfs;
  if (validPinataIpfsKeys) {
    pinataIpfs = new PinataIpfsHelper(pinataApiKey, pinataSecretApiKey);

    const [err] = await to(pinataIpfs.getPinList());

    if (err) {
      logger.error(
        'Error attempting to connect to Pinata IPFS service. We will not be able to manage file pinning',
        err,
      );
      pinataIpfs = null;
    }
  }
  pinataIpfs = pinataIpfs || {
    pinByHash: () => Promise.resolve(),
  };

  app.ipfsPinner = (hash, name, keyValues) => {
    return Promise.all([
      ipfs.pin.add(hash).catch(logger.error),
      pinataIpfs.pinByHash(hash, name, keyValues).catch(logger.error),
    ]);
  };
};
