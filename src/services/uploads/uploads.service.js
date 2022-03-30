/* eslint-disable class-methods-use-this */
// Initializes the `uploads` service on path `/uploads`
const express = require('@feathersjs/express');
const multer = require('multer');
const { errors } = require('@feathersjs/errors');
const multipartTransfer = require('../../middleware/upload');

const hooks = require('./uploads.hooks');

const notImplemented = method => {
  throw new errors.NotImplemented(`${method} is not implemented on this service`);
};
class UploadService {
  find(_params) {
    notImplemented('find');
  }

  get(_id, _params) {
    notImplemented('get');
  }

  create(_data, _params) {}

  update(_id, _data, _params) {
    notImplemented('update');
  }

  patch(_id, _data, _params) {
    notImplemented('patch');
  }

  remove(_id, _params) {
    notImplemented('remove');
  }

  setup(_app, _path) {}
}
module.exports = function uploadService() {
  const app = this;

  const multipartMiddleware = multer();

  // Override the default blobService get method to directly serve the file
  // In production, nginx will serve the file. This is a fallback if that isn't setup
  app.use('/uploads', express.static(app.get('uploads')));

  const service = new UploadService();
  service.docs = {
    operations: {
      update: false,
      patch: false,
      remove: false,
      get: false,
      create: {
        description: 'Currently I dont know what parameter is needed for this endpoint',
      },
    },
    definition: {},
  };

  // Initialize our service with any options it requires
  app.use('/uploads', multipartMiddleware.single('uri'), multipartTransfer, service);

  // Get our initialized service so that we can register hooks and filters
  app.service('uploads').hooks(hooks);
};
