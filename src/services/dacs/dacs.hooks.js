import { populate } from 'feathers-hooks-common';
import { restrictToOwner } from 'feathers-authentication-hooks';
import sanitizeAddress from '../../hooks/sanitizeAddress';
import setAddress from '../../hooks/setAddress';
import sanitizeHtml from '../../hooks/sanitizeHtml';

const feathers = require('feathers');

const restrict = [
  restrictToOwner({
    idField: 'address',
    ownerField: 'ownerAddress',
  }),
];

const schema = {
  include: [
    {
      service: 'users',
      nameAs: 'owner',
      parentField: 'ownerAddress',
      childField: 'address',
    },
  ]
};

module.exports = {
  before: {
    all: [],
    find: [ sanitizeAddress('ownerAddress') ],
    get: [],
    create: [ setAddress('ownerAddress'), sanitizeAddress('ownerAddress', { required: true, validate: true, }), sanitizeHtml('description') ],
    update: [ ...restrict, sanitizeAddress('ownerAddress', { required: true, validate: true }), sanitizeHtml('description') ],
    patch: [ ...restrict, sanitizeAddress('ownerAddress', { validate: true }), sanitizeHtml('description') ],
    remove: [ sanitizeAddress('ownerAddress'), ...restrict ],
  },

  after: {
    all: [ populate({ schema })],
    find: [ 
      // add campaignsCount to each DAC object
      function(hook) {
        return new Promise((resolve, reject) => {
          let promises = []

          if(hook.result.data) {
            hook.result.data.map((dac, i) => {          
              promises.push(hook.app.service('campaigns').find({ query: { 
                dacs: dac._id,
                projectId: {
                  $gt: '0' // 0 is a pending campaign
                },                
                $limit: 0 
              }}).then(count => {  
                dac.campaignsCount = count.total
                return dac
              }))

            })

            Promise.all(promises).then(() => {
              resolve(hook)
            })
          } else {
            resolve(hook)
          }
        })
    }],
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
