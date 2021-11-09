const getProjectInfoBySLug = slug => {
  return {
    id: String(Math.floor(Math.random() * 100000)),
    slug,
    title: slug.split('-').join(' '),
    walletAddress: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
    description: 'test description',
    admin: '25',
    image: 'https://i.imgur.com/uPFEgJu.png',
    categories: [
      {
        name: 'community',
      },
      {
        name: 'technology',
      },
      {
        name: 'research',
      },
    ],
  };
};
const getUserByUserId = _userId => {
  return {
    // Please dont change this it's needed for tests
    address: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
    name: 'John Smith',
    avatar:
      'https://lh3.googleusercontent.com/a-/AOh14GhZ2FbGT9rWS2yI9X9FxCFkzTxRrMV65C9iB8n58g=s96-c',
    email: 'john.smith@gmail.com',
    location: 'world',
  };
};

module.exports = { getProjectInfoBySLug, getUserByUserId };
