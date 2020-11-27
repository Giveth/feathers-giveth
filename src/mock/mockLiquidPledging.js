const { generateRandomEtheriumAddress } = require('../../test/testUtility');

const mockGiver = {
  commitTime: '',
  addr: generateRandomEtheriumAddress(),
  name: '',
  url: '',
};

async function getPledgeAdmin() {
  return Promise.resolve(mockGiver);
}

const $contract = {
  methods: {
    getPledge: async from => {
      return {
        call: {
          request: () => {
            return Promise.resolve(from);
          },
        },
      };
    },
    reviewer: async () => {
      return {
        call: {
          request: () => {
            return Promise.resolve(generateRandomEtheriumAddress());
          },
        },
      };
    },
    isCanceled: async () => {
      return {
        call: {
          request: () => {
            return Promise.resolve(false);
          },
        },
      };
    },
  },
};

function kernel() {
  return generateRandomEtheriumAddress();
}
module.exports = {
  getPledgeAdmin,
  $contract,
  kernel,
};
