const Web3 = require('web3');
const { LiquidPledging, LiquidPledgingState } = require('giveth-liquidpledging');

const THIRTY_SECONDS = 30 * 1000;

const ABI = [
  {
    constant: false,
    inputs: [
      { name: 'idReceiver', type: 'uint64' },
      { name: 'donorAddress', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'addGiverAndDonate',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'APP_ADDR_NAMESPACE',
    outputs: [{ name: '', type: 'bytes32' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'whitelistDisabled',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'projectId', type: 'uint64' }],
    name: 'isProjectCanceled',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'PLUGIN_MANAGER_ROLE',
    outputs: [{ name: '', type: 'bytes32' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'numberOfPledges',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'idPledge', type: 'uint64' }, { name: 'amount', type: 'uint256' }],
    name: 'confirmPayment',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'idPledge', type: 'uint64' }, { name: 'idxDelegate', type: 'uint64' }],
    name: 'getPledgeDelegate',
    outputs: [
      { name: 'idDelegate', type: 'uint64' },
      { name: 'addr', type: 'address' },
      { name: 'name', type: 'string' },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'contractHashes', type: 'bytes32[]' }],
    name: 'addValidPluginContracts',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getRecoveryVault',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'useWhitelist', type: 'bool' }],
    name: 'useWhitelist',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'idPledge', type: 'uint64' }],
    name: 'getPledge',
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'owner', type: 'uint64' },
      { name: 'nDelegates', type: 'uint64' },
      { name: 'intendedProject', type: 'uint64' },
      { name: 'commitTime', type: 'uint64' },
      { name: 'oldPledge', type: 'uint64' },
      { name: 'token', type: 'address' },
      { name: 'pledgeState', type: 'uint8' },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'idPledge', type: 'uint64' }, { name: 'amount', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'idSender', type: 'uint64' },
      { name: 'idPledge', type: 'uint64' },
      { name: 'amount', type: 'uint256' },
      { name: 'idReceiver', type: 'uint64' },
    ],
    name: 'transfer',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'idGiver', type: 'uint64' },
      { name: 'idReceiver', type: 'uint64' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'donate',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'isValidPlugin',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'idPledge', type: 'uint64' }],
    name: 'normalizePledge',
    outputs: [{ name: '', type: 'uint64' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'commitTime', type: 'uint64' },
      { name: 'plugin', type: 'address' },
    ],
    name: 'addDelegate',
    outputs: [{ name: 'idDelegate', type: 'uint64' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'numberOfPledgeAdmins',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'pledgesAmounts', type: 'uint256[]' }],
    name: 'mWithdraw',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'EVMSCRIPT_REGISTRY_APP_ID',
    outputs: [{ name: '', type: 'bytes32' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'removeValidPluginInstance',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'idReceiver', type: 'uint64' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'addGiverAndDonate',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'commitTime', type: 'uint64' },
      { name: 'plugin', type: 'address' },
    ],
    name: 'addGiver',
    outputs: [{ name: 'idGiver', type: 'uint64' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'projectAdmin', type: 'address' },
      { name: 'parentProject', type: 'uint64' },
      { name: 'commitTime', type: 'uint64' },
      { name: 'plugin', type: 'address' },
    ],
    name: 'addProject',
    outputs: [{ name: 'idProject', type: 'uint64' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'idProject', type: 'uint64' }],
    name: 'cancelProject',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'addValidPluginInstance',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'token', type: 'address' }],
    name: 'allowRecoverability',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'commitTime', type: 'uint64' },
      { name: 'plugin', type: 'address' },
    ],
    name: 'addGiver',
    outputs: [{ name: 'idGiver', type: 'uint64' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'appId',
    outputs: [{ name: '', type: 'bytes32' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'getCodeHash',
    outputs: [{ name: '', type: 'bytes32' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'ETH',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getInitializationBlock',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'EVMSCRIPT_REGISTRY_APP',
    outputs: [{ name: '', type: 'bytes32' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: '_token', type: 'address' }],
    name: 'transferToVault',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: '_sender', type: 'address' },
      { name: '_role', type: 'bytes32' },
      { name: 'params', type: 'uint256[]' },
    ],
    name: 'canPerform',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'idPledge', type: 'uint64' }, { name: 'amount', type: 'uint256' }],
    name: 'cancelPledge',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'contractHash', type: 'bytes32' }],
    name: 'removeValidPluginContract',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: '_vault', type: 'address' }],
    name: 'initialize',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'contractHash', type: 'bytes32' }],
    name: 'addValidPluginContract',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'idDelegate', type: 'uint64' },
      { name: 'newAddr', type: 'address' },
      { name: 'newName', type: 'string' },
      { name: 'newUrl', type: 'string' },
      { name: 'newCommitTime', type: 'uint64' },
    ],
    name: 'updateDelegate',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'pledges', type: 'uint64[]' }],
    name: 'mNormalizePledge',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'kernel',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'idSender', type: 'uint64' },
      { name: 'pledgesAmounts', type: 'uint256[]' },
      { name: 'idReceiver', type: 'uint64' },
    ],
    name: 'mTransfer',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'idGiver', type: 'uint64' },
      { name: 'newAddr', type: 'address' },
      { name: 'newName', type: 'string' },
      { name: 'newUrl', type: 'string' },
      { name: 'newCommitTime', type: 'uint64' },
    ],
    name: 'updateGiver',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: 'idPledge', type: 'uint64' }, { name: 'amount', type: 'uint256' }],
    name: 'cancelPayment',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'idAdmin', type: 'uint64' }],
    name: 'getPledgeAdmin',
    outputs: [
      { name: 'adminType', type: 'uint8' },
      { name: 'addr', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'commitTime', type: 'uint64' },
      { name: 'parentProject', type: 'uint64' },
      { name: 'canceled', type: 'bool' },
      { name: 'plugin', type: 'address' },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'idProject', type: 'uint64' },
      { name: 'newAddr', type: 'address' },
      { name: 'newName', type: 'string' },
      { name: 'newUrl', type: 'string' },
      { name: 'newCommitTime', type: 'uint64' },
    ],
    name: 'updateProject',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_script', type: 'bytes' }],
    name: 'getExecutor',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'vault',
    outputs: [{ name: '', type: 'address' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'uint256' },
      { indexed: true, name: 'to', type: 'uint256' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: 'idProject', type: 'uint256' }],
    name: 'CancelProject',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'idGiver', type: 'uint64' },
      { indexed: false, name: 'url', type: 'string' },
    ],
    name: 'GiverAdded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'idGiver', type: 'uint64' },
      { indexed: false, name: 'url', type: 'string' },
    ],
    name: 'GiverUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'idDelegate', type: 'uint64' },
      { indexed: false, name: 'url', type: 'string' },
    ],
    name: 'DelegateAdded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'idDelegate', type: 'uint64' },
      { indexed: false, name: 'url', type: 'string' },
    ],
    name: 'DelegateUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'idProject', type: 'uint64' },
      { indexed: false, name: 'url', type: 'string' },
    ],
    name: 'ProjectAdded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'idProject', type: 'uint64' },
      { indexed: false, name: 'url', type: 'string' },
    ],
    name: 'ProjectUpdated',
    type: 'event',
  },
];
/**
 Utility method to get a single pledge from liquidPledging

 Usage: node getPledge [pledgeId]
 * */

// const reconnectOnEnd = (web3Core, nodeUrl) => {
//   const web3 = web3Core;
//   // eslint-disable-next-line no-unused-vars
//   web3.currentProvider.on('end', e => {
//     if (web3.reconnectInterval) return;
//
//     web3.emit(web3.DISCONNECT_EVENT);
//
//     web3.pingInterval = undefined;
//
//     web3.reconnectInterval = setInterval(() => {
//       const newProvider = new web3.providers.WebsocketProvider(nodeUrl);
//
//       newProvider.on('connect', () => {
//         clearInterval(web3.reconnectInterval);
//         web3.reconnectInterval = undefined;
//         // note: "connection not open on send()" will appear in the logs when setProvider is called
//         // This is because web3.setProvider will attempt to clear any subscriptions on the currentProvider
//         // before setting the newProvider. Our currentProvider has been disconnected, so thus the not open
//         // error is logged
//         web3.setProvider(newProvider);
//         // attach reconnection logic to newProvider
//         reconnectOnEnd(web3, nodeUrl);
//         web3.emit(web3.RECONNECT_EVENT);
//       });
//     }, THIRTY_SECONDS);
//   });
// };

// function instantiateWeb3(nodeUrl) {
//   const provider =
//     nodeUrl && nodeUrl.startsWith('ws')
//       ? new Web3.providers.WebsocketProvider(nodeUrl, {
//           clientConfig: {
//             maxReceivedFrameSize: 100000000,
//             maxReceivedMessageSize: 100000000,
//           },
//         })
//       : nodeUrl;
//   return new Web3(provider);
//   // const w3 = Object.assign(new Web3(provider), EventEmitter.prototype);
//
//   // if (w3.currentProvider.on) {
//   //   w3.currentProvider.on('connect', () => {
//   //     // keep geth node connection alive
//   //     w3.pingInterval = setInterval(w3.eth.net.getId, 45 * 1000);
//   //   });
//   //
//   //   // attach the re-connection logic to the current web3 provider
//   //   reconnectOnEnd(w3, nodeUrl);
//   //
//   //   Object.assign(w3, {
//   //     DISCONNECT_EVENT: 'disconnect',
//   //     RECONNECT_EVENT: 'reconnect',
//   //   });
//   // }
//   //
//   // return w3;
// }

async function getPledgeAdmin() {
  // const foreignWeb3 = instantiateWeb3('http://localhost:8546');

  // const liquidPledging = new LiquidPledging(
  //   foreignWeb3,
  //   '0xBeFdf675cb73813952C5A9E4B84ea8B866DBA592',
  // );
  // const numberOfPledges = await liquidPledging.numberOfPledges();
  // console.log('Number of pledges', numberOfPledges);

  // const foreignWeb3 = instantiateWeb3('https://rinkeby.infura.io/Id3GoVvLrsO08ZNjxiKz');
  const nodeUrl = 'wss://rinkeby.giveth.io/ws';
  const provider = new Web3.providers.WebsocketProvider(nodeUrl, {
    clientConfig: {
      maxReceivedFrameSize: 100000000,
      maxReceivedMessageSize: 100000000,
    },
  });

  const foreignWeb3 = new Web3(provider);
  const { eth } = foreignWeb3;
  // eslint-disable-next-line prefer-destructuring
  eth.defaultAccount = eth.accounts[0];
  const liquidPledging = new eth.Contract(ABI, '0x8eB047585ABeD935a73ba4b9525213F126A0c979');

  // const liquidPledging = new LiquidPledging(
  //   foreignWeb3,
  //   '0x8eB047585ABeD935a73ba4b9525213F126A0c979',
  // );

  const numberOfPledges = await liquidPledging.methods.numberOfPledges().call();
  console.log('Number of pledges', numberOfPledges);

  const promises = [];
  for (let i = 1; i <= Math.min(numberOfPledges, 100000); i += 1) {
    promises.push(liquidPledging.methods.getPledge(i).call());
  }
  const pledges = await Promise.all(promises);
  console.log('pledges.length:', pledges.length);

  provider.disconnect();

  process.exit(0);
}

getPledgeAdmin();
