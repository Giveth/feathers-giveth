const { ObjectId } = require('mongoose').Types;
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');

const findSimilarDelegatedConversation = (
  app,
  { milestoneId, txHash, currencySymbol },
  projection = {},
) => {
  const conversationModel = app.service('conversations').Model;
  return conversationModel.findOne(
    {
      milestoneId,
      txHash,
      'payments.symbol': currencySymbol,
      messageContext: CONVERSATION_MESSAGE_CONTEXT.DELEGATED,
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
};
