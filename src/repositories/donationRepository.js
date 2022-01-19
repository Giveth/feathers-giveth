const { ObjectId } = require('mongoose').Types;
const { DonationBridgeStatus, DonationStatus } = require('../models/donations.model');

const getTotalUsdValueDonatedToCampaign = async (app, { campaignId }) => {
  const donationModel = app.service('donations').Model;
  const result = await donationModel.aggregate([
    {
      $match: {
        campaignId,
        homeTxHash: { $exists: true },
      },
    },
    {
      $group: {
        _id: 'donations',
        totalUsdValue: { $sum: { $toDouble: '$usdValue' } },
      },
    },
  ]);
  return result.length !== 0 ? result[0].totalUsdValue : 0;
};

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

const findDonationById = (app, { donationId }) => {
  const donationModel = app.service('donations').Model;
  return donationModel.findOne({ _id: ObjectId(donationId) });
};

const findParentDonation = (app, { parentDonations }) => {
  if (parentDonations.length === 0) {
    return undefined;
  }
  return findDonationById(app, { donationId: parentDonations[0] });
};

/**
 *
 * @param app: feathers instance
 * @param from: Date, example: 2018-06-08T16:05:28.005Z
 * @param to: Date: example: 2021-06-08T16:05:28.005Z
 * @param projectIds ?: Array<number>, example: [1340, 2723]
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
const listOfDonorsToVerifiedProjects = async (app, { verifiedProjectIds, from, to }) => {
  const donationModel = app.service('donations').Model;
  // If verifiedProjectIds is falsy it means we should use all donations
  const orCondition = verifiedProjectIds
    ? [
        {
          // it's for communities
          delegateId: { $in: verifiedProjectIds },
          intendedProjectId: { $exists: false },
        },

        // it's for traces and campaigns
        { ownerId: { $in: verifiedProjectIds } },
      ]
    : [
        {
          // it's for communities
          delegateId: { $exists: true },
          intendedProjectId: { $exists: false },
        },

        // it's for traces and campaigns
        { ownerId: { $exists: true }, ownerType: { $in: ['campaign', 'trace'] } },
      ];

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
        $or: orCondition,
        amount: { $ne: '0' },
        usdValue: { $ne: 0 },
        isReturn: false,
      },
    },
    {
      $sort: {
        createdAt: -1,
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
      $lookup: {
        from: 'communities',
        let: { delegateId: '$delegateId' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$delegateId', '$$delegateId'] },
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
            },
          },
        ],
        as: 'community',
      },
    },
    {
      $lookup: {
        from: 'campaigns',
        let: { projectId: '$ownerId' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$projectId', '$$projectId'] },
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
            },
          },
        ],
        as: 'campaign',
      },
    },
    {
      $lookup: {
        from: 'traces',
        let: { projectId: '$ownerId' },
        pipeline: [
          {
            $match: {
              projectId: { $exists: true },
              $expr: { $eq: ['$projectId', '$$projectId'] },
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
              campaignId: 1,
            },
          },
        ],
        as: 'trace',
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
  listOfDonorsToVerifiedProjects,
  findParentDonation,
  findDonationById,
  getTotalUsdValueDonatedToCampaign,
};
