const { assert } = require('chai');
const { getFeatherAppInstance } = require('../app');
const projectsFactory = require('./projects');
const mockLiquidPledging = require('../mock/mockLiquidPledging');
const {
  assertThrowsAsync,
  generateRandomTransactionHash,
  generateRandomNumber,
} = require('../../test/testUtility');

let projects;

function addProjectTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await projects.addProject({ event: 'NotProjectAdded' });
    };
    await assertThrowsAsync(badFunc, 'addProject only handles ProjectAdded events');
  });

  it('should throw exception, connecting to web3 problem in test mode', async () => {
    const idProject = generateRandomNumber(10, 100);
    const transactionHash = generateRandomTransactionHash();
    const event = {
      returnValues: {
        idProject,
      },
      transactionHash,
      event: 'ProjectAdded',
    };
    const badFunc = async () => {
      await await projects.addProject(event);
    };
    await assertThrowsAsync(badFunc, 'connection not open');
  });
}

function updateProjectTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await projects.updateProject({ event: 'NotProjectUpdated' });
    };
    await assertThrowsAsync(badFunc, 'updateProject only handles ProjectUpdated events');
  });

  it('should return null , no campaign create or update because of web3 connection error', async () => {
    const idProject = generateRandomNumber(10, 100);
    const transactionHash = generateRandomTransactionHash();
    const event = {
      returnValues: {
        idProject,
      },
      transactionHash,
      event: 'ProjectUpdated',
    };
    const campaigns = await projects.updateProject(event);
    assert.notOk(campaigns);
  });
}

function cancelProjectTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await projects.cancelProject({
        event: 'NotCancelProject',
        returnValues: {
          idProject: generateRandomNumber(1, 1000),
        },
      });
    };
    await assertThrowsAsync(badFunc, 'cancelProject only handles CancelProject events');
  });

  it('should throw exception, connecting to web3 problem in test mode', async () => {
    const idProject = generateRandomNumber(10, 100);
    const transactionHash = generateRandomTransactionHash();
    const event = {
      returnValues: {
        idProject,
      },
      transactionHash,
      event: 'CancelProject',
    };
    const result = await await projects.cancelProject(event);
    assert.isNotOk(result);
  });
}

function setAppTestCases() {
  it('should throw exception , invalid event passed', async () => {
    const badFunc = async () => {
      await projects.setApp({ event: 'NotSetApp' });
    };
    await assertThrowsAsync(badFunc, 'setApp only handles SetApp events');
  });

  it('should throw exception, connecting to web3 problem in test mode', async () => {
    const idProject = generateRandomNumber(10, 100);
    const transactionHash = generateRandomTransactionHash();
    const event = {
      returnValues: {
        idProject,
      },
      transactionHash,
      event: 'SetApp',
    };
    const result = await await projects.setApp(event);
    assert.isNotOk(result);
  });
}

describe('addProject() function tests', addProjectTestCases);
describe('updateProject() function tests', updateProjectTestCases);
describe('setApp() function tests', setAppTestCases);
describe('cancelProject() function tests', cancelProjectTestCases);

before(() => {
  const app = getFeatherAppInstance();
  projects = projectsFactory(app, mockLiquidPledging);
});
