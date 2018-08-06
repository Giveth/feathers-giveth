const dauria = require('dauria');
const errors = require('@feathersjs/errors');
const { disallow } = require('feathers-hooks-common');

const transformFile = () => context => {
  // delete id to prevent users specifying the file path to upload the file to
  delete context.data.id;
  if (!context.data.uri && context.params.file) {
    const { file } = context.params;
    const uri = dauria.getBase64DataURI(file.buffer, file.mimetype);
    context.data = { uri };
  }
};

const restrictFileType = () => context => {
  if (!context.data.uri) throw new errors.BadRequest('Invalid request');

  // note: the mimetype can be faked, however it will be saved as the faked
  // mimetype and from manual testing, however it will be saved with an image
  // file extension thus the browser will not execute js if
  // the mimetype is faked as image/jpeg.
  const parsedData = dauria.parseDataURI(context.data.uri);
  if (!parsedData.MIME.startsWith('image/')) {
    throw new errors.Forbidden('Only image uploads are supported');
  }
};

const transformCreateResponse = () => context => {
  let { uploadsBaseUrl } = context.app.settings;

  if (!uploadsBaseUrl.endsWith('/')) {
    uploadsBaseUrl = `${uploadsBaseUrl}/`;
  }

  const { id } = context.result;

  delete context.result.id;
  delete context.result.uri;

  context.result.url = `${uploadsBaseUrl}${id}`;

  return context;
};

module.exports = {
  before: {
    all: [],
    get: [disallow()],
    create: [transformFile(), restrictFileType()],
    remove: [disallow()],
  },

  after: {
    all: [],
    get: [],
    create: [transformCreateResponse()],
    remove: [],
  },

  error: {
    all: [],
    get: [],
    create: [],
    remove: [],
  },
};
