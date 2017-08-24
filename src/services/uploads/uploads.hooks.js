import { discard, disallow } from 'feathers-hooks-common';
import dauria from 'dauria';

const transformFile = () => {
  return context => {
    if (!context.data.uri && context.params.file) {
      const file = context.params.file;
      const uri = dauria.getBase64DataURI(file.buffer, file.mimetype);
      context.data = { uri: uri };
    }

  };
};

const transformCreateResponse = () => {
  return context => {
    let { uploadsBaseUrl } = context.app.settings;

    if (!uploadsBaseUrl.endsWith('/')) {
      uploadsBaseUrl = uploadsBaseUrl + '/';
    }

    const id = context.result.id;
    delete context.result.id;

    context.result.url = `${uploadsBaseUrl}${id}`;

    return context;
  };
};

module.exports = {
  before: {
    all: [],
    get: [ disallow() ],
    create: [ transformFile() ],
    remove: [],
  },

  after: {
    all: [],
    get: [],
    create: [ discard('uri'), transformCreateResponse() ],
    remove: [],
  },

  error: {
    all: [],
    get: [],
    create: [],
    remove: [],
  },
};
