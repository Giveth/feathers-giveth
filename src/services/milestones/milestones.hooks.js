import Web3 from 'web3';
import commons from 'feathers-hooks-common';
import errors from 'feathers-errors';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';


const restrict = () => context => {
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

    // reviewer can mark Completed or Canceled
    if (['Completed', 'Canceled'].includes(data.status) && data.mined === false) {
      if (user.address !== milestone.reviewerAddress) throw new errors.Forbidden('Only the reviewer accept or cancel a milestone');

      // whitelist of what the reviewer can update
      const approvedKeys = ['txHash', 'status', 'mined'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[ key ]);

    } else if (data.status === 'InProgress') {
      // reject milestone
      if (user.address !== milestone.reviewerAddress) throw new errors.Forbidden('Only the reviewer reject a milestone');

      // whitelist of what the reviewer can update
      const approvedKeys = ['status'];

      const keysToRemove = Object.keys(data).map(key => !approvedKeys.includes(key));
      keysToRemove.forEach(key => delete data[ key ]);

    } else if (user.address !== milestone.ownerAddress) throw new errors.Forbidden();
  };

  return getMilestones()
    .then(milestones => {
      return (Array.isArray(milestones)) ? milestones.forEach(canUpdate) : canUpdate(milestones);
    });
};

const address = [
  sanitizeAddress('pluginAddress', { required: true, validate: true }),
  sanitizeAddress([ 'reviewerAddress', 'recipientAddress' ], { required: false, validate: true }),
];

// hack for mlp so we can update the milestone when `collect` tx has been mined
const watchTx = () => context => {

  const items = commons.getItems(context);

  // should be a single item;
  if (!Array.isArray(items) && items.status === 'Paid' && Object.keys(items).includes('mined') && !items.mined) {
    const blockchain = context.app.get('blockchain');

    const web3 = new Web3(blockchain.nodeUrl);

    let intervalId;
    const getTx = () => {
      console.log('checking tx milestoneId ->', context.id);
      web3.eth.getTransaction(items.txHash)
        .then(tx => {
          if (tx) {
            context.app.service('milestones').patch(context.id, {
              mined: true,
            }).catch(console.log);
            clearInterval(intervalId);
          }
        }).catch(error => {
          console.log(error);
          clearInterval(intervalId);
        });
    };

    intervalId = setInterval(getTx, 5000); // 5 seconds
  }

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
    find: [ sanitizeAddress([ 'ownerAddress', 'pluginAddress', 'reviewerAddress', 'recipientAddress' ]) ],
    get: [],
    create: [ setAddress('ownerAddress'), ...address, sanitizeHtml('description') ],
    update: [ restrict(), ...address, sanitizeHtml('description') ],
    patch: [ restrict(), sanitizeAddress([ 'pluginAddress', 'reviewerAddress', 'recipientAddress' ], { validate: true }), sanitizeHtml('description'), watchTx() ],
    remove: [ commons.disallow() ],
  },

  after: {
    all: [ commons.populate({ schema }) ],
    find: [],
    get: [],
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
