const logger = require('winston');
const { AdminTypes } = require('../models/pledgeAdmins.model');
const { EmailImages, EmailSubscribeTypes } = require('../models/emails.model');
const { findParentDacs } = require('../repositories/dacRepository');
const { ANY_TOKEN } = require('../blockchain/lib/web3Helpers');
const {
  findParentDacSubscribersForCampaign,
  findProjectSubscribers,
} = require('../repositories/subscriptionRepository');
const { findUserByAddress } = require('../repositories/userRepository');

const emailNotificationTemplate = 'notification';
const emailStyle = `style='line-height: 33px; font-size: 22px;'`;
const generateTraceCtaRelativeUrl = (campaignId, traceId) => {
  return `/campaigns/${campaignId}/traces/${traceId}`;
};

const capitalizeDelegateType = inputDelegateType => {
  if (inputDelegateType.toLowerCase() === 'dac') return 'DAC';
  return inputDelegateType.charAt(0).toUpperCase() + inputDelegateType.slice(1);
};

const normalizeAmount = amount => {
  return Number(amount) / 10 ** 18;
};

const sendEmail = (app, data) => {
  if (!data.recipient) {
    return;
  }
  const emailService = app.service('/emails');
  // add host to subject for development
  if (!app.get('host').includes('beta')) {
    data.subject = `[${app.get('host')}] - ${data.subject}`;
  }
  data.dappUrl = app.get('dappUrl');
  // eslint-disable-next-line consistent-return
  return emailService.create(data);
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
        <p><span ${emailStyle}>Hi ${user}</span></p>
        <p>
          Thank you very much for your donation of ${normalizeAmount(amount)} ${
      token.symbol
    } to the ${donationType} <strong>${donatedToTitle}</strong>.
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

const traceReceivedDonation = (app, { trace, amount, token }) => {
  const { owner, recipient, campaign } = trace;
  const subject = 'Giveth - Your Trace has received a donation!';
  const traceTitle = trace.title;
  const normalizedAmount = normalizeAmount(amount);
  const description = `Your Trace ${traceTitle} has received a donation of ${normalizedAmount} ${token.symbol}!`;
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
          Your Trace <strong>${traceTitle}</strong> has received a donation of
          <span>${normalizedAmount} ${token.symbol}.</span>
          Check to see how close you are to reaching your goal</strong>.
        </p>
      `,
    cta: `Manage your account`,
    ctaRelativeUrl: `/my-traces`,
    unsubscribeType: EmailSubscribeTypes.DONATION_RECEIVED,
    unsubscribeReason: `You receive this email because you run a trace`,
    campaignId: campaign._id,
    traceId: trace._id,
  };
  sendEmail(app, ownerEmailData);

  // Maybe recipient is null or a user without email or a Campaign
  if (!recipient || !recipient.email || recipient.email === owner.email) {
    // To not sending donation email twice for user
    return;
  }
  const recipientEmailData = {
    recipient: recipient.email,
    template: emailNotificationTemplate,
    subject,
    secretIntro: description,
    title: 'You are so awesome!',
    image: EmailImages.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${recipient.name}</span></p>
        <p>
          Your Trace <strong>${traceTitle}</strong> has received a donation of
          <span>${normalizedAmount} ${token.symbol}.</span>
          Check to see how close you are to reaching your goal</strong>.
        </p>
      `,
    cta: `Manage your account`,
    ctaRelativeUrl: `/my-traces`,
    unsubscribeType: EmailSubscribeTypes.DONATION_RECEIVED,
    unsubscribeReason: `You receive this email because you run a trace`,
    campaignId: campaign._id,
    traceId: trace._id,
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
          for your ${donationType} <strong>${donatedToTitle}</strong>.
        </p>
        <p>
          You can now delegate this money to a ${
            donationType === AdminTypes.DAC ? 'Campaign or a Trace' : 'Trace'
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
          )} <strong>${delegateTitle}</strong> has proposed a delegation of
          <span style='display: block; color: rgb(53, 184, 209); line-height: 72px; font-size: 48px;'>
          ${normalizeAmount(amount)} ${token.symbol}</span> from your donation to
          ${capitalizeDelegateType(delegateType)} <strong>${delegateTitle}</strong>.
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

const traceProposed = async (app, { trace }) => {
  const {
    owner: traceOwner,
    title: traceTitle,
    _id: traceId,
    reviewer: traceReviewer,
    campaign,
    token,
    maxAmount,
  } = trace;
  const { title: campaignTitle, _id: campaignId, ownerAddress: campaignOwnerAddress } = campaign;
  const campaignOwner = await app.service('users').get(campaignOwnerAddress);
  const amount =
    token.symbol === ANY_TOKEN.symbol
      ? 'Unlimited amount of any token'
      : `${normalizeAmount(maxAmount)}${token.symbol}`;

  const campaignOwnerEmailData = {
    recipient: campaignOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - A Trace has been proposed!',
    secretIntro: `Take action! A Trace has been proposed for your Campaign! Please accept or reject.`,
    title: 'Take action: Trace proposed!',
    image: EmailImages.REVIEW_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${campaignOwner.name}</span></p>
        <p>
          The Trace <strong>${traceTitle}</strong> for <strong>${amount}</strong> has been proposed to <strong>${campaignTitle}</strong> Campaign .
          If you think this is a great idea, then <strong>please approve this Trace within 3 days</strong> to add it to your Campaign.
          If not, then please reject it with comment.
        </p>
      `,
    cta: `See the Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
    unsubscribeReason: `You receive this email because you run a Campaign`,
    traceId,
    campaignId,
  };
  await sendEmail(app, campaignOwnerEmailData);

  const traceOwnerEmailData = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Trace Proposal has been sent!',
    secretIntro: `Your proposed Trace ${traceTitle} has been submitted for review!`,
    title: 'Finger Crossed!',
    image: EmailImages.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${traceOwner.name}</span></p>
        <p>
          Your proposed Trace <strong>${traceTitle}</strong>
          has been submitted for review!
          We’ll let you know if the Trace is accepted by the Campaign Manager
          so you can start raising funds.</p>
      `,
    cta: `Manage your Traces`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
    unsubscribeReason: `You receive this email because you proposed a trace`,
    traceId,
    campaignId,
  };
  await sendEmail(app, traceOwnerEmailData);

  if (!traceReviewer) {
    return;
  }
  const traceReviewerEmailData = {
    recipient: traceReviewer.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Time to review!',
    secretIntro: `Take action: A Trace has been proposed for your review!`,
    title: 'Take action: Trace proposed!',
    image: EmailImages.REVIEW_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${traceReviewer.name || ''}</span></p>
        <p>
          The Trace <strong>${traceTitle}</strong>  has been proposed for your review.
           If you think this is a great idea, <strong>please approve this Trace within 3
           days</strong> to add it to your Campaign. If not, then please reject it with a comment.'</p>
      `,
    cta: `See the Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_PROPOSED,
    unsubscribeReason: `You receive this email because you are trace reviewer`,
    campaignId,
    traceId,
  };
  await sendEmail(app, traceReviewerEmailData);
};

const campaignOwnerEditedProposedTrace = async (app, { trace, campaignOwner }) => {
  const { title: traceTitle, _id: traceId, campaign, owner: traceOwner } = trace;
  const { title: campaignTitle, _id: campaignId } = campaign;

  const campaignOwnerEmailData = {
    recipient: campaignOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Trace edits have been submitted',
    secretIntro: `You have edited the proposed Trace ${traceTitle}`,
    title: 'Your Trace edits have been submitted',
    image: EmailImages.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${campaignOwner.name || ''}</span></p>
        <p>
          Your edits to the proposed Trace  <strong>${traceTitle}</strong>
           in your Campaign <strong>${campaignTitle}</strong>
            have been submitted. Check to review your edits.</p>
      `,
    cta: `See the Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
    unsubscribeReason: `You receive this email because you are campaign manager`,
    campaignId,
    traceId,
  };
  await sendEmail(app, campaignOwnerEmailData);
  const traceOwnerEmailData = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Trace has been edited',
    secretIntro: `Your trace ${traceTitle} has been edited by the Campaign Manager.`,
    title: 'Your Trace has been edited',
    image: EmailImages.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${traceOwner.name || ''}</span></p>
        <p>
          Your trace  <strong>${traceTitle}</strong>
          has been edited by the Campaign Manager.
          Check to see what edits have been made.</p>
      `,
    cta: `See the Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
    unsubscribeReason: `You receive this email because you are trace owner`,
    campaignId,
    traceId,
  };
  await sendEmail(app, traceOwnerEmailData);
};

const traceReviewerEditedProposedTrace = async (app, { trace }) => {
  const { title: traceTitle, _id: traceId, campaign } = trace;
  const { title: campaignTitle, _id: campaignId, ownerAddress: campaignOwnerAddress } = campaign;
  const campaignOwner = await app.service('users').get(campaignOwnerAddress);

  const campaignOwnerEmailData = {
    recipient: campaignOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - A proposed Trace in your Campaign has been edited',
    secretIntro: `The proposed Trace ${traceTitle} in your Campaign ${campaignTitle} has been edited.’`,
    title: 'A proposed Trace has been edited',
    image: EmailImages.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${campaignOwner.name || ''}</span></p>
        <p>
          The proposed Trace <strong>${traceTitle}</strong>
           in your Campaign <strong>${campaignTitle}</strong>
            has been edited by the Trace Reviewer. Check to review the edits.</p>
      `,
    cta: `See the Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
    unsubscribeReason: `You receive this email because you are campaign manager`,
    campaignId,
    traceId,
  };
  await sendEmail(app, campaignOwnerEmailData);
};

const traceOwnerEditedProposedTrace = async (app, { trace }) => {
  const { title: traceTitle, _id: traceId, campaign, owner: traceOwner } = trace;
  const { _id: campaignId } = campaign;

  const data = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Trace edits have been submitted',
    secretIntro: `You have edited the proposed Trace ${traceTitle}`,
    title: 'Your Trace edits have been submitted',
    image: EmailImages.SUGGEST_MILESTONE,
    text: `
        <p><span ${emailStyle}>Hi ${traceOwner.name || ''}</span></p>
        <p>
          Your edits to the proposed Trace  <strong>${traceTitle}</strong>
            have been submitted. Check to review your edits.</p>
      `,
    cta: `See the Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_EDITED,
    unsubscribeReason: `You receive this email because you are trace owner`,
    campaignId,
    traceId,
  };
  sendEmail(app, data);
};

const proposedTraceEdited = async (app, { trace, user }) => {
  if (user.address === trace.owner.address) {
    await traceOwnerEditedProposedTrace(app, {
      trace,
    });
  } else if (user.address === trace.campaign.ownerAddress) {
    await campaignOwnerEditedProposedTrace(app, {
      trace,
      campaignOwner: user,
    });
  } else if (user.address === trace.reviewer.address) {
    await traceReviewerEditedProposedTrace(app, {
      trace,
    });
  }
};

const proposedTraceAccepted = async (app, { trace, message }) => {
  const {
    title: traceTitle,
    _id: traceId,
    campaignId,
    campaign,
    owner: traceOwner,
    recipient: traceRecipient,
    maxAmount,
    token,
  } = trace;
  const { title: campaignTitle } = campaign;

  const amount =
    token.symbol === ANY_TOKEN.symbol
      ? 'Unlimited amount of any token'
      : `${normalizeAmount(maxAmount)}${token.symbol}`;

  const traceOwnerEmailData = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your proposed Trace is accepted!',
    secretIntro: `Your Trace ${traceTitle} has been accepted by the Campaign Owner. You can now receive donations.`,
    title: 'Take action: Trace proposed!',
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${traceOwner.name}</span></p>
        <p>
          Your proposed Trace <strong>${traceTitle}</strong> to the Campaign <strong>${campaignTitle}</strong> has been accepted by the Campaign Owner!
          <br/><br/>
          You can now receive donations, start executing the Trace, and once finished, mark it as complete.
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    traceId,
    campaignId,
    message,
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
    unsubscribeReason: `You receive this email because you run a Trace`,
  };
  sendEmail(app, traceOwnerEmailData);
  const dacWithSubscriptions = await findParentDacSubscribersForCampaign(app, {
    campaignId,
  });
  // eslint-disable-next-line no-restricted-syntax
  for (const dac of dacWithSubscriptions) {
    const dacTitle = dac.title;
    dac.subscriptions.forEach(subscription => {
      const subscriberUser = subscription.user;
      const dacSubscriberEmailData = {
        recipient: subscriberUser.email,
        template: emailNotificationTemplate,
        subject: `Giveth - ${dacTitle} has added a new trace!`,
        secretIntro: `Check out what ${dacTitle} has been up to!`,
        title: `${dacTitle} has expanded!`,
        image: EmailImages.MILESTONE_REVIEW_APPROVED,
        text: `
        <p><span ${emailStyle}>Hi ${subscription.user.name || ''}</span></p>
        <p>
         ${dacTitle} added a new trace. Come see what awesome things they have planned!
        </p>
      `,
        cta: `See Trace`,
        ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
        traceId,
        campaignId,
        message,
        unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
        unsubscribeReason: `You receive this email because you are subscribing a dac`,
      };
      sendEmail(app, dacSubscriberEmailData);
    });
  }

  const campaignSubscriptions = await findProjectSubscribers(app, {
    projectTypeId: campaignId,
  });
  // eslint-disable-next-line no-restricted-syntax
  for (const subscription of campaignSubscriptions) {
    const subscriberUser = subscription.user;
    const campaignSubscriberEmailData = {
      recipient: subscriberUser.email,
      template: emailNotificationTemplate,
      subject: `Giveth - ${campaignTitle} has added a new trace!`,
      secretIntro: `Check out what ${campaignTitle} has in store!`,
      title: `${campaignTitle} has expanded!`,
      image: EmailImages.MILESTONE_REVIEW_APPROVED,
      text: `
        <p><span ${emailStyle}>Hi ${subscriberUser.name || ''}</span></p>
        <p>
         ${campaignTitle} added a new trace. Come see what awesome things they have planned!
        </p>
      `,
      cta: `See Trace`,
      ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
      traceId,
      campaignId,
      message,
      unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_ACCEPTED,
      unsubscribeReason: `You receive this email because you are subscribing a campaign`,
    };
    sendEmail(app, campaignSubscriberEmailData);
  }

  // Maybe recipient is campaign and doesnt have email, or recipient id the trace owner

  // Maybe recipient is null or is campaign and doesnt have email, or recipient id the trace owner
  if (!traceRecipient || !traceRecipient.email || traceRecipient.address === traceOwner.address) {
    return;
  }
  const sendRecipientEmailData = {
    recipient: traceRecipient.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Trace created with you as a recipient',
    type: EmailSubscribeTypes.MILESTONE_CREATED,
    secretIntro: `A Trace ${traceTitle} has been created with you as the recipient.`,
    title: 'Trace created.',
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${traceRecipient.name}</span></p>
        <p>
          A Trace <strong>${traceTitle}</strong> for ${amount}
           has been created with you as the recipient.
        </p>
      `,
    cta: `See your Traces`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_CREATED,
    unsubscribeReason: `You receive this email because you are the recipient of a Trace`,
    campaignId,
    traceId,
    message,
  };
  sendEmail(app, sendRecipientEmailData);
};

const proposedTraceRejected = (app, { trace, message }) => {
  const { owner: traceOwner, _id: traceId, campaignId, title: traceTitle, campaign } = trace;
  const { title: campaignTitle } = campaign;
  const data = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your proposed Trace is rejected :-(',
    secretIntro: `Your Trace ${traceTitle} has been rejected by the Campaign Owner :-(`,
    title: 'Trace rejected :-(',
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${traceOwner.name || ''}</span></p>
        <p>
          Unfortunately your proposed Trace <strong>${traceTitle}</strong> to the Campaign <strong>${campaignTitle}</strong> has been rejected by the Campaign Owner.
          <br/><br/>
          Please contact the Campaign Owner to learn why your Trace was rejected.
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.PROPOSED_MILESTONE_REJECTED,
    unsubscribeReason: `You receive this email because you proposed a Trace`,
    message,
    traceId,
    campaignId,
  };

  sendEmail(app, data);
};

const traceRequestReview = (app, { trace, message }) => {
  const { _id: traceId, campaign, campaignId, reviewer: traceReviewer, title: traceTitle } = trace;
  const { title: campaignTitle } = campaign;

  const traceRequestReviewEmailData = {
    recipient: traceReviewer.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Time to review!',
    secretIntro: `Take action: you are requested to review the Trace ${traceTitle} within 3 days.`,
    title: 'Trace review requested',
    image: EmailImages.REVIEW_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${traceReviewer.name || ''}</span></p>
        <p>
          The Trace <strong>${traceTitle}</strong> to the Campaign <strong>${campaignTitle}</strong> has been marked as completed by the Trace Owner.
          <br/><br/>
        </p>
          Now is your moment to shine!
        </p>
        <p>
          Please contact the Trace Owner and <strong>review the completion of this Trace within 3 days.</strong>
        </p>
      `,
    cta: `Review Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REQUEST_REVIEW,
    unsubscribeReason: `You receive this email because you run a Trace`,
    traceId,
    campaignId,
    message,
  };

  sendEmail(app, traceRequestReviewEmailData);
};

const traceMarkedCompleted = async (app, { trace, message }) => {
  const {
    owner: traceOwner,
    recipient: traceRecipient,
    reviewer: traceReviewer,
    title: traceTitle,
    token,
    campaignId,
    campaign,
    _id: traceId,
  } = trace;
  const {
    title: campaignTitle,
    reviewerAddress: campaignReviewerAddress,
    ownerAddress: campaignOwnerAddress,
  } = campaign;
  const dacs = await findParentDacs(app, { campaignId });
  const campaignOwner = await findUserByAddress(app, campaignOwnerAddress, {
    name: 1,
    email: 1,
  });
  const campaignReviewer = await findUserByAddress(app, campaignReviewerAddress, {
    name: 1,
    email: 1,
  });
  const tokenSymbol = token.symbol === ANY_TOKEN.symbol ? '' : token.symbol;
  const traceOwnerEmailData = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your Trace is finished!',
    secretIntro: `Your Trace ${traceTitle} has been marked complete by the reviewer. The recipient can now collect the payment.`,
    title: `Trace completed! Time to collect ${tokenSymbol}.`,
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${traceOwner.name || ''}</span></p>
        <p>
          The Trace <strong>${traceTitle}</strong> in the Campaign <strong>${campaignTitle}</strong> has been marked complete by the reviewer!.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this Trace!
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
    unsubscribeReason: `You receive this email because you run a Trace`,
    campaignId,
    traceId,
    message,
  };
  sendEmail(app, traceOwnerEmailData);

  const traceReviewerEmailData = {
    recipient: traceReviewer.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - You approved the completion of a Trace',
    secretIntro: `You have marked the Trace ${traceTitle} as complete. The recipient can now collect the payment.`,
    title: `Trace completed!`,
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${traceReviewer.name || ''}</span></p>
        <p>
          You have marked the Trace  <strong>${traceTitle}</strong> in the Campaign <strong>${campaignTitle}</strong> as complete! The recipient can now transfer the funds out of this Trace.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this Trace!
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
    unsubscribeReason: `You receive this email because you are reviewer of a Trace`,
    campaignId,
    traceId,
    message,
  };
  sendEmail(app, traceReviewerEmailData);

  const campaignOwnerEmailData = {
    recipient: campaignOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - A Trace in your Campaign is finished!',
    secretIntro: `The Trace ${traceTitle} in your Campaign ${campaignTitle} has been marked complete by the Trace reviewer.`,
    title: `Trace completed!`,
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${campaignOwner.name || ''}</span></p>
        <p>
          The Trace  <strong>${traceTitle}</strong> in your Campaign <strong>${campaignTitle}</strong> has been marked complete by the Trace reviewer. The recipient can now transfer funds out of this Trace.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this Trace!
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
    unsubscribeReason: `You receive this email because you run a campaign`,
    campaignId,
    traceId,
    message,
  };
  sendEmail(app, campaignOwnerEmailData);

  const campaignReviewerEmailData = {
    recipient: campaignReviewer.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - A Trace in your Campaign is finished!',
    secretIntro: `The Trace ${traceTitle} in your Campaign ${campaignTitle} has been marked complete by the Trace reviewer.`,
    title: `Trace completed!`,
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${campaignReviewer.name || ''}</span></p>
        <p>
          The Trace  <strong>${traceTitle}</strong> in your Campaign <strong>${campaignTitle}</strong> has been marked complete by the Trace reviewer. The recipient can now transfer funds out of this Trace.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this Trace!
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
    unsubscribeReason: `You receive this email because you are reviewer of a campaign`,
    campaignId,
    traceId,
    message,
  };
  sendEmail(app, campaignReviewerEmailData);

  /* eslint-disable no-await-in-loop, no-restricted-syntax */
  for (const dac of dacs) {
    const dacOwner = await findUserByAddress(app, dac.ownerAddress, {
      name: 1,
      email: 1,
    });
    const dacOwnerEmailData = {
      recipient: dacOwner.email,
      template: emailNotificationTemplate,
      subject: 'Giveth - A Trace in your Campaign is finished!',
      secretIntro: `The Trace ${traceTitle} in your Campaign ${campaignTitle}
       that you support has been marked complete by the Trace reviewer.`,
      title: `Trace completed!`,
      image: EmailImages.MILESTONE_REVIEW_APPROVED,
      text: `
        <p><span ${emailStyle}>Hi ${dacOwner.name || ''}</span></p>
        <p>
          The Trace  <strong>${traceTitle}</strong> for the Campaign <strong>${campaignTitle}</strong>
          that you support has been marked complete by the Trace reviewer.
          The recipient can now transfer funds out of this Trace.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this Trace!
        </p>
      `,
      cta: `Manage Trace`,
      ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
      unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
      unsubscribeReason: `You receive this email because you run a dac`,
      campaignId,
      traceId,
      message,
    };
    sendEmail(app, dacOwnerEmailData);
  }

  if (
    !traceRecipient ||
    !traceRecipient.email
    //  || traceRecipient.address === traceOwner.address
  ) {
    return;
  }
  const traceRecipientEmailData = {
    recipient: traceRecipient.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Time to collect!',
    secretIntro: `Your Trace ${traceTitle} has been marked complete by the reviewer. The recipient can now collect the payment.`,
    title: `Trace completed! Time to collect ${tokenSymbol}.`,
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${traceRecipient.name || ''}</span></p>
        <p>
          The Trace <strong>${traceTitle}</strong> in the Campaign <strong>${campaignTitle}</strong> has been marked complete by the reviewer!.
          <br/><br/>
        </p>
          You can now transfer the funds out of this Trace!
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_APPROVED,
    unsubscribeReason: `You receive this email because you are recipient of a Trace`,
    campaignId,
    traceId,
    message,
  };
  sendEmail(app, traceRecipientEmailData);
};

const traceReviewRejected = (app, { trace, message }) => {
  const { owner: traceOwner, title: traceTitle, _id: traceId, campaignId, campaign } = trace;
  const { title: campaignTitle } = campaign;
  const data = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Trace rejected by reviewer :-(',
    type: EmailSubscribeTypes.MILESTONE_REVIEW_REJECTED,
    secretIntro: `The completion of your Trace ${traceTitle} has been rejected by the reviewer.`,
    title: 'Trace completion rejected.',
    image: EmailImages.MILESTONE_REVIEW_REJECTED,
    text: `
        <p><<span ${emailStyle}>Hi ${traceOwner.name || ''}</span></p>
        <p>
          The Trace completion <strong>${traceTitle}</strong> in the Campaign <strong>${campaignTitle}</strong> has been rejected by the reviewer.
        </p>
      `,
    cta: `Manage Trace`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_REVIEW_REJECTED,
    unsubscribeReason: `You receive this email because you run a Trace`,
    traceId,
    campaignId,
    message,
  };

  sendEmail(app, data);
};

const traceCancelled = (app, { trace, message }) => {
  const { owner: traceOwner, _id: traceId, title: traceTitle, campaignId, campaign } = trace;
  const { title: campaignTitle } = campaign;
  const data = {
    recipient: traceOwner.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Trace canceled :-(',
    type: EmailSubscribeTypes.MILESTONE_CANCELLED,
    secretIntro: `Your Trace ${traceTitle} has been canceled.`,
    title: 'Trace Canceled',
    image: EmailImages.MILESTONE_CANCELLED,
    text: `
        <p><span ${emailStyle}>Hi ${traceOwner.name || ''}</span></p>
        <p>
          The Trace <strong>${traceTitle}</strong> in the Campaign <strong>${campaignTitle}</strong> has been canceled.
        </p>
      `,
    cta: `Manage Traces`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    unsubscribeType: EmailSubscribeTypes.MILESTONE_CANCELLED,
    unsubscribeReason: `You receive this email because you run a Trace`,
    traceId,
    campaignId,
    message,
  };

  sendEmail(app, data);
};

const donationsCollected = (app, { trace, conversation }) => {
  const { recipient: traceRecipient, title: traceTitle, _id: traceId, campaignId } = trace;
  if (!traceRecipient || !traceRecipient.email) {
    logger.info(
      `Currently we dont send email for traces who doesnt have recipient, traceId: ${traceId}`,
    );
    return;
  }
  const data = {
    recipient: traceRecipient.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Donations collected',
    type: 'trace-donations-collected',
    secretIntro: `Your Trace ${traceTitle} has been paid.`,
    title: 'Trace Donations Collected',
    image: EmailImages.MILESTONE_REVIEW_APPROVED,
    text: `
        <p><span ${emailStyle}>Hi ${traceRecipient.name || ''}</span></p>
        <p>The following payments have been initiated for your Trace <strong>${traceTitle}</strong>:</p>
        <p></p>
        ${conversation.payments.map(p => `<p>${p.amount / 10 ** 18} ${p.symbol}</p>`)}
        <p></p>
        <p>You can expect to see these payment(s) to arrive in your wallet <strong>
           ${traceRecipient.address}
        </strong> within 48 - 72 hrs.</p>
      `,
    cta: `See your Traces`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    traceId,
    campaignId,
    unsubscribeType: EmailSubscribeTypes.DONATIONS_COLLECTED,
    unsubscribeReason: `You receive this email because you are the recipient of a Trace`,
  };
  sendEmail(app, data);
};

const moneyWentToRecipientWallet = (app, { trace, payments }) => {
  const { recipient: traceRecipient, title: traceTitle, _id: traceId, campaignId } = trace;
  if (!traceRecipient || !traceRecipient.email) {
    logger.info(
      `Currently we dont send email for traces who doesnt have recipient, traceId: ${traceId}`,
    );
    return Promise.resolve();
  }
  const data = {
    recipient: traceRecipient.email,
    template: emailNotificationTemplate,
    subject: 'Giveth - Your funds have been sent!',
    type: 'trace-donations-transferred',
    secretIntro: `The funds from your Trace ${traceTitle} have been sent to your wallet.`,
    title: 'Time to Celebrate!',
    image: EmailImages.DONATION_BANNER,
    text: `
        <p><span ${emailStyle}>Hi ${traceRecipient.name || ''}</span></p>
        <p>The funds from your Trace <strong>${traceTitle}</strong>
        of the amount
        <p></p>
        ${payments.map(p => `<p>${normalizeAmount(p.amount)} ${p.symbol}</p>`)}
        <p></p>
         have been sent to your wallet. It’s time to take action to build a brighter future!
        </p>

        <p>You have these payment(s) in your wallet <strong>
           ${traceRecipient.address}
        </strong> now.</p>
      `,
    cta: `See your Traces`,
    ctaRelativeUrl: generateTraceCtaRelativeUrl(campaignId, traceId),
    traceId,
    campaignId,
    unsubscribeType: EmailSubscribeTypes.DONATIONS_COLLECTED,
    unsubscribeReason: `You receive this email because you are the recipient of a Trace`,
  };
  return sendEmail(app, data);
};

module.exports = {
  capitalizeDelegateType,
  normalizeAmount,
  generateTraceCtaRelativeUrl,

  donationsCollected,
  donationReceipt,
  traceReceivedDonation,
  requestDelegation,
  donationDelegated,
  traceProposed,
  proposedTraceAccepted,
  proposedTraceRejected,
  proposedTraceEdited,
  traceReviewRejected,
  traceMarkedCompleted,
  traceRequestReview,
  traceCancelled,
  moneyWentToRecipientWallet,
};
