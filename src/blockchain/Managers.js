const BreakSignal = () => {
};


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

    this.liquidPledging.getNoteManager(returnValues.idDonor)
      .then(donor => this._addDonor(donor, returnValues.idDonor))
      .catch(err => console.error('addDonor error ->', err)); //eslint-disable-line no-console
  }

  updateDonor(event) {
    if (event.event !== 'DonorUpdated') throw new Error('updateDonor only handles DonorUpdated events');

    const donorId = event.returnValues.idDonor;

    const users = this.app.service('/users');

    const getUser = () => {
      return users.find({ query: { donorId } })
        .then(({ data }) => {

          if (data.length === 0) {
            this.liquidPledging.getNoteManager(donorId)
              .then(donor => this._addDonor(donor, donorId))
              .catch(err => console.error('updateDonor error ->', err)); //eslint-disable-line no-console
            throw new BreakSignal();
          }

          if (data.length > 1) {
            console.warn('more then 1 user with the same donorId found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    Promise.all([ getUser(), this.liquidPledging.getNoteManager(donorId) ])
      .then(([ user, donor ]) => {
        // If a donor changes address, update users to reflect the change.
        if (donor.addr !== user.address) {
          console.log(`donor address "${donor.addr}" differs from users address "${user.address}". Updating users to match`); // eslint-disable-line no-console
          users.patch(user.address, { $unset: { donorId: true } });
          return this._addDonor(donor, donorId);
        }

        return users.patch(user.address, { commitTime: donor.commitTime, name: donor.name });
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        console.error('updateDonor error ->', err); // eslint-disable-line no-console
      });
  }


  _addDonor(donor, donorId) {
    const { commitTime, addr, name } = donor;
    const users = this.app.service('/users');

    return users.get(addr)
      .catch(err => {
        if (err.name === 'NotFound') {
          return users.create({
            address: addr,
          });
        }

        throw err;
      })
      .then(user => {
        if (user.donorId && user.donorId !== 0) {
          console.error(`user already has a donorId set. existing donorId: ${user.donorId}, new donorId: ${donorId}`);
        }
        return users.patch(user.address, { commitTime, name, donorId: donorId });
      })
      .catch(err => console.error('_addDonor error ->', err));
  }


  //TODO support delegates other then causes
  addDelegate(event) {
    if (event.event !== 'DelegateAdded') throw new Error('addDelegate only handles DelegateAdded events');

    this._addDelegate(event.returnValues.idDelegate);
  }

  updateDelegate(event) {
    if (event.event !== 'DelegateUpdated') throw new Error('updateDelegate only handles DelegateUpdated events');

    const delegateId = event.returnValues.idDelegate;

    const causes = this.app.service('/causes');

    const getCause = () => {
      return causes.find({ query: { delegateId } })
        .then(({ data }) => {

          if (data.length === 0) {
            this._addDelegate(delegateId);
            throw new BreakSignal();
          }

          if (data.length > 1) {
            console.warn('more then 1 cause with the same delegateId found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    Promise.all([ getCause(), this.liquidPledging.getNoteManager(delegateId) ])
      .then(([ cause, delegate ]) => {
        return cause.patch(cause._id, {
          ownerAddress: delegate.addr,
          title: delegate.name,
        });
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        console.error('updateDelegate error ->', err); // eslint-disable-line no-console
      });
  }

  _addDelegate(delegateId) {
    const causes = this.app.service('/causes');

    const findCause = (delegate) => {
      return causes.find({ query: { title: delegate.name, ownerAddress: delegate.addr } })
        .then(({ data }) => {

          if (data.length === 0) {
            //TODO do we need to create an owner here?

            return causes.create({
              ownerAddress: delegate.addr,
              title: delegate.name,
              description: '',
            });
          }

          if (data.length > 1) {
            console.warn('more then 1 cause with the same ownerAddress and title found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    return this.liquidPledging.getNoteManager(delegateId)
      .then(delegate => Promise.all([ delegate, findCause(delegate) ]))
      .then(([ delegate, cause ]) => causes.patch(cause._id, {
        delegateId,
        title: delegate.name,
        ownerAddress: delegate.addr,
      }))
      .catch(err => console.error('_addDelegate error ->', err)); //eslint-disable-line no-console
  }
}

export default Managers;
