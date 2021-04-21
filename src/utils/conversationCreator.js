const logger = require('winston');
const { toBN } = require('web3-utils');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');
const { getTransaction } = require('../blockchain/lib/web3Helpers');
const {
  findSimilarDelegatedConversation,
  findSimilarPayoutConversation,
  updateConversationPayments,
} = require('../repositories/conversationRepository');

async function updateSimilarPayoutConversationPayments({ payment, similarPayout, app }) {
  const newPayment = {
    symbol: payment.symbol,
    decimals: payment.decimals,
    amount: toBN(payment.amount)
      .add(toBN(similarPayout.payments[0].amount))
      .toString(),
  };
  await updateConversationPayments(app, {
    conversationId: similarPayout._id,
    payments: [newPayment],
  });
}

async function updateSimilarDelegatedConversationPayments(payment, similarDelegation, app) {
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

// eslint-disable-next-line consistent-return
async function createPayoutConversation(
  app,
  { milestoneId, recipientAddress, donationId, timestamp, payment, txHash },
) {
  try {
    const service = app.service('conversations');
    const similarPayout = await findSimilarPayoutConversation(app, {
      milestoneId,
      txHash,
    });
    if (similarPayout) {
      return updateSimilarPayoutConversationPayments({ payment, similarPayout, app });
    }
    const data = {
      milestoneId,
      messageContext: CONVERSATION_MESSAGE_CONTEXT.PAYOUT,
      donationId,
      createdAt: timestamp,
      txHash,
      payments: [payment],
    };
    return service.create(data, { performedByAddress: recipientAddress });
  } catch (e) {
    logger.error('createPayoutConversation error', e);
  }
}

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
    return updateSimilarDelegatedConversationPayments(payment, similarDelegation, app);
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

  return app.service('conversations').create(data, { performedByAddress: actionTakerAddress });
};

module.exports = {
  createDonatedConversation,
  createDelegatedConversation,
  createPayoutConversation,
  updateSimilarPayoutConversationPayments,
};
