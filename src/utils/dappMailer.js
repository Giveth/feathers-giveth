const rp = require('request-promise');
const _ = require('lodash');
import { utils } from 'web3';

const _sendEmail = (app, data) => {
  console.log('send notification', data);

  rp({
    method: 'POST',
    url: app.get('dappMailerUrl').dev + '/send',
    headers: {
      'Authorization': app.get('dappMailerSecret').dev
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
      type: "donation"    
    })

    data.amount = utils.fromWei(data.amount);

    _sendEmail(app, data);
  },


  review: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Time to review!",       
      type: "review-required"    
    })

    _sendEmail(app, data);  
  },

  donationCancelled: (app, data) => {
    _.extend(data, {
      subject: "Giveth - Oh no, you lost a giver!",       
      type: "donation-cancelled"    
    })

    _sendEmail(app, data);     
  } 
}