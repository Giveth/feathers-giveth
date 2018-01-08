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
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
  },
  rinkeby: {
    vaultAddress: '0xc9Dc801aaEc6016282Da53e341f7f843f531eCfD',
    liquidPledgingAddress: '0x40de47F30Bac30dDB151948591030fe543Cdd43D',
    cappedMilestoneAddress: '0xfd39a5C81452C061e28B7aeD4E05a7bB9105c462',
    dacsAddress: '0x55D8284F19A70955b9785a2a06d410C789474B5b',
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
