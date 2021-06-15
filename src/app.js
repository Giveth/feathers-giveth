const logger = require('winston');
const path = require('path');
const favicon = require('serve-favicon');
const compress = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const configuration = require('@feathersjs/configuration');
const socketsConfig = require('./socketsConfig');
const configureLogger = require('./utils/configureLogger');

const middleware = require('./middleware');
const services = require('./services');
const appHooks = require('./app.hooks');
const authentication = require('./authentication');
const blockchain = require('./blockchain');
const mongoose = require('./mongoose');
const ipfsFetcher = require('./utils/ipfsFetcher');
const ipfsPinner = require('./utils/ipfsPinner');

const channels = require('./channels');

const app = express(feathers());

const addLogerToServices = () => {
  const traces = app.service('traces');

  // Listen to a normal service event
  traces.on('patched', trace => console.log('trace patched', trace));

  // Only listen to an event once
  traces.on('created', trace => console.log('trace has been created', trace));
};

function initFeatherApp() {
  // Load app configuration
  app.configure(configuration());

  app.configure(configureLogger);

  app.use(cors());

  app.use(helmet());
  app.use(compress());
  app.use(express.json({ limit: '10mb' }));
  app.use(
    express.urlencoded({
      limit: '10mb',
      extended: true,
    }),
  );

  app.use(favicon(path.join(app.get('public'), 'favicon.ico')));
  // Host the public folder
  app.use('/', express.static(app.get('public')));

  app.configure(mongoose);
  app.configure(express.rest());
  app.configure(socketsConfig);

  // Configure other middleware (see `middleware/index.js`)
  app.configure(middleware);
  app.configure(authentication);
  // Set up our services (see `services/index.js`)
  app.configure(services);
  app.configure(channels);
  // blockchain must be initialized after services
  app.configure(blockchain);
  app.configure(ipfsFetcher);
  app.configure(ipfsPinner);
  // Configure a middleware for 404s and the error handler
  app.use(express.notFound());
  app.use(
    express.errorHandler({
      logger: {
        error: e => {
          if (e.name === 'NotFound') {
            logger.warn(`404 - NotFound - ${e.data.url}`);
          } else {
            logger.error('Express error handler:', e);
          }
        },
        info: e => {
          if (e.name === 'NotFound') {
            logger.warn(`404 - NotFound - ${e.data.url}`);
          } else {
            logger.error('Express error handler:', e);
          }
        },
      },
    }),
  );

  app.hooks(appHooks);
  addLogerToServices(app);
  return app;
}


function getFeatherAppInstance() {
  return app;
}

module.exports = { initFeatherApp, getFeatherAppInstance };
