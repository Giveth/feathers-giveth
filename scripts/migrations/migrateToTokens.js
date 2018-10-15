const mongoose = require('mongoose');
const config = require("../../config/default.json");

const Schema = mongoose.Schema;
const mongoUrl = 'mongodb://localhost:27017/giveth'

mongoose.connect(mongoUrl);
const db = mongoose.connection;
const Milestones = db.collection('milestones')
const Campaigns = db.collection('campaigns')
const Dacs = db.collection('dacs')
const ETHConversion = db.collection('ethconversions')

db.on('error', err => console.error('Could not connect to Mongo', err));


const ETH = config.tokenWhitelist.find(t => t.symbol === 'ETH')
const { name, address, symbol } = ETH

/*
  Doing a raw db migration to make sure we don't change any timestamps!
*/

const migrateMilestonesToTokens = () => {
  return new Promise((resolve, reject) => {
    Milestones.updateMany({}, { 
      $set: { 
        token : {
          name: name,
          address: address,
          symbol: symbol
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
    })
}

const migrateCampaignsToTokens = () => {
  return new Promise((resolve, reject) => 
    Campaigns.updateMany({}, { 
      $set: { 
        token : {
          name: name,
          address: address,
          symbol: symbol
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
          name: name,
          address: address,
          symbol: symbol
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


const migrateEthConversions = () => {
  return new Promise((resolve, reject) => {

    // remove and create new indexes
    ETHConversion
      .getIndexes()
      .then(indexes => {
        if(Object.keys(indexes).includes('timestamp_1')) {
          ETHConversion.dropIndex('timestamp_1')
            .then( res => console.log('dropped timestamp index on ethconversions'))
            .catch( err => console.log('could not drop timestamp index on ethconversions'))
        } else {
          console.log('index timestamp already dropped')
        }
      })
      .catch(err => console.log('could not get indexes'))

    ETHConversion
      .getIndexes()
      .then(indexes => {
        if(!Object.keys(indexes).includes('timestamp_1_symbol_1')) {
          ETHConversion.createIndex({ timestamp: 1, symbol: 1}, { unique: true })
            .then( res => console.log('created symbol/timestamp index on ethconversions'))
            .catch( err => console.log('could not create symbol/timestamp index on ethconversions'))            
        } else {
          console.log('index timestamp/symbol already created')
        }
      })
      .catch(err => console.log('could not get indexes'))

    ETHConversion
      .updateMany({}, {
        $set: {
          symbol: symbol
        }
      })
      .then(res => {
        console.log(`migrated ${res.result.nModified} of total ${res.result.n} ethconversions`)
        resolve()
      })
      .catch( err => {
        console.log("error migrating ethconversions ", err)
        reject()
      })
  })
}



// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');
  console.log('Migration: adding token properties to milestones, campaigns, dacs')

  Promise.all([ 
    migrateMilestonesToTokens(), 
    migrateCampaignsToTokens(), 
    migrateDacsToTokens(),
    migrateEthConversions(),
  ])
    .then( res => process.exit())
    .catch( err => process.exit())
});