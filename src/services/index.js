const skunkworks = require('./skunkworks/skunkworks.service.js');
const causes = require('./causes/causes.service.js');
const projects = require('./projects/projects.service.js');
const milestones = require('./milestones/milestones.service.js');
const campaigns = require('./campaigns/campaigns.service.js');
const users = require('./users/users.service.js');
const uploads = require('./uploads/uploads.service.js');
const donations = require('./donations/donations.service.js');
import challenges from './challenges/challenges.service.js';

module.exports = function () {
  const app = this;
  app.configure(skunkworks);
  app.configure(causes);
  app.configure(projects);
  app.configure(milestones);
  app.configure(campaigns);
  app.configure(users);
  app.configure(uploads);
  app.configure(donations);
  app.configure(challenges);
};
