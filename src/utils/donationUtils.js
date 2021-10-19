const { DonationStatus } = require('../models/donations.model');
const { findParentDonation } = require('../repositories/donationRepository');

const isDonationBackToOriginalCampaign = async (
  app,
  { parentDonations, ownerType, ownerTypeId, status },
) => {
  if (ownerType !== 'campaign' || DonationStatus.COMMITTED !== status) {
    return false;
  }
  const parentDonation = await findParentDonation(app, { parentDonations });
  if (
    !parentDonation ||
    ![DonationStatus.PAID, DonationStatus.COMMITTED].includes(parentDonation.status)
  ) {
    return false;
  }
  const grandParentDonation = await findParentDonation(app, parentDonation);
  if (
    grandParentDonation &&
    grandParentDonation.status === DonationStatus.COMMITTED &&
    grandParentDonation.ownerType === 'campaign' &&
    grandParentDonation.ownerTypeId === ownerTypeId
  ) {
    // in this case we know that money went from campaign to  a trace, the recipient of
    // that trace is very campaign, so after disbursing (withdraw), the money go back to campaign
    return true;
  }
  return false;
};

module.exports = {
  isDonationBackToOriginalCampaign,
};
