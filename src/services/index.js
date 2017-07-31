const milestones = require('./milestones/milestones.service.js');
const groupings = require('./groupings/groupings.service.js');
const completionRequests = require('./completion-requests/completion-requests.service.js');
const givers = require('./givers/givers.service.js');
const donations = require('./donations/donations.service.js');
module.exports = function () {
  const app = this; // eslint-disable-line no-unused-vars
  app.configure(milestones);
  app.configure(groupings);
  app.configure(completionRequests);
  app.configure(givers);
  app.configure(donations);
};
