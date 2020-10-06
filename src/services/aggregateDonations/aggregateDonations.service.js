const { ObjectId } = require('mongoose').Types;
const { DonationStatus } = require('../../models/donations.model');

module.exports = function aggregateDonations() {
  const app = this;
  const donationsService = app.service('donations');
  const usersService = app.service('users');

  const aggregateDonationsService = {
    async find({ query }) {
      const { id, $limit, $skip } = query;
      if (!id || !ObjectId.isValid(id)) {
        return { error: 400 };
      }

      const donationModel = donationsService.Model;

      const params = [
        {
          $match: {
            status: { $in: [DonationStatus.COMMITTED, DonationStatus.WAITING] },
            $or: [
              { ownerTypeId: id }, // Committed ones to project
              { intendedProjectTypeId: id }, // Delegated via DAC
              {
                delegateTypeId: id,
                intendedProjectId: { $exists: false },
              }, // Dac donations
            ],
            amount: { $ne: 0 },
            isReturn: false,
          },
        },
        {
          $group: {
            _id: '$giverAddress',
            totalAmount: { $sum: '$usdValue' },
            count: { $sum: 1 },
            donations: { $push: '$_id' },
          },
        },
        { $sort: { totalAmount: -1 } },
      ];

      if ($skip) params.push({ $skip: Number($skip) });
      if ($limit) params.push({ $limit: Number($limit) });

      const result = await donationModel.aggregate(params);

      const promises = result.map(async item => {
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
          }),
        ]);

        item.donations = donations;
        item.giver = giver;

        return item;
      });

      return Promise.all(promises);
    },
  };
  app.use('/aggregateDonations', aggregateDonationsService);
};
