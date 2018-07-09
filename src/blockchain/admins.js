const logger = require('winston');
const giversFactory = require('./givers');
const delegatesFactory = require('./delegates');
const projectsFactory = require('./projects');
const to = require('../utils/to');

/**
 *
 * @param {object} app feathers app instance
 * @param {object} liquidPledging lp contract instance
 * @param {object} queue queue instance
 * @returns {object} obj to handle events from lp Admins
 */
const adminFactory = (app, liquidPledging, queue) => {
  const givers = giversFactory(app, liquidPledging, queue);
  const delegates = delegatesFactory(app, liquidPledging);
  const projects = projectsFactory(app, liquidPledging);

  // eslint-disable-next-line consistent-return
  async function createPledgeAdmin(id, type, typeId) {
    const pledgeAdmins = app.service('pledgeAdmins');

    try {
      return await pledgeAdmins.create({ id, type, typeId });
    } catch (err) {
      if (err.errorType === 'uniqueViolated') {
        // TODO specify schema here so the 'admin' object isn't attached to the fetched pledgeAdmin
        const [error, admin] = await to(pledgeAdmins.get(id));

        if (error) {
          logger.error(error);
        } else if (admin.type !== type || admin.typeId !== typeId) {
          logger.error(
            `existing pledgeAdmin id: ${id} -> type/typeId: ${admin.type}/${
              admin.typeId
            } does not match expected: ${type}/${typeId}`,
          );
        }

        return admin;
      }
      logger.error('create pledgeAdmin error =>', err);
    }
  }

  return {
    /**
     * handle `GiverAdded` events
     *
     * @param {object} event Web3 event object
     */
    async addGiver(event) {
      const user = await givers.addGiver(event);
      if (user) {
        createPledgeAdmin(user.giverId, 'giver', user.address);
      }
    },

    /**
     * handle `GiverUpdated` events
     *
     * @param {object} event Web3 event object
     */
    async updateGiver(event) {
      const user = await givers.updateGiver(event);
      if (user) {
        createPledgeAdmin(user.giverId, 'giver', user.address);
      }
    },

    /**
     * handle `DelegateAdded` events
     *
     * @param {object} event Web3 event object
     */
    async addDelegate(event) {
      const delegate = await delegates.addDelegate(event);

      if (delegate) {
        createPledgeAdmin(delegate.delegateId, 'dac', delegate._id);
      }
    },

    /**
     * handle `DelegateUpdated` events
     *
     * @param {object} event Web3 event object
     */
    async updateDelegate(event) {
      const delegate = await delegates.updateDelegate(event);

      // a new delegate is created if the createdAt & updatedAt are significantly different
      const fifteenSeconds = 15 * 1000;
      if (delegate.updatedAt - delegate.createdAt > fifteenSeconds) {
        createPledgeAdmin(delegate.delegateId, 'dac', delegate._id);
      }
    },

    /**
     * handle `ProjectAdded` events
     *
     * @param {object} event Web3 event object
     */
    async addProject(event) {
      const project = await projects.addProject(event);

      if (project) {
        // only milestones have a maxAmount
        const type = project.maxAmount ? 'milestone' : 'campaign';
        createPledgeAdmin(project.projectId, type, project._id);
      }
    },

    /**
     * handle `ProjectUpdated` events
     *
     * @param {object} event Web3 event object
     */
    async updateProject(event) {
      const project = await projects.updateProject(event);

      // a new project is created if the createdAt & updatedAt are significantly different
      const fifteenSeconds = 15 * 1000;
      if (project.updatedAt - project.createdAt > fifteenSeconds) {
        // only milestones have a maxAmount
        const type = project.maxAmount ? 'milestone' : 'campaign';
        createPledgeAdmin(project.projectId, type, project._id);
      }
    },

    /**
     * handle `CancelProject` events
     *
     * @param {object} event Web3 event object
     */
    cancelProject(event) {
      projects.cancelProject(event);
    },

    /**
     * handle `SetApp` events
     *
     * @param {object} event Web3 event object
     */
    setApp(event) {
      projects.setApp(event);
    },
  };
};

module.exports = adminFactory;
