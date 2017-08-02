const skunkworks = require('./skunkworks/skunkworks.service.js');
const causes = require('./causes/causes.service.js');
const projects = require('./projects/projects.service.js');
const milestones = require('./milestones/milestones.service.js');
module.exports = function () {
  const app = this; // eslint-disable-line no-unused-vars
  app.configure(skunkworks);
  app.configure(causes);
  app.configure(projects);
  app.configure(milestones);
};
