import Web3 from 'web3';

export default (req, res, next) => {

  const signature = req.headers.authorization;
  console.log('header -> ', signature);
  console.log('query -> ', req.query);

  if (signature) {
    const user = getUser(signature);

    Object.assign(req, { authenticated: true, user });
    Object.assign(req.feathers, { authenticated: true, user });
  }

  next();
}

export const getUser = signature => {
  const { Eth } = Web3.modules;

  try {
    const address = new Eth().accounts.recover('', signature);

    return {
      user: {
        address,
      },
    }
  } catch (e) {
    console.warn('error recovering address from signature');
  }
};
