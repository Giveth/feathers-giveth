const { ObjectId } = require('mongoose').Types;
const { DonationBridgeStatus } = require('../models/donations.model');

const updateBridgePaymentExecutedTxHash = async (
  app,
  { txHash, bridgePaymentExecutedTxHash, bridgePaymentExecutedTime },
) => {
  const donationModel = app.service('donations').Model;
  return donationModel.findOneAndUpdate(
    { txHash },
    {
      bridgeStatus: DonationBridgeStatus.PAID,
      bridgePaymentExecutedTxHash,
      bridgePaymentExecutedTime,
    },
    {
      new: true,
    },
  );
};
const updateBridgePaymentAuthorizedTxHash = async (
  app,
  { txHash, bridgePaymentAuthorizedTxHash },
) => {
  const donationModel = app.service('donations').Model;
  return donationModel.findOneAndUpdate(
    { txHash },
    {
      bridgePaymentAuthorizedTxHash,
    },
    {
      new: true,
    },
  );
};

module.exports = { updateBridgePaymentExecutedTxHash, updateBridgePaymentAuthorizedTxHash };
