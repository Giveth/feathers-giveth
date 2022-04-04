const axios = require('axios');

const { oldPinataApiKey, oldPinataApiSecret, newPinataApiKey, newPinataApiSecret } = process.env;

const getPinList = async ({ pageLimit, pageOffset }) => {
  let queryString = '?';

  if (pageLimit) {
    queryString += `pageLimit=${pageLimit}&`;
  }
  if (pageOffset) {
    queryString += `pageOffset=${pageOffset}&`;
  }
  const url = `https://api.pinata.cloud/data/pinList${queryString}`;
  const result = await axios.get(url, {
    headers: {
      pinata_api_key: oldPinataApiKey,
      pinata_secret_api_key: oldPinataApiSecret,
    },
  });
  return result.data;
};

const pinByHash = async (hashToPin, metadata) => {
  const url = `https://api.pinata.cloud/pinning/pinByHash`;
  const body = {
    hashToPin,
  };
  if (metadata.name || metadata.keyvalues) {
    body.pinataMetadata = metadata;
  }

  const result = await axios.post(url, body, {
    headers: {
      pinata_api_key: newPinataApiKey,
      pinata_secret_api_key: newPinataApiSecret,
    },
  });
  return result.data;
};

const migratePinataFiles = async () => {
  let migrateEnded = false;

  // Setting big numbers cause getting rate limit
  const pageLimit = 5;

  let pageOffset = 0;

  while (!migrateEnded) {
    try {
      const { count, rows } = await getPinList({
        pageLimit,
        pageOffset,
      });
      console.log('getPinList()', { count, pageOffset, pageLimit });
      if (rows.length === 0) {
        console.log('All files are uploaded now');
        migrateEnded = true;
      }

      const promises = rows.map(({ ipfs_pin_hash, metadata }) => {
        return pinByHash(ipfs_pin_hash, metadata);
      });
      const uploadResult = await Promise.all(promises);
      console.log('Upload hashes to ipfs', {
        pageOffset,
        pageLimit,
        uploadResult: uploadResult.map(({ status }) => status),
      });
      pageOffset += pageLimit;
    } catch (e) {
      console.log('migratePinataFiles() error', e);
    }
  }
};

migratePinataFiles()
  .then(result => {
    console.log('migratePinataFiles result', result);
  })
  .catch(e => {
    console.log('migratePinataFiles() error', e);
  });
