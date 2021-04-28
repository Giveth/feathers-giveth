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

const aggregatePayments = ({ payments, newPayment }) => {
  const similarPaymentIndex = payments.findIndex(p => p.symbol === newPayment.symbol);
  if (similarPaymentIndex >= 0) {
    payments[similarPaymentIndex].amount = toBN(payments[similarPaymentIndex].amount)
      .add(toBN(newPayment.amount))
      .toString();
  } else {
    payments.push(newPayment);
  }
  return payments;
};
async function addPaymentToExistingPayoutConversation({ payment, similarPayout, app }) {
  await updateConversationPayments(app, {
    conversationId: similarPayout._id,
    payments: aggregatePayments({ payments: similarPayout.payments, newPayment: payment }),
  });
}

async function addPaymentToExistingDelegatedConversation(payment, similarDelegation, app) {
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
  { milestoneId, performedByAddress, timestamp, payment, txHash },
) {
  try {
    const service = app.service('conversations');
    const similarPayout = await findSimilarPayoutConversation(app, {
      milestoneId,
      txHash,
    });
    if (similarPayout) {
      return addPaymentToExistingPayoutConversation({ payment, similarPayout, app });
    }
    const data = {
      milestoneId,
      messageContext: CONVERSATION_MESSAGE_CONTEXT.PAYOUT,
      createdAt: timestamp,
      txHash,
      payments: [payment],
    };
    return service.create(data, { performedByAddress });
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
    return addPaymentToExistingDelegatedConversation(payment, similarDelegation, app);
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
  createPayoutConversation,
  createRecipientChangedConversation,
  aggregatePayments,
};
