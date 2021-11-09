const config = require('config');
const Queue = require('bull');
const logger = require('winston');

const { errorMessages } = require('./errorMessages');
const { CampaignStatus } = require('../models/campaigns.model');

const updateCampaignQueue = new Queue('trace-campaign-updated', {
  redis: config.get('sharedRedis'),
});
const updateGivethIoProjectQueue = new Queue('givethio-project-updated', {
  redis: config.get('sharedRedis'),
});

const emitCampaignUpdateEvent = ({ campaignId, status, givethIoProjectId, title, description }) => {
  logger.info('Add event to trace-campaign-updated queue', {
    campaignId,
    givethIoProjectId,
    title,
    description,
    status,
  });
  // giveth.io will handle this event
  updateCampaignQueue.add({ campaignId, status, givethIoProjectId, title, description });
};

const initHandlingGivethIoUpdateEvents = app => {
  // These events come from giveth.io
  updateGivethIoProjectQueue.process(1, async (job, done) => {
    try {
      // There are title, description in job.data but we dont use theme right now
      const { campaignId, verified, archived, title, description } = job.data;
      logger.info('updateGivethIoProjectQueue(), job.data', job.data);
      const campaign = await app.service('campaigns').get(campaignId);
      if (!campaign) {
        throw new Error(errorMessages.CAMPAIGN_NOT_FOUND);
      }
      const updateData = {
        title,
        description,
      };
      if (verified !== undefined) {
        updateData.verified = Boolean(verified);
      }
      if (archived === true && campaign.status === CampaignStatus.ACTIVE) {
        updateData.status = CampaignStatus.ARCHIVED;
      } else if (archived === false && campaign.status === CampaignStatus.ARCHIVED) {
        updateData.status = CampaignStatus.ACTIVE;
      }
      logger.info('update campaign ', updateData);
      await app.service('campaigns').patch(campaign._id, updateData, {
        calledFromGivethIo: true,
      });
      done();
    } catch (e) {
      logger.error('updateGivethIoProjectQueue() error', e);
      done();
    }
  });
};

module.exports = {
  emitCampaignUpdateEvent,
  initHandlingGivethIoUpdateEvents,
};
