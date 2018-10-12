const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const { CampaignStatus } = require('../models/campaigns.model');
const { MilestoneStatus } = require('../models/milestones.model');

const checkReviewer = context => {
  if (!context.app.get('useReviewerWhitelist')) {
    return context;
  }

  const reviewerWhitelist = context.app.get('reviewerWhitelist').map(addr => addr.toLowerCase());

  const items = commons.getItems(context);

  const inWhitelist = project => {
    if (reviewerWhitelist.includes(project.reviewerAddress.toLowerCase())) {
      // milestones have a campaignReviewerAddress
      if (!Object.keys(project).includes('campaignReviewerAddress')) {
        return;
      } else if (reviewerWhitelist.includes(project.campaignReviewerAddress.toLowerCase())) {
        return;
      }
    }

    throw new errors.BadRequest(
      `project reviewer address ${project.reviewerAddress} is not in the whitelist`,
    );
  };

  if (Array.isArray(items)) {
    items.forEach(inWhitelist);
  } else {
    inWhitelist(items);
  }
  return context;
};

const checkOwner = context => {
  if (!context.app.get('useProjectOwnerWhitelist')) {
    return context;
  }

  const ownerWhitelist = context.app.get('projectOwnerWhitelist').map(addr => addr.toLowerCase());

  const items = commons.getItems(context);

  const inWhitelist = project => {
    if (
      ownerWhitelist.includes(project.ownerAddress.toLowerCase()) ||
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

const checkToken = context => {
  const tokenWhitelist = context.app.get('tokenWhitelist');

  const items = commons.getItems(context);

  const inWhitelist = project => {
    if (tokenWhitelist.find(t => t.address === project.token)) return;

    throw new errors.BadRequest(
      `token ${project.token} is not in the whitelist`,
    );
  };

  if (Array.isArray(items)) {
    items.forEach(inWhitelist);
  } else {
    inWhitelist(items);
  }
  return context;
};


module.exports = () => context => {
  checkOwner(context);
  checkReviewer(context);
  checkToken(context);
};
