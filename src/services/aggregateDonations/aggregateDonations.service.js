module.exports = function aggregateDonations() {
  const app = this;
  const donationsService = app.service('donations');
  const getDonationsInfo = async delegateTypeId => {
    const query = {
      _aggregate: [
        {
          $match: {
            delegateTypeId,
            amountRemaining: { $ne: 0 },
            intendedProjectId: { $exists: false },
            isReturn: false,
          },
        },
        { $sort: { totalAmount: 1 } },
        {
          $group: {
            _id: '$giverAddress',
            totalAmount: { $sum: '$usdValue' },
            count: { $sum: 1 },
          },
        },
      ],
    };
    return donationsService.find({
      paginate: false,
      query,
    });
  };
  const aggregateDonationsService = {
    async find({ query }) {
      const { delegateTypeId } = query;
      const result = await getDonationsInfo(delegateTypeId);
      return result;
    },
  };
  app.use('/aggregateDonations', aggregateDonationsService);
};
