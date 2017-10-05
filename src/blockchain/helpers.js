
export const milestoneStatus = (accepted, canceled) => {
  if (canceled) return 'Canceled';
  if (accepted) return 'Completed';
  return 'InProgress';
};

export const campaignStatus = (val) => {
  switch (val) {
    case '0':
      return 'Active';
    case '1':
      return 'Canceled';
    default:
      return 'Unknown';
  }
};
