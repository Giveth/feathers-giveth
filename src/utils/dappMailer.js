/* eslint-disable no-param-reassign */

const logger = require('winston');
const rp = require('request-promise');
const { AdminTypes } = require('../models/pledgeAdmins.model');

const sendEmail = (app, data) => {
  // add the dapp url that this feathers serves for
  Object.assign(data, { dappUrl: app.get('dappUrl') });
  const dappMailerUrl = app.get('dappMailerUrl');

  if (!dappMailerUrl) {
    logger.info(`skipping email notification. Missing dappMailerUrl in configuration file`);
    return;
  }
  if (!data.recipient) {
    logger.info(`skipping email notification to ${data.recipient} > ${data.unsubscribeType}`);
    return;
  }

  logger.info(`sending email notification to ${data.recipient} > ${data.unsubscribeType}`);

  // add host to subject for development
  if (!app.get('host').includes('beta')) {
    data.subject = `[${app.get('host')}] - ${data.subject}`;
  }

  rp({
    method: 'POST',
    url: `${dappMailerUrl}/send`,
    headers: {
      Authorization: app.get('dappMailerSecret'),
    },
    form: data,
    json: true,
  })
    .then(res => {
      logger.info(`email sent to ${data.recipient}: `, res);
    })
    .catch(err => {
      logger.error(`error sending email to ${data.recipient}`, err);
    });
};

module.exports = {
  donation: (app, data) => {
    data.amount = Number(data.amount) / 10 ** 18;

    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Thank you for your donation!',
      secretIntro: `Thank you for your donation of ${data.amount} ${data.token.symbol} to the ${data.donationType} "${data.donatedToTitle}"!`,
      title: 'You are so awesome!',
      image: 'Giveth-donation-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          Thank you very much for your donation of ${data.amount} ${data.token.symbol} to the ${data.donationType} <em>${data.donatedToTitle}</em>.
          With your donation we can really make this happen, and you play a vital part in making the world a better place!
        </p>
      `,
      cta: 'Manage your Donations',
      ctaRelativeUrl: '/donations',
      unsubscribeType: 'donation-receipt',
      unsubscribeReason: 'You receive this email from Giveth because you have made a donation',
    });

    sendEmail(app, data);
  },

  donationReceived: (app, data) => {
    data.amount = Number(data.amount) / 10 ** 18;

    Object.assign(data, {
      template: 'notification',
      subject: "Giveth - You've received a donation!",
      secretIntro: `You have received a donation of ${data.amount} ${data.token.symbol} for the ${data.donationType} "${data.donatedToTitle}"!`,
      title: 'You are so awesome!',
      image: 'Giveth-donation-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          You have received a donation of
          <span>${data.amount} ${data.token.symbol}</span>
          for your ${data.donationType} <em>${data.donatedToTitle}</em>.
        </p>
      `,
      cta: `Manage your ${data.donationType}`,
      ctaRelativeUrl: `/my-${data.donationType}s`,
      unsubscribeType: 'donation-received',
      unsubscribeReason: `You receive this email because you run a ${data.donationType}`,
    });

    sendEmail(app, data);
  },

  delegationRequired: (app, data) => {
    data.amount = Number(data.amount) / 10 ** 18;

    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Delegation required for new donation!',
      secretIntro: `Take action! Please delegate a new donation of ${data.amount} ${data.token.symbol} for the ${data.donationType} "${data.donatedToTitle}"!`,
      title: "Take action! You've received a donation, delegate now!",
      image: 'Giveth-donation-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          You have received a donation of
          <span style="display: block; color: rgb(53, 184, 209); line-height: 72px; font-size: 48px;">${
            data.amount
          } ${data.token.symbol}</span>
          for your ${data.donationType} <em>${data.donatedToTitle}</em>.
        </p>
        <p>
          You can now delegate this money to a ${
            data.donationType === AdminTypes.DAC ? 'Campaign or a Milestone' : 'Milestone'
          }.
        </p>
      `,
      cta: `Delegate Donation`,
      ctaRelativeUrl: `/delegations`,
      unsubscribeType: 'request-delegation',
      unsubscribeReason: `You receive this email because you run a ${data.donationType}`,
    });

    sendEmail(app, data);
  },

  donationDelegated: (app, data) => {
    data.amount = Number(data.amount) / 10 ** 18;

    const capitalizeDelegateType = delegateType => {
      if (delegateType.toLowerCase() === 'dac') return 'DAC';
      return delegateType.charAt(0).toUpperCase() + delegateType.slice(1);
    };

    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Your donation has been delegated!',
      secretIntro: `Take action! Please approve or reject the delegation of ${data.amount} ${data.token.symbol} to the ${data.delegationType} "${data.delegatedToTitle}"!`,
      title: 'Take action! Your donation has been delegated!',
      image: 'Giveth-donation-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The ${capitalizeDelegateType(data.delegateType)} <em>${
        data.delegateTitle
      }</em> has proposed a delegation of
          <span style="display: block; color: rgb(53, 184, 209); line-height: 72px; font-size: 48px;">
          ${data.amount} ${data.token.symbol}</span> from your donation to
          ${capitalizeDelegateType(data.delegateType)} <em>${data.delegateTitle}</em>.
        </p>
        <p>
          You have until ${data.commitTime.toUTCString()} to approve or reject this delegation. If you fail to
          act before this date, this delegation will be auto-approved.
        </p>
      `,
      cta: `View Donations`,
      ctaRelativeUrl: `/donations`,
      unsubscribeType: 'donation-delegated',
      unsubscribeReason: `You receive this email because your donation was delegated`,
    });

    sendEmail(app, data);
  },

  milestoneProposed: (app, data) => {
    data.amount = Number(data.amount) / 10 ** 18;

    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - A Milestone has been proposed!',
      secretIntro: `Take action! A Milestone has been proposed for your Campaign! Please accept or reject.`,
      title: 'Take action: Milestone proposed!',
      image: 'Giveth-suggest-milestone-banner.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The Milestone <em>${data.milestoneTitle}</em> for <em>${data.amount} ${data.token.symbol}</em> has been proposed to <em>${data.campaignTitle}</em> Campaign .
          If you think this is a great idea, then <strong>please approve this Milestone within 3 days</strong> to add it to your Campaign.
          If not, then please reject it with comment.
        </p>
      `,
      cta: `See the Milestone`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'milestone-proposed',
      unsubscribeReason: `You receive this email because you run a Campaign`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  proposedMilestoneAccepted: (app, data) => {
    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Your proposed Milestone is accepted!',
      secretIntro: `Your Milestone ${data.milestoneTitle} has been accepted by the Campaign Owner. You can now receive donations.`,
      title: 'Take action: Milestone proposed!',
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          Your proposed Milestone <em>${data.milestoneTitle}</em> to the Campaign <em>${data.campaignTitle}</em> has been accepted by the Campaign Owner!
          <br/><br/>
          You can now receive donations, start executing the Milestone, and once finished, mark it as complete.
        </p>
      `,
      cta: `Manage Milestone`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'proposed-milestone-accepted',
      unsubscribeReason: `You receive this email because you run a Milestone`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  proposedMilestoneRejected: (app, data) => {
    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Your proposed Milestone is rejected :-(',
      secretIntro: `Your Milestone ${data.milestoneTitle} has been rejected by the Campaign Owner :-(`,
      title: 'Milestone rejected :-(',
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          Unfortunately your proposed Milestone <em>${data.milestoneTitle}</em> to the Campaign <em>${data.campaignTitle}</em> has been rejected by the Campaign Owner.
          <br/><br/>
          Please contact the Campaign Owner to learn why your Milestone was rejected.
        </p>
      `,
      cta: `Manage Milestone`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'proposed-milestone-rejected',
      unsubscribeReason: `You receive this email because you proposed a Milestone`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  milestoneRequestReview: (app, data) => {
    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Time to review!',
      secretIntro: `Take action: you are requested to review the Milestone ${data.milestoneTitle} within 3 days.`,
      title: 'Milestone review requested',
      image: 'Giveth-review-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The Milestone <em>${data.milestoneTitle}</em> to the Campaign <em>${data.campaignTitle}</em> has been marked as completed by the Milestone Owner.
          <br/><br/>
        </p>
          Now is your moment to shine!
        </p>
        <p>
          Please contact the Milestone Owner and <strong>review the completion of this Milestone within 3 days.</strong>
        </p>
      `,
      cta: `Review Milestone`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'milestone-request-review',
      unsubscribeReason: `You receive this email because you run a Milestone`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  milestoneMarkedCompleted: (app, data) => {
    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Your Milestone is finished!',
      secretIntro: `Your Milestone ${data.milestoneTitle} has been marked complete by the reviewer. The recipient can now collect the payment.`,
      title: `Milestone completed! Time to collect ${data.token.symbol}.`,
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The Milestone <em>${data.milestoneTitle}</em> in the Campaign <em>${data.campaignTitle}</em> has been marked complete by the reviewer!.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this Milestone!
        </p>
      `,
      cta: `Manage Milestone`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'milestone-review-approved',
      unsubscribeReason: `You receive this email because you run a Milestone`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  milestoneReviewRejected: (app, data) => {
    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Milestone rejected by reviewer :-(',
      type: 'milestone-review-rejected',
      secretIntro: `The completion of your Milestone ${data.milestoneTitle} has been rejected by the reviewer.`,
      title: 'Milestone completion rejected.',
      image: 'Giveth-milestone-review-rejected-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The Milestone completion <em>${data.milestoneTitle}</em> in the Campaign <em>${data.campaignTitle}</em> has been rejected by the reviewer.
        </p>
      `,
      cta: `Manage Milestone`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'milestone-review-rejected',
      unsubscribeReason: `You receive this email because you run a Milestone`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  milestoneCanceled: (app, data) => {
    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Milestone canceled :-(',
      type: 'milestone-canceled',
      secretIntro: `Your Milestone ${data.milestoneTitle} has been canceled.`,
      title: 'Milestone canceled.',
      image: 'Giveth-milestone-canceled-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The Milestone <em>${data.milestoneTitle}</em> in the Campaign <em>${data.campaignTitle}</em> has been canceled.
        </p>
      `,
      cta: `Manage Milestones`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'milestone-canceled',
      unsubscribeReason: `You receive this email because you run a Milestone`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  milestoneCreated: (app, data) => {
    data.amount = Number(data.amount) / 10 ** 18;

    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Milestone created with you as a recipient',
      type: 'milestone-created',
      secretIntro: `A Milestone ${data.milestoneTitle} has been created with you as the recipient.`,
      title: 'Milestone created.',
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          A Milestone <em>${data.milestoneTitle}</em> for ${data.amount} ${data.token.symbol} has been created with you as the recipient.
        </p>
      `,
      cta: `See your Milestones`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'milestone-created',
      unsubscribeReason: `You receive this email because you are the recipient of a Milestone`,
      message: data.message,
    });

    sendEmail(app, data);
  },

  milestonePaid: (app, data) => {
    Object.assign(data, {
      template: 'notification',
      subject: 'Giveth - Milestone paid',
      type: 'milestone-paid',
      secretIntro: `Your Milestone ${data.milestoneTitle} has been paid.`,
      title: 'Milestone paid.',
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>The following payments have been initiated for your Milestone <em>${
          data.milestoneTitle
        }</em>:</p>
        <p></p>
        ${data.donationCounters.map(c => `<p>${c.totalDonated / 10 ** 18} ${c.symbol}</p>`)}
        <p></p>
        <p>You can expect to see these payment(s) to arrive in your wallet <em>${
          data.address
        }</em> within 48 - 72 hrs.</p>
      `,
      cta: `See your Milestones`,
      ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
      unsubscribeType: 'milestone-paid',
      unsubscribeReason: `You receive this email because you are the recipient of a Milestone`,
    });

    sendEmail(app, data);
  },

  donationCancelled: (app, data) => {
    Object.assign(data, {
      subject: 'Giveth - Oh no, you lost a giver!',
      type: 'donation-cancelled',
    });

    // not implemented yet
    // sendEmail(app, data);
    sendEmail(app, data);
  },
};
