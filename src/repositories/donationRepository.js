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
 * @param from: Date, example: 2018-06-08T16:05:28.005Z
 * @param to: Date: example: 2021-06-08T16:05:28.005Z
 * @param projectIds: Array<number>, example: [1340, 2723]
 * @returns {
 * Promise<
   [{
    "giverAddress" : string,
    "totalAmount" : number,
    "donations" : [
      {
        "usdValue": number,
        "amount": number,
        "homeTxHash": string,
        "giverAddress": string,
        "createdAt": string // sample: "2019-04-22T22:14:23.046Z",
        "token": string //sample : "ETH",
        "delegateId": number
        "ownerId": number
      }
    ]
  }]
  >}
 */
const listOfUserDonorsOnVerifiedProjects = async (app, { verifiedProjectIds, from, to }) => {
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
            delegateId: { $in: verifiedProjectIds },
            intendedProjectId: { $exists: false },
          },

          // it's for traces and campaigns
          { ownerId: { $in: verifiedProjectIds } },
        ],
        amount: { $ne: '0' },
        usdValue: { $ne: 0 },
        isReturn: false,
      },
    },
    {
      $project: {
        giverAddress: 1,
        usdValue: 1,
        amount: 1,
        homeTxHash: 1,
        ownerId: 1,
        delegateId: 1,
        tokenAddress: 1,
        createdAt: 1,
        _id: 0,
      },
    },
    {
      $group: {
        _id: '$giverAddress',
        totalAmount: { $sum: '$usdValue' },
        donations: { $push: '$$ROOT' },
      },
    },
    {
      $sort: { totalAmount: -1 },
    },
    {
      $project: {
        giverAddress: '$_id',
        donations: 1,
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
