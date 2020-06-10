const logger = require('winston');
const PinataIpfsHelper = require('./pinataIpfsHelper');

const to = require('./to');

module.exports = async function init() {
  const app = this;

  app.ipfsPinner = () => Promise.resolve();

  const pinataIpfsKeys = app.get('pinataIpfsKeys');
  if (!pinataIpfsKeys) return;
  const { pinataApiKey, pinataSecretApiKey } = pinataIpfsKeys;

  if (!pinataApiKey || !pinataSecretApiKey) {
    logger.info('Missing Pinata needed api keys. We will not be able to pin files to pinata.');
    return;
  }

  const pinataIpfs = new PinataIpfsHelper(pinataApiKey, pinataSecretApiKey);

  const [err] = await to(pinataIpfs.getPinList());

  if (err) {
    logger.error(
      'Error attempting to connect to Pinata IPFS service. We will not be able to manage file pinning',
      err,
    );
    return;
  }

  app.ipfsPinner = (hash, name, keyValues) =>
    pinataIpfs.pinByHash(hash, name, keyValues).catch(logger.error);
};
