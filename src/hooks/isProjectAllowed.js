const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const logger = require('winston');
const { TraceStatus } = require('../models/traces.model');
const { ZERO_ADDRESS } = require('../blockchain/lib/web3Helpers');
const { isUserInProjectWhiteList, isUserInReviewerWhiteList } = require('../utils/roleUtility');
const { isRequestInternal } = require('../utils/feathersUtils');

const checkReviewer = async context => {
  if (!context.app.get('useReviewerWhitelist')) {
    return context;
  }

  const items = commons.getItems(context);

  const inWhitelist = async project => {
    // new traces have optional reviewer
    if (!project.reviewerAddress || project.reviewerAddress === ZERO_ADDRESS) return;
    if (await isUserInReviewerWhiteList(context.app, project.reviewerAddress)) {
      // traces have a campaignReviewerAddress
      if (project.campaignReviewerAddress) {
        const campaign = await context.app.service('campaigns').get(project.campaignId);
        if (
          !campaign ||
          campaign.reviewerAddress.toLowerCase() !== project.campaignReviewerAddress.toLowerCase()
        ) {
          throw new errors.BadRequest(
            `project campaignReviewerAddress address ${project.campaignReviewerAddress} is not in the whitelist`,
          );
        }
      }
      return;
    }

    throw new errors.BadRequest(
      `project reviewer address ${project.reviewerAddress} is not in the whitelist`,
    );
  };

  if (Array.isArray(items)) {
    await Promise.all(items.map(inWhitelist));
  } else {
    await inWhitelist(items);
  }
  return context;
};

const checkCampaignOwner = async context => {
  if (!context.app.get('useProjectOwnerWhitelist')) {
    return context;
  }

  const items = commons.getItems(context);

  const inWhitelist = async project => {
    if (
      isRequestInternal(context) ||
      (await isUserInProjectWhiteList(context.app, project.ownerAddress.toLowerCase()))
    ) {
      return;
    }
    throw new errors.BadRequest(
      `project owner address ${project.ownerAddress} is not in the whitelist`,
    );
  };

  if (Array.isArray(items)) {
    // eslint-disable-next-line no-restricted-syntax
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      await inWhitelist(item);
    }
  } else {
    await inWhitelist(items);
  }
  return context;
};
const checkTraceStatus = async context => {
  if (isRequestInternal(context) || context.data.status === TraceStatus.PROPOSED) {
    return context;
  }
  const campaign = await context.app.service('campaigns').get(context.data.campaignId);
  if (
    campaign.ownerAddress.toLowerCase() === context.params.user.address.toLowerCase() &&
    context.data.status === TraceStatus.PENDING
  ) {
    // campaignOwner can create Pending Trace
    return context;
  }
  logger.error('trace status should just be proposed for external requests', {
    inputData: context.data,
    provider: context.params.provider,
  });
  throw new errors.BadRequest(`trace status is not proposed`);
};

module.exports = {
  isTraceAllowed: () => async context => {
    await checkTraceStatus(context);
    await checkReviewer(context);
  },
  checkCampaignOwner: () => context => checkCampaignOwner(context),
  checkReviewer: () => context => checkReviewer(context),
};
