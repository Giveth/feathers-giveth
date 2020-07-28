const Stream = require('stream');

const { DonationStatus } = require('../../models/donations.model');
const { EventStatus } = require('../../models/events.model');

module.exports = app => {
  const eventService = app.service('events');
  const milestoneService = app.service('milestones');

  const donationModel = app.get('donationModel');

  // Get stream of items to be written to csv for the campaign, plus milestones of this campaign
  const getData = async campaign => {
    const { _id: id, projectId } = campaign;
    const milestones = await milestoneService.find({
      query: {
        campaignId: id,
        $select: [
          '_id',
          'projectId',
          'migratedProjectId',
          'createdAt',
          'ownerAddress',
          'token',
          'title',
          'pluginAddress',
          'campaignId',
          'maxAmount',
        ],
        $sort: { createdAt: 1 },
      },
      paginate: false,
    });

    const findQueryStream = (service, query, params = {}) => {
      let totalCount = 0;
      let cache = [];
      let noMoreData = false;

      const stream = new Stream.Readable({
        read() {
          if (cache.length > 0) {
            stream.push(cache.shift());
            return;
          }

          if (noMoreData) {
            stream.push(null);
            return;
          }

          service
            .find({
              query: {
                ...query,
                $skip: totalCount,
                $limit: 100,
              },
              ...params,
            })
            .then(result => {
              console.log(result.total);
              const { data } = result;
              console.log(data.length);
              totalCount += data.length;
              if (totalCount === result.total) {
                noMoreData = true;
              }
              cache = data;
              stream.push(cache.shift());
            });
        },
        objectMode: true,
      });

      return stream;
    };

    const [distinctPledgeIds, distinctCanceledPledgeIds] = await Promise.all([
      // List of pledges ID owned by campaign and its milestones
      donationModel.distinct('pledgeId', {
        ownerTypeId: { $in: [id, ...milestones.map(m => m._id)] },
        status: { $in: [DonationStatus.COMMITTED, DonationStatus.PAID, DonationStatus.CANCELED] },
      }),
      // List of canceled pledge ID
      donationModel.distinct('pledgeId', {
        ownerTypeId: { $in: [id, ...milestones.map(m => m._id)] },
        status: DonationStatus.CANCELED,
      }),
    ]);
    const pledgeIds = distinctPledgeIds.map(String);
    const canceledPledgeIds = distinctCanceledPledgeIds.map(String);

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

    const eventQuery = {
      status: EventStatus.PROCESSED,
      $or: [
        {
          event: {
            $in: [
              'ProjectAdded',
              // 'ProjectUpdated',
              // 'CancelProject',
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
      $select: ['event', 'returnValues', 'transactionHash', 'createdAt'],
      $sort: { blockNumber: 1, transactionIndex: 1, logIndex: 1 },
    };

    const eventsStream = findQueryStream(eventService, eventQuery);
    return {
      eventsStream,
      milestones,
      pledgeIds: new Set(pledgeIds),
      canceledPledgeIds: new Set(canceledPledgeIds),
    };
  };

  return { getData };
};
