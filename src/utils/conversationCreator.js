const logger = require('winston');
const { toBN } = require('web3-utils');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');
const { getTransaction } = require('../blockchain/lib/web3Helpers');
const {
  findSimilarDelegatedConversation,
  updateConversationPayments,
} = require('../repositories/conversationRepository');

const createDonatedConversation = async (
  app,
  { milestoneId, donationId, homeTxHash, payment, giverAddress, actionTakerAddress },
) => {
  const data = {
    milestoneId,
    messageContext: CONVERSATION_MESSAGE_CONTEXT.DONATED,
    donationId,
    txHash: homeTxHash,
    payments: [payment],
    donorId: giverAddress,
    donorType: AdminTypes.GIVER,
  };
  try {
    const { timestamp } = await getTransaction(app, homeTxHash, true);
    data.createdAt = timestamp;
  } catch (e) {
    data.createdAt = new Date();
    logger.error(`Error on getting tx ${homeTxHash} info`, e);
  }

  return app.service('conversations').create(data, { performedByAddress: actionTakerAddress });
};

async function updateSimilarDelegatedConvesationPayments(payment, similarDelegation, app) {
  const newPayment = {
    symbol: payment.symbol,
    decimals: payment.decimals,
    amount: toBN(payment.amount)
      .add(toBN(similarDelegation.payments[0].amount))
      .toString(),
  };
  await updateConversationPayments(app, {
    conversationId: similarDelegation._id,
    payments: [newPayment],
  });
}

const createDelegatedConversation = async (
  app,
  { milestoneId, donationId, txHash, payment, parentDonations, actionTakerAddress },
) => {
  const similarDelegation = await findSimilarDelegatedConversation(app, {
    milestoneId,
    txHash,
    currencySymbol: payment.symbol,
  });
  if (similarDelegation) {
    await updateSimilarDelegatedConvesationPayments(payment, similarDelegation, app);
    return;
  }
  const [firstParentId] = parentDonations;
  const firstParent = await app.service('donations').get(firstParentId);
  const data = {
    milestoneId,
    messageContext: CONVERSATION_MESSAGE_CONTEXT.DELEGATED,
    donationId,
    txHash,
    payments: [payment],
    donorId: firstParent.delegateTypeId ? firstParent.delegateTypeId : firstParent.ownerTypeId,
    donorType: firstParent.delegateTypeId ? AdminTypes.DAC : firstParent.ownerType,
  };
  try {
    const { timestamp } = await getTransaction(app, txHash, false);
    data.createdAt = timestamp;
  } catch (e) {
    data.createdAt = new Date();
    logger.error(`Error on getting tx ${txHash} info`, e);
  }

  await app.service('conversations').create(data, { performedByAddress: actionTakerAddress });
};

const createRecipientChangedConversation = async (
  app,
  { milestoneId, newRecipientAddress, timestamp, txHash, from },
) => {
  const data = {
    milestoneId,
    messageContext: CONVERSATION_MESSAGE_CONTEXT.RECIPIENT_CHANGED,
    recipientAddress: newRecipientAddress,
    txHash,
    createdAt: timestamp,
  };
  return app.service('conversations').create(data, { performedByAddress: from });
};

module.exports = {
  createDonatedConversation,
  createDelegatedConversation,
  createRecipientChangedConversation,
};
