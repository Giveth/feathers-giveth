/* eslint-disable no-unused-vars */
const BigNumber = require('bignumber.js');
const errors = require('@feathersjs/errors');
const commons = require('feathers-hooks-common');
const logger = require('winston');

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const addConfirmations = require('../../hooks/addConfirmations');
const tokenAddressConversion = require('../../hooks/tokenAddressConversion');
const { DonationStatus } = require('../../models/donations.model');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { MilestoneStatus } = require('../../models/milestones.model');
const { getHourlyCryptoConversion } = require('../conversionRates/getConversionRatesService');
const { ZERO_ADDRESS, getTransaction } = require('../../blockchain/lib/web3Helpers');
const { getTokenByAddress } = require('../../utils/tokenHelper');
const { updateDonationEntityCountersHook } = require('./updateEntityCounters');

const poSchemas = {
  'po-giver': {
    include: [
      {
        service: 'users',
        nameAs: 'giver',
        parentField: 'giverAddress',
        childField: 'address',
      },
    ],
  },
  'po-giver-owner': {
    include: [
      {
        service: 'users',
        nameAs: 'ownerEntity',
        parentField: 'giverAddress',
        childField: 'address',
      },
    ],
  },
  'po-campaign': {
    include: [
      {
        service: 'campaigns',
        nameAs: 'ownerEntity',
        parentField: 'ownerTypeId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-campaign-intended': {
    include: [
      {
        service: 'campaigns',
        nameAs: 'intendedProjectEntity',
        parentField: 'intendedProjectId',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
  'po-dac': {
    include: [
      {
        service: 'dacs',
        nameAs: 'delegateEntity',
        parentField: 'delegateTypeId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-milestone': {
    include: [
      {
        service: 'milestones',
        nameAs: 'ownerEntity',
        parentField: 'ownerTypeId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-milestone-intended': {
    include: [
      {
        service: 'milestones',
        nameAs: 'intendedProjectEntity',
        parentField: 'intendedProjectId',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
};

const donationResolvers = {
  joins: {
    token: () => async (donation, context) => {
      const { tokenAddress } = donation;
      const token = getTokenByAddress(tokenAddress);
      if (token) {
        donation.token = token;
      }
    },
  },
};

const convertTokenToTokenAddress = () => context => {
  const { data } = context;
  if (data.token) {
    data.tokenAddress = data.token.address;
  }
  return context;
};

const setUSDValue = async (context, donation) => {
  if (donation.status === DonationStatus.PENDING) return donation;

  if ([DonationStatus.PAYING, DonationStatus.PAID].includes(donation.status)) {
    const parentDonations = await context.app
      .service('donations')
      .find({ paginate: false, query: { _id: { $in: donation.parentDonations } } });

    return context.app.service('donations').patch(
      donation._id,
      {
        usdValue: parentDonations.reduce((val, d) => val + (d.usdValue || 0), 0),
      },
      {
        skipUSDValueUpdate: true,
        skipEntityCounterUpdate: true,
      },
    );
  }

  const { _id, createdAt, token, amount } = donation;
  try {
    const { rate } = await getHourlyCryptoConversion(context.app, createdAt, token.symbol, 'USD');

    if (rate) {
      const usVar = Number(
        new BigNumber(amount)
          .div(10 ** 18)
          .times(rate)
          .toFixed(2),
      );
      return context.app.service('donations').patch(
        _id,
        {
          usdValue: usVar,
        },
        {
          skipUSDValueUpdate: true,
          skipEntityCounterUpdate: true,
        },
      );
    }

    return donation;
  } catch (e) {
    logger.error(`Error setting usdValue for donation: ${donation._id}`, e);
    return donation;
  }
};

const setUSDValueHook = () => async context => {
  commons.checkContext(context, 'after', ['create', 'patch']);

  // prevent recursive calls
  if (context.params.skipUSDValueUpdate) return context;

  if (Array.isArray(context.result)) {
    context.result = await Promise.all(context.result.map(setUSDValue.bind(null, context)));
  } else {
    context.result = await setUSDValue(context, context.result);
  }
  return context;
};

/**
 * Set the updatedAt of the campaign when a donation to the campaign or a campaign's milestone occurs
 */
const setEntityUpdated = () => async context => {
  commons.checkContext(context, 'after', ['create', 'patch']);

  const update = async donation => {
    if (donation.ownerType === AdminTypes.CAMPAIGN) {
      context.app.service('campaigns').patch(
        null,
        { updatedAt: donation.createdAt },
        {
          query: {
            _id: donation.ownerTypeId,
            updatedAt: { $lt: donation.createdAt },
          },
        },
      );
    } else if (donation.ownerType === AdminTypes.MILESTONE) {
      const milestone = await context.app.service('milestones').get(donation.ownerTypeId);
      context.app.service('campaigns').patch(
        null,
        { updatedAt: donation.createdAt },
        {
          query: {
            _id: milestone.campaignId,
            updatedAt: { $lt: donation.createdAt },
          },
        },
      );
    }
  };

  if (Array.isArray(context.result)) {
    context.result.forEach(update);
  } else {
    update(context.result);
  }
  return context;
};

const restrict = () => async context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();

  let donations = [];
  if (context.id)
    donations = await service.get(context.id, { paginate: false, schema: 'includeTypeDetails' });
  if (!context.id && context.params.query)
    donations = await service.find({
      paginate: false,
      query: context.params.query,
      schema: 'includeTypeDetails',
    });

  const canUpdate = async donation => {
    if (!donation) throw new errors.Forbidden();

    // whitelist of what the delegate can update
    const approvedKeys = ['pendingAmountRemaining'];

    if (
      donation.status === DonationStatus.TO_APPROVE &&
      [donation.ownerEntity.ownerAddress, donation.ownerEntity.address].includes(user.address)
    ) {
      // owner can also update status as 'COMMITTED' or 'REJECTED'
      if (![DonationStatus.COMMITTED, DonationStatus.REJECTED].includes(data.status)) {
        throw new errors.BadRequest('status can only be updated to `Committed` or `Rejected`');
      }
      approvedKeys.push('status');
    } else if (
      (donation.status === DonationStatus.WAITING &&
        donation.delegateEntity &&
        user.address === donation.delegateEntity.ownerAddress) ||
      [donation.ownerEntity.ownerAddress, donation.ownerEntity.address].includes(user.address)
    ) {
      // owner || delegate made this call, they can update `pendingAmountRemaining`
    } else {
      throw new errors.Forbidden();
    }

    const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
    keysToRemove.forEach(key => delete data[key]);
  };

  if (Array.isArray(donations)) {
    await Promise.all(donations.map(canUpdate));
  } else {
    await canUpdate(donations);
  }
  return context;
};

const joinDonationRecipient = (item, context) => {
  const newContext = { ...context, result: item };

  let ownerSchema;
  // if this is po-giver schema, we need to change the `nameAs` to ownerEntity
  if (item.ownerType === AdminTypes.GIVER) {
    ownerSchema = poSchemas['po-giver-owner'];
  } else {
    ownerSchema = poSchemas[`po-${item.ownerType.toLowerCase()}`];
  }

  return commons
    .populate({ schema: ownerSchema })(newContext)
    .then(c => (item.delegateId ? commons.populate({ schema: poSchemas['po-dac'] })(c) : c))
    .then(c =>
      item.intendedProjectId > 0 && item.intendedProjectType
        ? commons.populate({
            schema: poSchemas[`po-${item.intendedProjectType.toLowerCase()}-intended`],
          })(c)
        : c,
    )
    .then(c => c.result);
};

const updateMilestoneIfNotPledged = () => async context => {
  commons.checkContext(context, 'before', ['create']);

  const { data: donation } = context;
  const { COMMITTED, PAYING, PAID } = DonationStatus;

  if (donation.ownerType === AdminTypes.MILESTONE && [PAYING, PAID].includes(donation.status)) {
    const milestone = await context.app.service('milestones').get(donation.ownerTypeId);
    const { maxAmount, reviewerAddress, fullyFunded } = milestone;

    // never set uncapped or without-reviewer non-fullyFunded milestones as PAID
    const hasReviewer = reviewerAddress && reviewerAddress !== ZERO_ADDRESS;
    if (!maxAmount || (!fullyFunded && !hasReviewer)) return;

    const donations = await context.app.service('donations').find({
      paginate: false,
      query: {
        ownerTypeId: donation.ownerTypeId,
        status: { $in: [COMMITTED, PAYING] },
        amountRemaining: { $ne: '0' },
      },
    });

    // if there are still committed donations, don't mark the as paid or paying
    if (donations.some(d => d.status === COMMITTED)) return;

    const hasPayingDonation = donations.some(d => d.status === PAYING);

    context.app.service('milestones').patch(donation.ownerTypeId, {
      status:
        donation.status === PAYING || hasPayingDonation
          ? MilestoneStatus.PAYING
          : MilestoneStatus.PAID,
    });
  }
};

const addActionTakerAddress = () => async context => {
  const { txHash, actionTakerAddress, homeTxHash } = context.data;

  // Has already added or txHash/homeTxHash is not available
  if (!(txHash || homeTxHash) || actionTakerAddress) return;

  try {
    const { app } = context;
    const { from } = await getTransaction(app, homeTxHash || txHash, !!homeTxHash);
    context.data.actionTakerAddress = from;
  } catch (e) {
    logger.error(`Error on getting from of transaction: ${txHash}`, e);
  }
};

const setLessThanCutoff = async (context, donation) => {
  const { _id, amountRemaining, token, status } = donation;

  if (!amountRemaining) return donation;

  const { COMMITTED, WAITING, TO_APPROVE, PAYING } = DonationStatus;
  if (token && [COMMITTED, TO_APPROVE, WAITING, PAYING].includes(status)) {
    // amountRemaining equal or greater than 1, has at least 18 digits
    // It will be greater than cut-off value (10 ** (-1 * token.decimals)), if
    // it has digits not less than 18 - token.decimals
    // amountRemaining type is String
    const lessThanCutoff = amountRemaining.length <= 18 - Number(token.decimals);
    if (donation.lessThanCutoff !== lessThanCutoff) {
      return context.app.service('donations').patch(
        _id,
        {
          lessThanCutoff,
        },
        {
          skipLessThanCutoffUpdate: true,
          skipEntityCounterUpdate: true,
        },
      );
    }
  }
  return donation;
};

const setLessThanCutoffHook = () => async context => {
  commons.checkContext(context, 'after', ['create', 'patch']);

  // prevent recursive calls
  if (context.params.skipLessThanCutoffUpdate) return context;

  if (Array.isArray(context.result)) {
    context.result = await Promise.all(context.result.map(setLessThanCutoff.bind(null, context)));
  } else {
    context.result = await setLessThanCutoff(context, context.result);
  }
  return context;
};

const populateSchema = () => context => {
  if (context.params.schema === 'includeGiverDetails') {
    return commons.populate({ schema: poSchemas['po-giver'] })(context);
  }
  if (['includeTypeDetails', 'includeTypeAndGiverDetails'].includes(context.params.schema)) {
    if (context.params.schema === 'includeTypeAndGiverDetails') {
      commons.populate({ schema: poSchemas['po-giver'] })(context);
    }

    const items = commons.getItems(context);

    // items may be undefined if we are removing by id;
    if (items === undefined) return context;

    if (Array.isArray(items)) {
      const promises = items.map(item => joinDonationRecipient(item, context));

      return Promise.all(promises).then(results => {
        commons.replaceItems(context, results);
        return context;
      });
    }
    return joinDonationRecipient(items, context).then(result => {
      commons.replaceItems(context, result);
      return context;
    });
  }

  return context;
};

module.exports = {
  before: {
    all: [tokenAddressConversion(), commons.paramsFromClient('schema')],
    find: [sanitizeAddress('giverAddress')],
    get: [],
    create: [
      sanitizeAddress('giverAddress', {
        required: true,
        validate: true,
      }),
      updateMilestoneIfNotPledged(),
      addActionTakerAddress(),
      convertTokenToTokenAddress(),
    ],
    update: [commons.disallow()],
    patch: [
      restrict(),
      sanitizeAddress('giverAddress', { validate: true }),
      addActionTakerAddress(),
      convertTokenToTokenAddress(),
    ],
    remove: [commons.disallow()],
  },

  after: {
    all: [commons.fastJoin(donationResolvers), populateSchema()],
    find: [addConfirmations()],
    get: [addConfirmations()],
    create: [
      setUSDValueHook(),
      updateDonationEntityCountersHook(),
      setEntityUpdated(),
      setLessThanCutoffHook(),
    ],
    update: [],
    patch: [
      setUSDValueHook(),
      updateDonationEntityCountersHook(),
      setEntityUpdated(),
      setLessThanCutoffHook(),
    ],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
