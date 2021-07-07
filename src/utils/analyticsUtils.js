const config = require('config');
const Analytics = require('analytics-node');
const logger = require('winston');

const AnalyticsActions = {
  Donated: 'donated',
  Delegated: 'delegated',
  CommentAdded: 'created',
  TraceProposed: 'trace-proposed',
  TraceReproposed: 'reproposed rejected trace',
  TraceMarkCompleted: 'marked complete',
  TraceWithdraw: 'initiated withdrawal',
  TraceReviewRejected: 'trace-review-rejected',
  TraceCancelled: 'cancel',
  ProposeTraceRejected: 'rejected completion',
  ProposeTraceAccepted: 'accepted proposed Trace',
  ProposeTraceEdited: 'updated proposed',
  TraceArchived: 'trace-archived',
  TraceCompletionApproved: 'approved',
  TraceCompletionRejected: 'rejected completion',
  CampaignCancelled: 'cancel',
  CampaignCreated: 'created',
  CommunityCreated: 'created',
  Login: 'login',
  UserUpdated: 'updated',
  UserCreated: 'created',
};
const AnalyticsEvents = {
  Donated: 'Donated',
  Delegated: 'Delegated',
  CommentAdded: 'Comment Added',
  TraceProposed: 'Trace proposed',
  TraceReproposed: 'reproposed rejected trace',
  TraceMarkCompleted: 'Trace Marked Complete',
  TraceWithdraw: 'Trace Withdraw',
  TraceReviewRejected: 'trace-review-rejected',
  TraceCancelled: 'Trace Canceled',
  ProposeTraceRejected: 'Trace Rejected',
  ProposeTraceAccepted: 'Trace Accepted',
  ProposeTraceEdited: 'updated proposed',
  TraceArchived: 'trace-archived',
  TraceCompletionApproved: 'Approved Trace',
  TraceCompletionRejected: 'Trace Rejected',
  CampaignCancelled: 'Campaign Canceled',
  CampaignCreated: 'Campaign Created',
  CommunityCreated: 'Community Created',
  Login: 'login',
  UserUpdated: 'updated',
  UserCreated: 'User Created',
};

const AnalyticsCategories = {
  Donation: 'donation',
  User: 'User',
  Trace: 'trace',
  Conversation: 'comment',
  Campaign: 'campaign',
  Community: 'community',
};

let analytics;
if (config.segmentApiKey) {
  analytics = new Analytics(config.segmentApiKey);
} else {
  logger.info('You dont have segmentApiKey in your config, so analytics is disabled');
}

const getAnalitycsDataFromContext = context => {
  const data = {
    origin: context.params.headers.origin,
    referrer: context.params.headers.referrer,
    host: context.params.headers.host,
    userAgent: context.params.headers['user-agent'],
    /**
     * @see{@link https://atlassc.net/2020/02/25/feathersjs-client-real-ip}
     */
    ip: context.params.headers['x-real-ip'],
    userAddress: context.params.user && context.params.user.address,

    // If this not good to send it to Segment we should think with another thing for sending as anonymousId
    websocketKey: context.params.headers['sec-websocket-key'],
  };
  return data;
};
const identifyUser = user => {
  if (!analytics) {
    return;
  }
  /**
   * as said in documentation, we should call identify when user data changes
   * @see {@link https://segment.com/docs/connections/sources/catalog/libraries/server/node/#identify}
   */
  analytics.identify({ userId: user.address, traits: user });
};

const track = data => {
  if (!analytics) {
    return;
  }
  try {
    logger.debug('send segment tracking', data);
    analytics.track(data);
  } catch (e) {
    logger.error('send segment tracking error', { e, data });
  }
};
const page = data => {
  if (!analytics) {
    return;
  }
  try {
    logger.debug('send segment page', data);
    analytics.page(data);
  } catch (e) {
    logger.error('send segment page error', { e, data });
  }
};

const sendProposedTraceAcceptedEvent = ({ trace, userAddress }) => {
  track({
    event: AnalyticsEvents.ProposeTraceAccepted,
    userId: userAddress,
    properties: {
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.ProposeTraceAccepted,
      formType: trace.formType || 'old',
      label: trace._id,
      id: trace._id,
      title: trace.title,
      campaignTitle: trace.campaign.title,
    },
  });
};
const sendProposedTraceRejectedEvent = ({ trace, context }) => {
  const contextData = getAnalitycsDataFromContext(context);
  track({
    event: AnalyticsEvents.ProposeTraceRejected,
    userId: contextData.userAddress,
    properties: {
      ...getAnalitycsDataFromContext(context),
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.ProposeTraceRejected,
      formType: trace.formType || 'old',
      label: trace._id,
      id: trace._id,
      title: trace.title,
      campaignTitle: trace.campaign.title,
    },
  });
};
const sendProposedTraceEditedEvent = ({ trace, context }) => {
  const contextData = getAnalitycsDataFromContext(context);
  track({
    userId: contextData.userAddress,
    event: AnalyticsEvents.ProposeTraceEdited,
    properties: {
      ...getAnalitycsDataFromContext(context),
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.ProposeTraceEdited,

      formType: trace.formType,
      label: trace._id,
      id: trace._id,
      title: trace.title,
      campaignTitle: trace.campaign.title,
    },
  });
};
const sendTraceCompletionApprovedEvent = ({ trace, context }) => {
  const contextData = getAnalitycsDataFromContext(context);
  track({
    event: AnalyticsEvents.TraceCompletionApproved,
    properties: {
      ...contextData,
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceCompletionApproved,
      label: trace._id,
      id: trace._id,
      title: trace.title,
    },
  });
};

const sendTraceCompletionRejectedEvent = ({ trace, userAddress }) => {
  track({
    userId: userAddress,
    event: AnalyticsEvents.TraceCompletionRejected,
    properties: {
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceCompletionRejected,
      label: trace._id,
      id: trace._id,
      title: trace.title,
    },
  });
};
const sendTraceCancelledEvent = ({ trace, userAddress }) => {
  track({
    event: AnalyticsEvents.TraceCancelled,
    userId: userAddress,
    properties: {
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceCancelled,
      label: trace._id,
      id: trace._id,
      title: trace.title,
      donationCounters: trace.donationCounters,
    },
  });
};
const sendTraceReproposedEvent = ({ trace, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    userId: contextData.userAddress,
    event: AnalyticsEvents.TraceReproposed,
    properties: {
      ...getAnalitycsDataFromContext(context),
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceReproposed,
      label: trace._id,
      id: trace._id,
      title: trace.title,
    },
  });
};
const sendTraceProposedEvent = ({ trace, context }) => {
  const contextData = getAnalitycsDataFromContext(context);
  track({
    event: AnalyticsEvents.TraceProposed,
    userId: contextData.userAddress,
    properties: {
      ...getAnalitycsDataFromContext(context),
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceProposed,
      formType: trace.formType,
      label: trace._id,
      id: trace._id,
      title: trace.title,
    },
  });
};
const sendRequestTraceMarkCompletedEvent = ({ trace, userAddress }) => {
  track({
    userId: userAddress,
    event: AnalyticsEvents.TraceMarkCompleted,
    properties: {
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceMarkCompleted,
      label: trace._id,
      id: trace._id,
      title: trace.title,
    },
  });
};
const sendTraceWithdrawEvent = ({ trace }) => {
  track({
    event: AnalyticsEvents.TraceWithdraw,
    userId: trace.recipientAddress,
    properties: {
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceWithdraw,

      label: trace._id,
      id: trace._id,
      title: trace.title,
    },
  });
};
const sendTraceArchivedEvent = ({ trace, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    userId: contextData.userAddress,
    event: AnalyticsEvents.TraceArchived,
    properties: {
      ...getAnalitycsDataFromContext(context),
      category: AnalyticsCategories.Trace,
      action: AnalyticsActions.TraceArchived,
      label: trace._id,
      id: trace._id,
      title: trace.title,
    },
  });
};
const sendCommentAddedEvent = ({ conversation, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.CommentAdded,
    userId: contextData.userAddress,
    properties: {
      ...getAnalitycsDataFromContext(context),
      category: AnalyticsCategories.Conversation,
      action: AnalyticsActions.CommentAdded,
      id: conversation._id,
      label: conversation._id,
      message: conversation.message,
      traceId: conversation.traceId,
    },
  });
};

const sendCampaignCancelledEvent = ({ campaign, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.CampaignCancelled,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      category: AnalyticsCategories.Campaign,
      action: AnalyticsActions.CampaignCancelled,
      donationCounters: campaign.donationCounters,
      label: campaign._id,
      id: campaign._id,
      title: campaign.title,
    },
  });
};

const sendCampaignCreatedEvent = ({ campaign, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.CampaignCreated,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      category: AnalyticsCategories.Campaign,
      action: AnalyticsActions.CampaignCreated,
      label: campaign._id,
      id: campaign._id,
      title: campaign.title,
    },
  });
};

const sendCommunityCreatedEvent = ({ community, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.CommunityCreated,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      category: AnalyticsCategories.Community,
      action: AnalyticsActions.CommunityCreated,
      label: community._id,
      id: community._id,
      title: community.title,
    },
  });
};
const sendUserCreatedEvent = ({ context, user }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.UserCreated,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      category: AnalyticsCategories.User,
      action: AnalyticsActions.UserCreated,
      label: user.address,
    },
  });
};
const sendUserUpdatedEvent = ({ context, user }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.UserUpdated,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      category: AnalyticsCategories.User,
      action: AnalyticsActions.UserUpdated,
      label: user.address,
    },
  });
};

const sendDonationDelegatedEvent = ({ donation, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.Delegated,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      action: AnalyticsActions.Delegated,
      category: AnalyticsCategories.Donation,
      id: donation._id,
      projectType: donation.intendedProjectType,
      projectTypeId: donation.intendedProjectTypeId,
    },
  });
};
const sendDonationDonatedEvent = ({ donation, context }) => {
  const contextData = getAnalitycsDataFromContext(context);

  track({
    event: AnalyticsEvents.Donated,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      action: AnalyticsActions.Donated,
      category: AnalyticsCategories.Donation,
      id: donation._id,
      amount: donation.amount,
      token: donation.token,
    },
  });
};

const viewHomePage = ({ context }) => {
  const contextData = getAnalitycsDataFromContext(context);
  const viewPageData = {
    name: 'Home page or Reload',
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      url: '/',
    },
  };
  if (!viewPageData.userId) {
    viewPageData.anonymousId = contextData.websocketKey;
  }
  page(viewPageData);
};

const viewEntitiesPage = ({ context, query, entity }) => {
  const contextData = getAnalitycsDataFromContext(context);
  const entities = entity === 'community' ? 'communities' : `${entity}s`;

  const viewPageData = {
    name: `${entities} Page`,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      query,
      url: `/${entities}`,
    },
  };
  if (!viewPageData.userId) {
    viewPageData.anonymousId = contextData.websocketKey;
  }
  page(viewPageData);
};

const viewEntityDetailPage = ({ context, query, entity }) => {
  const contextData = getAnalitycsDataFromContext(context);
  const viewPageData = {
    name: `${entity} Detail`,
    userId: contextData.userAddress,
    properties: {
      ...contextData,
      query,
      url: `/${entity}/${query.slug}`,
    },
  };
  if (!viewPageData.userId) {
    viewPageData.anonymousId = contextData.websocketKey;
  }
  page(viewPageData);
};
module.exports = {
  identifyUser,
  sendProposedTraceAcceptedEvent,
  sendTraceCompletionRejectedEvent,
  sendUserUpdatedEvent,
  sendCommunityCreatedEvent,
  sendUserCreatedEvent,
  sendCampaignCreatedEvent,
  sendCampaignCancelledEvent,
  sendCommentAddedEvent,
  sendTraceWithdrawEvent,
  sendRequestTraceMarkCompletedEvent,
  sendTraceReproposedEvent,
  sendTraceCancelledEvent,
  sendProposedTraceEditedEvent,
  sendTraceCompletionApprovedEvent,
  sendProposedTraceRejectedEvent,
  sendTraceProposedEvent,
  sendTraceArchivedEvent,
  sendDonationDonatedEvent,
  sendDonationDelegatedEvent,

  viewHomePage,
  viewEntitiesPage,
  viewEntityDetailPage,
};
