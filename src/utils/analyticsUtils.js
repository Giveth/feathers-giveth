const config = require('config');
const Analytics = require('analytics-node');
const logger = require('winston');
const { BadRequest } = require('@feathersjs/errors');

let analytics;
if (config.segmentApiKey) {
  analytics = new Analytics(config.segmentApiKey);
} else {
  logger.info('You dont have segmentApiKey in your config, so analytics is disabled');
}

const track = data => {
  if (!analytics) {
    return;
  }
  try {
    logger.error('send segment tracking', data);
    analytics.track(data);
  } catch (e) {
    logger.error('send segment tracking error', { e, data });
  }
};

const page = data => {
  if (!analytics) {
    return;
  }
  try {
    logger.debug('send segment page', data);
    analytics.page(data);
  } catch (e) {
    logger.error('send segment page error', { e, data });
  }
};

const sendAnalytics = ({ data, params }) => {
  const dataContext = {
    ...data.context,
    /**
     * @see{@link https://atlassc.net/2020/02/25/feathersjs-client-real-ip}
     */
    ip: params.headers['x-real-ip'],
    userAgent: params.headers['user-agent'],
  };
  const eventData = {
    userId: data.userId,
    context: dataContext,
    userAgent: params.headers['user-agent'],
    properties: data.properties,
  };
  if (!eventData.userId) {
    eventData.anonymousId = data.anonymousId;
  }
  if (data.reportType === 'track') {
    track({
      ...eventData,
      event: data.event,
    });
    return {
      message: 'success',
    };
  }
  if (data.reportType === 'page') {
    page({
      ...eventData,
      name: data.page,
    });
    return {
      message: 'success',
    };
  }
  throw new BadRequest('invalid reportType');
};

module.exports = {
  sendAnalytics,
};
