/* eslint-disable no-unused-vars */
import errors from '@feathersjs/errors';
import commons from 'feathers-hooks-common';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import addConfirmations from '../../hooks/addConfirmations';
import { DonationStatus } from '../../models/donations.model';
import { AdminTypes } from '../../models/pledgeAdmins.model';
import { MilestoneStatus } from '../../models/milestones.model';

const restrict = () => context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();

  const getDonations = () => {
    if (context.id)
      return service.get(context.id, { paginate: false, schema: 'includeTypeDetails' });
    if (!context.id && context.params.query)
      return service.find({
        paginate: false,
        query: context.params.query,
        schema: 'includeTypeDetails',
      });
    return undefined;
  };

  const canUpdate = donation => {
    if (!donation) throw new errors.Forbidden();

    if (
      data.status === 'pending' &&
      (data.intendedProjectId || data.delegateId !== donation.delegateId)
    ) {
      // delegate made this call
      if (
        user.address !== donation.ownerId &&
        user.address !== donation.delegateEntity.ownerAddress
      )
        throw new errors.Forbidden();

      // whitelist of what the delegate can update
      const approvedKeys = [
        'txHash',
        'status',
        'delegate',
        'delegateId',
        'intendedProject',
        'intendedProjectId',
        'intendedProjectType',
      ];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (
      (donation.ownerType === 'giver' && user.address !== donation.ownerId) ||
      (donation.ownerType !== 'giver' && user.address !== donation.ownerEntity.ownerAddress)
    ) {
      throw new errors.Forbidden();
    }
  };

  return getDonations().then(
    donations => (Array.isArray(donations) ? donations.forEach(canUpdate) : canUpdate(donations)),
  );
};

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
        parentField: 'ownerId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-campaign-intended': {
    include: [
      {
        service: 'campaigns',
        nameAs: 'intendedEntity',
        parentField: 'intendedProject',
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
        parentField: 'delegateId',
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
        parentField: 'ownerId',
        childField: '_id',
        useInnerPopulate: true,
      },
    ],
  },
  'po-milestone-intended': {
    include: [
      {
        service: 'milestones',
        nameAs: 'intendedEntity',
        parentField: 'intendedProject',
        childField: 'projectId',
        useInnerPopulate: true,
      },
    ],
  },
};

// a bit of a hacky way to be able to revert donations if the tx failed.
const stashDonationIfPending = () => context => {
  // only deal with single donation patchs
  if (!context.id) return context;

  const { data } = context;

  if (data.status === 'pending') {
    return context.app
      .service('donations')
      .get(context.id)
      .then(donation => {
        data.previousState = donation;

        return context;
      })
      .catch(console.error);
  }

  // if not pending status, remove previousState from donation as it isn't needed
  if (data.$unset) {
    data.$unset.previousState = true;
  } else {
    data.$unset = {
      previousState: true,
    };
  }

  return context;
};

const joinDonationRecipient = (item, context) => {
  const newContext = Object.assign({}, context, { result: item });

  let ownerSchema;
  // if this is po-giver schema, we need to change the `nameAs` to ownerEntity
  if (item.ownerType.toLowerCase() === 'giver') {
    ownerSchema = poSchemas['po-giver-owner'];
  } else {
    ownerSchema = poSchemas[`po-${item.ownerType.toLowerCase()}`];
  }

  return commons
    .populate({ schema: ownerSchema })(newContext)
    .then(
      context =>
        item.delegate ? commons.populate({ schema: poSchemas['po-dac'] })(context) : context,
    )
    .then(
      context =>
        Number(item.intendedProject) > 0
          ? commons.populate({
              schema: poSchemas[`po-${item.intendedProjectType.toLowerCase()}-intended`],
            })(context)
          : context,
    )
    .then(context => context.result);
};

const updateMilestoneIfNotPledged = () => context => {
  commons.checkContext(context, 'before', ['create']);

  const { data: donation } = context;

  if (
    donation.ownerType === AdminTypes.MILESTONE &&
    [DonationStatus.PAYING, DonationStatus.PAID].includes(donation.status)
  ) {
    return context.app.service('milestones').patch(donation.ownerTypeId, {
      status:
        donation.status === DonationStatus.PAYING ? MilestoneStatus.PAYING : MilestoneStatus.PAID,
      // mined: true
    });
  }
};

const updateType = () => context => {
  const updateEntity = data => {
    let serviceName;
    let id;
    let donationQuery;

    if (data.ownerType.toLowerCase() === 'giver') {
      return Promise.resolve(context);
    } else if (data.ownerType.toLowerCase() === 'campaign') {
      serviceName = 'campaigns';
      id = data.ownerId;
      donationQuery = { ownerId: id, $select: ['ownerId'] };
    } else if (data.ownerType.toLowerCase() === 'milestone') {
      serviceName = 'milestones';
      id = data.ownerId;
      donationQuery = { ownerId: id, $select: ['ownerId'] };
    } else if (data.delegateId) {
      serviceName = 'dacs';
      id = data.delegateId;
      donationQuery = { delegateId: id, $select: ['ownerId'] };
    }

    const service = context.app.service(serviceName);

    if (!service) return Promise.resolve();

    return service
      .get(id)
      .then(entity => {
        let totalDonated = entity.totalDonated || 0;
        let donationCount = entity.donationCount || 0;
        let peopleCount = entity.peopleCount || 0;

        if (typeof donationCount !== 'number') {
          donationCount = parseInt(donationCount);
        }

        context.app
          .service('donations/history')
          .find({
            paginate: false,
            query: donationQuery,
            $select: ['ownerId'],
          })
          .then(donationsForEntity => {
            peopleCount = new Set(donationsForEntity.map(d => d.ownerId)).size;

            const amount = toBN(data.amount);
            if (amount > 0) donationCount += 1; // incoming donation
            totalDonated = toBN(totalDonated)
              .add(amount)
              .toString();

            return service.patch(entity._id, { donationCount, totalDonated, peopleCount });
          });
      })
      .catch(error => {
        console.error(error); // eslint-disable-line no-console
        return context;
      });
  };

  const updateEntities = data => {
    const toData = {
      ownerType: data.ownerType,
      ownerId: data.ownerId,
      delegateId: data.delegateId,
      amount: data.amount,
    };

    if (!data.fromDonationId) return updateEntity(toData);

    const fromData = {
      ownerType: data.fromOwnerType,
      ownerId: data.fromOwnerId,
      delegateId: data.delegateId,
      amount: `-${data.amount}`,
    };

    return Promise.all([updateEntity(toData), updateEntity(fromData)]);
  };

  if (Array.isArray(context.data)) {
    return Promise.all([...context.data.map(updateEntities)]).then(() => context);
  }

  return updateEntities(context.data).then(() => context);
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
      setAddress('giverAddress'),
      sanitizeAddress('giverAddress', {
        required: true,
        validate: true,
      }),
      updateMilestoneIfNotPledged(),
    ],
    update: [restrict(), sanitizeAddress('giverAddress', { validate: true })],
    patch: [
      restrict(),
      sanitizeAddress('giverAddress', { validate: true }),
      stashDonationIfPending(),
    ],
    remove: [commons.disallow()],
  },

  after: {
    all: [populateSchema()],
    find: [addConfirmations()],
    get: [addConfirmations()],
    create: [],
    update: [],
    patch: [],
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
