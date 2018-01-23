const networks = {
  main: {
    vaultAddress: '0x91a973BEE89225c6c186419B5Bab1944Fc5736C7',
    liquidPledgingAddress: '0x3f45D2D5FeB6b4b000d2d3B84442eeDDF54A735a',
    cappedMilestoneAddress: '0x61Dc072691041d411bDa8CE5B4090feb45788a8C',
    dacsAddress: '0x79bddecb728afda275923998701bac34d277fb19',
    tokenAddress: '0x0',
  },
  morden: {
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
    tokenAddress: '0x0',
  },
  ropsten: {
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
    tokenAddress: '0x0',
  },
  rinkeby: {
    vaultAddress: '0x965239B818af74A1cC7feEFb990c9d681CCC4F48',
    liquidPledgingAddress: '0x5625220088cA4Df67F15f96595546D10e9970B3A',
    cappedMilestoneAddress: '0x19Bd4E0DEdb9E5Ee9762391893d1f661404b561f',
    dacsAddress: '0xc2Cef51f91dE37739F0a105fEDb058E235BB7354',
    tokenAddress: '0xb991657107F2F12899938B0985572449400C57d5',
  },
  kovan: {
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
    tokenAddress: '0x0',
  },
  giveth: {
    vaultAddress: '0x0',
    liquidPledgingAddress: '0x0',
    cappedMilestoneAddress: '0x0',
    dacsAddress: '0x0',
    tokenAddress: '0x0',
  },
  default: {
    vaultAddress: '0xCfEB869F69431e42cdB54A4F4f105C19C080A601',
    liquidPledgingAddress: '0x254dffcd3277C0b1660F6d42EFbB754edaBAbC2B',
    cappedMilestoneAddress: '0xe982E462b094850F12AF94d21D470e21bE9D0E9C',
    dacsAddress: '0xD833215cBcc3f914bD1C9ece3EE7BF8B14f841bb',
    tokenAddress: '0x5b1869D9A4C187F2EAa108f3062412ecf0526b24',
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
