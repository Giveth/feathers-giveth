/**
 * This script find all of Dac, Campaign or Milestone has base64 image instead of ipfs, then
 * pin it to pinata for running this script the config just should have these fields:
 * pinataSecretApiKey, pinataApiKey, mongodb
 */
const Axios = require('axios');
const Https = require('https');
const FormData = require('form-data');
const config = require('config');
const mongoose = require('mongoose');
const fs = require('fs');
require('mongoose-long')(mongoose);
require('../src/models/mongoose-bn')(mongoose);

const cacheFileName = 'uploadAndPinProjectImagesToPinata.json';
const cacheDir = `${__dirname}/${cacheFileName}`;
let cachedHashes = [];
if (fs.existsSync(cacheDir)) {
  try {
    cachedHashes = cachedHashes.concat(...JSON.parse(fs.readFileSync(cacheDir)));
  } catch (e) {
    console.log('cant load old hashes from cache');
  }
}
console.log('cachedHashes', cachedHashes);
const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;

class PinataService {
  constructor(pinataApiKey, pinataSecretApiKey) {
    this.pinataApiKey = pinataApiKey;
    this.pinataSecretApiKey = pinataSecretApiKey;

    this.axios = Axios.create({
      httpsAgent: new Https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }

  pinFile(base64Content, { name, metadata }) {
    // we gather a local file for this example, but any valid readStream source will work here.
    const data = new FormData();
    const array = base64Content.split(',');
    const base64FileData =
      array.length > 1 && array[0].indexOf('base64') >= 0 ? array[1] : array[0];
    const fileData = Buffer.from(base64FileData, 'base64');
    data.append('file', fileData, name || 'anonymous');

    // You'll need to make sure that the metadata is in the form of a JSON object that's been convered to a string
    // metadata is optional
    data.append('pinataMetadata', JSON.stringify({ name, keyvalues: metadata }));
    return this.axios.post('Https://api.pinata.cloud/pinning/pinFileToIPFS', data, {
      maxContentLength: 'Infinity', // this is needed to prevent Axios from throw error with large files
      headers: {
        'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretApiKey,
      },
    });
  }
}
const pinataService = new PinataService(config.pinataApiKey, config.pinataSecretApiKey);
const uploadMilestoneImageToPinata = async (entity, entityType, mongooseModel) => {
  const projectId = String(entity.projectId);
  const pinataResult = await pinataService.pinFile(entity.image, {
    name: entity.title,
    metadata: {
      ownerType: entityType,
      ownerTypeId: entity._id,
      projectId,
    },
  });
  const ipfsHash = pinataResult.data.IpfsHash;
  const result = {
    ipfsHash,
    ownerTypeId: entity._id,
    ownerType: entityType,
    projectId,
  };
  await mongooseModel.updateOne({ _id: entity._id }, { image: `/ipfs/${ipfsHash}` },
    { timestamps: false },
  );
  console.log('result ', result);
  cachedHashes.push(result);
  return result;
};

const appFactory = () => {
  const data = {};
  return {
    get(key) {
      return data[key];
    },
    set(key, val) {
      data[key] = val;
    },
  };
};

const app = appFactory();
app.set('mongooseClient', mongoose);
const Milestones = require('../src/models/traces.model').createModel(app);
const Campaigns = require('../src/models/campaigns.model').createModel(app);
const Dacs = require('../src/models/dacs.model').createModel(app);

const uploadEntityImagesToPinata = async () => {
  try {
    await Milestones.find({ image: /data:image/ })
      .cursor()
      .eachAsync(
        async milestone => {
          await uploadMilestoneImageToPinata(milestone, 'milestone', Milestones);
        },
        {
          parallel: 3,
        },
      );
    await Campaigns.find({ image: /data:image/ })
      .cursor()
      .eachAsync(
        async campaign => {
          await uploadMilestoneImageToPinata(campaign, 'campaign', Campaigns);
        },
        {
          parallel: 3,
        },
      );
    await Dacs.find({ image: /data:image/ })
      .cursor()
      .eachAsync(
        async dac => {
          await uploadMilestoneImageToPinata(dac, 'dac', Dacs);
        },
        {
          parallel: 3,
        },
      );
    fs.writeFileSync(cacheDir, JSON.stringify(cachedHashes, null, 4));
    console.log('task ended');
    process.exit(0);
  } catch (e) {
    console.log('uploadEntityImagesToPinata error', e);
    process.exit(0);
  }
};

db.on('error', err => console.error(`Could not connect to Mongo:\n${err.stack}`));

db.once('open', async () => {
  console.info('Connected to Mongo');
  await uploadEntityImagesToPinata();
});
