const { assert, expect } = require('chai');
const getApprovedKeys = require('./getApprovedKeys');
const { SAMPLE_DATA } = require('../../../test/testUtility');

function getApprovedKeysTestCases() {
  const mileStone = {
    recipientAddress: SAMPLE_DATA.USER_ADDRESS,
    ownerAddress: SAMPLE_DATA.USER_ADDRESS,
    campaign: {
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      coownerAddress: SAMPLE_DATA.USER_ADDRESS,
    },
  };
  const mileStoneOwnerUser = {
    address: SAMPLE_DATA.USER_ADDRESS,
  };
  it('should return just pendingRecipientAddress if data included pendingRecipientAddress', function() {
    const approvedKeys = getApprovedKeys(
      mileStone,
      { pendingRecipientAddress: 'test' },
      mileStoneOwnerUser,
    );

    assert.equal(approvedKeys.length, 1);
    assert.equal(approvedKeys[0], 'pendingRecipientAddress');
  });

  it('should throw exception because user is not milestone recipient', function() {
    const badFunc = () => {
      getApprovedKeys(
        mileStone,
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };
    assert.throw(badFunc, 'Only the Milestone recipient can change the recipient');
  });

  it('should throw exception because milestone has no recipientAddress and user is not milestone owner', function() {
    const badFunc = () => {
      getApprovedKeys(
        {
          ownerAddress: SAMPLE_DATA.USER_ADDRESS,
        },
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };
    assert.throw(badFunc, 'Only the Milestone Manager can set the recipient');
  });

  it('should throw exception because user is not milestone recipient', function() {
    const badFunc = () => {
      getApprovedKeys(
        mileStone,
        { pendingRecipientAddress: 'test' },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Milestone recipient can change the recipient');
  });

  it('should throw exception, Only the Campaign Manager can accept a milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
        { status: SAMPLE_DATA.MILESTONE_STATUSES.PENDING },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Campaign Manager can accept a milestone');
  });

  it('should return an array, campaignManager wants to accept milestone', function() {
    const expectedKeys = ['txHash', 'status', 'mined', 'ownerAddress', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
      { status: SAMPLE_DATA.MILESTONE_STATUSES.PENDING },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });

  it('should throw exception, Only the Campaign Manager can reject a milestone', function() {
    const badFunc = () => {
      getApprovedKeys(
        { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
        { status: SAMPLE_DATA.MILESTONE_STATUSES.REJECTED },
        {
          address: SAMPLE_DATA.SECOND_USER_ADDRESS,
        },
      );
    };

    assert.throw(badFunc, 'Only the Campaign Manager can reject a milestone');
  });

  it('should return an array, campaignManager wants to reject milestone', function() {
    const expectedKeys = ['status', 'message', 'proofItems'];
    const approvedKeys = getApprovedKeys(
      { ...mileStone, status: SAMPLE_DATA.MILESTONE_STATUSES.PROPOSED },
      { status: SAMPLE_DATA.MILESTONE_STATUSES.REJECTED },
      mileStoneOwnerUser,
    );

    expect(approvedKeys.sort()).to.deep.equal(expectedKeys.sort());
  });
}

// TODO tests ae written until line:133 getApprovedKeys.js file
// If these tests approved I can write test for other cases

describe('getApprovedKeys() tests', getApprovedKeysTestCases);
