/**
 * This script deletes inaccessible ipfs path from db, it's necessary to show default images when
 * original image data is lost
 * Also, pins all ipfs path to Pinata server to have a duplicate of ipfs stored resources
 */
const fs = require('fs');
const isIPFS = require('is-ipfs');
const ipfsAPI = require('ipfs-api');

const mongoose = require('mongoose');
require('mongoose-long')(mongoose);
require('../../src/models/mongoose-bn')(mongoose);
const to = require('../../src/utils/to');
const PinataIpfsHelper = require('../../src/utils/pinataIpfsHelper');
const { AdminTypes } = require('../../src/models/pledgeAdmins.model');

const configFileName = 'beta';

// eslint-disable-next-line import/no-dynamic-require
const config = require(`../../config/${configFileName}.json`);

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

const DACs = require('../../src/models/dacs.model').createModel(app);
const Campaigns = require('../../src/models/campaigns.model').createModel(app);
const Milestones = require('../../src/models/traces.model').createModel(app);
const Users = require('../../src/models/users.model')(app);

// IPFS server (ipfsApi) refs local list
const refsLocalList = fs
  .readFileSync('refsLocalList.txt')
  .toString()
  .split('\n')
  .filter(s => s);

// IPFS server (ipfsApi) pinned list
const pinnedList = fs
  .readFileSync('pinnedList.txt')
  .toString()
  .split('\n')
  .filter(s => s)
  .map(s => s.split(' ')[0]);

const availableHashes = new Set(refsLocalList);
const ipfsApiPinnedHashes = new Set(pinnedList);
const pinataPinnedHashes = new Set();

const main = async () => {
  // Initialize ipfsApi pinner
  let ipfsApiPinner = () => Promise.resolve();
  const ipfsApiUrl = config.ipfsApi;
  if (ipfsApiUrl) {
    const ipfs = ipfsAPI(ipfsApiUrl);

    const [err] = await to(ipfs.id());

    if (err) {
      console.error(
        'Error attempting to connect to ipfsApi. We will not be able to manage file pinning',
        err,
      );
    } else {
      ipfsApiPinner = hash => ipfs.pin.add(hash).catch(console.error);
    }
  }

  let pinataIpfsPinner = () => Promise.resolve();
  const pinataIpfsKeys = config.pinataIpfsKeys || {};
  const { pinataApiKey, pinataSecretApiKey } = pinataIpfsKeys;

  if (pinataApiKey && pinataSecretApiKey) {
    const pinataIpfs = new PinataIpfsHelper(pinataApiKey, pinataSecretApiKey);

    const pageLimit = 1000;
    let pageOffset = 0;
    let err;
    let result;
    while (!err) {
      // eslint-disable-next-line no-await-in-loop
      [err, result] = await to(pinataIpfs.getPinList({ pageLimit, pageOffset }));
      if (!err) {
        const { rows, count } = result.data;
        rows.map(r => r.ipfs_pin_hash).forEach(hash => pinataPinnedHashes.add(hash));
        pageOffset += rows.length;
        if (pageOffset === count) break;
      }
    }

    if (err) {
      console.error(
        'Error attempting to connect to Pinata IPFS service. We will not be able to manage file pinning',
        err,
      );
    } else {
      pinataIpfsPinner = (hash, name, keyValues) => pinataIpfs.pinByHash(hash, name, keyValues);
    }
  }

  const isValidIpfs = path => path && isIPFS.ipfsPath(path);
  const normalizeHash = hash => hash.replace(/^\/ipfs\//, '');

  // Pin available files in pinata and our ipfs
  // Returns false if the file corresponding to path is not available
  const pinFile = async (ipfsPath, name, keyValues) => {
    const nip = normalizeHash(ipfsPath);
    const promises = [];
    if (availableHashes.has(nip)) {
      // Pin to ipfs api if it is not pinned there
      if (!ipfsApiPinnedHashes.has(nip)) {
        promises.push(ipfsApiPinner(nip));
      }
      if (!pinataPinnedHashes.has(nip)) {
        promises.push(pinataIpfsPinner(nip, name, keyValues));
      }
      await Promise.all(promises);
      return true;
    }

    console.log('Hash not found:', nip);
    return false;
  };

  const pinOrClearEntityIpfsPathEntries = (model, type) => {
    return model
      .find({})
      .select(['image', 'url', 'items', 'projectId', 'avatar'])
      .cursor()
      .eachAsync(
        async entity => {
          const { _id, projectId, image, avatar, url } = entity;
          const setObj = {}; // Modification to entity
          if (isValidIpfs(image)) {
            const ok = await pinFile(image, 'image', { ownerType: type, ownerId: projectId });
            if (!ok) {
              setObj.image = '';
              setObj.prevImage = image;
            }
          }
          if (isValidIpfs(avatar)) {
            const ok = await pinFile(avatar, 'image', { ownerType: type, ownerId: projectId });
            if (!ok) {
              setObj.avatar = '';
              setObj.prevAvatar = avatar;
            }
          }
          if (isValidIpfs(url)) {
            const ok = await pinFile(url, 'object', { type, id: projectId });
            if (!ok) {
              setObj.url = '';
              setObj.prevUrl = url;
            }
          }

          const items = entity.items || [];
          for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (isValidIpfs(item.image)) {
              // eslint-disable-next-line no-await-in-loop
              const ok = await pinFile(item.image, 'image', {
                ownerType: type,
                ownerId: projectId,
              });
              if (!ok) {
                setObj[`items.${i}.image`] = '';
                setObj[`items.${i}.prevImage`] = item.image;
              }
            }
          }

          if (Object.keys(setObj).length > 0) {
            console.log('id:', _id);
            console.log('setObj:', setObj);
            await model
              .updateOne(
                { _id },
                {
                  $set: {
                    ...setObj,
                  },
                },
                {
                  timestamps: false,
                },
              )
              .exec();
          }
        },
        {
          parallel: 30,
        },
      );
  };

  await pinOrClearEntityIpfsPathEntries(Users, AdminTypes.GIVER);
  await pinOrClearEntityIpfsPathEntries(DACs, AdminTypes.DAC);
  await pinOrClearEntityIpfsPathEntries(Campaigns, AdminTypes.CAMPAIGN);
  await pinOrClearEntityIpfsPathEntries(Milestones, AdminTypes.MILESTONE);
};

const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', async () => {
  console.log('Connected to Mongo');

  main().then(() => process.exit());
});
