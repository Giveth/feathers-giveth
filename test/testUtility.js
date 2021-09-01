const config = require('config');
const jwt = require('jsonwebtoken');
const path = require('path');
// eslint-disable-next-line import/no-unresolved
const restore = require('mongodb-restore-dump');
const { ObjectID } = require('bson');
const { assert } = require('chai');
const mongoose = require('mongoose');
const crypto = require('crypto');

const assertThrowsAsync = async (fn, errorMessage) => {
  let f = () => {
    // empty function
  };
  try {
    await fn();
  } catch (e) {
    f = () => {
      throw e;
    };
  } finally {
    if (errorMessage) {
      assert.throw(f, errorMessage);
    } else {
      assert.throw(f);
    }
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const assertNotThrowsAsync = async fn => {
  let f = () => {
    // empty function
  };
  try {
    await fn();
  } catch (e) {
    f = () => {
      throw e;
    };
  } finally {
    assert.doesNotThrow(f);
  }
};

const testAddress = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
const reviewerAddress = '0xd00cc82a132f421bA6414D196BC830Db95e2e7Dd';
const campaignAddress = '5fd3412e3e403d0c0f9e4463';
const campaignTitle = 'Serj tankian album ';
const projectOwnerAddress = '0x839395e20bbB182fa440d08F850E6c7A8f6F0780';
const secondUserAddress = '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0';
const givethIoProjectOwnerAddress = secondUserAddress;

function getJwt(address = testAddress) {
  const authentication = config.get('authentication');
  const jwtData = authentication.jwtOptions;
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
      subject: address,
      header: jwtData.header,
    },
  );
  return `Bearer ${token}`;
}

async function dropDb() {
  return new Promise((resolve, reject) => {
    console.log('dropping db');
    mongoose.connect(config.get('mongodb'), error => {
      if (error) {
        reject(error);
      } else {
        mongoose.connection.db.dropDatabase();
        resolve();
      }
    });
  });
}

async function seedData() {
  await dropDb();
  console.log('test db dropped');
  const dbName = config.get('mongodb').split('/')[config.get('mongodb').split('/').length - 1];
  await restore.database({
    uri: config.get('mongodb').replace(dbName, ''),
    // URI to the Server to use.
    // Either this or "con" must be provided.
    from: path.join(__dirname, '/db_seed_data/dump/giveth-test'),
    // path to the server dump, contains sub-directories
    // that themselves contain individual database
    // dumps

    // database: config.get('mongodb').split('/')[config.get('mongodb').split('/').length - 1],
    database: dbName,
    // name of the database that will be created
    // on the mongodb server from the dump

    clean: true,
  });
}

function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function generateHexNumber(len) {
  const hex = '0123456789abcdef';
  let output = '';
  /* eslint-disable no-plusplus */
  for (let i = 0; i < len; i++) {
    output += hex.charAt(Math.floor(Math.random() * hex.length));
  }
  return output;
}

function generateRandomEtheriumAddress() {
  return `0x${generateHexNumber(40)}`;
}

function generateRandomTransactionHash() {
  return `0x${generateHexNumber(62)}`;
}

const generateRandomTxHash = () => {
  return `0x${crypto.randomBytes(16).toString('hex')}`;
};

const SAMPLE_DATA = {
  // the user in seed data has these values
  USER_ADDRESS: testAddress,
  ADMIN_USER_ADDRESS: '0xb192Ade5c76209655380285d3D2F3AfA16C44727',
  USER_GIVER_ID: 1,

  SECOND_USER_ADDRESS: secondUserAddress,
  IN_PROJECT_WHITELIST_USER_ADDRESS: projectOwnerAddress,
  IN_REVIEWER_WHITELIST_USER_ADDRESS: reviewerAddress,
  GIVETH_IO_PROJECT_OWNER_ADDRESS: givethIoProjectOwnerAddress,
  IN_DELEGATE_WHITELIST_USER_ADDRESS: '0x84DD429D2A54176A971e0993E11020e4Aa81aB13',
  TRACE_ID: '5fd3424c3e403d0c0f9e4487',
  MILESTONE_PROJECT_ID: 5,
  CAMPAIGN_ID: campaignAddress,
  CAMPAIGN_TITLE: campaignTitle,
  FAKE_USER_ADDRESS: generateRandomEtheriumAddress(),
  COMMUNITY_ID: '5fd339eaa5ffa2a6198ecd70',
  USER_ID: '5fd3385aa5ffa2a6198ecd6e',
  TRACE_STATUSES: {
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
  DonationStatus: {
    PENDING: 'Pending',
    PAYING: 'Paying',
    PAID: 'Paid',
    TO_APPROVE: 'ToApprove',
    WAITING: 'Waiting',
    COMMITTED: 'Committed',
    CANCELED: 'Canceled',
    REJECTED: 'Rejected',
    FAILED: 'Failed',
  },
  EventStatus: {
    PENDING: 'Pending', // PENDING events were p/u by the ws subscription, but have yet to contain >= requiredConfirmations
    WAITING: 'Waiting', // WAITING events have been p/u by polling, have >= requiredConfirmations, & are ready to process
    PROCESSING: 'Processing',
    PROCESSED: 'Processed',
    FAILED: 'Failed',
  },
  CREATE_EVENT_DATA: {
    topics: [],
    isHomeEvent: false,
    status: 'Processed',
    address: '0x8eB047585ABeD935a73ba4b9525213F126A0c979',
    blockNumber: 3051511,
    transactionHash: '0x28a99355b05336993764f39d383a47b7b4577c3186d59fe55afb2cd0b4c15347',
    transactionIndex: 9,
    blockHash: '0xcdee74b8a7c19540b619672e260b0a88b8e81887de676a5da839fade04970688',
    logIndex: 6,
    id: 'log_69157b69',
    returnValues: {
      0: '261',
      1: '',
      idProject: '261',
      url: '',
    },
    event: 'ProjectAdded',
    signature: '0x9958fc92731727637b02f1ac1e6caf2814442c27e1d962f0c477cd14280f586d',
    raw: {
      data:
        '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
      topics: [
        '0x9958fc92731727637b02f1ac1e6caf2814442c27e1d962f0c477cd14280f586d',
        '0x0000000000000000000000000000000000000000000000000000000000000105',
      ],
    },
    confirmations: 6,
  },
  createTraceData() {
    return {
      fullyFunded: false,
      mined: true,
      title: `test-milestone-${new Date().getTime()}`,
      description: '<p>give money for god sake</p>',
      image: '',
      reviewerAddress,
      communityId: 0,
      date: '2020-11-10T00:00:00.000Z',
      recipientAddress: '0x0000000000000000000000000000000000000000',
      pluginAddress: '0x0000000000000000000000000000000000000001',
      campaignId: campaignAddress,
      status: 'Proposed',
      items: [],
      token: {
        name: 'ANY_TOKEN',
        address: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
        foreignAddress: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
        symbol: 'ANY_TOKEN',
        decimals: '1',
      },
      owner: {
        address: testAddress,
        createdAt: '2018-08-22T00:34:52.691Z',
        updatedAt: '2020-10-22T00:16:39.775Z',
        email: 'test@giveth.io',
      },
      type: 'BridgedMilestone',
      maxAmount: null,
      txHash: '0x8b0abaa5f5d3cc87c3d52362ef147b8a0fd4ccb02757f5f48b6048aa2e9d86c0',
      proofItems: [],
      pendingRecipientAddress: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
      peopleCount: 3,
    };
  },
  CREATE_CAMPAIGN_DATA: {
    title: 'Hello I;m new Campaign',
    projectId: 10,
    image: 'This should be image :))',
    mined: false,
    reviewerAddress,
    pluginAddress: '0x0000000000000000000000000000000000000001',
    ownerAddress: projectOwnerAddress,
    status: 'Pending',
    txHash: generateRandomTransactionHash(),
    description: 'test description for campaign',
  },
  DONATION_DATA: {
    status: 'Committed',
    parentDonations: [],
    usdValue: 19,
    txHash: '0xc58ba07cd7ad6a324d203d95b38205f3c9d1d9cc07aeed2031027eda58c3a9b7',
    pledgeId: '321',
    amount: '300000000000000',
    amountRemaining: '0',
    ownerId: 481,
    giverAddress: '0xA6012eA4284433baC05e96d352f435265eFa5860',
    homeTxHash: '0xb0cd61d8b5aa3420b860d7985f83451ef0758adee993de038507b89d4a244219',
    ownerTypeId: '5f22b2f69e4f03782453b658',
    ownerType: 'trace',
    tokenAddress: '0x0',
    actionTakerAddress: '0x5AC583Feb2b1f288C0A51d6Cdca2e8c814BFE93B',
  },
  CommunityStatus: {
    ACTIVE: 'Active',
    PENDING: 'Pending',
    CANCELED: 'Canceled',
    FAILED: 'Failed',
  },
  CREATE_COMMUNITY_DATA: {
    title: 'test community title',
    description: 'test community description',
    status: 'Pending',
    txHash: generateRandomTransactionHash(),
    ownerAddress: testAddress,
  },
  CAMPAIGN_STATUSES: {
    ACTIVE: 'Active',
    PENDING: 'Pending',
    CANCELED: 'Canceled',
    ARCHIVED: 'Archived',
    FAILED: 'Failed',
  },
};

const generateRandomMongoId = () => {
  return new ObjectID();
};

function padWithZero(number, size) {
  let s = String(number);
  while (s.length < (size || 2)) {
    s = `0${s}`;
  }
  return s;
}

module.exports = {
  getJwt,
  seedData,
  SAMPLE_DATA,
  generateRandomMongoId,
  generateRandomEtheriumAddress,
  assertNotThrowsAsync,
  assertThrowsAsync,
  generateRandomNumber,
  generateRandomTransactionHash,
  padWithZero,
  sleep,
  generateRandomTxHash,
};
