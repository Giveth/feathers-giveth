const networks = {
  main: {
    vaultAddress: '0x91a973BEE89225c6c186419B5Bab1944Fc5736C7',
    liquidPledgingAddress: '0x3f45D2D5FeB6b4b000d2d3B84442eeDDF54A735a',
    cappedMilestoneAddress: '0x61Dc072691041d411bDa8CE5B4090feb45788a8C',
    dacsAddress: '0x79bddecb728afda275923998701bac34d277fb19',
  },
  morden: {
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
  },
  ropsten: {
    vaultAddress: '0x4736De42c4263d2E12ee2d01Fed35E7454f844b3',
    liquidPledgingAddress: '',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
  },
  rinkeby: {
    vaultAddress: '0xBf0bA4c72daab5BFeF6B9C496db91e4614a57131',
    liquidPledgingAddress: '0x1B8F84E443668C81FeE5BEc266bc098e3c7fBC00',
    cappedMilestoneAddress: '0x137802c8F48294331654108dd64d8acD48b3321d',
    dacsAddress: '0x0',
  },
  kovan: {
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
  },
  giveth: {
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
  },
  default: {
    vaultAddress: '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab',
    liquidPledgingAddress: '0x5b1869D9A4C187F2EAa108f3062412ecf0526b24',
    cappedMilestoneAddress: '0xD833215cBcc3f914bD1C9ece3EE7BF8B14f841bb',
    dacsAddress: '0x254dffcd3277C0b1660F6d42EFbB754edaBAbC2B',
  },
};

let network;

export default (web3) => {
  if (network) return Promise.resolve(network);

  return web3.eth.net.getId()
    .then((id) => {
      switch (id) {
        case 1:
          network = Object.assign({}, networks.main);
          break;
        case 2:
          network = Object.assign({}, networks.morden);
          break;
        case 3:
          network = Object.assign({}, networks.ropsten);
          break;
        case 4:
          network = Object.assign({}, networks.rinkeby);
          break;
        case 33:
          network = Object.assign({}, networks.giveth);
          break;
        case 42:
          network = Object.assign({}, networks.kovan);
          break;
        default:
          network = Object.assign({}, networks.default);
          break;
      }
      return network;
    });
};
