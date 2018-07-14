const dauria = require('dauria');
const { disallow } = require('feathers-hooks-common');

const transformFile = () => context => {
  if (!context.data.uri && context.params.file) {
    const file = context.params.file;
    const uri = dauria.getBase64DataURI(file.buffer, file.mimetype);
    context.data = { uri };
  }
};

const transformCreateResponse = () => context => {
  let { uploadsBaseUrl } = context.app.settings;

  if (!uploadsBaseUrl.endsWith('/')) {
    uploadsBaseUrl = `${uploadsBaseUrl}/`;
  }

  const id = context.result.id;

  delete context.result.id;
  delete context.result.uri;

  context.result.url = `${uploadsBaseUrl}${id}`;

  return context;
};

module.exports = {
  before: {
    all: [],
    get: [disallow()],
    create: [transformFile()],
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
