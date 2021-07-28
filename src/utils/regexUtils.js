const getSimilarTitleInTraceRegex = title => {
  return new RegExp(`^${title.replace(/^\s+|\s+$|\s+(?=\s)/g, '')}\\s*$`, 'i');
};

module.exports = {
  getSimilarTitleInTraceRegex,
};
