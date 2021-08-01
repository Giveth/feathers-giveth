const { generateRandomNumber, SAMPLE_DATA } = require('../../../test/testUtility');

const getProjectInfoBySLug = slug => {
  return {
    id: String(generateRandomNumber(0, 1000)),
    slug,
    title: slug.split('-').join(' '),
    walletAddress: SAMPLE_DATA.GIVETH_IO_PROJECT_OWNER_ADDRESS,
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

module.exports = { getProjectInfoBySLug };
