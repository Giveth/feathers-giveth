const logger = require('winston');

const { DonationStatus } = require('../models/donations.model');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const Notifications = require('./dappMailer');
const { getTransaction } = require('../blockchain/lib/web3Helpers');
/**
 *
 * Conditionally sends a notification for a pledge
 *
 * */
const sendNotification = async (app, pledge) => {
  const {
    amount,
    token,
    actionTakerAddress,
    delegateType,
    commitTime,
    status,
    ownerTypeId,
    delegateTypeId,
    intendedProjectType,
    intendedProjectTypeId,
    txHash,
    ownerType,
    homeTxHash,
    giverAddress,
    parentDonations,
  } = pledge;

  // paid donations are handled by the milestone notifications
  if ([DonationStatus.PAYING, DonationStatus.PAID].includes(status)) return;

  const getAdmin = (type, id) => {
    if (type === AdminTypes.DAC) {
      return app.service('dacs').get(id);
    }
    if (type === AdminTypes.CAMPAIGN) {
      return app.service('campaigns').get(id);
    }
    if (type === AdminTypes.MILESTONE) {
      return app.service('milestones').get(id);
    }
    return app.service('users').get(id);
  };

  const pledgeAdmin = await getAdmin(delegateType || ownerType, delegateTypeId || ownerTypeId);

  // this is an initial donation
  if (homeTxHash) {
    try {
      const giver = await app.service('users').get(giverAddress);

      // thank giver if they are registered
      if (giver.email) {
        Notifications.donation(app, {
          recipient: giver.email,
          user: giver.name,
          amount,
          token,
          donationType: delegateType || ownerType,
          donatedToTitle: pledgeAdmin.title || pledgeAdmin.name,
        });
      }
    } catch (e) {
      // ignore missing giver
    }
  }

  // pledge has been delegated, notify the giver
  if (status === DonationStatus.TO_APPROVE) {
    try {
      const giver = await app.service('users').get(giverAddress);

      if (giver.email) {
        const intendedAdmin = await getAdmin(intendedProjectType, intendedProjectTypeId);

        Notifications.donationDelegated(app, {
          recipient: giver.email,
          user: giver.name,
          delegationType: intendedProjectType,
          delegatedToTitle: intendedAdmin.title,
          delegateType,
          delegateTitle: pledgeAdmin.title || pledgeAdmin.name,
          commitTime,
          amount,
          token,
        });
      }
    } catch (e) {
      // ignore missing giver
    }
  } else if (delegateType || ownerType === AdminTypes.CAMPAIGN) {
    // notify the pledge admin
    // if this is a DAC or a campaign, then the donation needs delegation
    Notifications.delegationRequired(app, {
      recipient: pledgeAdmin.owner.email,
      user: pledgeAdmin.owner.name,
      txHash,
      donationType: delegateType || ownerType, // dac / campaign
      donatedToTitle: pledgeAdmin.title || pledgeAdmin.name,
      amount,
      token,
    });
  } else {
    // if this is a milestone then no action is required

    // pledge = donation, pledgeAdmin= milestone,  performedByAddress:pledge.actionTakerAddress
    const { owner } = pledgeAdmin;

    Notifications.donationReceived(app, {
      recipient: owner.email,
      user: owner.name,
      txHash,
      donationType: ownerType,
      donatedToTitle: pledgeAdmin.title,
      amount,
      token,
    });

    // Create conversation

    let conversationModel;
    // Original event made the donation. For direct donations user makes donation in home network
    // but for delegate in foreign network
    let eventTxHash;

    const directDonation = !!homeTxHash;

    // Direct donation
    if (directDonation) {
      eventTxHash = homeTxHash;
      conversationModel = {
        milestoneId: pledgeAdmin._id,
        messageContext: 'donated',
        txHash: homeTxHash,
        payments: [
          {
            symbol: token.symbol,
            amount,
            decimals: token.decimals,
          },
        ],
        donorId: giverAddress,
        donorType: AdminTypes.GIVER,
      };
    }
    // Delegate
    else {
      eventTxHash = txHash;

      const [firstParentId] = parentDonations;
      const firstParent = await app.service('donations').get(firstParentId);
      let donorType;
      let donorId;
      if (firstParent.delegateTypeId) {
        donorType = AdminTypes.DAC;
        donorId = firstParent.delegateTypeId;
      } else {
        donorType = firstParent.ownerType;
        donorId = firstParent.ownerTypeId;
      }

      conversationModel = {
        milestoneId: pledgeAdmin._id,
        messageContext: 'delegated',
        txHash,
        payments: [
          {
            symbol: token.symbol,
            amount,
            decimals: token.decimals,
          },
        ],
        donorType,
        donorId,
      };
    }

    try {
      const { timestamp } = await getTransaction(app, eventTxHash, directDonation);
      conversationModel.createdAt = timestamp;
    } catch (e) {
      conversationModel.createdAt = new Date();
      logger.error(`Error on getting tx ${eventTxHash} info`, e);
    }

    await app
      .service('conversations')
      .create(conversationModel, { performedByAddress: actionTakerAddress });
  }
};

module.exports = sendNotification;
