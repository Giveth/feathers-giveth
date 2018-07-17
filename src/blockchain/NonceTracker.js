const semaphore = require('semaphore');
const logger = require('winston');

module.exports = class {
  constructor(initialNonce) {
    this.nonce = initialNonce ? Number(initialNonce) : undefined;
    this.sem = semaphore();
    this.onInit = [];
  }

  initialize(nonce) {
    this.nonce = Number(nonce);
    this.onInit.forEach(fn => fn());
  }

  obtainNonce() {
    logger.debug('Obtaining nonce');

    return new Promise(resolve => {
      const fn = () =>
        this.sem.take(() => {
          logger.debug('Giving nonce:', this.nonce);
          resolve(this.nonce);
          this.nonce += 1;
        });

      if (!this.nonce) {
        this.onInit.push(fn);
      } else {
        fn();
      }
    });
  }

  releaseNonce(nonce, success = true) {
    logger.debug('Releasing nonce:', nonce, 'success:', success);

    // n is returned and then incremented
    if (nonce + 1 !== this.nonce) {
      throw new Error('attempting to release nonce, but the provided nonce should not have a lock');
    }

    if (!success) this.nonce -= 1;
    this.sem.leave();
  }
};
