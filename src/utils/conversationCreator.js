const logger = require('winston');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');
const { getTransaction } = require('../blockchain/lib/web3Helpers');

const createDonatedConversation = async (
  app,
  { milestoneId, donationId, homeTxHash, payments, giverAddress, actionTakerAddress },
) => {
  const data = {
    milestoneId,
    messageContext: CONVERSATION_MESSAGE_CONTEXT.DONATED,
    donationId,
    txHash: homeTxHash,
    payments,
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
  { milestoneId, donationId, txHash, payments, parentDonations, actionTakerAddress },
) => {
  const [firstParentId] = parentDonations;
  const firstParent = await app.service('donations').get(firstParentId);
  const data = {
    milestoneId,
    messageContext: CONVERSATION_MESSAGE_CONTEXT.DELEGATED,
    donationId,
    txHash,
    payments,
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

module.exports = { createDonatedConversation, createDelegatedConversation };
