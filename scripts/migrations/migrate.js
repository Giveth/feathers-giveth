const mongoose = require('mongoose');
const altered = require('./altered.js');
const missing = require('./missing.js');
const fs = require('fs');
const crypto = require('crypto');

const Schema = mongoose.Schema;
const shortid = require('shortid');

// development database
const baseUploadUrl = 'localhost:3010/uploads';
const mongoUrl = 'mongodb://localhost:27017/giveth';
const campaignMap = {
  Bub3WLo6jmlG8V6j: {
    // Governance
    id: '5b37e5caa239ac21b383d4dd',
    campaignReviewerAddress: '0x27786AA843d68dB6Cf7e5f7c49981a946a4E9196',
  },
  Wze7njNMv5Z68M2X: {
    // Migration
    id: '5b37e9daa239ac21b383d4e0',
    campaignReviewerAddress: '0x51e37e3716c0ED418a90e519CeEE395d8f6deCB9',
  },
  R1WkS0obautijkvJ: {
    // Communication
    id: '5b3789513a65c31e4e4e8328',
    campaignReviewerAddress: '0x567355f84d44a982629D8675AB4aadBB92dbfD54',
  },
  ap6KXg8iJwwUAxBY: {
    // ScalingNOW
    id: '5b37ed82a239ac21b383d4e3',
    campaignReviewerAddress: '0x51e37e3716c0ED418a90e519CeEE395d8f6deCB9',
  },
  fzOahNwFVyY7qLTI: {
    // DApp campaign
    id: '5b39d45e14cec916d00dab20',
    campaignReviewerAddress: '0x567355f84d44a982629D8675AB4aadBB92dbfD54',
  },
  OcKJryNwjeidMXi9: {
    // DAppNode
    id: '5b44b198647f33526e67c262',
    campaignReviewerAddress: '0x53516256736bEbf6b5ACd3aBA9994A064247cF9D',
  },
  NMhA6QLwfsUmPQld: {
    // Social Coding
    id: '5b3b3a34329bc64ae74d13cd',
    campaignReviewerAddress: '0x27786AA843d68dB6Cf7e5f7c49981a946a4E9196',
  },
};

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

/**
 * Get extension from base64 encoded image string
 *
 * @param {String} data Base 64 image data
 *
 * @return {String} one of jpeg, gif, png
 */
function guessImageExtension(data) {
  if (data.charAt(0) === '/') {
    return 'jpeg';
  } else if (data.charAt(0) === 'R') {
    return 'gif';
  } else if (data.charAt(0) === 'i') {
    return 'png';
  }
  return 'jpeg';
}

/**
 * Constructs new image url
 */
const constructNewImageUrl = url => {
  if (url) {
    // The image is directly stored in the DB data, extract it
    if (url.startsWith('data:')) {
      const base64Image = url.split(';base64,').pop();

      const filename = `${crypto.randomBytes(32).toString('hex')}.${guessImageExtension(
        base64Image,
      )}`;

      fs.writeFile(`uploads/${filename}`, base64Image, { encoding: 'base64' }, () => {});
      return baseUploadUrl + filename;
    }
    return baseUploadUrl + url.split('/uploads')[1];
  }
  return '';
};

const replaceTestRPC = address =>
  address.toLowerCase() === '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1'.toLowerCase()
    ? '0x51e37e3716c0ED418a90e519CeEE395d8f6deCB9' // Lindsay's address
    : address;

/**
 * Migrates users.db
 */
const migrateUsers = () => {
  // schema as per user.model.js
  const userSchema = new Schema(
    {
      address: { type: String, required: true, index: true, unique: true },
      name: { type: String },
      email: { type: String },
      giverId: { type: String },
      commitTime: { type: String },
      avatar: { type: String },
    },
    {
      timestamps: true,
    },
  );

  const User = mongoose.model('user', userSchema);

  // migrate users to Mongo
  const lineReader = require('readline').createInterface({
    input: require('fs').createReadStream('./users.db'),
  });

  lineReader.on('line', line => {
    const u = JSON.parse(line);

    if (u.address) {
      User.findOne({ address: u.address }).then(existingUser => {
        if (!existingUser) {
          console.log('processing user > ', u);

          new User({
            address: u.address,
            name: u.name || '',
            email: u.email,
            giverId: u.giverId,
            commitTime: u.commitTime,
            avatar: constructNewImageUrl(u.avatar),
          }).save();
        } else {
          console.log('user already migrated :', u._id);
        }
      });
    }
  });
};

/**
 * Migrates milestones.db
 */

const migrateMilestones = () => {
  // schemas as per milestones.model.js
  const Item = new Schema({
    id: { type: String, default: shortid.generate },
    date: { type: Date, required: true },
    description: { type: String, required: true },
    image: { type: String },
    selectedFiatType: { type: String, required: true },
    fiatAmount: { type: String, required: true },
    etherAmount: { type: String },
    wei: { type: String },
    conversionRate: { type: Number, required: true },
    ethConversionRateTimestamp: { type: Date, required: true },
  });

  const milestoneSchema = new Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      image: { type: String },
      maxAmount: { type: String, required: true },
      ownerAddress: { type: String, required: true, index: true },
      reviewerAddress: { type: String, required: true, index: true },
      recipientAddress: { type: String, required: true, index: true },
      campaignReviewerAddress: { type: String, required: true, index: true },
      campaignId: { type: String, required: true, index: true },
      projectId: { type: Number, index: true },
      status: { type: String, required: true },
      items: [Item],
      ethConversionRateTimestamp: { type: Date, required: true },
      selectedFiatType: { type: String, required: true },
      date: { type: Date, required: true },
      fiatAmount: { type: String, required: true },
      etherAmount: { type: String },
      conversionRate: { type: Number, required: true },
      txHash: { type: String },
      pluginAddress: { type: String },
      totalDonated: { type: String },
      donationCount: { type: Number },
      mined: { type: Boolean },
      prevStatus: { type: String },
      performedByAddress: { type: String },

      // these 2 fields should not be stored in mongo
      // but we need them for temporary storage
      // as mongoose virtuals do not persist in after hooks
      message: { type: String },
      messageContext: { type: String },

      // migration
      migratedId: { type: String },
      migration: { type: String },
      migratedProjectId: { type: Number },
    },
    {
      timestamps: true,
    },
  );

  const Milestone = mongoose.model('milestones', milestoneSchema);

  // migrate users to Mongo
  const lines = fs
    .readFileSync('./milestones.db', 'utf-8')
    .split('\n')
    .filter(Boolean);

  const milestones = {};
  lines.forEach(line => {
    let m = JSON.parse(line);
    if (m._id && ['Completed', 'Paid'].includes(m.status)) {
      // Check if this milestone is not missing some values that should be added
      const missingValues = missing[m._id];
      m = Object.assign({}, missingValues, m);

      // Items need to be manually copied
      if (missingValues && missingValues.items) {
        missingValues.items.forEach((item, index) => {
          m.items[index] = Object.assign({}, item, m.items[index]);
        });
      }

      // Check if there are values in this milestone to be overwritten
      const alteredValues = altered[m._id];

      // Items need to be manually copied
      if (alteredValues && alteredValues.items) {
        alteredValues.items.forEach((item, index) => {
          m.items[index] = Object.assign({}, m.items[index], item);
        });

        delete alteredValues.items;
      }

      m = Object.assign({}, m, alteredValues);

      // Store when was the object updated last time or, if unavailable, the date of the conversion rate
      m.lastUpdate =
        m.updatedAt && m.updatedAt.$$date
          ? new Date(m.updatedAt.$$date)
          : new Date(m.ethConversionRateTimestamp * 1000);

      // We have not saved this milestone or the milestone we saved is older than the one we just processed
      if (!milestones[m._id] || milestones[m._id].lastUpdate < m.lastUpdate) milestones[m._id] = m;
    }
  });

  Object.values(milestones).forEach(m => {
    // Save to DB
    Milestone.remove({ migratedId: m._id }, () => {
      Milestone.findOne({ migratedId: m._id })
        .then(existingMilestone => {
          if (!existingMilestone) {
            const newMilestone = new Milestone({
              title: m.title,
              description: m.description,
              image: constructNewImageUrl(m.image),
              maxAmount: m.maxAmount,
              ownerAddress: replaceTestRPC(m.ownerAddress),
              reviewerAddress: replaceTestRPC(m.reviewerAddress),
              recipientAddress: m.recipientAddress,
              campaignReviewerAddress: campaignMap[m.campaignId].campaignReviewerAddress,
              campaignId: campaignMap[m.campaignId].id,
              projectId: -1,
              status: 'Paid',
              items: [],
              ethConversionRateTimestamp: m.ethConversionRateTimestamp * 1000,
              selectedFiatType: m.selectedFiatType,
              date: m.date,
              createdAt: m.date,
              fiatAmount: m.fiatAmount,
              etherAmount: m.etherAmount,
              conversionRate: m.conversionRate,
              txHash: m.txHash,
              pluginAddress: m.pluginAddress,
              totalDonated: m.maxAmount,
              donationCount: 1,
              mined: true,
              prevStatus: m.prevStatus,
              performedByAddress: m.performedByAddress,
              migration: '2018-07-01',
              migratedId: m._id,
              migratedProjectId: m.projectId,
            });

            if (m.items) {
              m.items.forEach(i => {
                const newItem = {
                  id: i.id,
                  date: i.date,
                  description: i.description,
                  image: constructNewImageUrl(i.image),
                  selectedFiatType: i.selectedFiatType,
                  fiatAmount: i.fiatAmount,
                  etherAmount: i.etherAmount,
                  wei: i.wei,
                  conversionRate: i.conversionRate,
                  ethConversionRateTimestamp: i.ethConversionRateTimestamp,
                };

                newMilestone.items.push(newItem);
              });
            }

            newMilestone
              .save()
              .then(() => console.log('migrated milestone : ', m._id))
              .catch(e =>
                console.log('error migrating milestone : ', m._id, Object.keys(e.errors)),
              );
          } else {
            console.log('milestone already migrated :', m._id);
          }
        })
        .catch(e => console.log('could not find milestone : ', m._id, e));
    });
  });
};

/**
 * Lets get the party started!
 # Connect to Mongo and start migrations
 */

mongoose.connect(mongoUrl);
const db = mongoose.connection;

db.on('error', err => console.error('Could not connect to Mongo', err));

// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');

  migrateUsers();
  migrateMilestones();
});
