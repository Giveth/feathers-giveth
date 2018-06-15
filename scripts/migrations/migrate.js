const mongoose = require('mongoose');
const altered = require('./altered.js');
const missing = require('./missing.js');

const Schema = mongoose.Schema;
const shortid = require('shortid');

// development database
const baseUploadUrl = 'localhost:3010/uploads';
const mongoUrl = 'mongodb://localhost:27017/giveth';

/**
 * Constructs new image url
 */
const constructNewImageUrl = url => {
  if (url) {
    return baseUploadUrl + url.split('/uploads')[1];
  }
};

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

          newUser = new User({
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
      summary: { type: String },
      image: { type: String },
      maxAmount: { type: String, required: true },
      ownerAddress: { type: String, required: true, index: true },
      reviewerAddress: { type: String, required: true, index: true },
      recipientAddress: { type: String, required: true, index: true },
      campaignReviewerAddress: { type: String, required: true, index: true },
      campaignId: { type: String, required: true, index: true },
      projectId: { type: String, index: true },
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
    },
    {
      timestamps: true,
    },
  );

  const Milestone = mongoose.model('milestones', milestoneSchema);

  // migrate users to Mongo
  const lineReader = require('readline').createInterface({
    input: require('fs').createReadStream('./milestones.db'),
  });

  lineReader.on('line', line => {
    let m = JSON.parse(line);

    if (m._id && ['Completed', 'Paid'].includes(m.status)) {
      Milestone.findOne({ migratedId: m._id }).then(existingMilestone => {
        if (!existingMilestone) {
          // Check if this milestone is not missing some values that would should be added
          const missingValues = missing[m._id];
          m = Object.assign({}, missingValues, m);

          // Items need to be manually copied
          if (missingValues && missingValues.items) {
            missingValues.items.forEach((item, index) => {
              m.items[index] = Object.assign({}, item, m.items[index]);
            });
          }

          // Check if we there are values to be overwritten
          const alteredValues = altered[m._id];

          // Items need to be manually copied
          if (alteredValues && alteredValues.items) {
            alteredValues.items.forEach((item, index) => {
              m.items[index] = Object.assign({}, m.items[index], item);
            });
          }

          delete alteredValues.items;
          m = Object.assign({}, m, alteredValues);

          newMilestone = new Milestone({
            title: m.title,
            description: m.description,
            summary: m.summary,
            image: constructNewImageUrl(m.image),
            maxAmount: m.maxAmount,
            ownerAddress: m.ownerAddress,
            reviewerAddress: m.reviewerAddress,
            recipientAddress: m.recipientAddress,
            campaignReviewerAddress: m.campaignReviewerAddress,
            campaignId: m.campaignId,
            projectId: m.projectId,
            status: 'Paid',
            items: [],
            ethConversionRateTimestamp: m.ethConversionRateTimestamp * 1000,
            selectedFiatType: m.selectedFiatType,
            date: m.date,
            fiatAmount: m.fiatAmount,
            etherAmount: m.etherAmount,
            conversionRate: m.conversionRate,
            txHash: m.txHash,
            pluginAddress: m.pluginAddress,
            totalDonated: m.totalDonated,
            mined: m.mined,
            prevStatus: m.prevStatus,
            performedByAddress: m.performedByAddress,
            obsolete: true,
            migratedId: m._id,
          });

          m.items &&
            m.items.map(i => {
              newItem = {
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

          newMilestone
            .save()
            .then(() => console.log('migrated milestone : ', m._id))
            .catch(e => console.log('error migrating milestone : ', m._id, Object.keys(e.errors)));
        } else {
          // console.log('milestone already migrated :', m._id)
        }
      });
    }
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
