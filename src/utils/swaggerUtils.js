const m2s = require('mongoose-to-swagger');

const generateSwaggerDocForCRUDService = (service, disabledMethods = ['remove']) => {
  const modelDefinition = m2s(service.Model);
  const serviceDoc = {
    securities: ['create', 'update', 'patch', 'remove'],
    definition: modelDefinition,
    operations: {
      find: {
        'parameters[0]': {
          type: 'integer',
          in: 'query',
          default: '25',
          name: '$limit',
        },
        'parameters[1]': {
          type: 'integer',
          in: 'query',
          default: '0',
          name: '$skip',
        },
      },
    },
  };
  disabledMethods.forEach(method => {
    serviceDoc.operations[method] = false;
  });

  // we start from 2 because the, 0,1 parameters are $limit and $skip
  let queryParameterCounter = 2;
  Object.keys(modelDefinition.properties).forEach(key => {
    if (
      modelDefinition.properties[key].type === 'string' &&
      !modelDefinition.properties[key].format &&
      key !== '_id'
    ) {
      serviceDoc.operations.find[`parameters[${queryParameterCounter}]`] = {
        name: key,
        in: 'query',
      };
      queryParameterCounter += 1;
    } else if (key === 'verified') {
      // in Trace, Community and Campaigns we have verified field the is boolean,
      // but in querystring we get string of true or false then we cast it to boolean in our hooks
      serviceDoc.operations.find[`parameters[${queryParameterCounter}]`] = {
        schema: {
          type: 'string',
          enum: ['true', 'false'],
        },
        in: 'query',
        name: key,
      };
      queryParameterCounter += 1;
    }
  });
  return serviceDoc;
};

module.exports = { generateSwaggerDocForCRUDService };
