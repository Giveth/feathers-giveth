const { database, config: migrationConfig, up } = require('migrate-mongo');
const config = require('config');
const { seedData, sleep } = require('./testUtility');

async function runMigrationsOnDbDump() {
  console.log('migrating up ....');
  const { db, client } = await database.connect();
  const myConfig = {
    mongodb: {
      url: config.get('mongodb'),
      options: { useNewUrlParser: true },
    },
    migrationsDir: './migrations',
    changelogCollectionName: 'changelog',
    migrationFileExtension: '.js',
  };

  migrationConfig.set(myConfig);
  const migrated = await up(db, client);
  migrated.forEach(fileName => console.log('Migrated:', fileName));
}

before(async () => {
  try {
    // await mongoServer.getUri();
    await seedData();
    console.log('test db restored');
    await runMigrationsOnDbDump();

    // If we require startServer before initializing mongo the server will not responding, I dont know the reason yet
    /* eslint-disable-next-line */
    const { startServer } = require('../src/server');
    console.log('starting server');
    // we need to wait after setting up of mongoServer we starServer
    await startServer();
    console.log('feathers server is up');
    // This is because it takes seconds to feather server starts
    await sleep(1000);
    console.log('going to run tests .....');
    // console.log('after running feather js', mongoUri);
  } catch (e) {
    console.log('error in beforeAll', e);
    throw new Error('could not setup tests requirements');
  }
});
