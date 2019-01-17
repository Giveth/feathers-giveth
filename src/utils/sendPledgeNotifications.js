const { DonationStatus } = require('../models/donations.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');

const Notifications = require('./dappMailer');

/**
 *
 * Conditionally sends a notification for a pledge
 *
 * */
const sendNotification = async (app, pledge) => {
  // paid donations are handled by the milestone notifications
  if ([DonationStatus.PAYING, DonationStatus.PAID].includes(pledge.status)) return;

  const getAdmin = (type, id) => {
    if (type === AdminTypes.DAC) {
      return app.service('dacs').get(id);
    } else if (type === AdminTypes.CAMPAIGN) {
      return app.service('campaigns').get(id);
    } else if (type === AdminTypes.MILESTONE) {
      return app.service('milestones').get(id);
    }
    return app.service('users').get(id);
  };

  const pledgeAdmin = await getAdmin(
    pledge.delegateType || pledge.ownerType,
    pledge.delegateTypeId || pledge.ownerTypeId,
  );

  // this is an initial donation
  if (pledge.homeTxHash) {
    try {
      const giver = await app.service('users').get(pledge.giverAddress);

      // thank giver if they are registered
      if (giver.email) {
        Notifications.donation(app, {
          recipient: giver.email,
          user: giver.name,
          amount: pledge.amount,
          token: pledge.token,
          donationType: pledge.delegateType || pledge.ownerType,
          donatedToTitle: pledgeAdmin.title || pledgeAdmin.name,
        });
      }
    } catch (e) {
      // ignore missing giver
    }
  }

  // pledge has been delegated, notify the giver
  if (pledge.status === DonationStatus.TO_APPROVE) {
    try {
      const giver = await app.service('users').get(pledge.giverAddress);

      if (giver.email) {
        const intendedAdmin = await getAdmin(
          pledge.intendedProjectType,
          pledge.intendedProjectTypeId,
        );

        Notifications.donationDelegated(app, {
          recipient: giver.email,
          user: giver.name,
          delegationType: pledge.intendedProjectType,
          delegatedToTitle: intendedAdmin.title,
          delegateType: pledge.delegateType,
          delegateTitle: pledgeAdmin.title || pledgeAdmin.name,
          commitTime: pledge.commitTime,
          amount: pledge.amount,
          token: pledge.token,
        });
      }
    } catch (e) {
      // ignore missing giver
    }
  } else if (pledge.delegateType || pledge.ownerType === AdminTypes.CAMPAIGN) {
    // notify the pledge admin
    // if this is a DAC or a campaign, then the donation needs delegation
    Notifications.delegationRequired(app, {
      recipient: pledgeAdmin.owner.email,
      user: pledgeAdmin.owner.name,
      txHash: pledge.txHash,
      donationType: pledge.delegateType || pledge.ownerType, // dac / campaign
      donatedToTitle: pledgeAdmin.title || pledgeAdmin.name,
      amount: pledge.amount,
      token: pledge.token,
    });
  } else {
    // if this is a milestone then no action is required
    Notifications.donationReceived(app, {
      recipient: pledgeAdmin.owner.email,
      user: pledgeAdmin.owner.name,
      txHash: pledge.txHash,
      donationType: pledge.ownerType,
      donatedToTitle: pledgeAdmin.title,
      amount: pledge.amount,
      token: pledge.token,
    });
  }
};

module.exports = sendNotification;
