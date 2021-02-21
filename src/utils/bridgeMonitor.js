const config = require('config');
const axios = require('axios');
const logger = require('winston');
const { DonationStatus, DONATION_BRIDGE_STATUS } = require('../models/donations.model');
const { MilestoneStatus } = require('../models/milestones.model');

const bridgeMonitorBaseUrl = config.get('bridgeMonitorBaseUrl');
const getDonationStatusFromBridge = async ({ txHash }) => {
  /**
   * If you want to see an example of bridge monitor response you can check this link
   * @see{@link https://feathers.bridge.beta.giveth.io/payments?event.returnValues.reference=0xe5f676f6d24fbe43feddb80dcebbedf86e35835b1c5dd984cda46faff73dd98a}
   * @type {*}
   */
  const result = await axios.get(`${bridgeMonitorBaseUrl}/payments`, {
    params: {
      'event.returnValues.reference': txHash,
    },
  });
  if (result.data && result.data.data && result.data.data.length >= 0) {
    return result.data.data[0];
  }
  return undefined;
};

const updateMilestoneStatusToPaid = async (app, donation) => {
  const donationService = app.service('donations');
  const milestoneService = app.service('milestones');
  const milestone = await milestoneService.get(donation.ownerTypeId);
  if (milestone.status !== MilestoneStatus.PAID) return;
  const donations = await donationService.find({
    paginate: false,
    query: {
      ownerTypeId: donation.ownerTypeId,
      status: { $in: [DonationStatus.COMMITTED, DonationStatus.PAYING, DonationStatus.PAID] },
      amountRemaining: { $ne: '0' },
    },
  });

  // if there are still committed and paying donations, don't mark the as paid or paying
  if (
    donations.some(d => d.status === DonationStatus.COMMITTED || d.status === DonationStatus.PAYING)
  ) {
    return;
  }

  const hasDonationWithPendingStatusInBridge = donations.some(
    d =>
      d.bridgeStatus !== DONATION_BRIDGE_STATUS.PAID &&
      d.bridgeStatus !== DONATION_BRIDGE_STATUS.CANCELLED,
  );
  if (!hasDonationWithPendingStatusInBridge) {
    await app.service('milestones').patch(donation.ownerTypeId, {
      isAllDonationsPaidInBridge: true,
    });
    // TODO can email to milestone owner and says that the money went to their wallet
  }
};

const updateDonationsAndMilestoneStatusToBridgePaid = async ({ app, donation, bridgeEvent }) => {
  const donationService = app.service('donations');
  const bridgeStatus = DONATION_BRIDGE_STATUS.PAID;
  await donationService.patch(donation._id, {
    bridgeStatus,
    bridgeTxHash: bridgeEvent.transactionHash,
  });
  logger.info('update donation bridge status', {
    donationId: donation._id,
    bridgeStatus,
  });
  await updateMilestoneStatusToPaid(app, donation);
};
const updateDonationsAndMilestoneStatusToBridgeFailed = async ({ app, donation, bridgeEvent }) => {
  const donationService = app.service('donations');
  const bridgeStatus = DONATION_BRIDGE_STATUS.CANCELLED;
  await donationService.patch(donation._id, {
    bridgeStatus,
    bridgeTxHash: bridgeEvent.transactionHash,
  });
  logger.info('update donation bridge status', {
    donationId: donation._id,
    bridgeStatus,
  });
};
const updateDonationsAndMilestoneStatusToBridgeUnknown = async ({ app, donation }) => {
  const donationService = app.service('donations');
  let bridgeStatus = DONATION_BRIDGE_STATUS.UNKNOWN;

  const timeBetweenCreatedDonationAndNow =
    new Date().getTime() - new Date(donation.createdAt).getTime();
  const expirationThreshold = 60 * 24 * 3600 * 1000;
  if (timeBetweenCreatedDonationAndNow > expirationThreshold) {
    // If a donations is for more than two months ago and the bridge status is unknown
    // then we set the bridgeStatus Expired to not inquiry again for that donation
    bridgeStatus = DONATION_BRIDGE_STATUS.EXPIRED;
  }
  donationService.patch(donation._id, {
    bridgeStatus,
  });
  logger.info('update donation bridge status', {
    donationId: donation._id,
    bridgeStatus,
  });
};

const inquiryAndUpdateDonationStatusFromBridge = async ({ app, donation }) => {
  const payment = await getDonationStatusFromBridge({ txHash: donation.txHash });
  if (payment && payment.paid) {
    await updateDonationsAndMilestoneStatusToBridgePaid({
      app,
      donation,
      bridgeEvent: payment.event,
    });
  } else if (payment && payment.canceled) {
    await updateDonationsAndMilestoneStatusToBridgeFailed({
      app,
      donation,
      bridgeEvent: payment.event,
    });
  } else {
    await updateDonationsAndMilestoneStatusToBridgeUnknown({
      app,
      donation,
    });
  }
};

const syncDonationsWithBridge = async app => {
  const donationService = app.service('donations');
  const donations = await donationService.find({
    paginate: false,
    query: {
      $limit: 100,
      // 3 * 24 * 60 * 60 * 1000 means 3 days
      createdAt: { $lte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      status: DonationStatus.PAID,
      txHash: { $exists: true },
      bridgeStatus: {
        // $exists: true,
        $nin: [
          DONATION_BRIDGE_STATUS.PAID,
          DONATION_BRIDGE_STATUS.CANCELLED,
          DONATION_BRIDGE_STATUS.EXPIRED,
        ],
      },
    },
  });
  logger.info(
    'updateDonationsStatusesWithBridge cronjob executed, donationsCount:',
    donations.length,
  );
  // eslint-disable-next-line no-restricted-syntax
  for (const donation of donations) {
    // eslint-disable-next-line no-await-in-loop
    await inquiryAndUpdateDonationStatusFromBridge({ app, donation });
  }
};

const updateDonationsStatusesWithBridge = async app => {
  await syncDonationsWithBridge(app);

  // 1000 * 60 * 5 means every 5 minute
  const intervalTime = 1000 * 60 * 5;
  setInterval(async () => {
    await syncDonationsWithBridge(app);
  }, intervalTime);
};

module.exports = {
  updateDonationsStatusesWithBridge,
};
