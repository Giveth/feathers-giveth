// TODO all error messages should come here, not use hardcode anymore
const errorMessages = {
  INVALID_INPUT_DATA: 'Invalid input data',
  JUST_ACTIVE_CAMPAIGNS_COULD_BE_ARCHIVED: 'Just Active campaigns could be archived',
  JUST_CAMPAIGN_OWNER_AND_ADMIN_CAN_ARCHIVE_CAMPAIGN:
    'Just campaignOwner and admin can archive campaign',
  JUST_CAMPAIGN_OWNER_AND_ADMIN_CAN_UN_ARCHIVE_CAMPAIGN:
    'Just campaignOwner and admin can unArchive campaign',
  ARCHIVED_CAMPAIGNS_STATUS_JUST_CAN_UPDATE_TO_ACTIVE:
    'Archived campaigns status can change just to Active',
};

module.exports = { errorMessages };
