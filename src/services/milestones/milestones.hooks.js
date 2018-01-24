import commons from 'feathers-hooks-common';
import errors from 'feathers-errors';
import logger from 'winston';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';
import isProjectAllowed from '../../hooks/isProjectAllowed';
import Notifications from './../../utils/dappMailer';
import { updatedAt, createdAt } from '../../hooks/timestamps';

const restrict = () => context => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const { user } = context.params;

  if (!user) throw new errors.NotAuthenticated();

  const getMilestones = () => {
    if (context.id) return service.get(context.id);
    if (!context.id && context.params.query)
      return service.find(context.params.query);
    return undefined;
  };

  const canUpdate = milestone => {
    if (!milestone) throw new errors.Forbidden();

    const reviewers = [
      milestone.reviewerAddress,
      milestone.campaignReviewerAddress,
    ];

    // reviewers can mark Completed or Canceled
    if (['Completed', 'Canceled'].includes(data.status) && data.mined === false) {

      if (!reviewers.includes(user.address)) {
        throw new errors.Forbidden(
          'Only the reviewer accept or cancel a milestone',
        );
      }

      // whitelist of what the reviewer can update
      const approvedKeys = ['txHash', 'status', 'mined', 'prevStatus'];

      const keysToRemove = Object.keys(data).map(
        key => !approvedKeys.includes(key),
      );
      keysToRemove.forEach(key => delete data[key]);
    } else if (data.status === 'InProgress' && milestone.status !== data.status) {
      // reject milestone
      if (!reviewers.includes(user.address)) {
        throw new errors.Forbidden('Only the reviewer reject a milestone');
      }

      // whitelist of what the reviewer can update
      const approvedKeys = ['status'];

      const keysToRemove = Object.keys(data).map(
        key => !approvedKeys.includes(key),
      );
      keysToRemove.forEach(key => delete data[key]);
    } else if (milestone.status === 'proposed' && data.status === 'pending') {
      // accept proposed milestone
      if (user.address !== milestone.campaignOwnerAddress) {
        throw new errors.Forbidden(
          'Only the campaign owner can accept a milestone',
        );
      }

      const approvedKeys = ['txHash', 'status', 'mined', 'ownerAddress'];

      const keysToRemove = Object.keys(data).map(
        key => !approvedKeys.includes(key),
      );
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

  return getMilestones().then(
    milestones =>
      Array.isArray(milestones)
        ? milestones.forEach(canUpdate)
        : canUpdate(milestones),
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
        .catch(e =>
          logger.error('error sending proposed milestone notification', e),
        );
    }
  }

  /**
   * Notifications when a milestone get patches
   * */
  if (context.method === 'patch') {
    if (
      result.prevStatus === 'proposed' &&
      result.status === 'InProgress' &&
      result.mined
    ) {
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

const address = [
  sanitizeAddress('pluginAddress', { required: true, validate: true }),
  sanitizeAddress(
    ['reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'],
    { required: false, validate: true },
  ),
];

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
      setAddress('ownerAddress'),
      ...address,
      isProjectAllowed(),
      sanitizeHtml('description'),
      createdAt
    ],
    update: [restrict(), ...address, sanitizeHtml('description'), updatedAt],
    patch: [
      restrict(),
      sanitizeAddress(
        [
          'pluginAddress',
          'reviewerAddress',
          'campaignReviewerAddress',
          'recipientAddress',
        ],
        { validate: true },
      ),
      sanitizeHtml('description'),
      updatedAt
    ],
    remove: [commons.disallow()],
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
