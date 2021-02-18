const Stream = require('stream');

const { DonationStatus } = require('../../models/donations.model');
const { EventStatus } = require('../../models/events.model');

module.exports = app => {
  const milestoneService = app.service('milestones');
  const donationModel = app.service('donations').Model;
  const eventModel = app.service('events').Model;

  const getCampaignMilesones = async campaignId => {
    return milestoneService.find({
      query: {
        campaignId,
        $select: [
          '_id',
          'projectId',
          'migratedProjectId',
          'createdAt',
          'ownerAddress',
          'tokenAddress',
          'title',
          'pluginAddress',
          'campaignId',
          'maxAmount',
          'type',
          'recipientAddress',
        ],
        $sort: { createdAt: 1 },
      },
      paginate: false,
    });
  };

  const getPledgeIdsByOwnersAndState = async (ownerIds, states) => {
    const distinctPledgeIds = await donationModel.distinct('pledgeId', {
      ownerTypeId: { $in: ownerIds },
      status: { $in: states },
    });
    return distinctPledgeIds.map(String);
  };
  const getAllPledgeIdsByOwners = async ownerIds => {
    return getPledgeIdsByOwnersAndState(ownerIds, [
      DonationStatus.COMMITTED,
      DonationStatus.PAID,
      DonationStatus.CANCELED,
    ]);
  };
  const getCanceledPledgeIdsByOwners = async ownerIds => {
    return getPledgeIdsByOwnersAndState(ownerIds, [DonationStatus.CANCELED]);
  };
  const getProjectIdsOfCampaignAndItsMilestone = (projectId, milestones) => {
    // List of projects ID of campaign and its milestones
    const projectIds = [String(projectId)];
    milestones.forEach(milestone => {
      const { projectId: milestoneProjectId, migratedProjectId } = milestone;
      if (migratedProjectId) {
        projectIds.push(String(migratedProjectId));
      } else if (milestoneProjectId && milestoneProjectId > 0) {
        projectIds.push(String(milestoneProjectId));
      }
    });
    return projectIds;
  };
  // Get stream of items to be written to csv for the campaign, plus milestones of this campaign
  const getData = async campaign => {
    const { _id: id, projectId } = campaign;
    const milestones = await getCampaignMilesones(id);
    const [pledgeIds, canceledPledgeIds] = await Promise.all([
      getAllPledgeIdsByOwners([id, ...milestones.map(m => m._id)]),
      getCanceledPledgeIdsByOwners([id, ...milestones.map(m => m._id)]),
    ]);
    const projectIds = await getProjectIdsOfCampaignAndItsMilestone(projectId, milestones);
    const transformer = new Stream.Transform({ objectMode: true });
    transformer._transform = async (fetchedEvent, encoding, callback) => {
      const { event } = fetchedEvent;
      if (event !== 'Transfer') {
        callback(null, fetchedEvent);
        return;
      }
      const { returnValues, transactionHash } = fetchedEvent;
      const { from, to, amount } = returnValues;

      const data = await eventModel.findOne({
        transactionHash,
        event,
        'returnValues.from': to,
        'returnValues.to': from,
        'returnValues.amount': amount,
      });
      // Transfer is not returned immediately
      if (!data) {
        callback(null, fetchedEvent);
      } else {
        callback();
      }
    };
    const stream = eventModel
      .find({
        status: EventStatus.PROCESSED,
        $or: [
          {
            event: {
              $in: [
                'ProjectAdded',
                'CancelProject',
                // 'ProjectUpdated',
                // 'MilestoneCompleteRequestApproved',
                // 'MilestoneCompleteRequestRejected',
                // 'MilestoneCompleteRequested',
                // 'PaymentCollected',
                // 'RecipientChanged',
              ],
            },
            'returnValues.idProject': { $in: projectIds.map(String) },
          },
          {
            event: 'Transfer',
            $or: [
              { 'returnValues.from': { $in: canceledPledgeIds } },
              { 'returnValues.to': { $in: pledgeIds } },
            ],
          },
        ],
      })
      .select(['event', 'returnValues', 'transactionHash', 'createdAt'])
      .sort({ blockNumber: 1, transactionIndex: 1, logIndex: 1 })
      .stream()
      .pipe(transformer);

    return {
      eventsStream: stream,
      milestones,
      pledgeIds: new Set(pledgeIds),
      canceledPledgeIds: new Set(canceledPledgeIds),
    };
  };

  return { getData };
};
