import logger from 'winston';

import { Kernel, AppProxyUpgradeable } from 'giveth-liquidpledging/build/contracts';
import { LPPCappedMilestone } from 'lpp-capped-milestone';
import { LPPCampaign } from 'lpp-campaign';
import { LPPDac } from 'lpp-dac';

import { getTokenInformation, milestoneStatus, pledgeState } from './helpers';

class BreakSignal extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, BreakSignal);
  }
}

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

    this.queue.startProcessing(event.transactionHash);
    this.liquidPledging
      .getPledgeAdmin(returnValues.idGiver)
      .then(giver => this._addGiver(giver, returnValues.idGiver, event.transactionHash))
      .catch(err => logger.error('addGiver error ->', err));
  }

  updateGiver(event) {
    if (event.event !== 'GiverUpdated')
      throw new Error('updateGiver only handles GiverUpdated events');

    const giverId = event.returnValues.idGiver;

    const users = this.app.service('/users');

    const getUser = () =>
      users.find({ query: { giverId } }).then(({ data }) => {
        if (data.length === 0) {
          this.liquidPledging
            .getPledgeAdmin(giverId)
            .then(giver => this._addGiver(giver, giverId, 0))
            .catch(err => logger.error('updateGiver error ->', err));
          throw new BreakSignal();
        }

        if (data.length > 1) {
          logger.info('more then 1 user with the same giverId found: ', data);
        }

        return data[0];
      });

    Promise.all([getUser(), this.liquidPledging.getPledgeAdmin(giverId)])
      .then(([user, giver]) => {
        // If a giver changes address, update users to reflect the change.
        if (giver.addr !== user.address) {
          logger.info(
            `giver address "${giver.addr}" differs from users address "${
              user.address
            }". Updating users to match`,
          );
          users.patch(user.address, { $unset: { giverId: true } });
          return this._addGiver(giver, giverId, 0);
        }

        const mutation = { commitTime: giver.commitTime };
        if (giver.name && giver.name !== user.name) {
          mutation.name = giver.name;
        }

        return users.patch(user.address, mutation);
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        logger.error('updateGiver error ->', err);
      });
  }

  _addGiver(giver, giverId, txHash) {
    const { commitTime, addr, name } = giver;
    const users = this.app.service('/users');

    let user;
    return users
      .get(addr)
      .catch(err => {
        if (err.name === 'NotFound') {
          return users.create({
            address: addr,
          });
        }

        throw err;
      })
      .then(u => {
        user = u;
        if (
          user.giverId &&
          (user.giverId !== 0 || user.giverId !== '0') &&
          user.giverId !== giverId
        ) {
          logger.error(
            `user already has a giverId set. existing giverId: ${
              user.giverId
            }, new giverId: ${giverId}`,
          );
        }

        const mutation = { commitTime, giverId };
        if (!user.name) {
          mutation.name = name;
        }
        return users.patch(user.address, mutation);
      })
      .then(user => this._addPledgeAdmin(giverId, 'giver', user.address))
      .then(() => this.queue.purge(txHash))
      .then(() => this.queue.finishedProcessing(txHash))
      .then(() => user)
      .catch(err => logger.error('_addGiver error ->', err));
  }

  addDelegate(event) {
    if (event.event !== 'DelegateAdded')
      throw new Error('addDelegate only handles DelegateAdded events');

    this._addDelegate(event.returnValues.idDelegate, event.transactionHash);
  }

  updateDelegate(event) {
    if (event.event !== 'DelegateUpdated')
      throw new Error('updateDelegate only handles DelegateUpdated events');

    const delegateId = event.returnValues.idDelegate;

    const dacs = this.app.service('/dacs');

    const getDAC = () =>
      dacs.find({ query: { delegateId } }).then(({ data }) => {
        if (data.length === 0) {
          this._addDelegate(delegateId);
          throw new BreakSignal();
        }

        if (data.length > 1) {
          logger.warn('more then 1 dac with the same delegateId found: ', data);
        }

        return data[0];
      });

    Promise.all([getDAC(), this.liquidPledging.getPledgeAdmin(delegateId)])
      .then(([dac, delegate]) =>
        dacs.patch(dac._id, {
          title: delegate.name,
        }),
      )
      .catch(err => {
        if (err instanceof BreakSignal) return;
        logger.error('updateDelegate error ->', err);
      });
  }

  _addDelegate(delegateId, txHash, retry = false) {
    const dacs = this.app.service('/dacs');

    const findDAC = delegate =>
      dacs.find({ query: { txHash } }).then(({ data }) => {
        if (data.length === 0) {
          if (!retry) {
            // this is really only useful when instant mining. Other then that, the dac should always be
            // created before the tx was mined.
            setTimeout(() => this._addDelegate(delegateId, txHash, true), 5000);
            throw new BreakSignal();
          }

          return this.web3.eth
            .getTransaction(txHash)
            .then(tx =>
              dacs.create({
                ownerAddress: tx.from,
                pluginAddress: delegate.plugin,
                title: delegate.name,
                totalDonated: '0',
                donationCount: 0,
                description: '',
              }),
            )
            .catch(err => {
              // dacs service will throw BadRequest error if owner isn't whitelisted
              if (err.name === 'BadRequest') throw new BreakSignal();

              throw err;
            });
        }

        if (data.length > 1) {
          logger.info('more then 1 dac with the same ownerAddress and title found: ', data);
        }

        return data[0];
      });

    const getTokenInfo = delegate =>
      new LPPDac(this.web3, delegate.plugin)
        .dacToken()
        .then(token => getTokenInformation(this.web3, token));

    return this.liquidPledging
      .getPledgeAdmin(delegateId)
      .then(delegate => Promise.all([delegate, findDAC(delegate), getTokenInfo(delegate)]))
      .then(([delegate, dac, tokenInfo]) =>
        dacs.patch(dac._id, {
          delegateId,
          pluginAddress: delegate.plugin,
          tokenAddress: tokenInfo.address,
          tokenSymbol: tokenInfo.symbol,
          tokenName: tokenInfo.name,
        }),
      )
      .then(dac => {
        this._addPledgeAdmin(delegateId, 'dac', dac._id).then(() => dac);
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        logger.error('_addDelegate error ->', err);
      });
  }

  addProject(event) {
    if (event.event !== 'ProjectAdded')
      throw new Error('addProject only handles ProjectAdded events');

    const projectId = event.returnValues.idProject;
    const txHash = event.transactionHash;

    return this.getAndSetAppBases().then(() =>
      this.liquidPledging
        .getPledgeAdmin(projectId)
        .then(project =>
          Promise.all([
            project,
            new AppProxyUpgradeable(this.web3, project.plugin).implementation(),
          ]),
        )
        .then(([project, baseCode]) => {
          if (!this.milestoneBase || !this.campaignBase)
            logger.error(
              'missing milestone or campaign base',
              this.milestoneBase,
              this.campaignBase,
            );
          if (baseCode === this.milestoneBase)
            return this._addMilestone(project, projectId, txHash);
          if (baseCode === this.campaignBase) return this._addCampaign(project, projectId, txHash);

          logger.error('AddProject event with unknown plugin baseCode ->', event, baseCode);
        }),
    );
  }

  _addMilestone(project, projectId, txHash, retry = false) {
    const milestones = this.app.service('/milestones');
    const campaigns = this.app.service('/campaigns');

    // get_or_create campaign by projectId
    const findCampaign = campaignProjectId =>
      campaigns.find({ query: { projectId: campaignProjectId } }).then(({ data }) => {
        // create a campaign if necessary
        if (data.length === 0) {
          // TODO do we need to create an owner here?

          return this.liquidPledging
            .getPledgeAdmin(campaignProjectId)
            .then(campaignProject =>
              campaigns.create({
                ownerAddress: campaignProject.addr,
                title: campaignProject.name,
                projectId: campaignProjectId,
                totalDonated: '0',
                donationCount: 0,
              }),
            )
            .then(campaign => campaign._id);
        }

        if (data.length > 1) {
          logger.info('more then 1 campaign with the same projectId found: ', data);
        }

        return data[0]._id;
      });

    // get_or_create milestone by title and ownerAddress
    const findMilestone = () =>
      milestones.find({ query: { txHash } }).then(({ data }) => {
        if (data.length === 0) {
          if (!retry) {
            // this is really only useful when instant mining. Other then that, the milestone should always be
            // created before the tx was mined.
            setTimeout(() => this._addMilestone(project, projectId, txHash, true), 5000);
            throw new BreakSignal();
          }

          return Promise.all([
            findCampaign(project.parentProject),
            this.web3.eth.getTransaction(txHash),
          ])
            .then(([campaignId, tx]) =>
              milestones.create({
                ownerAddress: tx.from,
                pluginAddress: project.plugin,
                reviewerAddress: '0x0000000000000000000000000000000000000000', // these will be set in the patch
                campaignReviewerAddress: '0x0000000000000000000000000000000000000000',
                title: project.name,
                description: '',
                txHash,
                campaignId,
                totalDonated: '0',
                donationCount: 0,
              }),
            )
            .catch(err => {
              // milestones service will throw BadRequest error if reviewer isn't whitelisted
              if (err.name === 'BadRequest') throw new BreakSignal();

              throw err;
            });
        }

        if (data.length > 1) {
          logger.error('more then 1 milestone with the same txHash found: ', data);
        }

        return data[0];
      });

    const cappedMilestone = new LPPCappedMilestone(this.web3, project.plugin);

    return Promise.all([
      findMilestone(),
      cappedMilestone.maxAmount(),
      cappedMilestone.reviewer(),
      cappedMilestone.campaignReviewer(),
      cappedMilestone.recipient(),
      cappedMilestone.completed(),
      this.liquidPledging.isProjectCanceled(projectId),
    ])
      .then(([milestone, maxAmount, reviewer, campaignReviewer, recipient, completed, canceled]) =>
        milestones.patch(
          milestone._id,
          {
            projectId,
            maxAmount,
            reviewerAddress: reviewer,
            campaignReviewerAddress: campaignReviewer,
            recipientAddress: recipient,
            title: project.name,
            pluginAddress: project.plugin,
            status: milestoneStatus(completed, canceled),
            mined: true,
            performedByAddress: milestone.ownerAddress,
          },
          { eventTxHash: txHash },
        ),
      )
      .then(milestone => {
        this._addPledgeAdmin(projectId, 'milestone', milestone._id).then(() => milestone);
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        logger.error('_addMilestone error ->', err);
      });
  }

  _addCampaign(project, projectId, txHash, retry = false) {
    const campaigns = this.app.service('/campaigns');

    // get_or_create campaign by title and ownerAddress
    const findCampaign = () =>
      campaigns.find({ query: { txHash } }).then(({ data }) => {
        // create a campaign if necessary
        if (data.length === 0) {
          if (!retry) {
            // this is really only useful when instant mining. Other then that, the campaign should always be
            // created before the tx was mined.
            setTimeout(() => this._addCampaign(project, projectId, txHash, true), 5000);
            throw new BreakSignal();
          }

          const lppCampaign = new LPPCampaign(this.web3, project.plugin);

          return Promise.all([this.web3.eth.getTransaction(txHash), lppCampaign.reviewer()])
            .then(([tx, reviewerAddress]) =>
              campaigns.create({
                ownerAddress: tx.from,
                pluginAddress: project.plugin,
                reviewerAddress,
                title: project.name,
                description: '',
                txHash,
                totalDonated: '0',
                donationCount: 0,
              }),
            )
            .catch(err => {
              // campaigns service will throw BadRequest error if reviewer isn't whitelisted
              if (err.name === 'BadRequest') throw new BreakSignal();

              throw err;
            });
        }

        if (data.length > 1) {
          logger.error('more then 1 campaign with the same title and ownerAddress found: ', data);
        }

        return data[0];
      });

    const lppCampaign = new LPPCampaign(this.web3, project.plugin);

    const getTokenInfo = () =>
      lppCampaign.campaignToken().then(addr => getTokenInformation(this.web3, addr));

    return Promise.all([
      findCampaign(),
      lppCampaign.isCanceled(),
      lppCampaign.reviewer(),
      getTokenInfo(),
    ])
      .then(([campaign, canceled, reviewer, tokenInfo]) =>
        campaigns.patch(campaign._id, {
          projectId,
          title: project.name,
          reviewerAddress: reviewer,
          pluginAddress: project.plugin,
          status: canceled ? 'Canceled' : 'Active',
          mined: true,
          tokenAddress: tokenInfo.address,
          tokenSymbol: tokenInfo.symbol,
          tokenName: tokenInfo.name,
        }),
      )
      .then(campaign => {
        this._addPledgeAdmin(projectId, 'campaign', campaign._id).then(() => campaign);
      })
      .catch(err => {
        if (err instanceof BreakSignal) return;
        logger.error('_addCampaign error ->', err);
      });
  }

  updateProject(event) {
    if (event.event !== 'ProjectUpdated')
      throw new Error('updateProject only handles ProjectUpdated events');

    const projectId = event.returnValues.idProject;

    // we make the assumption that if there is a parentProject, then the project is a milestone, otherwise it is a campaign
    return this.liquidPledging
      .getPledgeAdmin(projectId)
      .then(
        project =>
          project.parentProject > 0
            ? this._updateMilestone(project, projectId)
            : this._updateCampaign(project, projectId),
      );
  }

  _updateMilestone(project, projectId) {
    const milestones = this.app.service('/milestones');

    const getMilestone = () =>
      milestones.find({ query: { projectId } }).then(({ data }) => {
        if (data.length === 0) {
          this._addMilestone(project, projectId);
          throw new BreakSignal();
        }

        if (data.length > 1) {
          logger.info('more then 1 milestone with the same projectId found: ', data);
        }

        return data[0];
      });

    return getMilestone()
      .then(milestone =>
        milestones.patch(milestone._id, {
          // ownerAddress: project.addr, // TODO project.addr is the milestone contract, need to fix
          title: project.name,
        }),
      )
      .catch(err => {
        if (err instanceof BreakSignal) return;
        logger.error('_updateMilestone error ->', err);
      });
  }

  _updateCampaign(project, projectId) {
    const campaigns = this.app.service('/campaigns');

    const getCampaign = () =>
      campaigns.find({ query: { projectId } }).then(({ data }) => {
        if (data.length === 0) {
          this._addCampaign(project, projectId);
          throw new BreakSignal();
        }

        if (data.length > 1) {
          logger.info('more then 1 campaign with the same projectId found: ', data);
        }

        return data[0];
      });

    return getCampaign()
      .then(campaign =>
        campaigns.patch(campaign._id, {
          ownerAddress: project.addr,
          title: project.name,
        }),
      )
      .catch(err => {
        if (err instanceof BreakSignal) return;
        logger.error('_updateCampaign error ->', err);
      });
  }

  setApp(event) {
    if (event.event !== 'SetApp') throw new Error('setApp only handles SetApp events');

    const { name, app } = event.returnValues;
    const { keccak256 } = this.web3.utils;

    if (name === keccak256('lpp-capped-milestone')) {
      this.milestoneBase = app;
    } else if (name === keccak256('lpp-campaign')) {
      this.campaignBase = app;
    } else {
      logger.warn(`Unkonwn name in SetApp event:`, event);
    }
  }

  getAndSetAppBases() {
    if (this.campaignBase && this.milestoneBase) return Promise.resolve();

    const { keccak256 } = this.web3.utils;

    return this.liquidPledging
      .kernel()
      .then(kernel => {
        const k = new Kernel(this.web3, kernel);

        return Promise.all([
          k.getApp(keccak256(keccak256('base') + keccak256('lpp-campaign').substr(2))),
          k.getApp(keccak256(keccak256('base') + keccak256('lpp-capped-milestone').substr(2))),
        ]);
      })
      .then(([campaignBase, milestoneBase]) => {
        this.campaignBase = campaignBase;
        this.milestoneBase = milestoneBase;
      });
  }

  cancelProject(event) {
    if (event.event !== 'CancelProject')
      throw new Error('cancelProject only handles CancelProject events');

    const projectId = event.returnValues.idProject;

    return this.app
      .service('pledgeAdmins')
      .get(projectId)
      .then(pledgeAdmin => {
        let service;
        if (pledgeAdmin.type === 'campaign') {
          service = this.app.service('campaigns');
          // cancel all milestones
          this.app
            .service('milestones')
            .patch(
              null,
              {
                status: 'Canceled',
                mined: true,
                txHash: event.transactionHash,
              },
              {
                query: {
                  campaignId: pledgeAdmin.typeId,
                  status: { $ne: 'Canceled' },
                },
              },
            )
            .then(milestones => milestones.map(m => m._id))
            .then(milestoneIds => {
              this.app
                .service('donations')
                .find({
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
                .catch(logger.error);
            });
        } else {
          service = this.app.service('milestones');
        }

        // revert donations
        this.app
          .service('donations')
          .find({
            paginate: false,
            query: {
              $or: [{ ownerId: pledgeAdmin.typeId }, { intendedProjectId: pledgeAdmin.typeId }],
            },
          })
          .then(data => data.forEach(donation => this._revertDonation(donation)))
          .catch(logger.error);

        // update admin entity
        return service.patch(
          pledgeAdmin.typeId,
          {
            status: 'Canceled',
            mined: true,
          },
          { eventTxHash: event.transactionHash },
        );
      })
      .catch(error => {
        if (error.name === 'NotFound') return;
        logger.error(error);
      });
  }

  _revertDonation(donation) {
    const pledgeAdmins = this.app.service('pledgeAdmins');
    const donations = this.app.service('donations');

    const getAdmin = id =>
      pledgeAdmins.get(id).catch(error => {
        if (error.name === 'NotFound') return undefined;

        logger.error(error);
        return undefined;
      });

    const getMostRecentPledgeNotCanceled = pledgeId => {
      if (pledgeId === 0) return Promise.reject(new Error('pledgeId === 0, not sure what to do'));

      return this.liquidPledging
        .getPledge(pledgeId)
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

          return pledge.nDelegates > 0
            ? this.liquidPledging
                .getPledgeDelegate(pledgeId, pledge.nDelegates)
                .then(delegate => pledgeAdmins.get(delegate.idDelegate))
                .then(delegate => Object.assign(pledgeInfo, { pledgeDelegateAdmin: delegate }))
            : pledgeInfo;
        });
    };

    return getMostRecentPledgeNotCanceled(donation.pledgeId)
      .then(({ pledgeOwnerAdmin, pledge, pledgeDelegateAdmin }) => {
        const status =
          pledgeOwnerAdmin.type === 'giver' || pledgeDelegateAdmin ? 'waiting' : 'committed';

        const mutation = {
          paymentStatus: pledgeState(pledge.pledgeState),
          // updatedAt: //TODO get block time
          owner: pledge.owner,
          ownerId: pledgeOwnerAdmin.typeId,
          ownerType: pledgeOwnerAdmin.type,
          commitTime: pledge.commitTime ? new Date(pledge.commitTime * 1000) : new Date(),
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

        if (pledge.pledgeState !== '0')
          logger.error('why does pledge have non `Pledged` pledgeState? ->', pledge);

        return donations.patch(donation._id, mutation);
      })
      .catch(logger.error);
  }

  _addPledgeAdmin(id, type, typeId) {
    const pledgeAdmins = this.app.service('pledgeAdmins');

    return pledgeAdmins.create({ id, type, typeId }).catch(err => {
      if (err.errorType === 'uniqueViolated') {
        // TODO specify schema here so the 'admin' object isn't attached to the fetched pledgeAdmin
        return pledgeAdmins
          .get(id)
          .then(admin => {
            if (admin.type !== type || admin.typeId !== typeId) {
              logger.error(
                `existing pledgeAdmin id: ${id} -> type/typeId: ${admin.type}/${
                  admin.typeId
                } does not match expected: ${type}/${typeId}`,
              );
            }

            return admin;
          })
          .catch(logger.error);
      }
      logger.error('create pledgeAdmin error =>', err);
    });
  }
}

export default Admins;
