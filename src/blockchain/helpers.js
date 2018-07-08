// TODO dissolve this file

export const milestoneStatus = (completed, canceled) => {
  if (canceled) return 'Canceled';
  if (completed) return 'Completed';
  return 'InProgress';
};

export const pledgeState = val => {
  switch (val) {
    case '0':
      return 'Pledged';
    case '1':
      return 'Paying';
    case '2':
      return 'Paid';
    default:
      return 'Unknown';
  }
};