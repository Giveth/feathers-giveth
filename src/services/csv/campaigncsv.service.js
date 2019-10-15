const { ObjectID } = require('mongodb');
const json2csv = require('json2csv');

const fields = [
  'Action Date',
  'Sender Name',
  'Sender Address',
  'Recipient',
  'Recipient Address',
  'Currency',
  'Amount',
  'Action',
  'Link to Milestone',
  'Link to Recipient',
  'Link to Donor Profile Page',
  'Accessible Campaign Balance in ETH',
  'Accessible Campaign Balance in DAI',
  'Link to Rinkeby ',
  'Link to Mainnet',
];

class CsvItem {
  constructor(
    actionDate,
    fromName,
    from,
    toName,
    to,
    currency,
    amount,
    action,
    linkMilestone,
    linkRecipient,
    linkDonor,
    ethCampBalance,
    daiCampBalance,
    linkRink,
    linkMain,
  ) {
    this.actionDate = actionDate;
    this.fromName = fromName;
    this.from = from;
    this.toName = toName;
    this.to = to;
    this.currency = currency;
    this.amount = amount;
    this.action = action;
    this.linkMilestone = linkMilestone;
    this.linkRecipient = linkRecipient;
    this.linkDonor = linkDonor;
    this.ethCampBalance = ethCampBalance;
    this.daiCampBalance = daiCampBalance;
    this.linkRink = linkRink;
    this.linkMain = linkMain;
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

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
}

async function itemsFromDonations(donations, dappUrl, usersService, campaignService) {
  const csvItems = [];
  let totalEthDonated = 0;
  let totalDaiDonated = 0;
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
    const { symbol } = donation.token;
    const donationUser = donationData.data[0];
    let donatorName = '';
    if (donationUser.name === '' || !donationUser.name) {
      donatorName = 'Anonymous';
    } else {
      donatorName = donationUser.name;
    }
    // let action = '';
    // const linkMilestone = `${dappUrl}/campaigns/${donation.ownerTypeId}`;
    const donorProfile = `https://${dappUrl}/profile/${donation.giverAddress}`;
    const tokenAmount = donation.amount / donation.token.decimals;
    const mainLink = `https://etherscan.io/tx/${donation.homeTxHash}`;
    const rinkLink = `https://rinkeby.etherscan.io/tx/${donation.txHash}`;
    if (symbol === 'ETH') {
      totalEthDonated += tokenAmount;
    } else {
      totalDaiDonated += tokenAmount;
    }
    const csvItem = new CsvItem(
      donation.commitTime,
      donatorName,
      donation.giverAddress,
      campaignName,
      donation.ownerTypeId,
      symbol,
      donation.usdValue,
      'Donated',
      '-',
      '-',
      donorProfile,
      totalEthDonated,
      totalDaiDonated,
      rinkLink,
      mainLink,
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
  const dappUrl = app.get('dappUrl');

  const csvService = {
    async get(id) {
      const result = await donationService.find({
        query: {
          status: 'Committed',
          ownerTypeId: id,
        },
      });
      let csvItems = [];
      csvItems = await toCSV(
        await itemsFromDonations(result.data, dappUrl, usersService, campaignService),
      );
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
