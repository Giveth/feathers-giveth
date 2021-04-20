const { ObjectId } = require('mongoose').Types;
const { DonationBridgeStatus } = require('../models/donations.model');

const updateBridgePaymentExecutedTxHash = async (
  app,
  { donationId, bridgePaymentExecutedTxHash, bridgePaymentExecutedTime },
) => {
  const donationModel = app.service('donations').Model;
  return donationModel.findOneAndUpdate(
    { _id: ObjectId(donationId) },
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
  { donationId, bridgePaymentAuthorizedTxHash },
) => {
  const donationModel = app.service('donations').Model;
  return donationModel.findOneAndUpdate(
    { _id: ObjectId(donationId) },
    {
      bridgePaymentAuthorizedTxHash,
    },
    {
      new: true,
    },
  );
};

module.exports = { updateBridgePaymentExecutedTxHash, updateBridgePaymentAuthorizedTxHash };
