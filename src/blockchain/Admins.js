import { LPPDac } from 'lpp-dac';
import { LPPMilestone } from 'lpp-milestone';
import { LPPMilestoneRuntimeByteCode } from 'lpp-milestone/build/LPPMilestoneFactory.sol';
import { LPPCampaign } from 'lpp-campaign';
import { LPPCampaignRuntimeByteCode } from 'lpp-campaign/build/LPPCampaignFactory.sol';

import { getTokenInformation, milestoneStatus, pledgeState } from './helpers';

const BreakSignal = () => {
};

/**
 * class to keep feathers cache in sync with liquidpledging admins
 */
class Admins {
  constructor(app, liquidPledging, eventQueue) {
    this.app = app;
    this.web3 = liquidPledging.$web3;
    this.liquidPledging = liquidPledging;
    this.queue = eventQueue;
  }

  addGiver(event) {
    if (event.event !== 'GiverAdded') throw new Error('addGiver only handles GiverAdded events');

    const { returnValues } = event;

    this.liquidPledging.getPledgeAdmin(returnValues.idGiver)
      .then(giver => this._addGiver(giver, returnValues.idGiver, event.transactionHash))
      .catch(err => console.error('addGiver error ->', err)); // eslint-disable-line no-console
  }

  updateGiver(event) {
    if (event.event !== 'GiverUpdated') throw new Error('updateGiver only handles GiverUpdated events');

    const giverId = event.returnValues.idGiver;

    const users = this.app.service('/users');

    const getUser = () => users.find({ query: { giverId } })
      .then(({ data }) => {
        if (data.length === 0) {
          this.liquidPledging.getPledgeAdmin(giverId)
            .then(giver => this._addGiver(giver, giverId, 0))
            .catch(err => console.error('updateGiver error ->', err)); // eslint-disable-line no-console
          throw new BreakSignal();
        }

        if (data.length > 1) {
          console.warn('more then 1 user with the same giverId found: ', data); // eslint-disable-line no-console
        }

        return data[0];
      });

    Promise.all([getUser(), this.liquidPledging.getPledgeAdmin(giverId)])
      .then(([user, giver]) => {
        // If a giver changes address, update users to reflect the change.
        if (giver.addr !== user.address) {
          console.log(`giver address "${giver.addr}" differs from users address "${user.address}". Updating users to match`); // eslint-disable-line no-console
          users.patch(user.address, { $unset: { giverId: true } });
          return this._addGiver(giver, giverId, 0);
        }

        const mutation = { commitTime: giver.commitTime };
        if (giver.name && giver.name !== user.name) {
          mutation.name = giver.name;
        }

        return users.patch(user.address, mutation);
      })
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        console.error('updateGiver error ->', err); // eslint-disable-line no-console
      });
  }


  _addGiver(giver, giverId, txHash) {
    const { commitTime, addr, name } = giver;
    const users = this.app.service('/users');

    let user;
    return users.get(addr)
      .catch((err) => {
        if (err.name === 'NotFound') {
          return users.create({
            address: addr,
          });
        }

        throw err;
      })
      .then((u) => {
        user = u;
        if (user.giverId && user.giverId !== 0) {
          console.error(`user already has a giverId set. existing giverId: ${user.giverId}, new giverId: ${giverId}`);
        }

        const mutation = { commitTime, giverId };
        if (!user.name) {
          mutation.name = name;
        }
        return users.patch(user.address, mutation);
      })
      .then(user => this._addPledgeAdmin(giverId, 'giver', user.address))
      .then(() => this.queue.purge(txHash))
      .then(() => user)
      .catch(err => console.error('_addGiver error ->', err));
  }


  // TODO support delegates other then dacs
  addDelegate(event) {
    if (event.event !== 'DelegateAdded') throw new Error('addDelegate only handles DelegateAdded events');

    this._addDelegate(event.returnValues.idDelegate, event.transactionHash);
  }

  updateDelegate(event) {
    if (event.event !== 'DelegateUpdated') throw new Error('updateDelegate only handles DelegateUpdated events');

    const delegateId = event.returnValues.idDelegate;

    const dacs = this.app.service('/dacs');

    const getDAC = () => dacs.find({ query: { delegateId } })
      .then(({ data }) => {
        if (data.length === 0) {
          this._addDelegate(delegateId);
          throw new BreakSignal();
        }

        if (data.length > 1) {
          console.warn('more then 1 dac with the same delegateId found: ', data); // eslint-disable-line no-console
        }

        return data[0];
      });

    Promise.all([getDAC(), this.liquidPledging.getPledgeAdmin(delegateId)])
      .then(([dac, delegate]) => dacs.patch(dac._id, {
        title: delegate.name,
      }))
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        console.error('updateDelegate error ->', err); // eslint-disable-line no-console
      });
  }

  _addDelegate(delegateId, txHash, retry = false) {
    const dacs = this.app.service('/dacs');

    const findDAC = delegate => dacs.find({ query: { txHash } })
      .then(({ data }) => {
        if (data.length === 0) {
          if (!retry) {
            // this is really only useful when instant mining. Other then that, the dac should always be
            // created before the tx was mined.
            setTimeout(() => this._addDelegate(delegateId, txHash, true), 5000);
            throw new BreakSignal();
          }

          return this.web3.eth.getTransaction(txHash)
            .then(tx => dacs.create({
              ownerAddress: tx.from,
              pluginAddress: delegate.plugin,
              title: delegate.name,
              totalDonated: '0',
              donationCount: 0,
              description: '',
            }))
            .catch((err) => {
              // dacs service will throw BadRequest error if owner isn't whitelisted
              if (err.name === 'BadRequest') throw new BreakSignal();

              throw err;
            });
        }

        if (data.length > 1) {
          console.warn('more then 1 dac with the same ownerAddress and title found: ', data); // eslint-disable-line no-console
        }

        return data[0];
      });

    const getTokenInfo = (delegate) => {
      const dac = new LPPDac(this.web3, delegate.plugin);

      return dac.token().then(addr => getTokenInformation(this.web3, addr));
    };

    return this.liquidPledging.getPledgeAdmin(delegateId)
      .then(delegate => Promise.all([delegate, findDAC(delegate), getTokenInfo(delegate)]))
      .then(([delegate, dac, tokenInfo]) => dacs.patch(dac._id, {
        delegateId,
        pluginAddress: delegate.plugin,
        tokenAddress: tokenInfo.address,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
      }))
      .then((dac) => {
        this._addPledgeAdmin(delegateId, 'dac', dac._id)
          .then(() => dac);
      })
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        console.error('_addDelegate error ->', err); // eslint-disable-line no-console
      });
  }


  addProject(event) {
    if (event.event !== 'ProjectAdded') throw new Error('addProject only handles ProjectAdded events');

    const projectId = event.returnValues.idProject;
    const txHash = event.transactionHash;

    return this.liquidPledging.getPledgeAdmin(projectId)
      .then(project => Promise.all([project, this.web3.eth.getCode(project.plugin)]))
      .then(([project, byteCode]) => {
        if (byteCode === LPPMilestoneRuntimeByteCode) return this._addMilestone(project, projectId, txHash);
        if (byteCode === LPPCampaignRuntimeByteCode) return this._addCampaign(project, projectId, txHash);

        console.error('AddProject event with unknown plugin byteCode ->', event); // eslint-disable-line no-console
      });
  }

  _addMilestone(project, projectId, txHash, retry = false) {
    const milestones = this.app.service('/milestones');
    const campaigns = this.app.service('/campaigns');

    const lppMilestone = new LPPMilestone(this.web3, project.plugin);

    // get_or_create campaign by projectId
    const findCampaign = campaignProjectId => campaigns.find({ query: { projectId: campaignProjectId } })
      .then(({ data }) => {
        // create a campaign if necessary
        if (data.length === 0) {
          // TODO do we need to create an owner here?

          return this.liquidPledging.getPledgeAdmin(campaignProjectId)
            .then(campaignProject => campaigns.create({
              ownerAddress: campaignProject.addr,
              title: campaignProject.name,
              projectId: campaignProjectId,
              totalDonated: '0',
              donationCount: 0,
            }))
            .then(campaign => campaign._id);
        }

        if (data.length > 1) {
          console.warn('more then 1 campaign with the same projectId found: ', data); // eslint-disable-line no-console
        }

        return data[0]._id;
      });

    // get_or_create milestone by title and ownerAddress
    const findMilestone = () => milestones.find({ query: { txHash } })
      .then(({ data }) => {
        if (data.length === 0) {
          if (!retry) {
            // this is really only useful when instant mining. Other then that, the milestone should always be
            // created before the tx was mined.
            setTimeout(() => this._addMilestone(project, projectId, txHash, true), 5000);
            throw new BreakSignal();
          }

          return Promise.all([findCampaign(project.parentProject), this.web3.eth.getTransaction(txHash), lppMilestone.milestoneReviewer(), lppMilestone.campaignReviewer()])
            .then(([campaignId, tx, mReviewer, cReviewer]) => milestones.create({
              ownerAddress: tx.from,
              pluginAddress: project.plugin,
              reviewerAddress: mReviewer,
              campaignReviewerAddress: cReviewer,
              title: project.name,
              description: '',
              txHash,
              campaignId,
              totalDonated: '0',
              donationCount: 0,
            }))
            .catch((err) => {
              // milestones service will throw BadRequest error if reviewer isn't whitelisted
              if (err.name === 'BadRequest') throw new BreakSignal();

              throw err;
            });
        }

        if (data.length > 1) {
          console.warn('more then 1 milestone with the same txHash found: ', data); // eslint-disable-line no-console
        }

        return data[0];
      });

    return Promise.all([findMilestone(), lppMilestone.maxAmount(), lppMilestone.milestoneReviewer(), lppMilestone.campaignReviewer(), lppMilestone.recipient(), lppMilestone.accepted(), lppMilestone.isCanceled()])
      .then(([milestone, maxAmount, milestoneReviewer, campaignReviewer, recipient, accepted, canceled]) => milestones.patch(milestone._id, {
        projectId,
        maxAmount,
        reviewerAddress: milestoneReviewer,
        campaignReviewerAddress: campaignReviewer,
        recipientAddress: recipient,
        title: project.name,
        pluginAddress: project.plugin,
        status: milestoneStatus(accepted, canceled),
        mined: true,
      }))
      .then((milestone) => {
        this._addPledgeAdmin(projectId, 'milestone', milestone._id)
          .then(() => milestone);
      })
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        console.error('_addMilestone error ->', err); // eslint-disable-line no-console
      });
  }

  _addCampaign(project, projectId, txHash, retry = false) {
    const campaigns = this.app.service('/campaigns');

    // get_or_create campaign by title and ownerAddress
    const findCampaign = () => campaigns.find({ query: { txHash } })
      .then(({ data }) => {
        // create a campaign if necessary
        if (data.length === 0) {
          if (!retry) {
            // this is really only useful when instant mining. Other then that, the campaign should always be
            // created before the tx was mined.
            setTimeout(() => this._addCampaign(project, projectId, txHash, true), 5000);
            throw new BreakSignal();
          }

          return this.web3.eth.getTransaction(txHash)
            .then(tx => campaigns.create({
              ownerAddress: tx.from,
              pluginAddress: project.plugin,
              title: project.name,
              description: '',
              txHash,
              totalDonated: '0',
              donationCount: 0,
            }))
            .catch((err) => {
              // campaigns service will throw BadRequest error if reviewer isn't whitelisted
              if (err.name === 'BadRequest') throw new BreakSignal();

              throw err;
            });
        }

        if (data.length > 1) {
          console.warn('more then 1 campaign with the same title and ownerAddress found: ', data); // eslint-disable-line no-console
        }

        return data[0];
      });

    const lppCampaign = new LPPCampaign(this.web3, project.plugin);


    const getTokenInfo = () => lppCampaign.token().then(addr => getTokenInformation(this.web3, addr));

    return Promise.all([findCampaign(), lppCampaign.isCanceled(), lppCampaign.reviewer(), getTokenInfo()])
      .then(([campaign, canceled, reviewer, tokenInfo]) => campaigns.patch(campaign._id, {
        projectId,
        title: project.name,
        reviewerAddress: reviewer,
        pluginAddress: project.plugin,
        status: (canceled) ? 'Canceled' : 'Active',
        mined: true,
        tokenAddress: tokenInfo.address,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
      }))
      .then((campaign) => {
        this._addPledgeAdmin(projectId, 'campaign', campaign._id)
          .then(() => campaign);
      })
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        console.error('_addCampaign error ->', err); // eslint-disable-line no-console
      });
  }

  updateProject(event) {
    if (event.event !== 'ProjectUpdated') throw new Error('updateProject only handles ProjectUpdated events');

    const projectId = event.returnValues.idProject;

    // we make the assumption that if there is a parentProject, then the project is a milestone, otherwise it is a campaign
    return this.liquidPledging.getPledgeAdmin(projectId)
      .then(project => ((project.parentProject > 0) ? this._updateMilestone(project, projectId) : this._updateCampaign(project, projectId)));
  }

  _updateMilestone(project, projectId) {
    const milestones = this.app.service('/milestones');

    const getMilestone = () => milestones.find({ query: { projectId } })
      .then(({ data }) => {
        if (data.length === 0) {
          this._addMilestone(project, projectId);
          throw new BreakSignal();
        }

        if (data.length > 1) {
          console.warn('more then 1 milestone with the same projectId found: ', data); // eslint-disable-line no-console
        }

        return data[0];
      });

    return getMilestone()
      .then(milestone => milestones.patch(milestone._id, {
        // ownerAddress: project.addr, // TODO project.addr is the milestone contract, need to fix
        title: project.name,
      }))
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        console.error('_updateMilestone error ->', err); // eslint-disable-line no-console
      });
  }

  _updateCampaign(project, projectId) {
    const campaigns = this.app.service('/campaigns');

    const getCampaign = () => campaigns.find({ query: { projectId } })
      .then(({ data }) => {
        if (data.length === 0) {
          this._addCampaign(project, projectId);
          throw new BreakSignal();
        }

        if (data.length > 1) {
          console.warn('more then 1 campaign with the same projectId found: ', data); // eslint-disable-line no-console
        }

        return data[0];
      });

    return getCampaign()
      .then(campaign => campaigns.patch(campaign._id, {
        ownerAddress: project.addr,
        title: project.name,
      }))
      .catch((err) => {
        if (err instanceof BreakSignal) return;
        console.error('_updateCampaign error ->', err); // eslint-disable-line no-console
      });
  }

  cancelProject(event) {
    if (event.event !== 'CancelProject') throw new Error('cancelProject only handles CancelProject events');

    const projectId = event.returnValues.idProject;

    return this.app.service('pledgeAdmins').get(projectId)
      .then((pledgeAdmin) => {
        let service;
        if (pledgeAdmin.type === 'campaign') {
          service = this.app.service('campaigns');
          // cancel all milestones
          this.app.service('milestones').patch(null, {
            status: 'Canceled',
            mined: true,
            txHash: event.transactionHash,
          }, {
            query: {
              campaignId: pledgeAdmin.typeId,
              $not: {
                status: 'Canceled',
              },
            },
          })
            .then(milestones => milestones.map(m => m._id))
            .then((milestoneIds) => {
              this.app.service('donations').find({
                paginate: false,
                query: {
                  $or: [
                    { ownerId: { $in: milestoneIds } },
                    { intendedProjectId: { $in: milestoneIds } },
                  ],
                  paymentStatus: 'Pledged', // TODO what happens when paying?
                },
              })
                .then(data => data.forEach(donation => this._revertDonation(donation)))
                .catch(console.error);
            });
        } else {
          service = this.app.service('milestones');
        }

        // revert donations
        this.app.service('donations').find({
          paginate: false,
          query: {
            $or: [
              { ownerId: pledgeAdmin.typeId },
              { intendedProjectId: pledgeAdmin.typeId },
            ],
          },
        })
          .then(data => data.forEach(donation => this._revertDonation(donation)))
          .catch(console.error);

        // update admin entity
        return service.patch(pledgeAdmin.typeId, {
          status: 'Canceled',
          mined: true,
        });
      })
      .catch((error) => {
        if (error.name === 'NotFound') return;
        console.log(error);
      });
  }

  _revertDonation(donation) {
    const pledgeAdmins = this.app.service('pledgeAdmins');
    const donations = this.app.service('donations');

    const getAdmin = id => pledgeAdmins.get(id)
      .catch((error) => {
        if (error.name === 'NotFound') return undefined;

        console.error(error);
        return undefined;
      });

    const getMostRecentPledgeNotCanceled = (pledgeId) => {
      if (pledgeId === 0) return Promise.reject(new Error('pledgeId === 0, not sure what to do'));

      return this.liquidPledging.getPledge(pledgeId)
        .then(pledge => Promise.all([getAdmin(pledge.owner), pledge]))
        .then(([pledgeOwnerAdmin, pledge]) => {
          // if pledgeOwnerAdmin is not a giver, then it is a campaign/milestone
          // if the campaign/milestone is canceled, go back 1 pledge
          if (pledgeOwnerAdmin.type !== 'giver' && pledgeOwnerAdmin.admin.status === 'Canceled') {
            return getMostRecentPledgeNotCanceled(pledge.oldPledge);
          }

          const pledgeInfo = {
            pledgeOwnerAdmin,
            pledge,
          };

          return (pledge.nDelegates > 0) ?
            this.liquidPledging.getPledgeDelegate(pledgeId, pledge.nDelegates)
              .then(delegate => pledgeAdmins.get(delegate.idDelegate))
              .then(delegate => Object.assign(pledgeInfo, { pledgeDelegateAdmin: delegate })) :
            pledgeInfo;
        });
    };

    return getMostRecentPledgeNotCanceled(donation.pledgeId)
      .then(({
        pledgeOwnerAdmin, pledge, pledgeDelegateAdmin,
      }) => {
        const status = (pledgeOwnerAdmin.type === 'giver' || pledgeDelegateAdmin) ? 'waiting' : 'committed';

        const mutation = {
          paymentStatus: pledgeState(pledge.pledgeState),
          // updatedAt: //TODO get block time
          owner: pledge.owner,
          ownerId: pledgeOwnerAdmin.typeId,
          ownerType: pledgeOwnerAdmin.type,
          commitTime: (pledge.commitTime) ? new Date(pledge.commitTime * 1000) : new Date(),
          status,
        };

        // In liquidPledging, the oldPledge is only set in transferOwnershipToProject
        // thus an oldPledge will never have an intendedProject, so we remove it if present
        if (donation.intendedProject) {
          Object.assign(mutation, {
            $unset: {
              intendedProject: true,
              intendedProjectId: true,
              intendedProjectType: true,
            },
          });
        }

        if (pledgeDelegateAdmin) {
          Object.assign(mutation, {
            delegate: pledgeDelegateAdmin.id,
            delegateId: pledgeDelegateAdmin.typeId,
          });
        }

        if (pledge.pledgeState !== '0') console.log('why does pledge have non `Pledged` pledgeState? ->', pledge);

        return donations.patch(donation._id, mutation);
      }).catch(console.error);
  }

  _addPledgeAdmin(id, type, typeId) {
    const pledgeAdmins = this.app.service('pledgeAdmins');

    return pledgeAdmins.create({ id, type, typeId })
      .catch((err) => {
        // TODO if the pledgeAdmin already exists, then verify the type and typeId and return the admin
        console.log('create pledgeAdmin error =>', err);
      });
  }
}

export default Admins;
