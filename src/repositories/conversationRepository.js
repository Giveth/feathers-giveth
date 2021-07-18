const { ObjectId } = require('mongoose').Types;
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');

const findSimilarDelegatedConversation = (
  app,
  { traceId, txHash, currencySymbol },
  projection = {},
) => {
  const conversationModel = app.service('conversations').Model;
  return conversationModel.findOne(
    {
      traceId,
      txHash,
      'payments.symbol': currencySymbol,
      messageContext: CONVERSATION_MESSAGE_CONTEXT.DELEGATED,
    },
    projection,
  );
};

const findSimilarPayoutConversation = (app, { traceId, txHash }, projection = {}) => {
  const conversationModel = app.service('conversations').Model;
  return conversationModel.findOne(
    {
      traceId,
      txHash,
      messageContext: CONVERSATION_MESSAGE_CONTEXT.PAYOUT,
    },
    projection,
  );
};

const updateConversationPayments = (app, { conversationId, payments }) => {
  const conversationModel = app.service('conversations').Model;
  return conversationModel.findOneAndUpdate(
    { _id: ObjectId(conversationId) },
    {
      payments,
    },
    {
      new: true,
    },
  );
};

module.exports = {
  findSimilarDelegatedConversation,
  updateConversationPayments,
  findSimilarPayoutConversation,
};
