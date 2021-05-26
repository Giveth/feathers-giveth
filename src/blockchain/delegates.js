/* eslint-disable consistent-return */

const isIPFS = require('is-ipfs');
const logger = require('winston');
const { CommunityStatus } = require('../models/communities.model');
const reprocess = require('../utils/reprocess');
const to = require('../utils/to');
const { getTransaction } = require('./lib/web3Helpers');

const delegates = (app, liquidPledging) => {
  const communities = app.service('/communities');

  async function fetchProfile(url, delegateId) {
    const [err, profile] = await to(app.ipfsFetcher(url));

    if (err) {
      logger.warn(`error fetching delegate profile from ${url}`, err);
    } else if (profile && typeof profile === 'object') {
      app.ipfsPinner(url, 'object', { type: 'delegate', id: delegateId });
      if (profile.image && isIPFS.ipfsPath(profile.image)) {
        app.ipfsPinner(profile.image, 'image', { ownerType: 'delegate', ownerId: delegateId });
      }
    }
    return profile;
  }

  async function getOrCreateCommunity(delegate, txHash, retry = false) {
    const data = await communities.find({ paginate: false, query: { txHash } });
    if (data.length === 0) {
      // this is really only useful when instant mining. Other then that, the community should always be
      // created before the tx was mined.
      if (!retry) {
        return reprocess(getOrCreateCommunity.bind(this, delegate, txHash, true), 5000);
      }

      const { from } = await getTransaction(app, txHash);
      try {
        return communities.create({
          ownerAddress: from,
          pluginAddress: delegate.plugin,
          title: delegate.name,
          commitTime: delegate.commitTime,
          url: delegate.url,
          txHash,
          totalDonated: '0',
          currentBalance: '0',
          donationCount: 0,
          description: 'Missing Description... Added outside of UI',
        });
      } catch (err) {
        // communities service will throw BadRequest error if owner isn't whitelisted
        if (err.name === 'BadRequest') return;

        throw err;
      }
    }

    if (data.length > 1) {
      logger.info('more then 1 community with the same ownerAddress and title found: ', data);
    }

    return data[0];
  }

  async function addDelegate(delegateId, txHash) {
    try {
      const delegate = await liquidPledging.getPledgeAdmin(delegateId);
      const community = await getOrCreateCommunity(delegate, txHash);

      // most likely b/c the whitelist check failed
      if (!community) return;

      const profile = await fetchProfile(delegate.url, delegateId);
      const mutation = {
        title: delegate.name,
        ...profile,
        delegateId,
        commitTime: delegate.commitTime,
        pluginAddress: delegate.plugin,
        status: CommunityStatus.ACTIVE,
        url: delegate.url,
      };

      return communities.patch(community._id, mutation);
    } catch (err) {
      logger.error('Error community patch:', err);
    }
  }

  async function getCommunityById(delegateId) {
    const data = await communities.find({ paginate: false, query: { delegateId } });
    if (data.length === 0) {
      return addDelegate(delegateId);
    }

    if (data.length > 1) {
      logger.warn('more then 1 community with the same delegateId found: ', data);
    }

    return data[0];
  }

  return {
    /**
     * handle `DelegateAdded` events
     *
     * @param {object} event Web3 event object
     * @returns {object|undefined} delegate
     */
    addDelegate(event) {
      if (event.event !== 'DelegateAdded') {
        throw new Error('addDelegate only handles DelegateAdded events');
      }

      return addDelegate(event.returnValues.idDelegate, event.transactionHash);
    },

    /**
     * handle `DelegateUpdated` events
     *
     * @param {object} event Web3 event object
     * @returns {object} delegate
     */
    async updateDelegate(event) {
      if (event.event !== 'DelegateUpdated') {
        throw new Error('updateDelegate only handles DelegateUpdated events');
      }

      const delegateId = event.returnValues.idDelegate;

      try {
        const [community, delegate] = await Promise.all([
          getCommunityById(delegateId),
          liquidPledging.getPledgeAdmin(delegateId),
        ]);

        const mutation = { title: delegate.name };
        if (delegate.url && delegate.url !== community.url) {
          const profile = await fetchProfile(delegate.url, delegateId);
          Object.assign(mutation, profile);
        }
        Object.assign(mutation, {
          commitTime: delegate.commitTime,
          url: delegate.url,
        });

        return communities.patch(community._id, mutation);
      } catch (err) {
        logger.error('updateDelegate error ->', err);
      }
    },
  };
};

module.exports = delegates;
