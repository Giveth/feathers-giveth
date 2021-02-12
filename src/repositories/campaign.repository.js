const findCampaignRelatedDacs = async (app, campaignProjectId) => {
  const donationsService = app.service('donations');
  const donationModel = donationsService.Model;

  const aggregationQuery = [
    {
      $match: {
        intendedProjectId: campaignProjectId,
        intendedProjectType: 'campaign',
        delegateType: 'dac',
      },
    },
    { $group: { _id: '$delegateId' } },
    {
      $lookup: {
        from: 'dacs',
        let: { delegateId: '$_id' },
        pipeline: [
          {
            $match: { $expr: { $eq: ['$delegateId', '$$delegateId'] } },
          },
          {
            $lookup: {
              let: { ownerAddress: '$ownerAddress' },
              from: 'users',
              pipeline: [
                {
                  $match: { $expr: { $eq: ['$address', '$$ownerAddress'] } },
                },
              ],
              as: 'owner',
            },
          },
          {
            $unwind: '$owner',
          },
        ],
        as: 'dac',
      },
    },
    {
      $project: {
        _id: 0,
      },
    },
  ];
  const result = await donationModel.aggregate(aggregationQuery);
  let dacs = [];
  result.forEach(item => {
    if (item.dac) {
      dacs = dacs.concat(...item.dac);
    }
  });
  return dacs;
};

module.exports = {
  findCampaignRelatedDacs,
};
