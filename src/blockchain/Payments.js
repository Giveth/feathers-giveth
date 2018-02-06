/**
 * class to keep feathers cache in sync with Vault payments
 */
class Payments {
  constructor(app, vault) {
    this.app = app;
    this.web3 = vault.$web3;
    this.vault = vault;
  }

  authorizePayment(event, retry = false) {
    if (event.event !== 'AuthorizePayment')
      throw new Error('authorizePayment only handles AuthorizePayment events');

    const { returnValues } = event;
    const paymentId = returnValues.idPayment;
    const pledgeId = this.web3.utils.hexToNumberString(returnValues.ref);

    const donations = this.app.service('donations');
    donations
      .find({
        query: {
          pledgeId,
        },
      })
      .then(({ data }) => {
        if (data.length === 0) {
          if (retry) {
            console.error('no donations found with pledgeId ->', pledgeId); // eslint-disable-line no-console
          } else {
            // need to give time for Pledges.js to update the donation
            setTimeout(() => this.authorizePayment(event, true), 5000);
          }
          return;
        }

        donations.patch(
          null,
          { paymentId },
          {
            query: {
              pledgeId,
            },
          },
        );
      })
      .catch(error => console.log('authorizePayment error ->', error)); // eslint-disable-line no-console
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
    //       console.error('no donations found with paymentId ->', paymentId); // eslint-disable-line no-console
    //       return;
    //     }
    //
    //     donations.patch(null, { status: 'can_withdraw'}, {
    //       query: {
    //         paymentId
    //       }
    //     });
    //   })
    //   .catch((error) => console.log('confirmPayment error ->', error)); // eslint-disable-line no-console
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
    //       console.error('no donations found with paymentId ->', paymentId); // eslint-disable-line no-console
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
    //   .catch((error) => console.log('cancelPayment error ->', error)); // eslint-disable-line no-console
  }
}

export default Payments;
