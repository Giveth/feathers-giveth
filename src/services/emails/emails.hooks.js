const logger = require('winston');
const rp = require('request-promise');
const { disallow } = require('feathers-hooks-common');
const { EMAIL_STATUS } = require('../../models/emails.model');

const sendEmailToDappMailer = () => async context => {
  const { app, result } = context;
  const emailService = app.service('/emails');
  const dappUrl = app.get('dappUrl');
  const emailData = {
    recipient: result.recipient,
    template: result.template,
    subject: result.subject,
    secretIntro: result.secretIntro,
    image: result.image,
    text: result.text,
    cta: result.cta,
    ctaRelativeUrl: result.ctaRelativeUrl,
    unsubscribeType: result.unsubscribeType,
    unsubscribeReason: result.unsubscribeReason,
    // add the dapp url that this feathers serves for
    dappUrl,
    message: result.message,
  };
  const dappMailerUrl = app.get('dappMailerUrl');

  if (!dappMailerUrl) {
    logger.info(`skipping email notification. Missing dappMailerUrl in configuration file`);
    return;
  }
  if (!emailData.recipient) {
    logger.info(
      `skipping email notification to ${emailData.recipient} > ${emailData.unsubscribeType}`,
    );
    return;
  }

  logger.info(
    `sending email notification to ${emailData.recipient} > ${emailData.unsubscribeType}`,
  );

  rp({
    method: 'POST',
    url: `${dappMailerUrl}/send`,
    headers: {
      Authorization: app.get('dappMailerSecret'),
    },
    form: emailData,
    json: true,
  })
    .then(res => {
      logger.info(`email sent to ${emailData.recipient}: `, res);
      return emailService.patch(result._id, {
        status: EMAIL_STATUS.SUCCESS,
        dappUrl,
        dappMailerResponse: res,
      });
    })
    .catch(err => {
      logger.error(`error sending email to ${emailData.recipient}`, err);
      return emailService.patch(result._id, {
        status: EMAIL_STATUS.FAILED,
        dappUrl,
        error: err.message,
      });
    });
};

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [disallow('external')],
    update: [disallow('external')],
    patch: [disallow('external')],
    remove: [disallow('external')],
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [sendEmailToDappMailer()],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
