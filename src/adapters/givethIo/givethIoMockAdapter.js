const getProjectInfoBySLug = slug => {
  return {
    id: String(Math.floor(Math.random() * 100000)),
    slug,
    title: slug.split('-').join(' '),

    // Please dont change this it's needed for tests
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
const getUserByUserId = address => {
  return {
    walletAddress: address,
    name: 'John Smith',
    firstName: 'James',
    lastName: 'Smith',
    email: 'john.smith@gmail.com',
  };
};
module.exports = { getProjectInfoBySLug, getUserByUserId };
