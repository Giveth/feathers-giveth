// Initializes the `uploads` service on path `/uploads`
import express from '@feathersjs/express';
import blobService from 'feathers-blob';
import fs from 'fs-blob-store';
import multer from 'multer';
import { multipartTransfer } from '../../middleware/upload';

const hooks = require('./uploads.hooks');

module.exports = function() {
  const app = this;

  const blobStorage = fs(app.get('uploads'));
  const multipartMiddleware = multer();

  // Override the default blobService get method to directly serve the file
  // In production, nginx will serve the file. This is a fallback if that isn't setup
  app.use('/uploads', express.static(app.get('uploads')));

  // Initialize our service with any options it requires
  app.use(
    '/uploads',
    multipartMiddleware.single('uri'),
    multipartTransfer,
    blobService({ Model: blobStorage }),
  );

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('uploads');

  service.hooks(hooks);
};
