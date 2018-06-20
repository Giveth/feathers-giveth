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
import addConfirmations from '../../hooks/addConfirmations';

/* eslint no-underscore-dangle: 0 */

BigNumber.config({ DECIMAL_PLACES: 18 });

/**
 * Milestone states enum
 */
const MILESTONE = {
  PROPOSED: 'proposed',
  REJECTED: 'rejected',
  PENDING: 'pending',
  INPROGRESS: 'InProgress',
  NEEDSREVIEW: 'NeedsReview',
  COMPLETED: 'Completed',
  CANCELED: 'Canceled',
};

/**
 * Get keys that can be updated based on the state of the milestone and the user's permission
 *
 * @param milestone  Current milestone data that are saved
 * @param data       New milestone data that are being saved
 * @param user       Address of the user making the modification
 */
const getApprovedKeys = (milestone, data, user) => {
  const reviewers = [milestone.reviewerAddress, milestone.campaignReviewerAddress];

  // Fields that can be editted BEFORE milestone is created on the blockchain
  const editMilestoneKeys = [
    'title',
    'description',
    'maxAmount',
    'reviewerAddress',
    'recipientAddress',
    'ethConversionRateTimestamp',
    'selectedFiatType',
    'date',
    'fiatAmount',
    'conversionRate',
    'items',
    'message',
    'image',
  ];

  // Fields that can be editted once milestone stored on the blockchain
  const editMilestoneKeysOnChain = ['title', 'description', 'message', 'mined'];

  switch (milestone.status) {
    case MILESTONE.PROPOSED:
      // Accept proposed milestone by Campaign Manager
      if (data.status === MILESTONE.PENDING) {
        if (user.address !== milestone.campaign.ownerAddress) {
          throw new errors.Forbidden('Only the Campaing Manager can accept a milestone');
        }
        logger.info(`Accepting proposed milestone with id: ${milestone._id} by: ${user.address}`);

        return ['txHash', 'status', 'mined', 'ownerAddress', 'message'];
      }

      // Reject proposed milestone by Campaign Manager
      if (data.status === MILESTONE.REJECTED) {
        if (user.address !== milestone.campaign.ownerAddress) {
          throw new errors.Forbidden('Only the Campaign Manager can reject a milestone');
        }
        logger.info(`Rejecting proposed milestone with id: ${milestone._id} by: ${user.address}`);

        return ['status', 'message'];
      }

      // Editing milestone can be done by Milestone or Campaing Manager
      if (data.status === MILESTONE.PROPOSED) {
        if (![milestone.ownerAddress, milestone.campaign.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Manager can edit proposed milestone',
          );
        }
        logger.info(
          `Editing milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );

        return editMilestoneKeys;
      }
      break;

    case MILESTONE.REJECTED:
      // Editing milestone can be done by Milestone Manager
      if (data.status === MILESTONE.REJECTED) {
        if (user.address !== milestone.ownerAddress) {
          throw new errors.Forbidden('Only the Milestone Manager can edit rejected milestone');
        }
        logger.info(
          `Editing milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );
        return editMilestoneKeys;
      }

      // Re-proposing milestone can be done by Milestone Manager
      if (data.status === MILESTONE.PROPOSED) {
        if (user.address !== milestone.ownerAddress) {
          throw new errors.Forbidden('Only the Milestone Manager can repropose rejected milestone');
        }
        logger.info(`Reproposing rejected milestone with id: ${milestone._id} by: ${user.address}`);
        return ['status', 'message'];
      }
      break;

    case MILESTONE.INPROGRESS:
      // Mark milestone complete by Recipient or Milestone Manager
      if (data.status === MILESTONE.NEEDSREVIEW) {
        if (![milestone.recipientAddress, milestone.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone Manager or Recipient can mark a milestone complete',
          );
        }
        logger.info(`Marking milestone as complete. Milestone id: ${milestone._id}`);

        return ['status', 'mined', 'message'];
      }

      // Cancel milestone by Campaign or Milestone Reviewer
      if (data.status === MILESTONE.CANCELED && data.mined === false) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Reviewer can cancel a milestone',
          );
        }

        return ['txHash', 'status', 'mined', 'prevStatus', 'message'];
      }

      // Editing milestone can be done by Campaign or Milestone Manager
      if (data.status === MILESTONE.INPROGRESS) {
        if (![milestone.ownerAddress, milestone.campaign.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Milestone and Campaign Manager can edit milestone');
        }
        logger.info(`Editing milestone In Progress with id: ${milestone._id} by: ${user.address}`);
        return editMilestoneKeysOnChain;
      }
      break;

    case MILESTONE.NEEDSREVIEW:
      // Approve milestone completed by Campaign or Milestone Reviewer
      if (data.status === MILESTONE.COMPLETED && data.mined === false) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Reviewer can approve milestone has been completed',
          );
        }
        logger.info(`Approving milestone complete with id: ${milestone._id} by: ${user.address}`);
        return ['txHash', 'status', 'mined', 'prevStatus', 'message'];
      }

      // Reject milestone completed by Campaign or Milestone Reviewer
      if (data.status === MILESTONE.INPROGRESS) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Reviewer can reject that milestone has been completed',
          );
        }
        logger.info(`Rejecting milestone complete with id: ${milestone._id} by: ${user.address}`);
        return ['status', 'mined', 'message'];
      }

      // Cancel milestone by Campaign or Milestone Reviewer
      if (data.status === MILESTONE.CANCELED && data.mined === false) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Reviewer can cancel a milestone',
          );
        }
        logger.info(
          `Cancelling milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );
        return ['txHash', 'status', 'mined', 'prevStatus', 'message'];
      }

      // Editing milestone can be done by Milestone or Campaign Manager
      if (data.status === MILESTONE.NEEDSREVIEW) {
        if (![milestone.ownerAddress, milestone.campaign.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Milestone and Campaign Manager can edit milestone');
        }
        logger.info(
          `Editing milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );
        return editMilestoneKeysOnChain;
      }
      break;

    // States that do not have any action
    case MILESTONE.PENDING:
    case MILESTONE.COMPLETED:
    case MILESTONE.CANCELED:
    default:
      break;
  }

  // Unknown action, disallow everything
  return [];
};

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

    const approvedKeys = getApprovedKeys(milestone, data, user);

    // Remove the keys that are not allowed
    Object.keys(data).forEach(key => {
      if (!approvedKeys.includes(key)) delete data[key];
    });

    // Milestone is not yet on chain, check the ETH conversion
    if (['proposed', 'rejected'].includes(milestone.status)) {
      return checkEthConversion()(context);
    }
    // Milestone is on chain, remove data stored on-chain that can't be updated
    const keysToRemove = [
      'maxAmount',
      'reviewerAddress',
      'recipientAddress',
      'campaignReviewerAddress',
      'ethConversionRateTimestamp',
      'fiatAmount',
      'conversionRate',
      'selectedFiatType',
      'date',
    ];
    keysToRemove.forEach(key => delete data[key]);

    if (data.items) {
      data.items = data.items.map(({ date, description, image }) =>
        Object.assign(
          {},
          {
            date,
            description,
            image,
          },
        ),
      );
    }

    // needed b/c we need to call checkEthConversion for proposed milestones
    // which is async
    return Promise.resolve();
  };

  return getMilestones(context).then(
    milestones =>
      Array.isArray(milestones)
        ? Promise.all(milestones.forEach(canUpdate))
        : canUpdate(milestones),
  );
};

/**
 *
 * Conditionally sends a notification after patch or create
 *
 * */
const sendNotification = () => context => {
  const { data, app, result, params } = context;
  const { user } = params;

  const _createConversion = (app, data, txHash, messageContext, user) => {
    app
      .service('conversations')
      .create({
        milestoneId: data._id,
        message: data.message,
        messageContext,
        user,
        txHash,
      })
      .then(res => logger.info('created conversation!', res._id))
      .catch(e => logger.error('could not create conversation', e));
  };

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
   * This only gets triggered when the txHash is received through a milestone event
   * Which basically means the event is really mined
   * */
  if (context.method === 'patch' && context.params.eventTxHash) {
    if (result.prevStatus === 'proposed' && result.status === 'InProgress') {
      _createConversion(app, result, context.params.eventTxHash, 'proposedAccepted', user);

      // find the milestone owner and send a notification that his/her proposed milestone is approved
      Notifications.proposedMilestoneAccepted(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        amount: result.maxAmount,
        txHash: result.txHash,
        message: result.message,
      });
    }

    if (result.status === 'NeedsReview') {
      // find the milestone reviewer owner and send a notification that this milestone is been marked as complete and needs review
      _createConversion(app, result, context.params.eventTxHash, result.status, user);

      Notifications.milestoneRequestReview(app, {
        recipient: result.reviewer.email,
        user: result.reviewer.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (result.status === 'Completed' && result.mined) {
      _createConversion(app, result, context.params.eventTxHash, result.status, user);

      // find the milestone owner and send a notification that his/her milestone is marked complete
      Notifications.milestoneMarkedCompleted(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (result.prevStatus === 'NeedsReview' && result.status === 'InProgress') {
      _createConversion(app, result, context.params.eventTxHash, 'rejected', user);

      // find the milestone reviewer and send a notification that his/her milestone has been rejected by reviewer
      Notifications.milestoneReviewRejected(app, {
        recipient: result.reviewer.email,
        user: result.reviewer.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (result.status === 'Canceled' && result.mined) {
      _createConversion(app, result, context.params.eventTxHash, result.status, user);

      // find the milestone owner and send a notification that his/her milestone is canceled
      Notifications.milestoneCanceled(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }
  }

  if (context.method === 'patch' && !context.params.eventTxHash) {
    if (result.prevStatus === 'proposed' && result.status === 'rejected') {
      _createConversion(app, result, 'proposedRejected', user);

      // find the milestone owner and send a notification that his/her proposed milestone is rejected
      Notifications.proposedMilestoneRejected(app, {
        recipient: result.owner.email,
        user: result.owner.name,
        milestoneTitle: result.title,
        campaignTitle: result.campaign.title,
        message: result.message,
      });
    }

    if (result.prevStatus === 'rejected' && result.status === 'proposed') {
      _createConversion(app, result, 'rePropose', user);
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

const storePrevState = () => context => {
  // do not update prevStatus when triggered by contract event
  // it has already been set
  if (context.data.status && !context.params.eventTxHash) {
    return getMilestones(context).then(milestone => {
      context.data.prevStatus = milestone.status;
      return context;
    });
  }

  return context;
};

/**
 * Stores the address of the user who patched (= performed action on) the milestone
 * */

const performedBy = () => context => {
  // do not process internal calls as they have no user
  if (!context.params.provider) return context;

  context.data.performedByAddress = context.params.user.address;
  return context;
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
    ],
    update: [restrict(), checkMilestoneDates(), ...address, sanitizeHtml('description')],
    patch: [
      restrict(),
      sanitizeAddress(
        ['pluginAddress', 'reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'],
        { validate: true },
      ),
      sanitizeHtml('description'),
      storePrevState(),
      performedBy(),
    ],
    remove: [canDelete()],
  },

  after: {
    all: [commons.populate({ schema })],
    find: [addConfirmations()],
    get: [addConfirmations()],
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
