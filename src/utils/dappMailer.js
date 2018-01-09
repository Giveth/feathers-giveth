const rp = require('request-promise');
const _ = require('lodash');
import { utils } from 'web3';

const _sendEmail = (app, data) => {
  // add the dapp url that this feathers serves for
  _.extend(data, { dappUrl: app.get('dappUrl')});

  console.log('send notification', data);

  rp({
    method: 'POST',
    url: app.get('dappMailerUrl') + '/send',
    headers: {
      'Authorization': app.get('dappMailerSecret')
    },
    form: data,
    json: true
  }).then( res => { 
    console.log('send email', res)
  }).catch( err => {    
    console.log('error sending email', err)
  });      
}


export default {
  donation: (app, data) => {
    data.amount = utils.fromWei(data.amount);

    _.extend(data, {
      template: "notification",
      subject: "Giveth - Thank you for your donation!",             
      secretIntro: `Thank you for your donation of ${data.amount}Ξ to the ${data.donationType} "${data.donatedToTitle}"!`,
      title: 'You are so awesome!',
      image: 'Giveth-donation-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          Thank you very much for your donation of ${data.amount}Ξ to the ${data.donationType} <em>${data.donatedToTitle}</em>. 
          With your donation we can really make this happen, and you play a vital part in making the world a better place!  
        </p>        
      `,
      cta: "Manage your Donations",
      ctaRelativeUrl: "/my-donations",
      unsubscribeType: "donation-receipt",
      unsubscribeReason: "You receive this email from Giveth because you have made a donation"    
    })

    _sendEmail(app, data);
  },


  donationReceived: (app, data) => {
    data.amount = utils.fromWei(data.amount);

    _.extend(data, {
      template: "notification",
      subject: "Giveth - You've received a donation!",             
      secretIntro: `You have received a donation of ${data.amount}Ξ for the ${data.donationType} "${data.donatedToTitle}"!`,
      title: 'You are so awesome!',
      image: 'Giveth-donation-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          You have received a donation of 
          <span>${data.amount}Ξ</span>
          for your ${data.donationType} <em>${data.donatedToTitle}</em>. 
        </p>        
      `,
      cta: `Manage your ${data.donationType}`,
      ctaRelativeUrl: `/my-${data.donationType}s`,
      unsubscribeType: "donation-received",
      unsubscribeReason: `You receive this email because you run a ${data.donationType}`    
    })

    _sendEmail(app, data);
  },  


  delegationRequired: (app, data) => {
    data.amount = utils.fromWei(data.amount);

    _.extend(data, {
      template: "notification",
      subject: "Giveth - Delegation required for new donation!",       
      secretIntro: `Take action! Please delegate a new donation of ${data.amount}Ξ for the ${data.donationType} "${data.donatedToTitle}"!`,
      title: "Take action! You've received a donation, please delegate!",
      image: 'Giveth-donation-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          You have received a donation of 
          <span style="display: block; color: rgb(53, 184, 209); line-height: 72px; font-size: 48px;">${data.amount}Ξ</span>
          for your ${data.donationType} <em>${data.donatedToTitle}</em>. 
        </p>
        <p>
          You need to delegate this money to a campaign or a milestone. 
          <strong>Please do so within the next 3 days.</strong>
        </p>
      `,
      cta: `Delegate Donation`,
      ctaRelativeUrl: `/my-donations`,
      unsubscribeType: "request-delegation",
      unsubscribeReason: `You receive this email because you run a ${data.donationType}`    
    })    

    _sendEmail(app, data);
  }, 


  milestoneProposed: (app, data) => {
    data.amount = utils.fromWei(data.amount);

    _.extend(data, {
      template: "notification",
      subject: "Giveth - A milestone has been proposed!",       
      secretIntro: `Take action! A milestone has been proposed for your campaign! Please accept or reject.`,
      title: "Take action: Milestone proposed!",
      image: 'Giveth-suggest-milestone-banner.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          A milestone <em>${data.milestoneTitle}</em> of ${data.amount}Ξ has been proposed for your campaign of the campaign <em>${data.campaignTitle}</em>. 
          If you think this is a great idea, then <strong>please approve this milestone within 3 days</strong> to add it to your campaign. 
          If not, then please reject it.
        </p>
      `,
      cta: `Approve Milestone`,
      ctaRelativeUrl: `/my-milestones`,
      unsubscribeType: "milestone-proposed",
      unsubscribeReason: `You receive this email because you run a campaign`    
    })  

    data.amount = utils.fromWei(data.amount);
    _sendEmail(app, data);
  },  


  proposedMilestoneAccepted: (app, data) => {
    _.extend(data, {
      template: "notification",
      subject: "Giveth - Your proposed milestone is accepted!",       
      secretIntro: `Your milestone ${data.milestoneTitle} has been accepted by the campaign owner. You can now receive donations.`,
      title: "Take action: Milestone proposed!",
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          Your proposed milestone <em>${data.milestoneTitle}</em> of the campaign <em>${data.campaignTitle}</em> has been accepted by the campaign owner!
          <br/><br/>
          You can now receive donations, start executing the milestone, and once finished, mark it as complete.
        </p>
      `,
      cta: `Manage Milestone`,
      ctaRelativeUrl: `/my-milestones`,
      unsubscribeType: "proposed-milestone-accepted",
      unsubscribeReason: `You receive this email because you run a milestone`    
    }) 

    _sendEmail(app, data);
  },


  proposedMilestoneRejected: (app, data) => {
    _.extend(data, {
      template: "notification",
      subject: "Giveth - Your proposed milestone is rejected :-(",       
      secretIntro: `Your milestone ${data.milestoneTitle} has been rejected by the campaign owner :-(`,
      title: "Milestone rejected :-(",
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          Unfortunately your proposed milestone <em>${data.milestoneTitle}</em> of the campaign <em>${data.campaignTitle}</em> has been rejected by the campaign owner.
          <br/><br/>
          Please contact the campaign owner to learn why your milestone was rejected.
        </p>
      `,
      cta: `Manage Milestone`,
      ctaRelativeUrl: `/my-milestones`,
      unsubscribeType: "proposed-milestone-rejected",
      unsubscribeReason: `You receive this email because you proposed a milestone`    
    })     

    _sendEmail(app, data);
  },              

  milestoneRequestReview: (app, data) => {
    _.extend(data, {
      template: "notification",
      subject: "Giveth - Time to review!",       
      secretIntro: `Take action: you are requested to review the milestone ${data.milestoneTitle} within 3 days.`,
      title: "Milestone review requested",
      image: 'Giveth-review-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The milestone <em>${data.milestoneTitle}</em> of the campaign <em>${data.campaignTitle}</em> has been marked as completed by the milestone owner.
          <br/><br/>
        </p>
          Now is your moment to shine! 
        </p>
        <p>
          Please contact the milestone owner and <strong>review the completion of this milestone within 3 days.</strong>
        </p>
      `,
      cta: `Review Milestone`,
      ctaRelativeUrl: `/my-milestones`,
      unsubscribeType: "milestone-request-review",
      unsubscribeReason: `You receive this email because you run a milestone`    
    })       

    _sendEmail(app, data);  
  },

  milestoneMarkedCompleted: (app, data) => {
    _.extend(data, {
      template: "notification",
      subject: "Giveth - Your milestone is finished!",       
      secretIntro: `Your milestone ${data.milestoneTitle} has been marked complete by the reviewer. The recipient can now collect the payment.`,
      title: "Milestone completed! Time to collect Ether.",
      image: 'Giveth-milestone-review-approved-banner-email.png',
      text: `
        <p><span style="line-height: 33px; font-size: 22px;">Hi ${data.user}</span></p>
        <p>
          The milestone <em>${data.milestoneTitle}</em> of the campaign <em>${data.campaignTitle}</em> has been marked complete by the reviewer!.
          <br/><br/>
        </p>
          The recipient can now transfer the funds out of this milestone! 
        </p>
      `,
      cta: `Manage Milestone`,
      ctaRelativeUrl: `/my-milestones`,
      unsubscribeType: "milestone-review-approved",
      unsubscribeReason: `You receive this email because you run a milestone`    
    })       

    _sendEmail(app, data);  
  },  


  milestoneReviewRejected: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Milestone rejected by reviewer :-(",       
      type: "milestone-review-rejected"    
    })
    // not implemented yet
    // _sendEmail(app, data);  
  },  

  milestoneCanceled: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Milestone canceled by campaign owner :-(",       
      type: "milestone-canceled"    
    })

    // not implemented yet
    // _sendEmail(app, data);  
  },    

  donationCancelled: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Oh no, you lost a giver!",       
      type: "donation-cancelled"    
    })

    // not implemented yet
    // _sendEmail(app, data);  
    _sendEmail(app, data);     
  } 
}