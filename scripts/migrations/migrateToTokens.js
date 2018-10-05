const mongoose = require('mongoose');
const config = require("../../config/default.json");

const Schema = mongoose.Schema;
const mongoUrl = 'mongodb://localhost:27017/giveth'

mongoose.connect(mongoUrl);
const db = mongoose.connection;
const Milestones = db.collection('milestones')
const Campaigns = db.collection('campaigns')
const Dacs = db.collection('dacs')

db.on('error', err => console.error('Could not connect to Mongo', err));

/*
  Doing a raw db migration to make sure we don't change any timestamps!
*/

const migrateMilestonesToTokens = () => {
  return new Promise((resolve, reject) => 
    Milestones.updateMany({}, { 
      $set: { 
        token : {
          name: Object.keys(config.tokenWhitelist[0])[0],
          address: Object.values(config.tokenWhitelist[0])[0]
        }
      }
    })
      .then( res => {
        console.log(`migrated ${res.result.nModified} of total ${res.result.n} milestones`)
        resolve()
      })
      .catch( err => {
        console.log("error migrating milestones ", err)
        reject()
      })
    )
}

const migrateCampaignsToTokens = () => {
  return new Promise((resolve, reject) => 
    Campaigns.updateMany({}, { 
      $set: { 
        token : {
          name: Object.keys(config.tokenWhitelist[0])[0],
          address: Object.values(config.tokenWhitelist[0])[0]
        }
      }
    })
      .then( res => {
        console.log(`migrated ${res.result.nModified} of total ${res.result.n} campaigns`)
        resolve()
      })
      .catch( err => {
        console.log("error migrating campaigns ", err)
        reject()
      })
    )
}

const migrateDacsToTokens = () => {
  return new Promise((resolve, reject) => 
    Dacs.updateMany({}, { 
      $set: { 
        token : {
          name: Object.keys(config.tokenWhitelist[0])[0],
          address: Object.values(config.tokenWhitelist[0])[0]
        }
      }
    })
      .then( res => {
        console.log(`migrated ${res.result.nModified} of total ${res.result.n} dacs`)
        resolve()
      })
      .catch( err => {
        console.log("error migrating dacs ", err)
        reject()
      })
    )
}



// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');
  console.log('Migration: adding token properties to milestones, campaigns, dacs')

  Promise.all([ 
    migrateMilestonesToTokens(), 
    migrateCampaignsToTokens(), 
    migrateDacsToTokens() 
  ])
    .then( res => process.exit())
    .catch( err => process.exit())
});