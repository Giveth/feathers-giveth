const dauria = require('dauria');
const errors = require('@feathersjs/errors');
const { disallow } = require('feathers-hooks-common');
const { gql, GraphQLClient } = require('graphql-request');
const config = require('config');
const logger = require('winston');

const client = new GraphQLClient(config.givethIoUrl);

const TraceImageOwnerType = {
  USER: 'USER',
  TRACE: 'TRACE',
  CAMPAIGN: 'CAMPAIGN',
  DAC: 'DAC',
};

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

const uploadToImpactGraph = () => async context => {
  const fileData = context.data.uri;
  const TRACE_IMAGE_UPLOAD = gql`
      mutation traceImageUpload($fileData:String!, $user:String!, $entityId:String!, $password: String!) {
        traceImageUpload(
          traceFileUpload: {
            fileDataBase64: $fileData
            user: $user
            entityId: $entityId
            password: $password
            imageOwnerType: ${TraceImageOwnerType.USER}
          }
        )
      }
  `;
  try {
    const result = await client.request(TRACE_IMAGE_UPLOAD, {
      fileData,
      user: context.params.user.address,
      entityId: '1',
      password: config.givethIoFileUploaderPassword,
    });
    context.result = result.traceImageUpload;
  } catch (e) {
    logger.error(e);
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
    patch: [disallow()],
    update: [disallow()],
    create: [transformFile(), restrictFileType(), uploadToImpactGraph()],
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
