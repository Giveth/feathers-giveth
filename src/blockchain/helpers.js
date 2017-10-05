export const milestoneStatus = (accepted, canceled) => {
  if (canceled) return 'Canceled';
  if (accepted) return 'Completed';
  return 'InProgress';
};
