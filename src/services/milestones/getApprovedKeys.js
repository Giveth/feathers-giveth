const errors = require('@feathersjs/errors');
const logger = require('winston');
const { MilestoneStatus } = require('../../models/milestones.model');

/**
 * Get keys that can be updated based on the state of the milestone and the user's permission
 *
 * @param milestone  Current milestone data that are saved
 * @param data       New milestone data that are being saved
 * @param user       Address of the user making the modification
 */
const getApprovedKeys = (milestone, data, user) => {
  const reviewers = [milestone.reviewerAddress, milestone.campaignReviewerAddress];

  // Fields that can be edited BEFORE milestone is created on the blockchain
  const editMilestoneKeys = [
    'title',
    'description',
    'maxAmount',
    'reviewerAddress',
    'recipientAddress',
    'conversionRateTimestamp',
    'selectedFiatType',
    'date',
    'fiatAmount',
    'conversionRate',
    'items',
    'message',
    'proofItems',
    'image',
    'token',
  ];

  // Fields that can be edited once milestone stored on the blockchain
  const editMilestoneKeysOnChain = ['title', 'description', 'message', 'proofItems', 'mined'];

  switch (milestone.status) {
    case MilestoneStatus.PROPOSED:
      // Accept proposed milestone by Campaign Manager
      if (data.status === MilestoneStatus.PENDING) {
        if (user.address !== milestone.campaign.ownerAddress) {
          throw new errors.Forbidden('Only the Campaign Manager can accept a milestone');
        }
        logger.info(`Accepting proposed milestone with id: ${milestone._id} by: ${user.address}`);

        return ['txHash', 'status', 'mined', 'ownerAddress', 'message', 'proofItems'];
      }

      // Reject proposed milestone by Campaign Manager
      if (data.status === MilestoneStatus.REJECTED) {
        if (user.address !== milestone.campaign.ownerAddress) {
          throw new errors.Forbidden('Only the Campaign Manager can reject a milestone');
        }
        logger.info(`Rejecting proposed milestone with id: ${milestone._id} by: ${user.address}`);

        return ['status', 'message', 'proofItems'];
      }

      // Editing milestone can be done by Milestone or Campaing Manager
      if (data.status === MilestoneStatus.PROPOSED) {
        if (![milestone.ownerAddress, milestone.campaign.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Manager can edit proposed milestone',
          );
        }
        logger.info(
          `Editing milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );

        return editMilestoneKeys;
      }
      break;

    case MilestoneStatus.REJECTED:
      // Editing milestone can be done by Milestone Manager
      if (data.status === MilestoneStatus.REJECTED) {
        if (user.address !== milestone.ownerAddress) {
          throw new errors.Forbidden('Only the Milestone Manager can edit rejected milestone');
        }
        logger.info(
          `Editing milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );
        return editMilestoneKeys;
      }

      // Re-proposing milestone can be done by Milestone Manager
      if (data.status === MilestoneStatus.PROPOSED) {
        if (user.address !== milestone.ownerAddress) {
          throw new errors.Forbidden('Only the Milestone Manager can repropose rejected milestone');
        }
        logger.info(`Reproposing rejected milestone with id: ${milestone._id} by: ${user.address}`);
        return ['status', 'message', 'proofItems'];
      }
      break;

    case MilestoneStatus.IN_PROGRESS:
      // Mark milestone complete by Recipient or Milestone Manager
      if (data.status === MilestoneStatus.NEEDS_REVIEW) {
        if (![milestone.recipientAddress, milestone.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone Manager or Recipient can mark a milestone complete',
          );
        }
        logger.info(`Marking milestone as complete. Milestone id: ${milestone._id}`);

        return ['txHash', 'status', 'mined', 'message', 'proofItems'];
      }

      // Cancel milestone by Milestone Manager or Milestone Reviewer
      if (data.status === MilestoneStatus.CANCELED && data.mined === false) {
        if (![milestone.reviewerAddress, milestone.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone Manager or Milestone Reviewer can cancel a milestone',
          );
        }

        return ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
      }

      // Editing milestone can be done by Campaign or Milestone Manager
      if (data.status === MilestoneStatus.IN_PROGRESS) {
        if (![milestone.ownerAddress, milestone.campaign.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Milestone and Campaign Manager can edit milestone');
        }
        logger.info(`Editing milestone In Progress with id: ${milestone._id} by: ${user.address}`);
        return editMilestoneKeysOnChain;
      }
      break;

    case MilestoneStatus.NEEDS_REVIEW:
      // Approve milestone completed by Campaign or Milestone Reviewer
      if (data.status === MilestoneStatus.COMPLETED && data.mined === false) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Reviewer can approve milestone has been completed',
          );
        }
        logger.info(`Approving milestone complete with id: ${milestone._id} by: ${user.address}`);
        return ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
      }

      // Reject milestone completed by Campaign or Milestone Reviewer
      if (data.status === MilestoneStatus.IN_PROGRESS) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone or Campaign Reviewer can reject that milestone has been completed',
          );
        }
        logger.info(`Rejecting milestone complete with id: ${milestone._id} by: ${user.address}`);
        return ['status', 'mined', 'message', 'proofItems'];
      }

      // Cancel milestone by Milestone Manager or Milestone Reviewer
      if (data.status === MilestoneStatus.CANCELED && data.mined === false) {
        if (![milestone.reviewerAddress, milestone.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone Manager or Milestone Reviewer can cancel a milestone',
          );
        }
        logger.info(
          `Cancelling milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );
        return ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
      }

      // Editing milestone can be done by Milestone or Campaign Manager
      if (data.status === MilestoneStatus.NEEDS_REVIEW) {
        if (![milestone.ownerAddress, milestone.campaign.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Milestone and Campaign Manager can edit milestone');
        }
        logger.info(
          `Editing milestone with id: ${milestone._id} status: ${milestone.status} by: ${
            user.address
          }`,
        );
        return editMilestoneKeysOnChain;
      }
      break;

    case MilestoneStatus.COMPLETED:
      // Disbursing funds can be done by Milestone Manager or Recipient
      if (data.status === MilestoneStatus.PAYING) {
        if (![milestone.recipientAddress, milestone.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Milestone Manager or Recipient can disburse a milestone payment',
          );
        }
        logger.info(`Disbursing milestone payment. Milestone id: ${milestone._id}`);

        return ['txHash', 'status', 'mined'];
      }
      break;

    // States that do not have any action
    case MilestoneStatus.PENDING:
    case MilestoneStatus.CANCELED:
    default:
      break;
  }

  // Unknown action, disallow everything
  return [];
};

module.exports = getApprovedKeys;
