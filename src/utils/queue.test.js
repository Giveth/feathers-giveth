const { assert, expect } = require('chai');
const queueMixin = require('./queue');
const { generateRandomEtheriumAddress, assertThrowsAsync } = require('../../test/testUtility');

function queueTestCases() {
  it('queue instance should have add, get and purge functions', function() {
    const queue = queueMixin({});
    assert.isOk(queue);
    assert.exists(queue.add);
    assert.exists(queue.get);
    assert.exists(queue.purge);
  });

  it('queue instance should throw exception if pass falsy thing to add', function() {
    const queue = queueMixin({});
    assert.throw(() => {
      queue.add(null);
    }, 'fn must not be null');
  });

  it('should can add job to queue and get them', function() {
    const queue = queueMixin({});
    queue.add(() => {});
    assert.equal(queue.get().length, 1);
    queue.add(() => {});
    assert.equal(queue.get().length, 2);
  });

  it('should purge call the first function that added and not called yet', async () => {
    const firstGeneratedAddress = generateRandomEtheriumAddress();
    const secondGeneratedAddress = generateRandomEtheriumAddress();
    const queue = queueMixin({});
    queue.add(() => {
      return firstGeneratedAddress;
    });
    queue.add(() => {
      return secondGeneratedAddress;
    });
    const resultOfFirstFunction = await queue.purge();
    assert.equal(resultOfFirstFunction, firstGeneratedAddress);
    const resultOfSecondFunction = await queue.purge();
    assert.equal(resultOfSecondFunction, secondGeneratedAddress);
  });

  it('should purge call async functions correctly', async () => {
    const firstGeneratedAddress = generateRandomEtheriumAddress();
    const secondGeneratedAddress = generateRandomEtheriumAddress();
    const queue = queueMixin({});
    queue.add(() => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(firstGeneratedAddress);
        }, 1000);
      });
    });
    queue.add(() => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(secondGeneratedAddress);
        }, 1000);
      });
    });

    const resultOfFirstFunction = await queue.purge();
    assert.equal(resultOfFirstFunction, firstGeneratedAddress);
    const resultOfSecondFunction = await queue.purge();
    assert.equal(resultOfSecondFunction, secondGeneratedAddress);
  });

  it('should purge call async functions correctly when exception throws', async () => {
    const queue = queueMixin({});
    const errorMessage = 'This function should throw exception';
    queue.add(() => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error(errorMessage));
        }, 1000);
      });
    });
    const badFunc = async () => {
      await queue.purge();
    };
    await assertThrowsAsync(badFunc, errorMessage);
  });

  it('should purge reuturn undefined when there is no more job', async () => {
    const firstGeneratedAddress = generateRandomEtheriumAddress();
    const queue = queueMixin({});
    queue.add(() => {
      return firstGeneratedAddress;
    });
    const resultOfFirstFunction = await queue.purge();
    assert.equal(resultOfFirstFunction, firstGeneratedAddress);
    const result = await queue.purge();
    assert.isNotOk(result);
  });
}

describe('test queue functionality', queueTestCases);
