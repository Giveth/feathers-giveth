import socketsConfig from './socketsConfig';
import logger from './utils/logger';

import middleware from './middleware';
import services from './services';
import appHooks from './app.hooks';
import authentication from './authentication';
import blockchain from './blockchain';

const channels = require('./channels');

const path = require('path');
const favicon = require('serve-favicon');
const compress = require('compression');
const cors = require('cors');
const helmet = require('helmet');

const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const configuration = require('@feathersjs/configuration');

const notFound = require('@feathersjs/errors/not-found');

const mongoose = require('./mongoose');

const app = express(feathers());

// Load app configuration
app.configure(configuration());

// Enable and configure CORS, security, compression, favicon and body parsing
const origin = app.get('env') === 'production' ? app.get('dappUrl') : '*';

const corsOptions = {
  origin,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

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

app.configure(logger);

// Configure other middleware (see `middleware/index.js`)
app.configure(middleware);
app.configure(authentication);
// Set up our services (see `services/index.js`)
app.configure(services);
app.configure(channels);
// blockchain must be initialized after services
app.configure(blockchain);
// Configure a middleware for 404s and the error handler
app.use(notFound());
app.use(express.errorHandler());

app.hooks(appHooks);

module.exports = app;
