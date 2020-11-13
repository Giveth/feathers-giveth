// events-model.js - A mongoose model
const EventStatus = {
  PENDING: 'Pending', // PENDING events were p/u by the ws subscription, but have yet to contain >= requiredConfirmations
  WAITING: 'Waiting', // WAITING events have been p/u by polling, have >= requiredConfirmations, & are ready to process
  PROCESSING: 'Processing',
  PROCESSED: 'Processed',
  FAILED: 'Failed',
};

const EVENT_TYPES = {
  TRANSFER: 'Transfer',
  GIVER_ADDED: 'GiverAdded',
  PROJECT_ADDED: 'ProjectAdded',
  CANCEL_PROJECT: 'CancelProject',
  PROJECT_UPDATED: 'ProjectUpdated',
  GIVER_UPDATED: 'GiverUpdated',
  DELEGATE_ADDED: 'DelegateAdded',
  DELEGATE_UPDATED: 'DelegateUpdated',
  MILESTONE_COMPLETE_REQUEST_APPROVED: 'MilestoneCompleteRequestApproved',
  MILESTONE_COMPLETE_REQUESTED: 'MilestoneCompleteRequested',
  MILESTONE_COMPLETE_REQUEST_REJECTED: 'MilestoneCompleteRequestRejected',
  PAYMENT_COLLECTED: 'PaymentCollected',
  CONFIRM_PAYMENT: 'ConfirmPayment',
  AUTHORIZE_PAYMENT: 'AuthorizePayment',
  REQUEST_REVIEW: 'RequestReview',
  SET_APP: 'SetApp',
  NEW_APP_PROXY: 'NewAppProxy',
  AUTO_PAY_SET: 'AutoPaySet',
  APPROVE_COMPLETED: 'ApproveCompleted',
  REJECT_COMPLETED: 'RejectCompleted',
  RECIPIENT_CHANGED: 'RecipientChanged',
};
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const event = new Schema(
    {
      logIndex: { type: Number, required: true, index: true },
      transactionIndex: { type: Number, required: true },
      transactionHash: { type: String, required: true, index: true },
      blockHash: { type: String, required: true },
      blockNumber: { type: Number, required: true },
      address: { type: String, required: true },
      type: { type: String },
      id: { type: String, required: true },
      returnValues: { type: Object },
      event: { type: String, index: true, enum: Object.values(EVENT_TYPES) },
      signature: { type: String },
      raw: { type: Object },
      topics: [String],
      status: {
        type: String,
        require: true,
        enum: Object.values(EventStatus),
        default: EventStatus.WAITING,
        index: true,
      },
      processingError: { type: String },
      confirmations: { type: Number, require: true },
    },
    {
      timestamps: true,
    },
  );
  event.index({ updatedAt: 1 });
  event.index({ createdAt: 1 });
  return mongooseClient.model('event', event);
}

module.exports = {
  createModel,
  EventStatus,
};
