import LPPMilestone from 'lpp-milestone';
import { LPPMilestoneByteCode } from 'lpp-milestone/build/LPPMilestone.sol';
import LPPCampaign from 'lpp-campaign';
import { LPPCampaignByteCode } from 'lpp-campaign/build/LPPCampaign.sol';

import { campaignStatus, milestoneStatus } from './helpers';

const BreakSignal = () => {
};

const LPPCampaignRuntimeByteCode = '0x606060405236156100b45763ffffffff60e060020a600035041663200d2ed281146100b95780634ce3791e146100f057806374041d1f1461011f57806379ba5097146101325780637ec4c705146101475780638652d8d61461015a5780638da5cb5b1461017957806394edc3591461018c578063980e7844146101bc578063a54044f8146101cf578063a6f9dae1146101e2578063ad1483c314610201578063d4edf5e514610236578063d4ee1d901461027d575b600080fd5b34156100c457600080fd5b6100cc610290565b604051808260018111156100dc57fe5b60ff16815260200191505060405180910390f35b34156100fb57600080fd5b6101036102a0565b604051600160a060020a03909116815260200160405180910390f35b341561012a57600080fd5b6101036102af565b341561013d57600080fd5b6101456102be565b005b341561015257600080fd5b610145610307565b341561016557600080fd5b610145600160a060020a0360043516610356565b341561018457600080fd5b6101036103a0565b341561019757600080fd5b61019f6103af565b60405167ffffffffffffffff909116815260200160405180910390f35b34156101c757600080fd5b6101456103c6565b34156101da57600080fd5b6101036104f6565b34156101ed57600080fd5b610145600160a060020a0360043516610505565b341561020c57600080fd5b61014567ffffffffffffffff6004358116906024358116906044358116906064351660843561054f565b341561024157600080fd5b61026b67ffffffffffffffff60043581169060243581169060443581169060643516608435610556565b60405190815260200160405180910390f35b341561028857600080fd5b610103610698565b60045460a060020a900460ff1681565b600454600160a060020a031681565b600254600160a060020a031681565b60015433600160a060020a0390811691161415610305576001546000805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a039092169190911790555b565b60045433600160a060020a0390811691161461032257600080fd5b600480546003805473ffffffffffffffffffffffffffffffffffffffff19908116600160a060020a03841617909155169055565b60035433600160a060020a0390811691161461037157600080fd5b6004805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0392909216919091179055565b600054600160a060020a031681565b60025460a060020a900467ffffffffffffffff1681565b60005433600160a060020a03908116911614806103f1575060035433600160a060020a039081169116145b15156103fc57600080fd5b600060045460a060020a900460ff16600181111561041657fe5b1461042057600080fd5b600254600160a060020a0381169063796d56549060a060020a900467ffffffffffffffff1660405160e060020a63ffffffff841602815267ffffffffffffffff9091166004820152602401600060405180830381600087803b151561048457600080fd5b6102c65a03f1151561049557600080fd5b50506004805474ff0000000000000000000000000000000000000000191660a060020a17905550600254600160a060020a03167f3be3cf8b79824600b33b84642199163dc824bc8afdc691d0bcd8a849e39f92fc60405160405180910390a2565b600354600160a060020a031681565b60005433600160a060020a0390811691161461052057600080fd5b6001805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0392909216919091179055565b5050505050565b600254600090819033600160a060020a0390811691161461057657600080fd5b600254600160a060020a031663cb9123ff87600060405160e0015260405160e060020a63ffffffff841602815267ffffffffffffffff909116600482015260240160e060405180830381600087803b15156105d057600080fd5b6102c65a03f115156105e157600080fd5b5050506040518051906020018051906020018051906020018051906020018051906020018051906020018051905050505093505050506101ff8467ffffffffffffffff16148061065d57506101008467ffffffffffffffff1614801561065d575060025467ffffffffffffffff82811660a060020a9092041614155b1561068a57600060045460a060020a900460ff16600181111561067c57fe5b1461068a576000915061068e565b8291505b5095945050505050565b600154600160a060020a0316815600a165627a7a7230582028d8154c8c1ead23ab39437b47fd920fafef615329007c5034ee11dfe0da93310029';


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
        this._addNoteManager(donorId, 'donor', user.address)
          .then(() => user);
      })
      .catch(err => console.error('_addDonor error ->', err));
  }


  //TODO support delegates other then dacs
  addDelegate(event) {
    if (event.event !== 'DelegateAdded') throw new Error('addDelegate only handles DelegateAdded events');

    this._addDelegate(event.returnValues.idDelegate, event.transactionHash);
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

  _addDelegate(delegateId, txHash, retry = false) {
    const dacs = this.app.service('/dacs');

    const findDAC = (delegate) => {
      return dacs.find({ query: { txHash } })
        .then(({ data }) => {

          if (data.length === 0) {
            if (!retry) {
              // this is really only useful when instant mining. Other then that, the dac should always be
              // created before the tx was mined.
              setTimeout(() => this._addDelegate(delegateId, txHash, true), 5000);
              throw new BreakSignal();
            }
            //TODO do we need to create an owner here?
            //TODO maybe don't create new dac as all creating is done via the ui? Do we want to show delegates added not via the ui?

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
        ownerAddress: delegate.addr,
      }))
      .then(dac => {
        this._addNoteManager(delegateId, 'dac', dac._id)
          .then(() => dac);
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        console.error('_addDelegate error ->', err); //eslint-disable-line no-console
      });
  }


  addProject(event) {
    if (event.event !== 'ProjectAdded') throw new Error('addProject only handles ProjectAdded events');

    const projectId = event.returnValues.idProject;
    const txHash = event.transactionHash;

    return this.liquidPledging.getNoteManager(projectId)
      .then(project => Promise.all([ project, this.web3.eth.getCode(project.plugin) ]))
      .then(([ project, byteCode ]) => {

        // if (byteCode === LPPMilestoneByteCode) return this._addMilestone(project, projectId, txHash);
        // if (byteCode === LPPCampaignByteCode) return this._addCampaign(project, projectId, txHash);

        // console.error('AddProject event with unknown plugin byteCode ->', event); // eslint-disable-line no-console
        //TODO remove this after runtimeByteCode is added to solcpiler
        if (byteCode === LPPCampaignRuntimeByteCode) return this._addCampaign(project, projectId, txHash);
        return this._addMilestone(project, projectId, txHash);
      });
  }

  _addMilestone(project, projectId, txHash, retry = false) {
    const milestones = this.app.service('/milestones');
    const campaigns = this.app.service('/campaigns');

    const lppMilestone = new LPPMilestone(this.web3, project.plugin);

    // get_or_create campaign by projectId
    const findCampaign = (campaignProjectId) => {
      return campaigns.find({ query: { projectId: campaignProjectId } })
        .then(({ data }) => {

          // create a campaign if necessary
          if (data.length === 0) {
            //TODO do we need to create an owner here?

            return this.liquidPledging.getNoteManager(campaignProjectId)
              .then(campaignProject => campaigns.create({
                ownerAddress: campaignProject.addr,
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
      return milestones.find({ query: { txHash } })
        .then(({ data }) => {

          if (data.length === 0) {
            if (!retry) {
              // this is really only useful when instant mining. Other then that, the milestone should always be
              // created before the tx was mined.
              setTimeout(() => this._addMilestone(project, projectId, txHash, true), 5000);
              throw new BreakSignal();
            }
            //TODO do we need to create an owner here?

            return Promise.all([ findCampaign(project.parentProject), this.web3.eth.getTransaction(txHash) ])
              .then(([ campaignId, tx ]) => milestones.create({
                ownerAddress: tx.from,
                pluginAddress: project.plugin,
                title: project.name,
                description: '',
                txHash,
                campaignId,
              }));
          }

          if (data.length > 1) {
            console.warn('more then 1 milestone with the same txHash found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    return Promise.all([ findMilestone(), lppMilestone.maxAmount(), lppMilestone.reviewer(), lppMilestone.recipient(), lppMilestone.state() ])
      .then(([ milestone, maxAmount, reviewer, recipient, state ]) => milestones.patch(milestone._id, {
        projectId,
        maxAmount,
        reviewerAddress: reviewer,
        recipientAddress: recipient,
        title: project.name,
        pluginAddress: project.plugin,
        status: milestoneStatus(state),
        mined: true,
      }))
      .then(milestone => {
        this._addNoteManager(projectId, 'milestone', milestone._id)
          .then(() => milestone);
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        console.error('_addMilestone error ->', err); //eslint-disable-line no-console
      });
  }

  _addCampaign(project, projectId, txHash, retry = false) {
    const campaigns = this.app.service('/campaigns');

    // get_or_create campaign by title and ownerAddress
    const findCampaign = () => {
      return campaigns.find({ query: { txHash } })
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
              }));
          }

          if (data.length > 1) {
            console.warn('more then 1 campaign with the same title and ownerAddress found: ', data); // eslint-disable-line no-console
          }

          return data[ 0 ];
        });
    };

    const lppCampaign = new LPPCampaign(this.web3, project.plugin);

    return Promise.all([ findCampaign(), lppCampaign.status(), lppCampaign.reviewer() ])
      .then(([ campaign, status, reviewer ]) => campaigns.patch(campaign._id, {
        projectId,
        title: project.name,
        ownerAddress: project.addr,
        reviewerAddress: reviewer,
        pluginAddress: project.plugin,
        status: campaignStatus(status),
      }))
      .then(campaign => {
        this._addNoteManager(projectId, 'campaign', campaign._id)
          .then(() => campaign);
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        console.error('_addCampaign error ->', err); //eslint-disable-line no-console
      });
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
          ownerAddress: project.addr, // TODO project.addr is the milestone contract, need to fix
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
    const noteManagers = this.app.service('noteManagers');

    return noteManagers.create({ id, type, typeId })
      .catch(err => {
        // TODO if the noteManager already exists, then verify the type and typeId and return the manager
        console.log('create noteManager error =>', err);
      });
  }
}

export default Managers;
