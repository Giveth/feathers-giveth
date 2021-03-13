const request = require('supertest');
const config = require('config');
const { assert } = require('chai');
const {findProjectSubscribers} = require('./subscriptionRepository')

const { getJwt, SAMPLE_DATA, generateRandomEtheriumAddress } = require('../../test/testUtility');
const { getFeatherAppInstance } = require('../app');
const baseUrl = config.get('givethFathersBaseUrl');

let app;

before(() => {
  app = getFeatherAppInstance();
});

function findProjectSubscribersTests (){
  it('should return subscriber users that have email', async ()=> {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-dacSubscriber@test.giveth`,
      isAdmin: true,
      name: `dac subscriber ${new Date()}`,
    });
    const dac = (
      await request(baseUrl)
        .post('/dacs')
        .send({
          ...SAMPLE_DATA.CREATE_DAC_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
    const subscription = await app.service('subscriptions').Model({
      userAddress:  user.address,
      projectType:'dac',
      projectTypeId: dac._id,
      enabled:true
    }).save();
    const subscriptions = await findProjectSubscribers(app, {
      projectTypeId : dac._id
    });
    assert.isArray(subscriptions);
    assert.equal(subscriptions[0].user.address, user.address)
    assert.equal(String(subscriptions[0]._id),String(subscription._id))
  });
  it('should doesnt return subscriptions for disabled subscriptions', async ()=> {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      email: `${new Date().getTime()}-dacSubscriber@test.giveth`,
      isAdmin: true,
      name: `dac subscriber ${new Date()}`,
    });
    const dac = (
      await request(baseUrl)
        .post('/dacs')
        .send({
          ...SAMPLE_DATA.CREATE_DAC_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
     await app.service('subscriptions').Model({
      userAddress:  user.address,
      projectType:'dac',
      projectTypeId: dac._id,
      enabled:false
    }).save();
    const subscriptions = await findProjectSubscribers(app, {
      projectTypeId : dac._id
    });
    assert.isArray(subscriptions);
    assert.isEmpty(subscriptions);
  });
  it('should not return subscriber when users doesnt have email', async ()=> {
    const userService = app.service('users');
    const user = await userService.create({
      address: generateRandomEtheriumAddress(),
      isAdmin: true,
      name: `dac subscriber ${new Date()}`,
    });
    const dac = (
      await request(baseUrl)
        .post('/dacs')
        .send({
          ...SAMPLE_DATA.CREATE_DAC_DATA,
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        })
        .set({ Authorization: getJwt(SAMPLE_DATA.USER_ADDRESS) })
    ).body;
     await app.service('subscriptions').Model({
      userAddress:  user.address,
      projectType:'dac',
      projectTypeId: dac._id,
      enabled:true
    }).save();
    const subscriptions = await findProjectSubscribers(app, {
      projectTypeId : dac._id
    });
    assert.isArray(subscriptions);
    assert.isEmpty(subscriptions);
  });
}

describe(`findProjectSubscribers test cases`, findProjectSubscribersTests);
