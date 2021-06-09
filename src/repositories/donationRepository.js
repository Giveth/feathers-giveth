const { DonationBridgeStatus, DonationStatus } = require('../models/donations.model');

const updateBridgePaymentExecutedTxHash = async (
  app,
  { txHash, bridgePaymentExecutedTxHash, bridgePaymentExecutedTime },
) => {
  const donationModel = app.service('donations').Model;
  return donationModel.updateMany(
    { txHash, status: DonationStatus.PAID },
    {
      $set: {
        bridgeStatus: DonationBridgeStatus.PAID,
        bridgePaymentExecutedTxHash,
        bridgePaymentExecutedTime,
      },
    },
  );
};
const updateBridgePaymentAuthorizedTxHash = async (
  app,
  { txHash, bridgePaymentAuthorizedTxHash },
) => {
  const donationModel = app.service('donations').Model;
  return donationModel.updateMany(
    { txHash, status: DonationStatus.PAID },
    {
      $set: {
        bridgePaymentAuthorizedTxHash,
      },
    },
  );
};

const isAllDonationsPaidOut = async (app, { txHash, traceId }) => {
  const donationModel = app.service('donations').Model;
  const notPaidOutDonationsCount = await donationModel.count({
    txHash,
    status: DonationStatus.PAID,
    ownerTypeId: traceId,
    // after payout  bridgePaymentExecutedTxHash field should be filled
    bridgePaymentExecutedTxHash: {
      $exists: false,
    },
  });
  return notPaidOutDonationsCount === 0;
};

/**
 *
 * @param app: feathers instance
 * @param from: Date, example: 2021-06-08T16:05:28.005Z
 * @param to: Date: example: 2021-06-08T16:05:28.005Z
 * @param projectIds: Array<number>, example: [1340, 2723]
 * @returns {
 * Promise<
   [{
    "_id" : "0x3ba20bC27c2B65C98A5aBF922a34e6Eb3108A9CB",
    "totalAmount" : 10.43,
    "donations" : [
      {
       donation
      }
    ],
    "giver" : {
     //userInfo
    }
  }]
  >}
 */
const listOfUserDonorsOnVerifiedProjects = async (app, { projectIds, from, to }) => {
  const donationModel = app.service('donations').Model;
  return donationModel.aggregate([
    {
      $match: {
        status: {
          $in: ['Waiting', 'Committed'],
        },
        createdAt: {
          $gte: from,
          $lte: to,
        },

        homeTxHash: { $exists: true },
        $or: [
          {
            // it's for communities
            delegateId: { $in: projectIds },
            intendedProjectId: { $exists: false },
          },

          // it's for traces and campaigns
          { ownerId: { $in: projectIds } },
        ],
        amount: { $ne: '0' },
        usdValue: { $ne: 0 },
        isReturn: false,
      },
    },

    {
      $group: {
        _id: '$giverAddress',
        totalAmount: { $sum: '$usdValue' },
        donationIds: { $push: '$_id' },
      },
    },

    {
      $lookup: {
        from: 'users',
        let: { giverAddress: '$_id' },
        pipeline: [
          {
            $match: { $expr: { $eq: ['$address', '$$giverAddress'] } },
          },
        ],
        as: 'giver',
      },
    },
    {
      $unwind: '$giver',
    },
    {
      $lookup: {
        from: 'donations',
        let: { donationIds: '$donationIds' },
        pipeline: [
          {
            $match: { $expr: { $in: ['$_id', '$$donationIds'] } },
          },
        ],
        as: 'donations',
      },
    },
    {
      $project: {
        // giverAddress: '$_id',
        donations: 1,
        giver: 1,
        totalAmount: 1,
        _id: 0,
      },
    },
  ]);
};

module.exports = {
  updateBridgePaymentExecutedTxHash,
  updateBridgePaymentAuthorizedTxHash,
  isAllDonationsPaidOut,
  listOfUserDonorsOnVerifiedProjects,
};
