const { assert } = require('chai');
const {
  isUserAdmin,
  isUserInDelegateWhiteList,
  isUserInProjectWhiteList,
  isUserInReviewerWhiteList,
} = require('./roleUtility');
const { SAMPLE_DATA } = require('../../test/testUtility');
const { getFeatherAppInstance } = require('../app');

let app;

function isUserAdminTestCases() {
  it('should return true for an admin address', () => {
    const isAdmin = isUserAdmin(SAMPLE_DATA.ADMIN_USER_ADDRESS);
    assert.isTrue(isAdmin);
  });
  it('should return false for a  non-admin address', () => {
    const isAdmin = isUserAdmin(SAMPLE_DATA.SECOND_USER_ADDRESS);
    assert.isFalse(isAdmin);
  });
}
function isUserInDelegateWhiteListTestCases() {
  it('should return true for user that has isDelegator true', async () => {
    const isDelegator = await isUserInDelegateWhiteList(
      app,
      SAMPLE_DATA.IN_DELEGATE_WHITELIST_USER_ADDRESS,
    );
    assert.isTrue(isDelegator);
  });
  it('should return true for admin user', async () => {
    const isDelegator = await isUserInDelegateWhiteList(app, SAMPLE_DATA.ADMIN_USER_ADDRESS);
    assert.isTrue(isDelegator);
  });
  it('should return false for user that has isDelegator false', async () => {
    const isDelegator = await isUserInDelegateWhiteList(app, SAMPLE_DATA.SECOND_USER_ADDRESS);
    assert.isNotOk(isDelegator);
  });
}
function isUserInProjectWhiteListTestCases() {
  it('should return true for user that has isProjectOwner true', async () => {
    const isProjectOwner = await isUserInProjectWhiteList(
      app,
      SAMPLE_DATA.IN_PROJECT_WHITELIST_USER_ADDRESS,
    );
    assert.isTrue(isProjectOwner);
  });
  it('should return true for admin user', async () => {
    const isProjectOwner = await isUserInProjectWhiteList(app, SAMPLE_DATA.ADMIN_USER_ADDRESS);
    assert.isTrue(isProjectOwner);
  });
  it('should return false for user that has isDelegator false', async () => {
    const isProjectOwner = await isUserInProjectWhiteList(app, SAMPLE_DATA.SECOND_USER_ADDRESS);
    assert.isNotOk(isProjectOwner);
  });
}
function isUserInReviewerWhiteListTestCases() {
  it('should return true for user that has isInReviewerWhiteList true', async () => {
    const isInReviewerWhiteList = await isUserInReviewerWhiteList(
      app,
      SAMPLE_DATA.IN_REVIEWER_WHITELIST_USER_ADDRESS,
    );
    assert.isTrue(isInReviewerWhiteList);
  });
  it('should return true for admin user', async () => {
    const isInReviewerWhiteList = await isUserInReviewerWhiteList(
      app,
      SAMPLE_DATA.ADMIN_USER_ADDRESS,
    );
    assert.isTrue(isInReviewerWhiteList);
  });
  it('should return false for user that has isDelegator false', async () => {
    const isInReviewerWhiteList = await isUserInReviewerWhiteList(
      app,
      SAMPLE_DATA.SECOND_USER_ADDRESS,
    );
    assert.isNotOk(isInReviewerWhiteList);
  });
}

describe('isUserAdmin() tests', isUserAdminTestCases);
describe('isUserInDelegateWhiteList() tests', isUserInDelegateWhiteListTestCases);
describe('isUserInProjectWhiteList() tests', isUserInProjectWhiteListTestCases);
describe('isUserInReviewerWhiteList() tests', isUserInReviewerWhiteListTestCases);

before(() => {
  app = getFeatherAppInstance();
});
