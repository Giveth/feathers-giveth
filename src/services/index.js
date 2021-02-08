const challenges = require('./challenges/challenges.service');
const pledgeAdmins = require('./pledgeAdmins/pledgeAdmins.service');
const events = require('./events/events.service');
const emails = require('./emails/emails.service');

const dacs = require('./dacs/dacs.service.js');
const milestones = require('./milestones/milestones.service.js');
const campaigns = require('./campaigns/campaigns.service.js');
const campaigncsv = require('./csv/campaigncsv.service.js');
const users = require('./users/users.service.js');
const uploads = require('./uploads/uploads.service.js');
const donations = require('./donations/donations.service.js');
const aggregateDonations = require('./aggregateDonations/aggregateDonations.service.js');
const transactions = require('./transactions/transactions.service.js');
const whitelist = require('./whitelist/whitelist.service.js');
const gasprice = require('./gasprice/gasprice.service.js');
const conversionRates = require('./conversionRates/conversionRates.service.js');
const conversations = require('./conversations/conversations.service.js');

module.exports = function configure() {
  const app = this;
  app.configure(dacs);
  app.configure(milestones);
  app.configure(campaigns);
  app.configure(users);
  app.configure(uploads);
  app.configure(donations);
  app.configure(aggregateDonations);
  app.configure(transactions);
  app.configure(challenges);
  app.configure(pledgeAdmins);
  app.configure(whitelist);
  app.configure(gasprice);
  app.configure(conversionRates);
  app.configure(events);
  app.configure(emails);
  app.configure(conversations);
  app.configure(campaigncsv);
};
