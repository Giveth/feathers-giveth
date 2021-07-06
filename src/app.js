const logger = require('winston');
const path = require('path');
const config = require('config');
const favicon = require('serve-favicon');
const compress = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const configuration = require('@feathersjs/configuration');
const Sentry = require('@sentry/node');
const swagger = require('feathers-swagger');
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
const { configureAuditLog } = require('./auditLog/feathersElasticSearch');
const channels = require('./channels');

const app = express(feathers());
Sentry.init({
  dsn: config.sentryDsn,
  environment: process.env.NODE_ENV,
  release: `Giveth-Feathers@${process.env.npm_package_version}`,
  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

function initSwagger() {
  app.configure(
    swagger({
      docsPath: '/docs',
      openApiVersion: 3,
      idType: 'string',
      uiIndex: true,
      specs: {
        info: {
          title: 'Feathers-Giveth API',
          description: 'In reality the user use socketio instead of REST',
          version: process.env.npm_package_version,
        },
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              description:
                'Open giveth-dapp in chrome and copy accessToken from Network -> WS -> Messages section',
            },
          },
        },
        servers: [
          {
            url: 'https://feathers.develop.giveth.io',
            description: 'UAT',
          },
          {
            url: 'http://localhost:3030',
            description: 'Localhost',
          },
          {
            url: 'https://feathers.beta.giveth.io',
            description: 'Production',
          },
        ],
        security: [{ BearerAuth: [] }],
        schemes: ['http', 'https'], // Optionally set the protocol schema used (sometimes required when host on https)
      },
    }),
  );
}

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
  initSwagger();

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
  if (config.enableAuditLog) {
    configureAuditLog(app);
  }
  return app;
}

function getFeatherAppInstance() {
  return app;
}

module.exports = { initFeatherApp, getFeatherAppInstance };
