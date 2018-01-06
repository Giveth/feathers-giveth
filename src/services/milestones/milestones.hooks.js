import commons from 'feathers-hooks-common';
import errors from 'feathers-errors';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';
import isProjectAllowed from '../../hooks/isProjectAllowed';
import Notifications from './../../utils/dappMailer';


const restrict = () => (context) => {
  // internal call are fine
  if (!context.params.provider) return context;

  const { data, service } = context;
  const user = context.params.user;

  if (!user) throw new errors.NotAuthenticated();

  const getMilestones = () => {
    if (context.id) return service.get(context.id);
    if (!context.id && context.params.query) return service.find(context.params.query);
    return undefined;
  };

  const canUpdate = (milestone) => {
    if (!milestone) throw new errors.Forbidden();

    const reviewers = [milestone.reviewerAddress, milestone.campaignReviewerAddress];

    // reviewers can mark Completed or Canceled
    if (['Completed', 'Canceled'].includes(data.status) && data.mined === false) {
      if (!reviewers.includes(user.address)) throw new errors.Forbidden('Only the reviewer accept or cancel a milestone');

      // whitelist of what the reviewer can update
      const approvedKeys = ['txHash', 'status', 'mined'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (data.status === 'InProgress' && milestone.status !== data.status) {
      // reject milestone
      if (!reviewers.includes(user.address)) throw new errors.Forbidden('Only the reviewer reject a milestone');

      // whitelist of what the reviewer can update
      const approvedKeys = ['status'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (milestone.status === 'proposed') {
      // accept proposed milestone
      if (user.address !== milestone.campaignOwnerAddress) throw new errors.Forbidden('Only the campaign owner can accept a milestone');
      const approvedKeys = ['txHash', 'status', 'mined', 'ownerAddress'];

      // data.ownerAddress = user.address

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[key]);
    } else if (!milestone.status && (user.address !== milestone.ownerAddress)) throw new errors.Forbidden();
  };

  return getMilestones()
    .then(milestones => ((Array.isArray(milestones)) ? milestones.forEach(canUpdate) : canUpdate(milestones)));
};

const sendNotification = () => (context) => {
  const { data, app } = context;
  if(data.status === 'proposed') {
    // find the campaign admin and send a notification that milestone is proposed
    app.service('users').find({query: { address: data.campaignOwnerAddress }})
      .then((users) => {
        console.log('campaignOwner', users)

        Notifications.milestoneProposed(app, {
          recipient: users.data[0].email,
          user: users.data[0].name,
          milestoneTitle: data.title,
          amount: data.maxAmount
        });  
      })
      .catch((e) => console.error('error sending proposed milestone notification', e));
  };
};


const address = [
  sanitizeAddress('pluginAddress', { required: true, validate: true }),
  sanitizeAddress(['reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'], { required: false, validate: true }),
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
    find: [sanitizeAddress(['ownerAddress', 'pluginAddress', 'reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'])],
    get: [],
    create: [setAddress('ownerAddress'), ...address, isProjectAllowed(), sanitizeHtml('description')],
    update: [restrict(), ...address, sanitizeHtml('description')],
    patch: [restrict(), sanitizeAddress(['pluginAddress', 'reviewerAddress', 'campaignReviewerAddress', 'recipientAddress'], { validate: true }), sanitizeHtml('description')],
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
