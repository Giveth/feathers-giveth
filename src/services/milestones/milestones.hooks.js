import commons from 'feathers-hooks-common';
import errors from 'feathers-errors';
import logger from 'winston';
import { utils } from 'web3';
import BigNumber from 'bignumber.js';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';
import isProjectAllowed from '../../hooks/isProjectAllowed';
import Notifications from './../../utils/dappMailer';
import { updatedAt, createdAt } from '../../hooks/timestamps';

BigNumber.config({ DECIMAL_PLACES: 8 });

const getMilestones = context => {
  if (context.id) return context.service.get(context.id);
  if (!context.id && context.params.query) return context.service.find(context.params.query);
  return Promise.resolve();
};

const restrict = () => context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();

  const canUpdate = milestone => {
    if (!milestone) throw new errors.Forbidden();

    const reviewers = [milestone.reviewerAddress, milestone.campaignReviewerAddress];

    // reviewers can mark Completed or Canceled
    if (['Completed', 'Canceled'].includes(data.status) && data.mined === false) {
      if (!reviewers.includes(user.address)) {
        throw new errors.Forbidden('Only the reviewer accept or cancel a milestone');
      }

      // whitelist of what the reviewer can update
      const approvedKeys = ['txHash', 'status', 'mined', 'prevStatus'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);

      // mark complete
    } else if (data.status === 'NeedsReview' && milestone.status !== data.status) {
      if (![milestone.recipientAddress, milestone.ownerAddress].includes(user.address)) {
        throw new errors.Forbidden('Only the owner or recipient can mark a milestone complete');
      }

      // whitelist of what can be updated
      const approvedKeys = ['status'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);

      // reject the milestone
    } else if (data.status === 'InProgress' && milestone.status !== data.status) {
      if (!reviewers.includes(user.address)) {
        throw new errors.Forbidden('Only the reviewer reject a milestone');
      }

      // whitelist of what the reviewer can update
      const approvedKeys = ['status'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);

      // accept proposed milestone
    } else if (milestone.status === 'proposed' && data.status === 'pending') {
      if (user.address !== milestone.campaignOwnerAddress) {
        throw new errors.Forbidden('Only the campaign owner can accept a milestone');
      }

      const approvedKeys = ['txHash', 'status', 'mined', 'ownerAddress'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);

      // Reject proposed milestone
    } else if (milestone.status === 'proposed' && user.address === milestone.campaignOwnerAddress) {
      logger.info(`Rejecting proposed milestone with id: ${milestone._id}`);

      const approvedKeys = ['status'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (user.address !== milestone.ownerAddress) {
      throw new errors.Forbidden();
    } else if (milestone.status !== 'proposed') {
      // this data is stored on-chain & can't be updated
      const keysToRemove = [
        'maxAmount',
        'reviewerAddress',
        'recipientAddress',
        'campaignReviewerAddress',
      ];
      keysToRemove.forEach(key => delete data[key]);
    }
  };

  return getMilestones(context).then(
    milestones =>
      Array.isArray(milestones) ? milestones.forEach(canUpdate) : canUpdate(milestones),
  );
};

/**
 *
 * Conditionally sends a notification after patch or create
 *
 * */
const sendNotification = () => context => {
  const { data, app, result } = context;

  /**
   * Notifications when a milestone get created
   * */
  if (context.method === 'create') {
    if (result.status === 'proposed') {
      // find the campaign admin and send a notification that milestone is proposed
      app
        .service('users')
        .find({ query: { address: data.campaignOwnerAddress } })
        .then(users => {
          Notifications.milestoneProposed(app, {
            recipient: users.data[0].email,
            user: users.data[0].name,
            milestoneTitle: data.title,
            campaignTitle: result.campaign.title,
            amount: data.maxAmount,
          });
        })
        .catch(e => logger.error('error sending proposed milestone notification', e));
    }
  }

  /**
   * Notifications when a milestone get patches
   * */
  if (context.method === 'patch') {
    if (result.prevStatus === 'proposed' && result.status === 'InProgress' && result.mined) {
      // find the milestone owner and send a notification that his/her proposed milestone is approved
      Notifications.proposedMilestoneAccepted(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        amount: result.maxAmount,
        txHash: result.txHash,
      });
    }

    if (result.prevStatus === 'proposed' && result.status === 'rejected') {
      // find the milestone owner and send a notification that his/her proposed milestone is rejected
      Notifications.proposedMilestoneRejected(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
      });
    }

    if (result.status === 'NeedsReview') {
      // find the milestone reviewer owner and send a notification that this milestone is been marked as complete and needs review
      Notifications.milestoneRequestReview(app, {
        recipient: result.reviewer.email,
        user: result.reviewer.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
      });
    }

    if (result.status === 'Completed' && result.mined) {
      // find the milestone owner and send a notification that his/her milestone is marked complete
      Notifications.milestoneMarkedCompleted(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
      });
    }

    if (result.prevStatus === 'NeedsReview' && result.status === 'InProgress') {
      // find the milestone reviewer and send a notification that his/her milestone has been rejected by reviewer
      Notifications.milestoneReviewRejected(app, {
        recipient: result.reviewer.email,
        user: result.reviewer.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
      });
    }

    if (result.status === 'Canceled' && result.mined) {
      // find the milestone owner and send a notification that his/her milestone is canceled
      Notifications.milestoneCanceled(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
      });
    }
  }
};

/** *
 * This function checks that the maxAmount in the milestone is based on the correct conversion rate of the milestone date
 * */
const checkEthConversion = () => context => {
  // abort check for internal calls
  if (!context.params.provider) return context;

  const { data, app } = context;
  const { items } = data;

  // skip check if the milestone has been already created
  // FIXME: Even single expense should be stored in data.items. Unnecessary duplicity in code on both frontend and feathers.
  if (!items && !data.fiatAmount && !data.maxAmount && !data.selectedFiatType) return context;

  const calculateCorrectEther = (conversionRate, fiatAmount, etherToCheck, selectedFiatType) => {
    logger.debug(
      'calculating correct ether conversion',
      conversionRate.rates[selectedFiatType],
      fiatAmount,
      etherToCheck,
    );
    // calculate the converion of the item, make sure that fiat-eth is correct
    const rate = conversionRate.rates[selectedFiatType];
    const ether = utils.toWei(new BigNumber(fiatAmount).div(rate).toFixed(18));

    if (ether !== etherToCheck) {
      throw new errors.Forbidden('Conversion rate is incorrect');
    }
  };

  if (items && items.length > 0) {
    // check total amount of milestone, make sure it is correct
    const totalItemEtherAmount = items.reduce(
      (sum, item) => sum.plus(new BigNumber(item.etherAmount)),
      new BigNumber('0'),
    );

    if (utils.toWei(totalItemEtherAmount.toFixed(18)) !== data.maxAmount) {
      throw new errors.Forbidden('Total amount in ether is incorrect');
    }

    // now check that the conversion rate for each milestone is correct
    const promises = items.map(item =>
      app
        .service('ethconversion')
        .find({ query: { date: item.date } })
        .then(conversionRate => {
          calculateCorrectEther(conversionRate, item.fiatAmount, item.wei, item.selectedFiatType);
        }),
    );

    return Promise.all(promises).then(() => context);
  }
  // check that the conversion rate for the milestone is correct
  return app
    .service('ethconversion')
    .find({ query: { date: data.date } })
    .then(conversionRate => {
      calculateCorrectEther(conversionRate, data.fiatAmount, data.maxAmount, data.selectedFiatType);
      return context;
    });
};

/**
 * This function checks that milestones and items are not created in the future, which we disallow at the moment
 * */
const checkMilestoneDates = () => context => {
  // abort check for internal calls
  if (!context.params.provider) return context;

  const { data } = context;
  const { items } = data;

  const today = new Date().setUTCHours(0, 0, 0, 0);
  const todaysTimestamp = Math.round(today) / 1000;

  const checkFutureTimestamp = requestedDate => {
    const date = new Date(requestedDate);
    const timestamp = Math.round(date) / 1000;

    if (todaysTimestamp - timestamp < 0) {
      throw new errors.Forbidden('Future items are not allowed');
    }
  };

  if ((items && items.length) > 0) {
    items.forEach(item => checkFutureTimestamp(item.date));
  } else {
    checkFutureTimestamp(data.date);
  }
  return context;
};

const address = [
  sanitizeAddress('pluginAddress', { required: true, validate: true }),
  sanitizeAddress(['reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'], {
    required: false,
    validate: true,
  }),
];

const canDelete = () => context => {
  const isDeletable = milestone => {
    if (!milestone) throw new errors.NotFound();

    if (!['proposed', 'rejected'].includes(milestone.status)) {
      throw new errors.Forbidden('only proposed milestones can be removed');
    }
  };

  return getMilestones(context).then(milestones => {
    if (Array.isArray(milestones)) milestones.forEach(isDeletable);
    else isDeletable(milestones);
    return context;
  });
};

const schema = {
  include: [
    {
      service: 'users',
      nameAs: 'owner',
      parentField: 'ownerAddress',
      childField: 'address',
    },
    {
      service: 'users',
      nameAs: 'reviewer',
      parentField: 'reviewerAddress',
      childField: 'address',
    },
    {
      service: 'users',
      nameAs: 'campaignReviewer',
      parentField: 'campaignReviewerAddress',
      childField: 'address',
    },
    {
      service: 'users',
      nameAs: 'recipient',
      parentField: 'recipientAddress',
      childField: 'address',
    },
    {
      service: 'campaigns',
      nameAs: 'campaign',
      parentField: 'campaignId',
      childField: '_id',
    },
  ],
};

module.exports = {
  before: {
    all: [],
    find: [
      sanitizeAddress([
        'ownerAddress',
        'pluginAddress',
        'reviewerAddress',
        'campaignReviewerAddress',
        'recipientAddress',
      ]),
    ],
    get: [],
    create: [
      checkEthConversion(),
      checkMilestoneDates(),
      setAddress('ownerAddress'),
      ...address,
      isProjectAllowed(),
      sanitizeHtml('description'),
      createdAt,
    ],
    update: [
      restrict(),
      checkEthConversion(),
      checkMilestoneDates(),
      ...address,
      sanitizeHtml('description'),
      updatedAt,
    ],
    patch: [
      checkEthConversion(),
      restrict(),
      sanitizeAddress(
        ['pluginAddress', 'reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'],
        { validate: true },
      ),
      sanitizeHtml('description'),
      updatedAt,
    ],
    remove: [canDelete()],
  },

  after: {
    all: [commons.populate({ schema })],
    find: [],
    get: [],
    create: [sendNotification()],
    update: [],
    patch: [sendNotification()],
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
