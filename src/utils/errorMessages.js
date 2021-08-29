// TODO all error messages should come here, not use hardcode anymore
const errorMessages = {
  JUST_ACTIVE_CAMPAIGNS_COULD_BE_ARCHIVED: 'Just Active campaigns could be archived',
  JUST_CAMPAIGN_OWNER_AND_ADMIN_CAN_ARCHIVE_CAMPAIGN:
    'Just campaignOwner and admin can archive campaign',
  JUST_CAMPAIGN_OWNER_AND_ADMIN_CAN_UN_ARCHIVE_CAMPAIGN:
    'Just campaignOwner and admin can unArchive campaign',
  ARCHIVED_CAMPAIGNS_STATUS_JUST_CAN_UPDATE_TO_ACTIVE:
    'Archived campaigns status can change just to Active',
  SENT_SYMBOL_IS_NOT_IN_TOKEN_WITHE_LIST: 'Sent symbol is not in token whitelist',
  SENT_TO_IS_NOT_IN_TOKEN_WITHE_LIST: 'Sent toSymbol is not in token whitelist',
};

module.exports = { errorMessages };
