const errors = require('@feathersjs/errors');
const logger = require('winston');
const { TraceStatus } = require('../../models/traces.model');
const { ZERO_ADDRESS } = require('../../blockchain/lib/web3Helpers');

/**
 * Get keys that can be updated based on the state of the trace and the user's permission
 *
 * @param trace  Current trace data that are saved
 * @param data       New trace data that are being saved
 * @param user       Address of the user making the modification
 */
const getApprovedKeys = (trace, data, user) => {
  const reviewers = [trace.reviewerAddress, trace.campaignReviewerAddress];

  // Fields that can be edited BEFORE trace is created on the blockchain
  const editTraceKeys = [
    'title',
    'description',
    'maxAmount',
    'reviewerAddress',
    'recipientAddress',
    'recipientId',
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
    'type',
    'dacId',
  ];

  // Fields that can be edited once trace stored on the blockchain
  const editTraceKeysOnChain = ['title', 'description', 'image', 'message', 'proofItems', 'mined'];

  // changing the recipient
  if (data.pendingRecipientAddress) {
    // Owner can set the recipient
    if (!trace.recipientAddress || trace.recipientAddress === ZERO_ADDRESS) {
      if (user.address !== trace.ownerAddress) {
        throw new errors.Forbidden('Only the Trace Manager can set the recipient');
      }
    } else if (user.address !== trace.recipientAddress) {
      throw new errors.Forbidden('Only the Trace recipient can change the recipient');
    }
    return ['pendingRecipientAddress'];
  }

  switch (trace.status) {
    case TraceStatus.PROPOSED:
      // Accept proposed trace by Campaign Manager
      if (data.status === TraceStatus.PENDING) {
        if (![trace.campaign.ownerAddress, trace.campaign.coownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Campaign Manager can accept a trace');
        }
        logger.info(`Accepting proposed trace with id: ${trace._id} by: ${user.address}`);

        return ['txHash', 'status', 'mined', 'ownerAddress', 'message', 'proofItems'];
      }

      // Reject proposed trace by Campaign Manager
      if (data.status === TraceStatus.REJECTED) {
        if (![trace.campaign.ownerAddress, trace.campaign.coownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Campaign Manager can reject a trace');
        }
        logger.info(`Rejecting proposed trace with id: ${trace._id} by: ${user.address}`);

        return ['status', 'message', 'proofItems'];
      }

      // Editing trace can be done by Trace or Campaign Manager
      if (data.status === TraceStatus.PROPOSED) {
        if (
          ![trace.ownerAddress, trace.campaign.ownerAddress, trace.campaign.coownerAddess].includes(
            user.address,
          )
        ) {
          throw new errors.Forbidden('Only the Trace or Campaign Manager can edit proposed trace');
        }
        logger.info(
          `Editing trace with id: ${trace._id} status: ${trace.status} by: ${user.address}`,
        );

        return editTraceKeys;
      }
      break;

    case TraceStatus.REJECTED:
      // Editing trace can be done by Trace Manager
      if (data.status === TraceStatus.REJECTED) {
        if (user.address !== trace.ownerAddress) {
          throw new errors.Forbidden('Only the Trace Manager can edit rejected trace');
        }
        logger.info(
          `Editing trace with id: ${trace._id} status: ${trace.status} by: ${user.address}`,
        );
        return editTraceKeys;
      }

      // Re-proposing trace can be done by Trace Manager
      if (data.status === TraceStatus.PROPOSED) {
        if (user.address !== trace.ownerAddress) {
          throw new errors.Forbidden('Only the Trace Manager can repropose rejected trace');
        }
        logger.info(`Reproposing rejected trace with id: ${trace._id} by: ${user.address}`);
        return editTraceKeys.concat(['status']);
      }
      break;

    case TraceStatus.IN_PROGRESS:
      // Mark trace complete by Recipient or Trace Manager
      if (data.status === TraceStatus.NEEDS_REVIEW) {
        if (![trace.recipientAddress, trace.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Trace Manager or Recipient can mark a trace complete',
          );
        }
        logger.info(`Marking trace as complete. Trace id: ${trace._id}`);
        return ['description', 'txHash', 'status', 'mined', 'message', 'proofItems'];
      }

      // Archive trace by Trace Manager or Campaign Manager
      if (data.status === TraceStatus.ARCHIVED) {
        if (
          ![trace.campaign.ownerAddress, trace.campaign.coownerAddess, trace.ownerAddress].includes(
            user.address,
          )
        ) {
          throw new errors.Forbidden(
            'Only the Trace Manager or Campaign Manager can archive a trace',
          );
        }
        logger.info(`Archiving trace. Trace id: ${trace._id}`);
        return ['txHash', 'status', 'mined'];
      }

      // Cancel trace by Trace Manager or Trace Reviewer
      if (data.status === TraceStatus.CANCELED && data.mined === false) {
        if (![trace.reviewerAddress, trace.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Trace Manager or Trace Reviewer can cancel a trace');
        }
        return ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
      }

      // Editing trace can be done by Campaign or Trace Manager
      if (data.status === TraceStatus.IN_PROGRESS) {
        if (
          ![trace.ownerAddress, trace.campaign.ownerAddress, trace.campaign.coownerAddess].includes(
            user.address,
          )
        ) {
          throw new errors.Forbidden('Only the Trace and Campaign Manager can edit trace');
        }
        logger.info(`Editing trace In Progress with id: ${trace._id} by: ${user.address}`);
        return editTraceKeysOnChain;
      }

      // Editing a proposed trace can be done by either manager and all usual properties can be changed since it's not on chain
      if (data.status === TraceStatus.PROPOSED) {
        if (
          ![trace.ownerAddress, trace.campaign.ownerAddress, trace.campaign.coownerAddess].includes(
            user.address,
          )
        ) {
          throw new errors.Forbidden('Only the Trace and Campaign Manager can edit proposed trace');
        }
        logger.info(`Editing proposed trace with id: ${trace._id} by: ${user.address}`);
        return editTraceKeys;
      }

      break;

    case TraceStatus.NEEDS_REVIEW:
      // Approve trace completed by Campaign or Trace Reviewer
      if (data.status === TraceStatus.COMPLETED && data.mined === false) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Trace or Campaign Reviewer can approve trace has been completed',
          );
        }
        logger.info(`Approving trace complete with id: ${trace._id} by: ${user.address}`);
        return ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
      }

      // Reject trace completed by Campaign or Trace Reviewer
      if (data.status === TraceStatus.IN_PROGRESS) {
        if (!reviewers.includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Trace or Campaign Reviewer can reject that trace has been completed',
          );
        }
        logger.info(`Rejecting trace complete with id: ${trace._id} by: ${user.address}`);
        return ['status', 'mined', 'message', 'proofItems'];
      }

      // Cancel trace by Trace Manager or Trace Reviewer
      if (data.status === TraceStatus.CANCELED && data.mined === false) {
        if (![trace.reviewerAddress, trace.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden('Only the Trace Manager or Trace Reviewer can cancel a trace');
        }
        logger.info(
          `Cancelling trace with id: ${trace._id} status: ${trace.status} by: ${user.address}`,
        );
        return ['txHash', 'status', 'mined', 'prevStatus', 'message', 'proofItems'];
      }

      // Editing trace can be done by Trace or Campaign Manager
      if (data.status === TraceStatus.NEEDS_REVIEW) {
        if (
          ![trace.ownerAddress, trace.campaign.ownerAddress, trace.campaign.coownerAddess].includes(
            user.address,
          )
        ) {
          throw new errors.Forbidden('Only the Trace and Campaign Manager can edit trace');
        }
        logger.info(
          `Editing trace with id: ${trace._id} status: ${trace.status} by: ${user.address}`,
        );
        return editTraceKeysOnChain;
      }
      break;

    case TraceStatus.COMPLETED:
      // Disbursing funds can be done by Trace Manager or Recipient
      if (data.status === TraceStatus.PAYING) {
        if (![trace.recipientAddress, trace.ownerAddress].includes(user.address)) {
          throw new errors.Forbidden(
            'Only the Trace Manager or Recipient can disburse a trace payment',
          );
        }
        logger.info(`Disbursing trace payment. Trace id: ${trace._id}`);

        return ['txHash', 'status', 'mined'];
      }

      if (data.status === TraceStatus.ARCHIVED) {
        if (
          ![trace.campaign.ownerAddress, trace.campaign.coownerAddess, trace.ownerAddress].includes(
            user.address,
          )
        ) {
          throw new errors.Forbidden(
            'Only the Trace Manager or Campaign Manager can archive a trace',
          );
        }
        logger.info(`Archiving trace. Trace id: ${trace._id}`);
        return ['txHash', 'status', 'mined'];
      }

      break;

    // States that do not have any action
    case TraceStatus.PENDING:
    case TraceStatus.CANCELED:
    default:
      break;
  }

  // Unknown action, disallow everything
  return [];
};

module.exports = getApprovedKeys;
