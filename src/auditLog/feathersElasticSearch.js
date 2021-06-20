const { sendEventToElasticSearch } = require('./elatikSearchUtils');

const unifyData = ({ item, context, serviceName }) => {
  return {
    entity: JSON.stringify(item),
    entityType: serviceName,
    provider: (context && context.params && context.params.provider) || 'internal',
    user: context && context.params && context.params.user && context.params.user.address,
    inputData: context && context.data && JSON.stringify(context.data, null, 4),
    txHash: item.txHash || item.transactionHash,
    updatedAt: item.updatedAt,
    status: item.status,
    homeTxHash: item.homeTxHash,
    entityId: item._id || item.address,
  };
};

const setAuditLogToFeathersService = ({ app, serviceName }) => {
  const service = app.service(serviceName);
  service.on('patched', (item, context) => {
    sendEventToElasticSearch({
      ...unifyData({
        item,
        serviceName,
        context,
      }),
      action: 'patch',
    });
  });
  service.on('updated', (item, context) => {
    sendEventToElasticSearch({
      ...unifyData({
        item,
        serviceName,
        context,
      }),
      action: 'patch',
    });
  });
  service.on('removed', (item, context) => {
    sendEventToElasticSearch({
      ...unifyData({
        item,
        serviceName,
        context,
      }),
      action: 'remove',
    });
  });
  service.on('created', (item, context) => {
    sendEventToElasticSearch({
      ...unifyData({
        item,
        serviceName,
        context,
      }),
      action: 'create',
    });
  });
};

const configureAuditLog = app => {
  setAuditLogToFeathersService({ app, serviceName: 'traces' });
  setAuditLogToFeathersService({ app, serviceName: 'campaigns' });
  setAuditLogToFeathersService({ app, serviceName: 'users' });
  setAuditLogToFeathersService({ app, serviceName: 'communities' });
  setAuditLogToFeathersService({ app, serviceName: 'donations' });
  setAuditLogToFeathersService({ app, serviceName: 'pledgeAdmins' });
  setAuditLogToFeathersService({ app, serviceName: 'events' });
};

module.exports = {
  configureAuditLog,
};
