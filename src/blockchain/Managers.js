/**
 * class to keep feathers cache in sync with liquidpledging managers
 */
class Managers {
  constructor(app, liquidPledging) {
    this.app = app;
    this.web3 = liquidPledging.$web3;
    this.liquidPledging = liquidPledging;
  }

  addDonor(event) {
    if (event.event !== 'DonorAdded') throw new Error('addDonor only handles DonorAdded events');

    const { returnValues } = event;

    const users = this.app.service('/users');

    let commitTime;
    this.liquidPledging.getNoteManager(returnValues.idDonor)
      .then(donor => {
        const { addr } = donor;
        commitTime = donor.commitTime;

        return users.get(addr)
          .catch(err => {
            console.log(err);
            if (err.name === 'NotFound') {
              return users.create({
                address: addr,
              });
            }

            throw err;
          });
      })
      .then(user => {
        if (user.donorId && user.donorId !== 0) {
          console.error(`user already has a donorId set. existing donorId: ${user.donorId}, new donorId: ${returnValues.idDonor}`);
        }
        return users.patch(user.address, { commitTime, donorId: returnValues.idDonor });
      })
      .catch(err => console.error('addDonor error ->', err));
  }
}

export default Managers;
