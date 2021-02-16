const config = require('config');
const { Parser } = require('json2csv');
const { getTokenByAddress } = require('../../utils/tokenHelper');

const createAggregateQuery = ownerType => {
  return [
    { $match: { homeTxHash: { $exists: true }, ownerType } },
    {
      $lookup: {
        from: `${ownerType}s`,
        let: { id: { $toObjectId: '$ownerTypeId' } },
        pipeline: [
          {
            $match: { $expr: { $eq: ['$_id', '$$id'] } },
          },
        ],
        as: ownerType,
      },
    },
    {
      $unwind: `$${ownerType}`,
    },
  ];
};
const normalizeDonation = donation => {
  const dappUrl = config.get('dappUrl');
  const { ownerType, campaign, milestone, tokenAddress } = donation;
  const token = getTokenByAddress(tokenAddress);
  const data = {
    _id: donation._id,
    usdValue: donation.usdValue,
    amount: Number(donation.amount).toExponential(),
    amountHumanized: donation.amount / 10 ** 18,
    giverAddress: donation.giverAddress,
    ownerTypeId: donation.ownerTypeId,
    ownerType,
    createdAt: donation.createdAt,
    homeTxHash: donation.homeTxHash,
    tokenAddress,
    tokenSymbol: token.symbol,
  };
  if (ownerType === 'milestone') {
    data.projectLink = `${dappUrl}/campaigns/${milestone.campaignId}/milestones/${milestone._id}`;
    data.projectId = milestone.projectId;
  } else if (ownerType === 'campaign') {
    data.projectLink = `${dappUrl}/campaigns/${campaign._id}`;
    data.projectId = campaign.projectId;
  }
  return data;
};
module.exports = async function aggregateDonations() {
  const app = this;
  const donationsService = app.service('donations');
  const donationModel = donationsService.Model;

  const directDonationsReport = async (req, res, _next) => {
    const campaignDonations = await donationModel.aggregate(createAggregateQuery('campaign'));
    const milestoneDonations = await donationModel.aggregate(createAggregateQuery('milestone'));
    const donations = milestoneDonations
      .concat(...campaignDonations)
      .sort((a, b) => {
        if (a.createdAt < b.createdAt) return -1;
        if (a.createdAt > b.createdAt) return 1;
        return 0;
      })
      .map(donation => normalizeDonation(donation));

    const fields = Object.keys(donations[0]);
    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(donations);
    res.type('csv');
    res.end(csv);
  };
  app.use('/directDonationsReport', directDonationsReport);
};
