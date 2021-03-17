const { assert } = require('chai');
const { findUserByAddress } = require('./userRepository');
const { getFeatherAppInstance } = require('../app');
const { generateRandomEtheriumAddress } = require('../../test/testUtility');

let app;

before(() => {
  app = getFeatherAppInstance();
});

function findUserByAddressTests() {
  it('should findUser correctly, with not passing projection', async () => {
    const userService = app.service('users');
    const userInfo = {
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-testUser@test.giveth`,
      isAdmin: true,
      name: `dac subscriber ${new Date()}`,
    };
    await userService.create(userInfo);
    const user = await findUserByAddress(app, userInfo.address);
    assert.ok(user);
    assert.equal(user.email, userInfo.email);
    assert.equal(user.address, userInfo.address);
    assert.equal(user.name, userInfo.name);
    assert.equal(user.isAdmin, userInfo.isAdmin);
  });
  it('should findUser correctly, with passing projection', async () => {
    const userService = app.service('users');
    const userInfo = {
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-testUser@test.giveth`,
      isAdmin: true,
      name: `dac subscriber ${new Date()}`,
    };
    await userService.create(userInfo);
    const user = await findUserByAddress(app, userInfo.address, {
      name: 1,
    });
    assert.ok(user);
    assert.equal(user.name, userInfo.name);
    assert.notOk(user.address);
    assert.notOk(user.email);
    assert.notOk(user.isAdmin);
  });

  it('should return null for invalid userAddres', async () => {
    const user = await findUserByAddress(app, generateRandomEtheriumAddress(), {
      name: 1,
    });
    assert.notOk(user);
  });
}

describe(`findUserByAddress test cases`, findUserByAddressTests);
