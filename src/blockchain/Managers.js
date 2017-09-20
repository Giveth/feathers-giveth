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
      .then(user => {
        this._addNoteManager(donorId, 'users', user.address)
          .then(() => user);
      })
      .catch(err => console.error('_addDonor error ->', err));
  }


  //TODO support delegates other then dacs
  addDelegate(event) {
    if (event.event !== 'DelegateAdded') throw new Error('addDelegate only handles DelegateAdded events');

    this._addDelegate(event.returnValues.idDelegate);
  }

  updateDelegate(event) {
    if (event.event !== 'DelegateUpdated') throw new Error('updateDelegate only handles DelegateUpdated events');

    const delegateId = event.returnValues.idDelegate;

    const dacs = this.app.service('/dacs');

    const getDAC = () => {
      return dacs.find({ query: { delegateId } })
        .then(({ data }) => {

          if (data.length === 0) {
            this._addDelegate(delegateId);
            throw new BreakSignal();
          }

          if (data.length > 1) {
            console.warn('more then 1 dac with the same delegateId found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    Promise.all([ getDAC(), this.liquidPledging.getNoteManager(delegateId) ])
      .then(([ dac, delegate ]) => {
        return dacs.patch(dac._id, {
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
    const dacs = this.app.service('/dacs');

    const findDAC = (delegate) => {
      return dacs.find({ query: { title: delegate.name, ownerAddress: delegate.addr, delegateId: 0 } })
        .then(({ data }) => {

          if (data.length === 0) {
            //TODO do we need to create an owner here?

            return dacs.create({
              ownerAddress: delegate.addr,
              title: delegate.name,
              description: '',
            });
          }

          if (data.length > 1) {
            console.warn('more then 1 dac with the same ownerAddress and title found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    return this.liquidPledging.getNoteManager(delegateId)
      .then(delegate => Promise.all([ delegate, findDAC(delegate) ]))
      .then(([ delegate, dac ]) => dacs.patch(dac._id, {
        delegateId,
        title: delegate.name,
        ownerAddress: delegate.addr,
      }))
      .then(dac => {
        this._addNoteManager(delegateId, 'dacs', dac._id)
          .then(() => dac);
      })
      .catch(err => console.error('_addDelegate error ->', err)); //eslint-disable-line no-console
  }


  addProject(event) {
    if (event.event !== 'ProjectAdded') throw new Error('addProject only handles ProjectAdded events');

    const projectId = event.returnValues.idProject;

    // we make the assumption that if there is a parentProject, then the project is a milestone, otherwise it is a campaign
    return this.liquidPledging.getNoteManager(projectId)
      .then(project => {
        return (project.parentProject > 0) ? this._addMilestone(project, projectId) : this._addCampaign(project, projectId);
      });
  }

  _addMilestone(project, projectId) {
    const milestones = this.app.service('/milestones');
    const campaigns = this.app.service('/campaigns');

    // get_or_create campaign by projectId
    const findCampaign = (campaignProjectId) => {
      return campaigns.find({ query: { projectId: campaignProjectId } })
        .then(({ data }) => {

          // create a campaign if necessary
          if (data.length === 0) {
            //TODO do we need to create an owner here?

            return this.liquidPledging.getNoteManager(campaignProjectId)
              .then(campaignProject => campaigns.create({
                ownerAddress: campaignProject.ownerAddress,
                title: campaignProject.name,
                projectId: campaignProjectId,
              }))
              .then(campaign => campaign._id);
          }

          if (data.length > 1) {
            console.warn('more then 1 campaign with the same projectId found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ]._id;
        });
    };

    // get_or_create milestone by title and ownerAddress
    const findMilestone = () => {
      return milestones.find({ query: { title: project.name, ownerAddress: project.addr, projectId: 0 } })
        .then(({ data }) => {

          if (data.length === 0) {
            //TODO do we need to create an owner here?

            return findCampaign(project.parentProject)
              .then(campaignId => milestones.create({
                ownerAddress: project.addr,
                title: project.name,
                description: '',
                campaignId,
              }));
          }

          //TODO do we need to check that the parentProject and milestone campaignId are the same campaign?
          if (data.length > 1) {
            console.warn('more then 1 milestone with the same ownerAddress and title found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    return findMilestone()
      .then((milestone) => milestones.patch(milestone._id, {
        projectId,
        title: project.name,
        ownerAddress: project.addr,
      }))
      .then(milestone => {
        this._addNoteManager(projectId, 'milestones', milestone._id)
          .then(() => milestone);
      })
      .catch(err => console.error('_addMilestone error ->', err)); //eslint-disable-line no-console
  }

  _addCampaign(project, projectId) {
    const campaigns = this.app.service('/campaigns');

    // get_or_create campaign by title and ownerAddress
    const findCampaign = () => {
      return campaigns.find({ query: { title: project.name, ownerAddress: project.addr, projectId: 0 } })
        .then(({ data }) => {

          // create a campaign if necessary
          if (data.length === 0) {
            return campaigns.create({
              ownerAddress: project.addr,
              title: project.name,
              description: '',
            });
          }

          if (data.length > 1) {
            console.warn('more then 1 campaign with the same title and ownerAddress found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    return findCampaign()
      .then(campaign => campaigns.patch(campaign._id, {
        projectId,
        title: project.name,
        ownerAddress: project.addr,
      }))
      .then(campaign => {
        this._addNoteManager(projectId, 'campaigns', campaign._id)
          .then(() => campaign);
      })
      .catch(err => console.error('_addCampaign error ->', err)); //eslint-disable-line no-console
  }

  updateProject(event) {
    if (event.event !== 'ProjectUpdated') throw new Error('updateProject only handles ProjectUpdated events');

    const projectId = event.returnValues.idProject;

    // we make the assumption that if there is a parentProject, then the project is a milestone, otherwise it is a campaign
    return this.liquidPledging.getNoteManager(projectId)
      .then(project => {
        return (project.parentProject > 0) ? this._updateMilestone(project, projectId) : this._updateCampaign(project, projectId);
      });
  }

  _updateMilestone(project, projectId) {
    const milestones = this.app.service('/milestones');

    const getMilestone = () => {
      return milestones.find({ query: { projectId } })
        .then(({ data }) => {

          if (data.length === 0) {
            this._addMilestone(project, projectId);
            throw new BreakSignal();
          }

          if (data.length > 1) {
            console.warn('more then 1 milestone with the same projectId found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    return getMilestone()
      .then((milestone) => {
        return milestones.patch(milestone._id, {
          ownerAddress: project.addr,
          title: project.name,
        });
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        console.error('_updateMilestone error ->', err); // eslint-disable-line no-console
      });
  }

  _updateCampaign(project, projectId) {
    const campaigns = this.app.service('/campaigns');

    const getCampaign = () => {
      return campaigns.find({ query: { projectId } })
        .then(({ data }) => {

          if (data.length === 0) {
            this._addCampaign(project, projectId);
            throw new BreakSignal();
          }

          if (data.length > 1) {
            console.warn('more then 1 campaign with the same projectId found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    return getCampaign()
      .then((campaign) => {
        return campaigns.patch(campaign._id, {
          ownerAddress: project.addr,
          title: project.name,
        });
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        console.error('_updateCampaign error ->', err); // eslint-disable-line no-console
      });
  }


  _addNoteManager(id, type, typeId) {
    const noteManagers = this.app.service('/noteManagers');

    return noteManagers.create({ id, type, typeId })
      .catch(err => {
        // TODO if the noteManager already exists, then verify the type and typeId and return the manager
        console.log('create noteManager error =>', err);
      });
  }
}

export default Managers;
