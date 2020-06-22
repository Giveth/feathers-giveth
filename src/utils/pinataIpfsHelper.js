/**
 * Pinata cloud functions helper
 */
const Axios = require('axios');
const Https = require('https');
const FormData = require('form-data');

const normalizeHash = hash => hash.replace(/^\/ipfs\//, '');

module.exports = class {
  constructor(pinataApiKey, pinataSecretApiKey) {
    this.pinataApiKey = pinataApiKey;
    this.pinataSecretApiKey = pinataSecretApiKey;

    this.axios = Axios.create({
      httpsAgent: new Https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }

  getPinList(queryParams) {
    let queryString = '?';
    if (queryParams.hashContains) {
      queryString += `hashContains=${queryParams.hashContains}&`;
    }
    if (queryParams.pinStartDate) {
      queryString += `pinStart=${queryParams.pinStartDate}&`;
    }
    if (queryParams.pinEndDate) {
      queryString += `pinEnd=${queryParams.pinEndDate}&`;
    }
    if (queryParams.unpinStartDate) {
      queryString += `unpinStart=${queryParams.unpinStartDate}&`;
    }
    if (queryParams.unpinEndDate) {
      queryString += `unpinEnd=${queryParams.unpinEndDate}&`;
    }
    if (queryParams.selectedPinStatus) {
      queryString += `pinFilter=${queryParams.selectedPinStatus}&`;
    }
    if (queryParams.unpinEndDate) {
      queryString += `unpinEnd=${queryParams.unpinEndDate}&`;
    }
    if (queryParams.unpinEndDate) {
      queryString += `unpinEnd=${queryParams.unpinEndDate}&`;
    }
    if (queryParams.pageLimit) {
      queryString += `pageLimit=${queryParams.pageLimit}&`;
    }
    if (queryParams.pageOffset) {
      queryString += `pageOffset=${queryParams.pageOffset}&`;
    }
    if (queryParams.nameContains) {
      queryString += `metadata[name]=${queryParams.nameContains}&`;
    }
    // Make sure keyvalues are properly formatted as described earlier in the docs.
    if (queryParams.keyvalues) {
      const stringKeyValues = JSON.stringify(queryParams.keyvalues);
      queryString += `metadata[keyvalues]=${stringKeyValues}`;
    }
    const url = `https://api.pinata.cloud/data/pinList${queryString}`;
    return this.axios.get(url, {
      headers: {
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretApiKey,
      },
    });
  }

  pinFile(base64Content, fileName) {
    // we gather a local file for this example, but any valid readStream source will work here.
    const data = new FormData();
    const array = base64Content.split(',');
    const base64FileData =
      array.length > 1 && array[0].indexOf('base64') >= 0 ? array[1] : array[0];
    const fileData = Buffer.from(base64FileData, 'base64');
    data.append('file', fileData, fileName || 'anonymous');

    // You'll need to make sure that the metadata is in the form of a JSON object that's been convered to a string
    // metadata is optional
    if (fileName) {
      const metadata = JSON.stringify({
        name: fileName,
      });
      data.append('pinataMetadata', metadata);
    }

    return this.axios.post('Https://api.pinata.cloud/pinning/pinFileToIPFS', data, {
      maxContentLength: 'Infinity', // this is needed to prevent Axios from throw error with large files
      headers: {
        'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretApiKey,
      },
    });
  }

  pinByHash(hashToPin, name, keyValues) {
    const url = `https://api.pinata.cloud/pinning/pinByHash`;
    const body = {
      hashToPin: normalizeHash(hashToPin),
    };

    if (name || keyValues) {
      body.pinataMetadata = {
        name,
        keyvalues: keyValues,
      };
    }

    return this.axios.post(url, body, {
      headers: {
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretApiKey,
      },
    });
  }

  removePin(hashToUnpin) {
    const url = `https://api.pinata.cloud/pinning/unpin/${normalizeHash(hashToUnpin)}`;
    return this.axios.delete(url, {
      headers: {
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretApiKey,
      },
    });
  }
};
