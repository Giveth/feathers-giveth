import logger from 'winston';
/**
 * class to keep feathers cache in sync with Vault payments
 */
class Payments {
  constructor(app, vault, eventQueue) {
    this.app = app;
    this.web3 = vault.$web3;
    this.vault = vault;
    this.queue = eventQueue;
  }

  authorizePayment(event, isQueued = false) {
    if (event.event !== 'AuthorizePayment')
      throw new Error('authorizePayment only handles AuthorizePayment events');

    if (!isQueued && this.queue.isProcessing(event.transactionHash)) {
      this.queue.add(event.transactionHash, () => this.authorizePayment(event, true));
      return Promise.resolve();
    }

    const { returnValues } = event;
    const paymentId = returnValues.idPayment;
    const pledgeId = this.web3.utils.hexToNumberString(returnValues.ref);

    const donations = this.app.service('donations');
    return donations
      .find({
        query: {
          pledgeId,
        },
      })
      .then(({ data }) => {
        if (data.length === 0) {
          logger.error('AuthorizePayment: no donations found with pledgeId ->', pledgeId);
          return Promise.resolve();
        }

        return donations.patch(
          null,
          { paymentId },
          {
            query: {
              pledgeId,
            },
          },
        );
      })
      .then(() => {
        if (isQueued) this.queue.purge(event.transactionHash);
      })
      .catch(error => logger.error('authorizePayment error ->', error));
  }

  confirmPayment(event) {
    if (event.event !== 'ConfirmPayment')
      throw new Error('confirmPayment only handles ConfirmPayment events');

    // const { returnValues } = event;
    // const paymentId = returnValues.idPayment;
    // I don't think we need to do anything here

    // const donations = this.app.service('donations');
    // donations.find({
    //   query: {
    //     paymentId,
    //   },
    // })
    //   .then(({ data }) => {
    //     if (data.length === 0) {
    //       logger.error('no donations found with paymentId ->', paymentId);
    //       return;
    //     }
    //
    //     donations.patch(null, { status: 'can_withdraw'}, {
    //       query: {
    //         paymentId
    //       }
    //     });
    //   })
    //   .catch((error) => logger.error('confirmPayment error ->', error));
  }

  cancelPayment(event) {
    if (event.event !== 'CancelPayment')
      throw new Error('cancelPayment only handles CancelPayment events');

    // const { returnValues } = event;

    // const paymentId = returnValues.idPayment;
    // I don't think we need to do anything here

    // const donations = this.app.service('donations');
    // donations.find({
    //   query: {
    //     paymentId,
    //   },
    // })
    //   .then(({ data }) => {
    //     if (data.length === 0) {
    //       logger.error('no donations found with paymentId ->', paymentId);
    //       return;
    //     }
    //
    //     // what should the status be here?
    //     donations.patch(null, { status: 'committed', $unset: { paymentId: true } }, {
    //       query: {
    //         paymentId
    //       }
    //     });
    //   })
    //   .catch((error) => logger.error('cancelPayment error ->', error));
  }
}

export default Payments;
