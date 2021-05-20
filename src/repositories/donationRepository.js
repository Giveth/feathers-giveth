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

module.exports = {
  updateBridgePaymentExecutedTxHash,
  updateBridgePaymentAuthorizedTxHash,
  isAllDonationsPaidOut,
};
