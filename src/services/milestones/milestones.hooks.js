import Web3 from 'web3';
import commons from 'feathers-hooks-common';
// import { restrictToOwner } from 'feathers-authentication-hooks';

import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';

const restrict = [
  // restrictToOwner({
  //   idField: 'address',
  //   ownerField: 'ownerAddress',
  // }),
];

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
              mined: true
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
  ],
};


module.exports = {
  before: {
    all: [],
    find: [ sanitizeAddress([ 'ownerAddress', 'pluginAddress', 'reviewerAddress', 'recipientAddress' ]) ],
    get: [],
    create: [ setAddress('ownerAddress'), ...address, sanitizeHtml('description') ],
    update: [ ...restrict, ...address, sanitizeHtml('description') ],
    patch: [ ...restrict, sanitizeAddress(['pluginAddress', 'reviewerAddress', 'recipientAddress'], { validate: true }), sanitizeHtml('description'), watchTx() ],
    remove: [ sanitizeAddress([ 'pluginAddress', 'reviewerAddress', 'recipientAddress' ]), ...restrict ],
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
