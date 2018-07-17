const logger = require('winston');

const givers = (app, liquidPledging) => {
  const users = app.service('/users');

  async function getOrCreateUser(address) {
    try {
      return await users.get(address);
    } catch (err) {
      if (err.name === 'NotFound') {
        return users.create({
          address,
        });
      }

      throw err;
    }
  }

  async function addGiver(giver, giverId) {
    const { commitTime, addr, name } = giver;

    let user = await getOrCreateUser(addr);

    if (user.giverId > 0 && user.giverId !== Number(giverId)) {
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

    user = await users.patch(user.address, mutation);
    return user;
  }

  async function getUserById(giverId) {
    const data = await users.find({ paginate: false, query: { giverId } });

    if (data.length === 0) {
      const giver = await liquidPledging.getPledgeAdmin(giverId);
      return addGiver(giver, giverId);
    }

    if (data.length > 1) {
      logger.info('more then 1 user with the same giverId found: ', data);
    }

    return data[0];
  }

  return {
    /**
     * handle `GiverAdded` events
     *
     * @param {object} event Web3 event object
     * @returns {object} user|undefined
     */
    // eslint-disable-next-line consistent-return
    async addGiver(event) {
      if (event.event !== 'GiverAdded') throw new Error('addGiver only handles GiverAdded events');

      const { returnValues } = event;

      try {
        const giver = await liquidPledging.getPledgeAdmin(returnValues.idGiver);
        return addGiver(giver, returnValues.idGiver, event.transactionHash);
      } catch (err) {
        logger.error('addGiver error ->', err);
      }
    },

    /**
     * handle `GiverUpdated` events
     *
     * @param {object} event Web3 event object
     * @returns {object|undefined} if a new user is created, then the user is returned, otherwise undefined
     */
    // eslint-disable-next-line consistent-return
    async updateGiver(event) {
      if (event.event !== 'GiverUpdated') {
        throw new Error('updateGiver only handles GiverUpdated events');
      }

      const giverId = event.returnValues.idGiver;

      try {
        const [user, giver] = await Promise.all([
          getUserById(giverId),
          liquidPledging.getPledgeAdmin(giverId),
        ]);

        // If a giver changes address, update users to reflect the change.
        if (giver.addr !== user.address) {
          logger.info(
            `giver address "${giver.addr}" differs from users address "${
              user.address
            }". Updating users to match`,
          );
          users.patch(user.address, { $unset: { giverId: true } });
          return addGiver(giver, giverId);
        }

        const mutation = { commitTime: giver.commitTime };
        if (giver.name && giver.name !== user.name) {
          mutation.name = giver.name;
        }

        await users.patch(user.address, mutation);
      } catch (err) {
        logger.error('updateGiver error ->', err);
      }
    },
  };
};

module.exports = givers;
