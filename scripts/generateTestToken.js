const Web3 = require('web3');
const { MiniMeTokenFactory, MiniMeToken, MiniMeTokenState } = require('minimetoken');
const { GivethBridge, ForeignGivethBridge } = require('giveth-bridge');

const keys = require('./keys.js');
const homeWeb3 = new Web3('https://ropsten.infura.io');
const foreignWeb3 = new Web3('https://rinkeby.giveth.io');

const homeGasPrice = homeWeb3.utils.toWei('6', 'gwei');

/**
 * Deploys a token on ropsten suitable for testing within Giveth
 * Update token info accordingly
 **/
const TOKEN = {
  name: 'MiniMe Test Token',
  symbol: 'MMT',
  decimals: 18
}

/**
 * gets the private key from keys.js
 **/
if(!keys.testToken) {
  console.error("No private key found for 'testToken' in keys.js")
  process.exit()
}

const account = homeWeb3.eth.accounts.privateKeyToAccount(keys.testToken);
homeWeb3.eth.accounts.wallet.add(account)
const accountAddress = account.address;

/**
 * Deploy script
 **/
async function deployTestToken() {
  try {
    let nonce = await homeWeb3.eth.getTransactionCount(accountAddress);

    console.log('Generating Minime TokenFactory...')

    const tokenFactory = await MiniMeTokenFactory.new(homeWeb3, { 
      from: accountAddress,
      $extraGas: 100000,
      homeGasPrice,
      nonce
    }).on('transactionHash', txHash => console.log('TokenFactory tx (Ropsten) =>', txHash));;

    console.log('Deployed tokenFactory at address: ', tokenFactory.$address)
    console.log('Deploying Minime token...')

    const miniMeToken = await MiniMeToken.new(
      homeWeb3,
      tokenFactory.$address,
      0,
      0,
      TOKEN.name,
      TOKEN.decimals,
      TOKEN.symbol,
      true,
      { from: accountAddress },
    ).on('transactionHash', txHash => console.log('Minime Token tx (Ropsten)=>', txHash));;

    console.log('Deployed miniMeToken at address: ', miniMeToken.$address)

    // generate tokens
    res = await miniMeToken.generateTokens(accountAddress, Web3.utils.toWei("10000000000"), { from: accountAddress })
    console.log('Generated MMT tokens...')

    const miniMeTokenState = new MiniMeTokenState(miniMeToken);
    const tokenState = await miniMeTokenState.getState(); 

    console.log('Token details', tokenState)

    // // whitelist MMT token
    // await homeBridge.whitelistToken(miniMeToken.$address, true, { from: accountAddress })

    // // add token on foreign
    // await foreignBridge.addToken(miniMeToken.$address, 'MiniMe Test Token', 18, 'MMT', { from: accountAddress })
    // const foreigTokenAddress = await foreignBridge.tokenMapping(miniMeToken.$address);

    console.log('\n\n----- Add this info to your tokenWhitelist in [env].json -----')
    console.log('\n\n', {
      "name": TOKEN.name, 
      "address": miniMeToken.$address, 
      // "foreignAddress": foreigTokenAddress,
      "symbol": TOKEN.symbol, 
      "decimals": TOKEN.decimals      
    })

    process.exit();
    
  } catch (e) {
    console.error(e);
    process.exit();
  }
}

deployTestToken();