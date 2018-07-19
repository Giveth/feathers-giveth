module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [
       context => { //pro tip: console.log(typeof(context))
         // switch statement for all events not considered transfers
         // context.data.event += ' transaction 2';
           context.data = {
             address: context.data.address,
             txHash: context.data.txHash,
             event: context.data.event,
             userRole: context.data.userRole,
             userAction: context.data.userAction,
             projectType: context.data.projectType,
             title: context.data.title,
           };

         // preventing transactions from being created, below
         // context.result = null;
       }],

    update: [],
    patch: [],
    remove: [],
  },

  after: {
    all: [],
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
