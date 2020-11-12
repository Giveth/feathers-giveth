const { ObjectId } = require('mongoose').Types;
const { DonationStatus } = require('../../models/donations.model');

module.exports = function aggregateDonations() {
  const app = this;
  const donationsService = app.service('donations');
  const usersService = app.service('users');

  const aggregateDonationsService = {
    async find({ query, provider }) {
      const { id, $limit, $skip } = query;
      if (!id || !ObjectId.isValid(id)) {
        return { error: 400 };
      }

      const donationModel = donationsService.Model;

      const dataQuery = [{ $sort: { totalAmount: -1 } }];
      if ($skip) dataQuery.push({ $skip: Number($skip) });
      if ($limit) dataQuery.push({ $limit: Number($limit) });

      const result = await donationModel
        .aggregate()
        .match({
          status: { $in: [DonationStatus.COMMITTED, DonationStatus.WAITING] },
          $or: [
            { ownerTypeId: id }, // Committed ones to project
            { intendedProjectTypeId: id }, // Delegated via DAC
            {
              delegateTypeId: id,
              intendedProjectId: { $exists: false },
            }, // Dac donations
          ],
          amount: { $ne: '0' },
          isReturn: false,
        })
        .group({
          _id: '$giverAddress',
          totalAmount: { $sum: '$usdValue' },
          count: { $sum: 1 },
          donations: { $push: '$_id' },
        })
        .match({ totalAmount: { $gt: 0 } })
        .facet({
          data: dataQuery,
          metadata: [{ $count: 'total' }],
        })
        .exec();

      const { data, metadata } = result[0];

      // Fetch donations
      const promises = data.map(async item => {
        const [donations, [giver] = []] = await Promise.all([
          donationsService.find({
            paginate: false,
            query: {
              _id: { $in: item.donations },
              $sort: { createAt: -1 },
            },
          }),
          usersService.find({
            paginate: false,
            query: {
              address: item._id,
            },
            provider, // In order to resolve avatar field
          }),
        ]);

        return {
          ...item,
          donations,
          giver,
        };
      });

      return {
        data: await Promise.all(promises),
        skip: $skip,
        limit: $limit,
        total: metadata && metadata[0] && metadata[0].total,
      };
    },
  };
  app.use('/aggregateDonations', aggregateDonationsService);
};
