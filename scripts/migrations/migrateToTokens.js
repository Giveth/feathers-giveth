const mongoose = require('mongoose');
const config = require("../../config/default.json");

const Schema = mongoose.Schema;
const mongoUrl = 'mongodb://localhost:27017/giveth'

mongoose.connect(mongoUrl);
const db = mongoose.connection;
const Milestones = db.collection('milestones')
const Donations = db.collection('donations')
const ETHConversion = db.collection('ethconversions')

db.on('error', err => console.error('migrateToTokens > Could not connect to Mongo', err));


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
        console.log(`migrateMilestonesToTokens > migrated ${res.result.nModified} of total ${res.result.n} milestones`)
        resolve()
      })
      .catch( err => {
        console.log("migrateMilestonesToTokens > error migrating milestones ", err)
        reject()
      })
    })
}

const migrateDonationsToTokens = () => {
  return new Promise((resolve, reject) => 
    Donations.updateMany({}, { 
      $set: { 
        token : {
          name: name,
          address: address,
          symbol: symbol
        }
      }
    })
      .then( res => {
        console.log(`migrateDonationsToTokens > migrated ${res.result.nModified} of total ${res.result.n} donations`)
        resolve()
      })
      .catch( err => {
        console.log("migrateDonationsToTokens > error migrating donations ", err)
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
            .then( res => console.log('migrateEthConversions > dropped timestamp index on ethconversions'))
            .catch( err => console.log('migrateEthConversions > could not drop timestamp index on ethconversions'))
        } else {
          console.log('migrateEthConversions > index timestamp already dropped')
        }
      })
      .catch(err => console.log('migrateEthConversions > could not get indexes'))

    ETHConversion
      .getIndexes()
      .then(indexes => {
        if(!Object.keys(indexes).includes('timestamp_1_symbol_1')) {
          ETHConversion.createIndex({ timestamp: 1, symbol: 1}, { unique: true })
            .then( res => console.log('migrateEthConversions > created symbol/timestamp index on ethconversions'))
            .catch( err => console.log('migrateEthConversions > could not create symbol/timestamp index on ethconversions'))            
        } else {
          console.log('migrateEthConversions > index timestamp/symbol already created')
        }
      })
      .catch(err => console.log('migrateEthConversions > could not get indexes'))

    ETHConversion
      .updateMany({}, {
        $set: {
          symbol: symbol
        }
      })
      .then(res => {
        console.log(`EthConversions > migrated ${res.result.nModified} of total ${res.result.n} ethconversions`)
        resolve()
      })
      .catch( err => {
        console.log("EthConversions > error migrating ethconversions ", err)
        reject()
      })
  })
}



// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');
  console.log('Migration: adding token properties to milestones, donations and ethconversions')

  Promise.all([ 
    migrateMilestonesToTokens(), 
    migrateDonationsToTokens(),
    migrateEthConversions(),
  ])
    .then( res => process.exit())
    .catch( err => process.exit())
});