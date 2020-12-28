const { generateRandomEtheriumAddress } = require('../../test/testUtility');

let mockGiver = {
  commitTime: '',
  addr: generateRandomEtheriumAddress(),
  name: '',
  url: '',
};

async function getPledgeAdmin() {
  return Promise.resolve(mockGiver);
}

module.exports = mockGiverData => {
  if (mockGiverData) {
    mockGiver = mockGiverData;
  }
  return {
    getPledgeAdmin,
  };
};
