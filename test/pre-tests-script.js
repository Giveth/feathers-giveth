const { seedData } = require('./testUtility');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

before(async () => {
  try {
    // await mongoServer.getUri();
    console.log('pre-test 0')

    await seedData();
    console.log('test db restored')

    // If we require startServer before initializing mongo the server will not responding, I dont know the reason yet
    /* eslint-disable-next-line */
    const { startServer } = require('../src/server');
    console.log('starting server')
    // we need to wait after setting up of mongoServer we starServer
    await startServer();
    console.log('feathers server is up')
    // This is because it takes seconds to feather server starts
    await sleep(1000);
    console.log('going to run tests .....')
    // console.log('after running feather js', mongoUri);
  } catch (e) {
    console.log('error in beforeAll', e);
    throw new Error('could not setup tests requirements');
  }
});
