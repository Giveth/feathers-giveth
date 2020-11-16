const config = require('config');
const jwt = require('jsonwebtoken');
const mongoRestore = require('mongodb-restore');

const testAddress = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';

function getJwt(address = testAddress) {
  const authentication = config.get('authentication');
  const jwtData = authentication.jwt;
  const token = jwt.sign(
    {
      userId: address,
      aud: jwtData.audience,
    },
    authentication.secret,
    {
      algorithm: jwtData.algorithm,
      expiresIn: jwtData.expiresIn,
      issuer: jwtData.issuer,
      subject: jwtData.subject,
      header: jwtData.header,
    },
  );
  return 'Bearer ' + token;
}

function seedData() {

  return new Promise((resolve, reject) => {
    mongoRestore({
      uri: config.get('mongodb'), // mongodb://<dbuser>:<dbpassword>@<dbdomain>.mongolab.com:<dbport>/<dbdatabase>
      root: __dirname + '/db_seed_data/giveth',
      parser: 'bson',
      callback: (err, result) => {
        if (err) {
          return reject(err);
        }
        resolve(result);
      },
    });
  });
}

const SAMPLE_DATA = {
  USER_ADDRESS: testAddress,
  SECOND_USER_ADDRESS: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
  MILESTONE_ID: '5faa26b7642872709976045b',
  MILESTONE_STATUSES:{
    PROPOSED: 'Proposed',
    REJECTED: 'Rejected',
    PENDING: 'Pending',
    IN_PROGRESS: 'InProgress',
    NEEDS_REVIEW: 'NeedsReview',
    COMPLETED: 'Completed',
    CANCELED: 'Canceled',
    PAYING: 'Paying',
    PAID: 'Paid',
    FAILED: 'Failed',
    ARCHIVED: 'Archived',
  },
  CREATE_MILESTONE_DATA:{
    fullyFunded: false,
    mined: true,
    title: 'test-milestone',
    description: '<p>give money for god sake</p>',
    image: '',
    reviewerAddress: testAddress,
    dacId: 0,
    date: '2020-11-10T00:00:00.000Z',
    recipientAddress: '0x0000000000000000000000000000000000000000',
    pluginAddress: '0x0000000000000000000000000000000000000001',
    campaignId: '5fa97a9c4c63425d06b8a245',
    status: 'InProgress',
    items: [],
    token: {
      name: 'ANY_TOKEN',
      address: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
      foreignAddress: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
      symbol: 'ANY_TOKEN',
      decimals: '1'
    },
    type: 'BridgedMilestone',
    maxAmount: null,
    txHash: '0x8b0abaa5f5d3cc87c3d52362ef147b8a0fd4ccb02757f5f48b6048aa2e9d86c0',
    proofItems: [],
    pendingRecipientAddress: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    peopleCount: 3
  }

};


module.exports = {
  getJwt,
  seedData,
  SAMPLE_DATA,
};
