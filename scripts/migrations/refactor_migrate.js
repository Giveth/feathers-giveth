const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

// NOTE: Run the following directly from mongoshell before running this script

// db.donations.update({}, {$rename:{"ownerId":"ownerTypeId"}}, false, true);
// db.donations.update({}, {$rename:{"owner":"ownerId"}}, false, true);
// db.donations.update({}, {$rename:{"intendedProjectId":"intendedProjectTypeId"}}, false, true);
// db.donations.update({}, {$rename:{"intendedProject":"intendedProjectId"}}, false, true);
// db.donations.update({}, {$rename: {"delegateId":"delegateTypeId"}}, false, true);
// db.donations.update({}, {$rename: {"delegate":"delegateId"}}, false, true);

// development database
const mongoUrl = 'mongodb://localhost:27017/giveth';

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

const Campaign = require('../../src/models/campaigns.model').createModel(app);
// const Conversation = require('../../src/models/conversations.model')(app);
const Dac = require('../../src/models/dacs.model').createModel(app);
const Donation = require('../../src/models/donations.model').createModel(app);
const { DonationStatus } = require('../../src/models/donations.model');
const Events = require('../../src/models/events.model')(app);
const Milestone = require('../../src/models/milestones.model').createModel(app);
const { MilestoneStatus } = require('../../src/models/milestones.model');
const PledgeAdmin = require('../../src/models/pledgeAdmins.model').createModel(app);
const User = require('../../src/models/users.model')(app);
const Item = require('../../src/models/item.model');

const migrateCampaign = () => {
  // re-save all campaigns so the types are updated
  Campaign.find({}).then(campaigns => {
    campaigns.forEach(c => Campaign.update({ _id: c._id }, c).exec());
  });
};
const migrateConversation = () => {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;

  // we need to define the schema here b/c the models/conversation.model
  // schema defines a composite unique index that will fail
  const conversation = new Schema(
    {
      milestoneId: { type: String, required: true, index: true },
      messageContext: { type: String, required: true },
      message: { type: String },
      replyToId: { type: String },
      performedByRole: { type: String, required: true },
      ownerAddress: { type: String, required: true },
      items: [Item],
      txHash: { type: String },
      mined: { type: Boolean, default: false },
    },
    {
      timestamps: true,
    },
  );

  const Conversation = mongooseClient.model('conversation', conversation);

  // re-save all conversations so the types are updated
  const existingVals = {};
  Conversation.find({})
    .sort({ milestoneId: 1, txHash: 1, messageContext: 1 })
    .exec(async (err, conversations) => {
      conversations.forEach(c => {
        // remove any duplicates
        const id = `${c.milestoneId}${c.txHash}${c.messageContext}`;
        if (existingVals[id]) {
          c.remove();
        } else {
          existingVals[id] = true;
          Conversation.update({ _id: c._id }, c).exec();
        }
      });
    });
};
const migrateDac = () => {
  // re-save all dacs so the types are updated
  Dac.find({}, (err, dacs) => {
    dacs.forEach(d => Dac.update({ _id: d._id }, d).exec());
  });
};
const migrateDonation = () => {
  // re-save all donations so the types are updated
  Donation.find({}, (err, donations) => {
    donations.forEach(d => {
      if (d.status === 'pending') {
        d.status = DonationStatus.PENDING;
      } else if (d.status === 'paying') {
        d.status = DonationStatus.PAYING;
      } else if (d.status === 'paid') {
        d.status = DonationStatus.PAID;
      } else if (d.status === 'to_approve') {
        d.status = DonationStatus.TO_APPROVE;
      } else if (d.status === 'waiting') {
        d.status = DonationStatus.WAITING;
      } else if (d.status === 'committed') {
        d.status = DonationStatus.COMMITTED;
      } else if (d.status === 'rejected') {
        d.status = DonationStatus.REJECTED;
      }
      d.amountRemaining = d.amount;
      Donation.update({ _id: d._id }, d).exec();
    });
  });
};
const migrateEvent = () => {
  // re-save all events so the types are updated
  Events.find({}, (err, events) => {
    events.forEach(e => Events.update({ _id: e._id }, e).exec());
  });
};
const migrateMilestone = () => {
  // re-save all milestones so the types are updated
  Milestone.find({}, (err, milestones) => {
    milestones.forEach(m => {
      if (m.status === 'rejected') {
        m.status = MilestoneStatus.REJECTED;
      } else if (m.status === 'proposed') {
        m.status = MilestoneStatus.PROPOSED;
      } else if (m.status === 'pending') {
        m.status = MilestoneStatus.PENDING;
      } else if (m.status === 'paid') {
        m.status = MilestoneStatus.PAID;
      } else if (m.status === 'paying') {
        m.status = MilestoneStatus.PAYING;
      } else if (m.status === 'canceled') {
        m.status = MilestoneStatus.CANCELED;
      }
      Milestone.update({ _id: m._id }, m).exec();
    });
  });
};
const migratePledgeAdmin = () => {
  // re-save all admins so the types are updated
  PledgeAdmin.find({}, (err, admins) => {
    admins.forEach(a => PledgeAdmin.update({ _id: a._id }, a).exec());
  });
};
const migrateUsers = () => {
  // re-save all users so the types are updated
  User.find({}, (err, users) => {
    users.forEach(u => User.update({ _id: u._id }, u).exec());
  });
};
//
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

  migrateCampaign();
  migrateDac();
  migratePledgeAdmin();
  migrateUsers();
  migrateEvent();
  migrateConversation();
  migrateDonation();
  migrateMilestone();
});
