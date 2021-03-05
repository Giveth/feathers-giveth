/* eslint-disable no-param-reassign */

const { AdminTypes } = require('../models/pledgeAdmins.model');
const { EmailImages, EmailSubscribeTypes } = require('../models/emails.model');

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

const donationReceipt = (app, { recipient, user, amount, token, donationType, donatedToTitle }) => {
  const data = {
    recipient,
    template: emailNotificationTemplate,
    subject: 'Giveth - Thank you for your donation!',
    secretIntro: `Thank you for your donation of ${normalizeAmount(amount)} ${
      token.symbol
    } to the ${donationType} "${donatedToTitle}"!`,
    title: 'You are so awesome!',
    image: EmailImages.DONATION_BANNER,
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
    unsubscribeType: EmailSubscribeTypes.DONATION_RECEIPT,
    unsubscribeReason: 'You receive this email from Giveth because you have made a donation',
  };

  sendEmail(app, data);
};

const milestoneReceivedDonation = (app, { milestone, amount, token }) => {
  const { owner, recipient, campaign } = milestone;
  const subject = 'Giveth - Your Milestone has received a donation!';
  const milestoneTitle = milestone.title;
  const normalizedAmount = normalizeAmount(amount);
  const description = `Your Milestone ${milestoneTitle} has received a donation of ${normalizedAmount} ${token.symbol}!`;
  const ownerEmailData = {
    recipient: owner.email,
    template: emailNotificationTemplate,
    subject,
    secretIntro: description,
    title: 'You are so awesome!',
    image: EmailImages.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${owner.name}</span></p>
        <p>
          Your Milestone <strong>${milestoneTitle}</strong> has received a donation of
          <span>${normalizedAmount} ${token.symbol}.</span>
          Check to see how close you are to reaching your goal</em>.
        </p>
      `,
    cta: `Manage your account`,
    ctaRelativeUrl: `/my-milestones`,
    unsubscribeType: EmailSubscribeTypes.DONATION_RECEIVED,
    unsubscribeReason: `You receive this email because you run a milestone`,
    campaignId: campaign._id,
    milestoneId: milestone._id,
  };
  sendEmail(app, ownerEmailData);
  if (!recipient.email || recipient.email === owner.email) {
    // To not sending donation email twice for user
    return;
  }
  const recipientEmailData = {
    recipient: owner.email,
    template: emailNotificationTemplate,
    subject,
    secretIntro: description,
    title: 'You are so awesome!',
    image: EmailImages.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${recipient.name}</span></p>
        <p>
          Your Milestone <strong>${milestoneTitle}</strong> has received a donation of
          <span>${normalizedAmount} ${token.symbol}.</span>
          Check to see how close you are to reaching your goal</em>.
        </p>
      `,
    cta: `Manage your account`,
    ctaRelativeUrl: `/my-milestones`,
    unsubscribeType: EmailSubscribeTypes.DONATION_RECEIVED,
    unsubscribeReason: `You receive this email because you run a milestone`,
    campaignId: campaign._id,
    milestoneId: milestone._id,
  };

  sendEmail(app, recipientEmailData);
};

const requestDelegation = (
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
  const normalizedAmount = normalizeAmount(amount);
  const data = {
    recipient,
    user,
    template: emailNotificationTemplate,
    subject: 'Giveth - Delegation required for new donation!',
    secretIntro: `Take action! Please delegate a new donation of ${normalizedAmount} ${token.symbol} for the ${donationType} "${donatedToTitle}"!`,
    title: "Take action! You've received a donation, delegate now!",
    image: EmailImages.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          You have received a donation of
          <span style='display: block; color: rgb(53, 184, 209); line-height: 72px; font-size: 48px;'>${normalizedAmount} ${
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
    unsubscribeType: EmailSubscribeTypes.REQUEST_DELEGATION,
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
    image: EmailImages.DONATION_BANNER,
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
    unsubscribeType: EmailSubscribeTypes.DONATION_DELEGATED,
    unsubscribeReason: `You receive this email because your donation was delegated`,
  };

  sendEmail(app, data);
};

const milestoneProposed = async (app, { milestone }) => {
  const {
    owner: milestoneOwner,
    title: milestoneTitle,
    _id: milestoneId,
    reviewer: milestoneReviewer,
    campaign,
    token,
    maxAmount: amount,
  } = milestone;
  const { title: campaignTitle, _id: campaignId, ownerAddress: campaignOwnerAddress } = campaign;
  const campaignOwner = await app.service('users').get(campaignOwnerAddress);

  const campaignOwnerEmailData = {
    recipient: campaignOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - A Milestone has been proposed!',
    secretIntro: `Take action! A Milestone has been proposed for your Campaign! Please accept or reject.`,
    title: 'Take action: Milestone proposed!',
    image: EmailImages.REVIEW_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${campaignOwner.name}</span></p>
        <p>
          The Milestone <strong>${milestoneTitle}</strong> for <em>${normalizeAmount(amount)} ${
      token.symbol
    }</em> has been proposed to <em>${campaignTitle}</em> Campaign .
          If you think this is a great idea, then <strong>please approve this Milestone within 3 days</strong> to add it to your Campaign.
          If not, then please reject it with comment.
        </p>
      `,
    cta: `See the Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
    unsubscribeReason: `You receive this email because you run a Campaign`,
    milestoneId,
    campaignId,
  };
  sendEmail(app, campaignOwnerEmailData);

  const milestoneOwnerEmailData = {
    recipient: milestoneOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Milestone Proposal has been sent!',
    secretIntro: `our proposed Milestone ${milestoneTitle} has been submitted for review!`,
    title: 'Finger Crossed!',
    image: EmailImages.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${milestoneOwner.name}</span></p>
        <p>
          Your proposed Milestone <strong>${milestoneTitle}</strong>
          has been submitted for review!
          We’ll let you know if the Milestone is approved by
          the reviewer so you can start raising funds.</p>
      `,
    cta: `Manage your Milestones`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
    unsubscribeReason: `You receive this email because you proposed a milestone`,
    milestoneId,
    campaignId,
  };
  sendEmail(app, milestoneOwnerEmailData);

  if (!milestoneReviewer) {
    return;
  }
  const milestoneReviewerEmailData = {
    recipient: milestoneReviewer.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Time to review!',
    secretIntro: `Take action: A Milestone has been proposed for your review!`,
    title: 'Take action: Milestone proposed!',
    image: EmailImages.REVIEW_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${milestoneReviewer.name || ''}</span></p>
        <p>
          The Milestone <strong>${milestoneTitle}</strong>  has been proposed for your review.
           If you think this is a great idea, <strong>please approve this Milestone within 3
           days</strong> to add it to your Campaign. If not, then please reject it with a comment.'</p>
      `,
    cta: `See the Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
    unsubscribeReason: `You receive this email because you are milestone reviewer`,
    campaignId,
    milestoneId,
  };
  sendEmail(app, milestoneReviewerEmailData);
};

const campaignOwnerEditedProposedMilestone = async (app, { milestone, campaignOwner }) => {
  const { title: milestoneTitle, _id: milestoneId, campaign } = milestone;
  const { title: campaignTitle, _id: campaignId } = campaign;

  const data = {
    recipient: campaignOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Milestone edits have been submitted',
    secretIntro: `You have edited the proposed Milestone ${milestoneTitle}`,
    title: 'Your Milestone edits have been submitted',
    image: EmailImages.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${campaignOwner.name || ''}</span></p>
        <p>
          Your edits to the proposed Milestone  <strong>${milestoneTitle}</strong>
           in your Campaign <strong>${campaignTitle}</strong>
            have been submitted. Check to review your edits.</p>
      `,
    cta: `See the Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
    unsubscribeReason: `You receive this email because you are campaign manager`,
    campaignId,
    milestoneId,
  };
  sendEmail(app, data);
};

const proposedMilestoneEdited = async (app, { milestone, user }) => {
  console.log('proposedMilestoneEdited ', {
    user,
    owner: milestone.owner,
  });
  if (user.address === milestone.owner.address) {
    // TODO email to milestone owner
  } else if (user.address === milestone.campaign.ownerAddress) {
    await campaignOwnerEditedProposedMilestone(app, {
      milestone,
      campaignOwner: user,
    });
  }
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
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
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
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
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
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
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
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_REJECTED,
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
    image: EmailImages.REVIEW_BANNER,
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
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REQUEST_REVIEW,
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
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
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
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
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
    type: EmailSubscribeTypes.MILESTONE_REVIEW_REJECTED,
    secretIntro: `The completion of your Milestone ${milestoneTitle} has been rejected by the reviewer.`,
    title: 'Milestone completion rejected.',
    image: EmailImages.MILESTONE_REVIEW_REJECTED,
    text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${user}</span></p>
        <p>
          The Milestone completion <em>${milestoneTitle}</em> in the Campaign <em>${campaignTitle}</em> has been rejected by the reviewer.
        </p>
      `,
    cta: `Manage Milestone`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_REJECTED,
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
    type: EmailSubscribeTypes.MILESTONE_CREATED,
    secretIntro: `A Milestone ${milestoneTitle} has been created with you as the recipient.`,
    title: 'Milestone created.',
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
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
    unsubscribeType: EmailSubscribeTypes.MILESTONE_CREATED,
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
    type: EmailSubscribeTypes.MILESTONE_CANCELLED,
    secretIntro: `Your Milestone ${milestoneTitle} has been canceled.`,
    title: 'Milestone Canceled',
    image: EmailImages.MILESTONE_CANCELLED,
    text: `
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          The Milestone <em>${milestoneTitle}</em> in the Campaign <em>${campaignTitle}</em> has been canceled.
        </p>
      `,
    cta: `Manage Milestones`,
    ctaRelativeUrl: generateMilestoneCtaRelativeUrl(campaignId, milestoneId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_CANCELLED,
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
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
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
    unsubscribeType: EmailSubscribeTypes.DONATIONS_COLLECTED,
    unsubscribeReason: `You receive this email because you are the recipient of a Milestone`,
  };
  sendEmail(app, data);
};

module.exports = {
  capitalizeDelegateType,
  normalizeAmount,
  generateMilestoneCtaRelativeUrl,

  donationsCollected,
  donationReceipt,
  milestoneReceivedDonation,
  requestDelegation,
  donationDelegated,
  milestoneProposed,
  proposedMilestoneAccepted,
  proposedMilestoneRejected,
  proposedMilestoneEdited,
  milestoneReviewRejected,
  milestoneMarkedCompleted,
  milestoneRequestReview,
  milestoneCreated,
  milestoneCanceled,
};
