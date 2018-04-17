import commons from 'feathers-hooks-common';
import errors from 'feathers-errors';

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
      project.status === 'proposed'
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
};

export default () => context => {
  checkOwner(context);
  checkReviewer(context);
};
