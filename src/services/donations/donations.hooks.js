/* eslint-disable no-unused-vars */
const BigNumber = require('bignumber.js');
const errors = require('@feathersjs/errors');
const commons = require('feathers-hooks-common');
const logger = require('winston');

const sanitizeAddress = require('../../hooks/sanitizeAddress');
const addConfirmations = require('../../hooks/addConfirmations');
const { DonationStatus } = require('../../models/donations.model');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { MilestoneStatus } = require('../../models/milestones.model');
const {
  getHourlyUSDCryptoConversion,
} = require('../../services/conversionRates/getConversionRatesService');

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

  const { createdAt } = donation;
  try {
    const { rate } = await getHourlyUSDCryptoConversion(
      context.app,
      createdAt,
      donation.token.symbol,
    );

    if (rate) {
      return context.app.service('donations').patch(
        donation._id,
        {
          usdValue: Number(
            new BigNumber(donation.amount)
              .div(10 ** Number(donation.token.decimals))
              .times(rate)
              .toFixed(2),
          ),
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
  const newContext = Object.assign({}, context, { result: item });

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
    .then(
      c =>
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
  if (
    donation.ownerType === AdminTypes.MILESTONE &&
    [DonationStatus.PAYING, DonationStatus.PAID].includes(donation.status)
  ) {
    const milestone = await context.app.service('milestones').get(donation.ownerTypeId);
    // never set uncapped milestones as PAID
    if (!milestone.maxAmount) return;

    const donations = await context.app.service('donations').find({
      paginate: false,
      query: {
        status: { $in: [DonationStatus.COMMITTED, DonationStatus.PAYING] },
        amountRemaining: { $ne: '0' },
      },
    });

    // if there are still committed donations, don't mark the as paid or paying
    if (donations.some(d => d.status === DonationStatus.COMMITTED)) return;

    const atLeastOneDonationPaying = donations.some(d => d.status === DonationStatus.PAYING);

    context.app.service('milestones').patch(donation.ownerTypeId, {
      status:
        donation.status === atLeastOneDonationPaying || DonationStatus.PAYING
          ? MilestoneStatus.PAYING
          : MilestoneStatus.PAID,
    });
  }
};

const populateSchema = () => context => {
  if (context.params.schema === 'includeGiverDetails') {
    return commons.populate({ schema: poSchemas['po-giver'] })(context);
  } else if (['includeTypeDetails', 'includeTypeAndGiverDetails'].includes(context.params.schema)) {
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
    all: [commons.paramsFromClient('schema')],
    find: [sanitizeAddress('giverAddress')],
    get: [],
    create: [
      sanitizeAddress('giverAddress', {
        required: true,
        validate: true,
      }),
      updateMilestoneIfNotPledged(),
    ],
    update: [commons.disallow()],
    patch: [restrict(), sanitizeAddress('giverAddress', { validate: true })],
    remove: [commons.disallow()],
  },

  after: {
    all: [populateSchema()],
    find: [addConfirmations()],
    get: [addConfirmations()],
    create: [setUSDValueHook(), updateDonationEntityCountersHook(), setEntityUpdated()],
    update: [],
    patch: [setUSDValueHook(), updateDonationEntityCountersHook(), setEntityUpdated()],
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
