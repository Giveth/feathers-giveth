

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
    const json2csv = require('json2csv');
    const fields = ['from','fromName','to','toName','txHash','amount','action','date','totalCampaignAmount'];
    

    const campaignService = app.service('donations');
    
    const csvService = {
        async get(id, params) {
            const result = await campaignService.find({
                query: {
                    status: 'Committed',
                    ownerTypeId: id
                }
            })
            let csvItems = []
            csvItems = await toCSV(await itemsFromDonations(result.data))
            console.log(csvItems)
            return csvItems
        }
    }
    
    // Initialize our service with any options it requires
    app.use('/campaigncsv', csvService, function(req, res) {
        const result = res.data;
        const data = result.data; // will be either `result` as an array or `data` if it is paginated
        const csv = json2csv.parse({ data, fields });
      
        res.type('csv');
        res.end(csv);
      });
};

class CsvItem {
    constructor(from, fromName, to, toName, txHash, amount, action, date, totalCampaignAmount){
        this.from=from
        this.fromName=fromName
        this.to=to
        this.toName=toName
        this.txHash=txHash
        this.amount=amount
        this.action=action
        this.date=date
        this.totalCampaignAmount=totalCampaignAmount
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
            totalCampaignAmount: this.totalCampaignAmount
        }
    }
    
}

async function itemsFromDonations(donations) {
    let csvItems = []
    donations.forEach(element => {
        let csvItem = new CsvItem(
            element.giverAddress
        )
        csvItems.push(csvItem.returnJSON())
    }); 
    return csvItems
}

function toCSV(json) {
    json = Object.values(json);
    var csv = "";
    var keys = (json[0] && Object.keys(json[0])) || [];
    csv += keys.join(',') + '\n';
    for (var line of json) {
      csv += keys.map(key => line[key]).join(',') + '\n';
    }
    return csv;
}
