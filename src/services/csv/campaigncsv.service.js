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

  const infoListeners = {};

  const campaignService = app.service('campaigns');
  const getCampaignInfo = {
    async get(id) {
      if (!id || !ObjectId.isValid(id)) {
        return { error: 400 };
      }

      if (infoListeners[id]) {
        return new Promise(resolve => {
          infoListeners.push(resolve);
        });
      }

      infoListeners[id] = [];

      const result = await campaignService.find({
        query: {
          _id: id,
          $limit: 1,
        },
      });

      let response;

      if (result.total !== 1) {
        response = { error: 404 };
      } else {
        const campaign = result.data[0];
        response = { campaign };
      }

      infoListeners[id].forEach(cb => cb(response));
      delete infoListeners[id];

      return response;
    },
  };

  const csvService = async (req, res, next) => {
    const { campaign } = req;
    const id = campaign._id.toString();
    res.type('csv');
    res.setHeader('Content-disposition', `attachment; filename=${id}.csv`);
    const { eventsStream, traces, pledgeIds, canceledPledgeIds } = await getData(campaign);
    const chunks = [];
    const writeToCache = () => {
      MemoryCache.put(id, { updatedAt: campaign.updatedAt, body: chunks.join('') });
    };
    eventsStream
      .on('error', next)
      .pipe(newEventTransform({ campaign, traces, pledgeIds, canceledPledgeIds }))
      .on('error', next)
      .pipe(getNewCsvTransform())
      .on('error', next)
      .on('data', chunk => {
        chunks.push(chunk);
      })
      .on('finish', () => {
        writeToCache();
        res.send(chunks.join(''));
      });
  };

  const cacheListeners = {};

  const cacheMiddleWare = (req, res, next) => {
    const { error, campaign } = res.data;

    const { _id, updatedAt } = campaign;
    req.campaign = campaign;
    const id = _id.toString();
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

    if (cacheListeners[id]) {
      cacheListeners[id].push(body => {
        res.type('csv');
        res.setHeader('Content-disposition', `attachment; filename=${id}.csv`);
        res.send(body);
      });
      return;
    }
    cacheListeners[id] = [];

    res.sendResponse = res.send;
    res.send = body => {
      MemoryCache.put(id, { updatedAt, body });
      res.sendResponse(body);
      cacheListeners[id].forEach(cb => cb(body));
      delete cacheListeners[id];
      res.end();
    };

    req.campaign = campaign;

    next();
  };

  // Initialize our service with any options it requires
  app.use('/campaigncsv/', getCampaignInfo, cacheMiddleWare, csvService);
};
