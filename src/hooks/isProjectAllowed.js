const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const { CampaignStatus } = require('../models/campaigns.model');
const { MilestoneStatus } = require('../models/milestones.model');
const { ZERO_ADDRESS } = require('../blockchain/lib/web3Helpers');
const { isUserInProjectWhiteList, isUserInReviewerWhiteList } = require('../utils/roleUtility');

const checkReviewer = async context => {
  if (!context.app.get('useReviewerWhitelist')) {
    return context;
  }

  const items = commons.getItems(context);

  const inWhitelist = async project => {
    // new milestones have optional reviewer
    if (!project.reviewerAddress || project.reviewerAddress === ZERO_ADDRESS) return;
    if (await isUserInReviewerWhiteList(context.app, project.reviewerAddress)) {
      // milestones have a campaignReviewerAddress
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

const checkOwner = context => {
  if (!context.app.get('useProjectOwnerWhitelist')) {
    return context;
  }

  const items = commons.getItems(context);

  const inWhitelist = async project => {
    if (
      (await isUserInProjectWhiteList(context.app, project.ownerAddress.toLowerCase())) ||
      [MilestoneStatus.PROPOSED, CampaignStatus.PROPOSED].includes(project.status)
    ) {
      return;
    }

    throw new errors.BadRequest(
      `project owner address ${project.ownerAddress} is not in the whitelist`,
    );
  };

  if (Array.isArray(items)) {
    items.forEach(inWhitelist);
  } else {
    inWhitelist(items);
  }
  return context;
};

module.exports = {
  isProjectAllowed: () => context => {
    checkOwner(context);
    checkReviewer(context);
  },
  checkOwner: () => context => checkOwner(context),
  checkReviewer: () => context => checkReviewer(context),
};
