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
  },
};

module.exports = {
  getPledgeAdmin,
  $contract,
};
