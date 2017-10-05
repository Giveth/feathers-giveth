/**
 * class to keep feathers cache in sync with Vault payments
 */
class Payments {
  constructor(app, vault) {
    this.app = app;
    this.web3 = vault.$web3;
    this.vault = vault;
  }

  authorizePayment(event) {
    if (event.event !== 'AuthorizePayment') throw new Error('authorizePayment only handles AuthorizePayment events');

    const { returnValues } = event;
    const paymentId = returnValues.idPayment;
    const pledgeId = this.web3.utils.hexToNumberString(returnValues.ref);

    const donations = this.app.service('donations');
    donations.find({
      query: {
        pledgeId,
      },
    })
      .then(({ data }) => {
        if (data.length === 0) {
          console.error('no donations found with pledgeId ->', pledgeId); // eslint-disable-line no-console
          return;
        }

        donations.patch(null, { paymentId }, {
          query: {
            pledgeId
          }
        });
      })
      .catch((error) => console.log('authorizePayment error ->', error)); // eslint-disable-line no-console
  }

  confirmPayment(event) {
    if (event.event !== 'CancelPayment') throw new Error('cancelPayment only handles CancelPayment events');

    const { returnValues } = event;
  }

  cancelPayment(event) {
    if (event.event !== 'CancelPayment') throw new Error('cancelPayment only handles CancelPayment events');

    const { returnValues } = event;
  }
}

export default Payments;
