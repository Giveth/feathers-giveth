/* eslint-disable no-param-reassign */
const MemoryCache = require('memory-cache');
const { ObjectId } = require('mongoose').Types;

// Factories to create function used for generating and transforming data
const json2csv = require('./json2csv');
const eventTransform = require('./eventTransform');
const source = require('./source');

module.exports = function csv() {
  const app = this;

  const { getData } = source(app);
  const { newEventTransform } = eventTransform(app);
  const { getNewCsvTransform } = json2csv(app);

  const campaignService = app.service('campaigns');
  const getCampaignInfo = {
    async get(id) {
      if (!id || !ObjectId.isValid(id)) {
        return { error: 400 };
      }

      const result = await campaignService.find({
        query: {
          _id: id,
          $limit: 1,
        },
      });
      if (result.total !== 1) {
        return { error: 404 };
      }
      const campaign = result.data[0];
      return { campaign };
    },
  };

  const csvService = async (req, res, next) => {
    const { campaign } = req;
    const { id } = campaign;
    res.type('csv');
    res.setHeader('Content-disposition', `attachment; filename=${id}.csv`);

    const { eventsStream, milestones, pledgeIds, canceledPledgeIds } = await getData(campaign);
    const chunks = [];
    eventsStream
      .on('error', next)
      .pipe(newEventTransform({ campaign, milestones, pledgeIds, canceledPledgeIds }))
      .on('error', next)
      .pipe(getNewCsvTransform())
      .on('error', next)
      .on('data', chunk => {
        chunks.push(chunk);
      })
      .on('finish', () => {
        res.send(chunks.join(''));
      });
  };

  const cacheMiddleWare = (req, res, next) => {
    const { error, campaign } = res.data;

    const { id, updatedAt } = campaign;

    if (error) {
      res.status(error).end();
      return;
    }

    const value = MemoryCache.get(id);

    if (value && value.updatedAt.getTime() === updatedAt.getTime()) {
      res.type('csv');
      res.setHeader('Content-disposition', `attachment; filename=${id}.csv`);
      res.send(value.body);
      return;
    }

    res.sendResponse = res.send;
    res.send = body => {
      MemoryCache.put(id, { updatedAt, body });
      res.sendResponse(body);
      res.end();
    };

    req.campaign = campaign;

    next();
  };

  // Initialize our service with any options it requires
  app.use('/campaigncsv/', getCampaignInfo, cacheMiddleWare, csvService);
};
