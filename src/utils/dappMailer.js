const rp = require('request-promise');
const _ = require('lodash');
import { utils } from 'web3';

const _sendEmail = (app, data) => {
  console.log('send notification', data);

  rp({
    method: 'POST',
    url: app.get('dappMailerUrl') + '/send',
    headers: {
      'Authorization': app.get('dappMailerSecret')
    },
    form: data
  }).then( res => { 
    console.log('send email', res)
  }).catch( err => {    
    console.log('error sending email', err)
  });      
}


export default {
  donation: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Thank you for your donation!",       
      type: "donation-receipt"    
    })

    data.amount = utils.fromWei(data.amount);
    _sendEmail(app, data);
  },


  donationReceived: (app, data) => {
    _.extend(data, {
      subject: "Giveth - You've received a donation!",       
      type: "donation-received"    
    })

    data.amount = utils.fromWei(data.amount);
    _sendEmail(app, data);
  },  


  delegationRequired: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Delegation required for new donation!",       
      type: "request-delegation"    
    })

    data.amount = utils.fromWei(data.amount);
    _sendEmail(app, data);
  }, 


  milestoneProposed: (app, data) => {
    _.extend(data, {
      subject: "Giveth - A milestone has been proposed!",       
      type: "milestone-proposed"    
    })

    data.amount = utils.fromWei(data.amount);
    _sendEmail(app, data);
  },  


  proposedMilestoneAccepted: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Your proposed milestone is accepted!",       
      type: "proposed-milestone-accepted"    
    })

    data.amount = utils.fromWei(data.amount);
    _sendEmail(app, data);
  },


  proposedMilestoneRejected: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Your proposed milestone is rejected :-(",       
      type: "proposed-milestone-rejected"    
    })

    _sendEmail(app, data);
  },              

  milestoneRequestReview: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Time to review!",       
      type: "milestone-request-review"    
    })

    _sendEmail(app, data);  
  },

  milestoneMarkedCompleted: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Your milestone is finished!",       
      type: "milestone-review-approved"    
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