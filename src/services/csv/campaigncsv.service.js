// const { Readable, Transform } = require('stream');
const Stream = require('stream');
const { Transform } = require('json2csv');

const fields = [
  {
    label: 'Giver Address',
    value: 'from',
    default: 'NULL',
  },
  {
    label: 'Giver Name',
    value: 'fromName',
    default: 'NULL',
  },
  'to',
  'toName',
  'txHash',
  'amount',
  'action',
  'date',
  // 'totalCampaignAmount',
];

class CsvItem {
  constructor(from, fromName, to, toName, txHash, amount, action, date) {
    this.from = from;
    this.fromName = fromName;
    this.to = to;
    this.toName = toName;
    this.txHash = txHash;
    this.amount = amount;
    this.action = action;
    this.date = date;
    // this.totalCampaignAmount = totalCampaignAmount;
  }

  returnJSON() {
    return {
      actionDate: this.actionDate,
      fromName: this.fromName,
      from: this.from,
      toName: this.toName,
      to: this.to,
      currency: this.currency,
      amount: this.amount,
      action: this.action,
      linkMilestone: this.linkMilestone,
      linkRecipient: this.linkRecipient,
      linkDonor: this.linkDonor,
      ethCampBalance: this.ethCampBalance,
      daiCampBalance: this.daiCampBalance,
      linkRink: this.linkRink,
      linkMain: this.linkMain,
    };
  }
}

module.exports = function registerService() {
  const app = this;

  const donationService = app.service('donations');
  // const campaignService = app.service('campaigns');
  const milestoneService = app.service('milestones');
  // const usersService = app.service('users');

  const transformDonation = new Stream.Transform({
    objectMode: true,
    transform(donation, _, callback) {
      const csvItem = new CsvItem(
        donation.giverAddress,
        donation.giver.name,
        donation.ownerTypeId,
        donation.ownerEntity.title,
        donation.txHash,
        donation.amount,
        'Donated',
        donation.createdAt,
      );
      callback(null, csvItem.returnJSON());
    },
  });
  const getDonationStream = async id => {
    const milestones = await milestoneService.find({
      query: {
        campaignId: id,
        $select: ['id'],
      },
      paginate: false,
    });

    const result = await donationService.find({
      query: {
        status: 'Committed',
        ownerTypeId: { $in: [id, ...milestones.map(m => m._id)] },
        // $select: [
        //   '_id',
        //   'giverAddress',
        //   'ownerType',
        //   'ownerTypeId',
        //   'txHash',
        //   'amount',
        //   'createdAt',
        // ],
      },
      paginate: false,
      schema: 'includeTypeAndGiverDetails',
    });
    const readable = new Stream.Readable({
      read() {},
      objectMode: true,
    });
    result.forEach(d => {
      return readable.push(d);
    });
    readable.push(null);
    return readable;
  };
  const csvService = {
    async get(id) {
      const donationStream = await getDonationStream(id);

      return donationStream.pipe(transformDonation);
    },
  };

  // Initialize our service with any options it requires
  app.use('/campaigncsv', csvService, (req, res) => {
    const result = res.data;
    const json2csv = new Transform({ fields }, { objectMode: true });
    result.pipe(json2csv).pipe(res);
  });
};
