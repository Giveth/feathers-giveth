const logger = require('winston');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');

const tokenKey = (symbol, ownerType, type) => `${ownerType}_${symbol}_${type}`;
const TokenKeyType = {
  BALANCE: 'balance',
  REQUESTED: 'requested',
  HOLD: 'hold',
  PAID: 'paid',
};

module.exports = {
  factory: app => {
    const dappUrl = app.get('dappUrl');

    const userService = app.service('users');
    const donationService = app.service('donations');

    const { etherscan, homeEtherscan } = app.get('blockchain');

    // Transform donations related to a campaign to csv items
    const getEntityLink = (entity, type) => {
      switch (type) {
        case AdminTypes.CAMPAIGN:
          return `${dappUrl}/campaigns/${entity._id.toString()}`;

        case AdminTypes.MILESTONE:
          return `${dappUrl}/campaigns/${entity.campaignId}/milestones/${entity._id.toString()}`;

        case AdminTypes.GIVER:
          return `${dappUrl}/profile/${entity.address}`;
        default:
          return '';
      }
    };

    const getEtherscanLink = txHash => {
      if (!etherscan || !txHash) return undefined;

      return `${etherscan}tx/${txHash}`;
    };

    const getHomeEtherscanLink = txHash => {
      if (!homeEtherscan || !txHash) return undefined;

      return `${homeEtherscan}tx/${txHash}`;
    };
    const donationDelegateStatus = async parentDonationId => {
      if (!parentDonationId) {
        return {
          isDelegate: false,
        };
      }

      const [parent] = await donationService.find({
        query: {
          _id: parentDonationId,
          $select: [
            'parentDonations',
            'status',
            'ownerTypeId',
            'ownerType',
            'delegateType',
            'delegateTypeId',
          ],
        },
        paginate: false,
      });

      if (!parent) {
        logger.error(`No parent donation with id ${parentDonationId} found`);
        return {
          isDelegate: false,
        };
      }

      const {
        status,
        delegateTypeId,
        delegateType,
        ownerTypeId,
        parentDonations,
        ownerType,
      } = parent;

      if (status === DonationStatus.COMMITTED) {
        return {
          isDelegate: true,
          parentOwnerTypeId: delegateTypeId || ownerTypeId,
          parentOwnerType: delegateType || ownerType,
        };
      }

      if (parentDonations.length === 0) {
        return {
          isDelegate: false,
        };
      }

      return donationDelegateStatus(parentDonations[0]);
    };

    const getUser = async address => {
      const [user] = await userService.find({
        query: {
          address,
          $select: ['name'],
          $limit: 1,
        },
        paginate: false,
      });
      return user;
    };

    return {
      getEntityLink,
      getEtherscanLink,
      getHomeEtherscanLink,
      getUser,
      donationDelegateStatus,
    };
  },
  tokenKey,
  TokenKeyType,
};
