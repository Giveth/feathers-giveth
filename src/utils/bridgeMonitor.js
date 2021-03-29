const config = require('config');
const axios = require('axios');
const logger = require('winston');
const { DonationStatus, DonationBridgeStatus } = require('../models/donations.model');
const { getTransaction } = require('../blockchain/lib/web3Helpers');
const { moneyWentToRecipientWallet } = require('./dappMailer');

const bridgeMonitorBaseUrl = config.get('bridgeMonitorBaseUrl');
const getDonationStatusFromBridge = async ({ txHash, tokenAddress }) => {
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
    const matchedEvent = result.data.data.find(bridgeEvent => {
      const normalizedToken =
        tokenAddress === '0x0'
          ? '0x0000000000000000000000000000000000000000'
          : tokenAddress.toLowerCase();
      return bridgeEvent.event.returnValues.token.toLowerCase() === normalizedToken;
    });
    return matchedEvent;
  }
  return undefined;
};

const updateDonationsStatusToBridgePaid = async ({ app, donation, payment }) => {
  const donationService = app.service('donations');
  const bridgeStatus = DonationBridgeStatus.PAID;
  const { timestamp } = await getTransaction(app, payment.paymentTransactionHash, true);
  await donationService.patch(donation._id, {
    bridgeStatus,
    bridgeTxHash: payment.paymentTransactionHash,
    bridgeTransactionTime: timestamp,
  });
  const milestone = await app.service('milestones').get(donation.ownerTypeId);
  moneyWentToRecipientWallet(app, {
    milestone,
    token: donation.token,
    amount: donation.amount,
  });
  logger.info('update donation bridge status', {
    donationId: donation._id,
    bridgeStatus,
    timestamp,
  });
};
const updateDonationsStatusToBridgeFailed = async ({ app, donation }) => {
  const donationService = app.service('donations');
  const bridgeStatus = DonationBridgeStatus.CANCELLED;
  await donationService.patch(donation._id, {
    bridgeStatus,
  });
  logger.info('update donation bridge status', {
    donationId: donation._id,
    bridgeStatus,
  });
};
const updateDonationsAndMilestoneStatusToBridgeUnknown = async ({ app, donation }) => {
  const donationService = app.service('donations');
  let bridgeStatus = DonationBridgeStatus.UNKNOWN;

  const timeBetweenCreatedDonationAndNow =
    new Date().getTime() - new Date(donation.createdAt).getTime();
  const expirationThreshold = 60 * 24 * 3600 * 1000;
  if (timeBetweenCreatedDonationAndNow > expirationThreshold) {
    // If a donations is for more than two months ago and the bridge status is unknown
    // then we set the bridgeStatus Expired to not inquiry again for that donation
    bridgeStatus = DonationBridgeStatus.EXPIRED;
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
  const payment = await getDonationStatusFromBridge({
    txHash: donation.txHash,
    tokenAddress: donation.tokenAddress,
  });
  if (payment && payment.paid) {
    await updateDonationsStatusToBridgePaid({
      app,
      donation,
      payment,
    });
  } else if (payment && payment.canceled) {
    await updateDonationsStatusToBridgeFailed({
      app,
      donation,
      payment,
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
          DonationBridgeStatus.PAID,
          DonationBridgeStatus.CANCELLED,
          DonationBridgeStatus.EXPIRED,
        ],
      },
    },
  });
  logger.info(
    'updateDonationsStatusesWithBridge cronjob executed, donationsCount:',
    donations.length,
  );
  const promises = [];
  donations.forEach(donation => {
    promises.push(inquiryAndUpdateDonationStatusFromBridge({ app, donation }));
  });
  await Promise.all(promises);
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
