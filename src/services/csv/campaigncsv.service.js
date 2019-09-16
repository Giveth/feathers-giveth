const { ObjectID } = require('mongodb');
const json2csv = require('json2csv');

const fields = [
  'from',
  'fromName',
  'to',
  'toName',
  'txHash',
  'amount',
  'action',
  'date',
  'totalCampaignAmount',
];

class CsvItem {
  constructor(from, fromName, to, toName, txHash, amount, action, date, totalCampaignAmount) {
    this.from = from;
    this.fromName = fromName;
    this.to = to;
    this.toName = toName;
    this.txHash = txHash;
    this.amount = amount;
    this.action = action;
    this.date = date;
    this.totalCampaignAmount = totalCampaignAmount;
  }

  returnJSON() {
    return {
      from: this.from,
      fromName: this.fromName,
      to: this.to,
      toName: this.toName,
      txHash: this.txHash,
      amount: this.amount,
      action: this.action,
      date: this.date,
      totalCampaignAmount: this.totalCampaignAmount,
    };
  }
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
}

async function itemsFromDonations(donations, usersService, campaignService) {
  const csvItems = [];
  let totalCampaignAmount = 0;
  await asyncForEach(donations, async donation => {
    const donationData = await usersService.find({
      query: {
        address: donation.giverAddress,
      },
    });
    const oId = new ObjectID(donation.ownerTypeId);
    const campaignData = await campaignService.find({
      query: {
        _id: oId,
      },
    });
    const campaignName = campaignData.data[0].title;
    // console.log(campaignName)
    const donationUser = donationData.data[0];
    let donatorName = '';
    if (donationUser.name === '' || !donationUser.name) {
      donatorName = 'Anonymous';
    } else {
      donatorName = donationUser.name;
    }
    // let action = '';
    totalCampaignAmount += donation.usdValue;
    // console.log(donation)
    const csvItem = new CsvItem(
      donation.giverAddress,
      donatorName,
      donation.ownerTypeId,
      campaignName,
      donation.txHash,
      donation.usdValue,
      'Donated',
      donation.commitTime,
      totalCampaignAmount,
    );
    // console.log(csvItem)
    csvItems.push(csvItem.returnJSON());
  });
  return csvItems;
}

function toCSV(jsonCore) {
  const json = Object.values(jsonCore);
  let csv = '';
  const keys = (json[0] && Object.keys(json[0])) || [];
  csv += `${keys.join(',')}\n`;
  // eslint-disable-next-line no-restricted-syntax
  for (const line of json) {
    csv += `${keys.map(key => line[key]).join(',')}\n`;
  }
  return csv;
}

module.exports = function registerService() {
  const app = this;
  // const donationService = app.service('donations');
  // const result = await donationService.find({
  //     query: {
  //         status: { $ne: 'Failed' },
  //         $or: [{ intendedProjectTypeId: id }, { ownerTypeId: id }],
  //         ownerTypeId: id,
  //         isReturn: false,
  //         $sort: { usdValue: -1, createdAt: -1 },
  //         $limit:0,
  //         $skip:0,
  //       },
  //       schema: 'includeTypeAndGiverDetails',
  // });

  const donationService = app.service('donations');
  const campaignService = app.service('campaigns');
  const usersService = app.service('users');

  const csvService = {
    async get(id) {
      const result = await donationService.find({
        query: {
          status: 'Committed',
          ownerTypeId: id,
        },
      });
      let csvItems = [];
      csvItems = await toCSV(await itemsFromDonations(result.data, usersService, campaignService));
      // console.log(csvItems)
      return csvItems;
    },
  };

  // Initialize our service with any options it requires
  app.use('/campaigncsv', csvService, (req, res) => {
    const result = res.data;
    const { data } = result; // will be either `result` as an array or `data` if it is paginated
    const csv = json2csv.parse({
      data,
      fields,
    });

    res.type('csv');
    res.end(csv);
  });
};
