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
      $select: ['event', 'returnValues', 'transactionHash', 'createdAt'],
      $sort: { blockNumber: 1, transactionIndex: 1, logIndex: 1 },
    };

    let totalCount = 0;
    let cache = [];
    let noMoreData = false;

    // Filter transfer events returned back immediately in same transaction
    // @param {Stream} stream to send filtered event
    // @param {Object} fetched event to send
    // @return {Boolean} filtered
    const filterTransfers = async (stream, fetchedEvent) => {
      const { event } = fetchedEvent;
      if (event !== 'Transfer') {
        stream.push(fetchedEvent);
        return false;
      }

      const { returnValues, transactionHash } = fetchedEvent;
      const { from, to, amount } = returnValues;

      const result = await eventService.find({
        query: {
          transactionHash,
          event,
          'returnValues.from': to,
          'returnValues.to': from,
          'returnValues.amount': amount,
          $limit: 1,
        },
      });

      const { data } = result;
      // Transfer is not returned immediately
      if (data.length === 0) {
        stream.push(fetchedEvent);
        return false;
      }

      return true;
    };

    const readEvents = async stream => {
      if (cache.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const filtered = await filterTransfers(stream, cache.shift());
        // eslint-disable-next-line no-await-in-loop
        if (filtered) await readEvents(stream);
        return;
      }

      if (noMoreData) {
        stream.push(null);
        return;
      }

      const result = await eventService.find({
        query: {
          ...eventQuery,
          $skip: totalCount,
          $limit: 100,
        },
      });
      const { data } = result;
      totalCount += data.length;
      if (totalCount === result.total) {
        noMoreData = true;
      }

      cache = data;

      const filtered = await filterTransfers(stream, cache.shift());
      if (filtered) await readEvents(stream);
    };

    const eventsStream = new Stream.Readable({
      read() {
        return readEvents(eventsStream);
      },
      objectMode: true,
    });

    return {
      eventsStream,
      milestones,
      pledgeIds: new Set(pledgeIds),
      canceledPledgeIds: new Set(canceledPledgeIds),
    };
  };

  return { getData };
};
