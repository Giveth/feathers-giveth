import Web3 from 'web3';

export default (req, res, next) => {
  const { Eth } = Web3.modules;

  try {
    const signature = req.headers.authorization;

    if (signature) {
      const address = new Eth().accounts.recover('', signature);

      Object.assign(req, { authenticated: true, user: { address } });
      Object.assign(req.feathers, { authenticated: true, user: { address } });
    }
  } catch (e) {
    console.warn('error recovering address from signature');
  }

  next();
}
