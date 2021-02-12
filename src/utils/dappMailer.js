/* eslint-disable no-param-reassign */
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { EMAIL_IMAGES, EMAIL_SUBSCRIBE_TYPES } = require('../models/emails.model');
const emailNotificationTemplate = 'notification';
const emailStyle = `style='line-height: 33px; font-size: 22px;'`;
const generateMilestoneCtaRelativeUrl = (campaignId, milestoneId) => {
  return `/campaigns/${campaignId}/milestones/${milestoneId}`;
};

const capitalizeDelegateType = inputDelegateType => {
  if (inputDelegateType.toLowerCase() === 'dac') return 'DAC';
  return inputDelegateType.charAt(0).toUpperCase() + inputDelegateType.slice(1);
};

const normalizeAmount = amount => {
  return Number(amount) / 10 ** 18;
};

const sendEmail = (app, data) => {
  const emailService = app.service('/emails');
  // add host to subject for development
  if (!app.get('host').includes('beta')) {
    data.subject = `[${app.get('host')}] - ${data.subject}`;
  }
  emailService.create(data);
};

const thanksFromDonationGiver = (
  app,
  { recipient, user, amount, token, donationType, donatedToTitle },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Thank you for your donation!',
    secretIntro: `Thank you for your donation of ${normalizeAmount(amount)} ${
      token.symbol
    } to the ${donationType} "${donatedToTitle}"!`,
    title: 'You are so awesome!',
    image: EMAIL_IMAGES.DONATION_BANNER,
    text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${user}</span></p>
        <p>
          Thank you very much for your donation of ${normalizeAmount(amount)} ${
      token.symbol
    } to the ${donationType} <em>${donatedToTitle}</em>.
          With your donation we can really make this happen, and you play a vital part in making the world a better place!
        </p>
      `,
    cta: 'Manage your Donations',
    ctaRelativeUrl: '/donations',
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.DONATION_RECEIPT,
    unsubscribeReason: 'You receive this email from Giveth because you have made a donation',
  };

  sendEmail(app, data);
};

const donationReceived = (
  app,
  { recipient, user, donationType, donatedToTitle, amount, token },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: "Giveth - You've received a donation!",
    secretIntro: `You have received a donation of ${normalizeAmount(amount)} ${
      token.symbol
    } for the ${donationType} "${donatedToTitle}"!`,
    title: 'You are so awesome!',
    image: EMAIL_IMAGES.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          You have received a donation of
          <span>${amount} ${token.symbol}</span>
          for your ${donationType} <em>${donatedToTitle}</em>.
        </p>
      `,
    cta: `Manage your ${donationType}`,
    ctaRelativeUrl: `/my-${donationType}s`,
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.DONATION_RECEIVED,
    unsubscribeReason: `You receive this email because you run a ${donationType}`,
  };

  sendEmail(app, data);
};

const delegationRequired = (
  app,
  {
    recipient,
    user,
    donationType, // dac / campaign
    donatedToTitle,
    amount,
    token,
  },
) => {
  const data = {
    recipient,
    user,
    template: emailNotificationTemplate,
    subject: 'Giveth - Delegation required for new donation!',
    secretIntro: `Take action! Please delegate a new donation of ${normalizeAmount(amount)} ${
      token.symbol
    } for the ${donationType} "${donatedToTitle}"!`,
    title: "Take action! You've received a donation, delegate now!",
    image: EMAIL_IMAGES.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          You have received a donation of
          <span style='display: block; color: rgb(53, 184, 209); line-height: 72px; font-size: 48px;'>${amount} ${
      token.symbol
    }</span>
          for your ${donationType} <em>${donatedToTitle}</em>.
        </p>
        <p>
          You can now delegate this money to a ${
            donationType === AdminTypes.DAC ? 'Campaign or a Milestone' : 'Milestone'
          }.
        </p>
      `,
    cta: `Delegate Donation`,
    ctaRelativeUrl: `/delegations`,
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.REQUEST_DELEGATION,
    unsubscribeReason: `You receive this email because you run a ${donationType}`,
  };

  sendEmail(app, data);
};

const donationDelegated = (
  app,
  {
    recipient,
    user,
    delegationType,
    delegatedToTitle,
    delegateType,
    delegateTitle,
    commitTime,
    amount,
    token,
  },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your donation has been delegated!',
    secretIntro: `Take action! Please approve or reject the delegation of ${normalizeAmount(
      amount,
    )} ${token.symbol} to the ${delegationType} "${delegatedToTitle}"!`,
    title: 'Take action! Your donation has been delegated!',
    image: EMAIL_IMAGES.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          The ${capitalizeDelegateType(
            delegateType,
          )} <em>${delegateTitle}</em> has proposed a delegation of
          <span style='display: block; color: rgb(53, 184, 209); line-height: 72px; font-size: 48px;'>
          ${normalizeAmount(amount)} ${token.symbol}</span> from your donation to
          ${capitalizeDelegateType(delegateType)} <em>${delegateTitle}</em>.
        </p>
        <p>
          You have until ${commitTime.toUTCString()} to approve or reject this delegation. If you fail to
          act before this date, this delegation will be auto-approved.
        </p>
      `,
    cta: `View Donations`,
    ctaRelativeUrl: `/donations`,
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.DONATION_DELEGATED,
    unsubscribeReason: `You receive this email because your donation was delegated`,
  };

  sendEmail(app, data);
};

const milestoneProposed = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignTitle, campaignId, amount, token },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - A Milestone has been proposed!',
    secretIntro: `Take action! A Milestone has been proposed for your Campaign! Please accept or reject.`,
    title: 'Take action: Milestone proposed!',
    image: EMAIL_IMAGES.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          The Milestone <em>${milestoneTitle}</em> for <em>${normalizeAmount(amount)} ${
      token.symbol
    }</em> has been proposed to <em>${campaignTitle}</em> Campaign .
          If you think this is a great idea, then <strong>please approve this Milestone within 3 days</strong> to add it to your Campaign.
          If not, then please reject it with comment.
        </p>
      `,
    cta: `See the Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.MILESTONE_PROPOSED,
    unsubscribeReason: `You receive this email because you run a Campaign`,
    // message: message,
  };

  sendEmail(app, data);
};

const proposedMilestoneAccepted = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignTitle, campaignId, message },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your proposed Milestone is accepted!',
    secretIntro: `Your Milestone ${milestoneTitle} has been accepted by the Campaign Owner. You can now receive donations.`,
    title: 'Take action: Milestone proposed!',
    image: EMAIL_IMAGES.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${user}</span></p>
        <p>
          Your proposed Milestone <em>${milestoneTitle}</em> to the Campaign <em>${campaignTitle}</em> has been accepted by the Campaign Owner!
          <br/><br/>
          You can now receive donations, start executing the Milestone, and once finished, mark it as complete.
        </p>
      `,
    cta: `Manage Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.PROPOSED_MILESTONE_ACCEPTED,
    unsubscribeReason: `You receive this email because you run a Milestone`,
    message,
  };

  sendEmail(app, data);
};

const proposedMilestoneAcceptedForDacOwner = (
  app,
  { recipient, milestoneId, user, campaignId, message, dacTitle },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: `${dacTitle} has added a new milestone!`,
    secretIntro: `Check out what ${dacTitle} has been up to!`,
    title: `${dacTitle} has expanded!`,
    image: EMAIL_IMAGES.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${user}</span></p>
        <p>${dacTitle} added a new milestone. Come see what awesome things they have planned!</p>
        <br/><br/>
      `,
    cta: `See Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.PROPOSED_MILESTONE_ACCEPTED,
    unsubscribeReason: `You receive this email because you run a Milestone`,
    message,
  };

  sendEmail(app, data);
};

const proposedMilestoneRejected = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignTitle, campaignId, message },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your proposed Milestone is rejected :-(',
    secretIntro: `Your Milestone ${milestoneTitle} has been rejected by the Campaign Owner :-(`,
    title: 'Milestone rejected :-(',
    image: EMAIL_IMAGES.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          Unfortunately your proposed Milestone <em>${milestoneTitle}</em> to the Campaign <em>${campaignTitle}</em> has been rejected by the Campaign Owner.
          <br/><br/>
          Please contact the Campaign Owner to learn why your Milestone was rejected.
        </p>
      `,
    cta: `Manage Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.PROPOSED_MILESTONE_REJECTED,
    unsubscribeReason: `You receive this email because you proposed a Milestone`,
    message,
  };

  sendEmail(app, data);
};

const milestoneRequestReview = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignTitle, campaignId, message },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Time to review!',
    secretIntro: `Take action: you are requested to review the Milestone ${milestoneTitle} within 3 days.`,
    title: 'Milestone review requested',
    image: EMAIL_IMAGES.REVIEW_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          The Milestone <em>${milestoneTitle}</em> to the Campaign <em>${campaignTitle}</em> has been marked as completed by the Milestone Owner.
          <br/><br/>
        </p>
          Now is your moment to shine!
        </p>
        <p>
          Please contact the Milestone Owner and <strong>review the completion of this Milestone within 3 days.</strong>
        </p>
      `,
    cta: `Review Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.MILESTONE_REQUEST_REVIEW,
    unsubscribeReason: `You receive this email because you run a Milestone`,
    message,
  };

  sendEmail(app, data);
};
const milestoneMarkedCompleted = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignTitle, campaignId, message, token },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Milestone is finished!',
    secretIntro: `Your Milestone ${milestoneTitle} has been marked complete by the reviewer. The recipient can now collect the payment.`,
    title: `Milestone completed! Time to collect ${token.symbol}.`,
    image: EMAIL_IMAGES.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${user}</span></p>
        <p>
          The Milestone <em>${milestoneTitle}</em> in the Campaign <em>${campaignTitle}</em> has been marked complete by the reviewer!.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this Milestone!
        </p>
      `,
    cta: `Manage Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.MILESTONE_REVIEW_APPROVED,
    unsubscribeReason: `You receive this email because you run a Milestone`,
    message,
  };

  sendEmail(app, data);
};
const milestoneReviewRejected = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignTitle, campaignId, message },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Milestone rejected by reviewer :-(',
    type: EMAIL_SUBSCRIBE_TYPES.MILESTONE_REVIEW_REJECTED,
    secretIntro: `The completion of your Milestone ${milestoneTitle} has been rejected by the reviewer.`,
    title: 'Milestone completion rejected.',
    image: EMAIL_IMAGES.MILESTONE_REVIEW_REJECTED,
    text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${user}</span></p>
        <p>
          The Milestone completion <em>${milestoneTitle}</em> in the Campaign <em>${campaignTitle}</em> has been rejected by the reviewer.
        </p>
      `,
    cta: `Manage Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.MILESTONE_REVIEW_REJECTED,
    unsubscribeReason: `You receive this email because you run a Milestone`,
    message,
  };

  sendEmail(app, data);
};

const milestoneCreated = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignId, amount, token },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Milestone created with you as a recipient',
    type: EMAIL_SUBSCRIBE_TYPES.MILESTONE_CREATED,
    secretIntro: `A Milestone ${milestoneTitle} has been created with you as the recipient.`,
    title: 'Milestone created.',
    image: EMAIL_IMAGES.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          A Milestone <em>${milestoneTitle}</em> for ${normalizeAmount(amount)} ${
      token.symbol
    } has been created with you as the recipient.
        </p>
      `,
    cta: `See your Milestones`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.MILESTONE_CREATED,
    unsubscribeReason: `You receive this email because you are the recipient of a Milestone`,
  };

  sendEmail(app, data);
};
const milestoneCanceled = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignTitle, campaignId, message },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Milestone canceled :-(',
    type: EMAIL_SUBSCRIBE_TYPES.MILESTONE_CANCELLED,
    secretIntro: `Your Milestone ${milestoneTitle} has been canceled.`,
    title: 'Milestone Canceled',
    image: EMAIL_IMAGES.MILESTONE_CANCELLED,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          The Milestone <em>${milestoneTitle}</em> in the Campaign <em>${campaignTitle}</em> has been canceled.
        </p>
      `,
    cta: `Manage Milestones`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.MILESTONE_CANCELLED,
    unsubscribeReason: `You receive this email because you run a Milestone`,
    message,
  };

  sendEmail(app, data);
};

const donationsCollected = (
  app,
  { recipient, user, milestoneTitle, milestoneId, campaignId, conversation, address },
) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Donations collected',
    type: 'milestone-donations-collected',
    secretIntro: `Your Milestone ${milestoneTitle} has been paid.`,
    title: 'Milestone Donations Collected',
    image: EMAIL_IMAGES.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>The following payments have been initiated for your Milestone <em>${milestoneTitle}</em>:</p>
        <p></p>
        ${conversation.payments.map(p => `<p>${p.amount / 10 ** 18} ${p.symbol}</p>`)}
        <p></p>
        <p>You can expect to see these payment(s) to arrive in your wallet <em>
           ${address}
        </em> within 48 - 72 hrs.</p>
      `,
    cta: `See your Milestones`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EMAIL_SUBSCRIBE_TYPES.DONATIONS_COLLECTED,
    unsubscribeReason: `You receive this email because you are the recipient of a Milestone`,
  };
  sendEmail(app, data);
};

module.exports = {
  capitalizeDelegateType,
  normalizeAmount,
  generateMilestoneCtaRelativeUrl,

  donationsCollected,
  thanksFromDonationGiver,
  donationReceived,
  delegationRequired,
  donationDelegated,
  milestoneProposed,
  proposedMilestoneAccepted,
  proposedMilestoneRejected,
  milestoneReviewRejected,
  milestoneMarkedCompleted,
  milestoneRequestReview,
  milestoneCreated,
  milestoneCanceled,
  proposedMilestoneAcceptedForDacOwner,
};
