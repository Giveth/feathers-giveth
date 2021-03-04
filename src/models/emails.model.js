const EmailImages = {
  MILESTONE_REVIEW_APPROVED: 'Giveth-milestone-review-approved-banner-email.png',
  MILESTONE_REVIEW_REJECTED: 'Giveth-milestone-review-rejected-banner-email.png',
  MILESTONE_CANCELLED: 'Giveth-milestone-canceled-banner-email.png',
  SUGGEST_MILESTONE: 'Giveth-suggest-milestone-banner.png',
  DONATION_BANNER: 'Giveth-donation-banner-email.png',
  REVIEW_BANNER: 'Giveth-review-banner-email.png',
};

const EmailSubscribeTypes = {
  DONATION_RECEIPT: 'donation-receipt',
  DONATION_RECEIVED: 'donation-received',
  REQUEST_DELEGATION: 'request-delegation',
  DONATION_DELEGATED: 'donation-delegated',
  MILESTONE_PROPOSED: 'milestone-proposed',
  PROPOSED_MILESTONE_ACCEPTED: 'proposed-milestone-accepted',
  PROPOSED_MILESTONE_REJECTED: 'proposed-milestone-rejected',
  MILESTONE_REQUEST_REVIEW: 'milestone-request-review',
  MILESTONE_REVIEW_APPROVED: 'milestone-review-approved',
  MILESTONE_REVIEW_REJECTED: 'milestone-review-rejected',
  MILESTONE_CREATED: 'milestone-created',
  MILESTONE_CANCELLED: 'milestone-canceled',
  DONATIONS_COLLECTED: 'donations-collected',
};

const EMAIL_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};

function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const email = new Schema(
    {
      recipient: { type: String, required: true },
      template: { type: String, required: true },
      subject: { type: String, required: true },
      secretIntro: { type: String, required: true },
      title: { type: String, required: true },
      text: { type: String, required: true },
      image: { type: String, required: true, enum: Object.values(EmailImages) },
      unsubscribeType: { type: String, required: true, enum: Object.values(EmailSubscribeTypes) },
      unsubscribeReason: { type: String, required: true },
      cta: { type: String, required: true },
      ctaRelativeUrl: { type: String, required: true },
      message: { type: String, default: '' },
      dappMailerResponse: { type: Object },
      error: { type: String, default: '' },
      milestoneId: { type: String },
      campaignId: { type: String },
      status: { type: String, enum: Object.values(EMAIL_STATUS), default: EMAIL_STATUS.PENDING },
    },
    {
      timestamps: true,
    },
  );
  return mongooseClient.model('email', email);
}

module.exports = {
  EmailSubscribeTypes,
  EmailImages,
  createModel,
  EMAIL_STATUS,
};
