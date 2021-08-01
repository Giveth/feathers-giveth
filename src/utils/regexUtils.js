const getSimilarTitleInTraceRegex = title => {
  return new RegExp(`^\\s*${title.replace(/^\s+|\s+$|\s+(?=\s)/g, '')}\\s*$`, 'i');
};

module.exports = {
  getSimilarTitleInTraceRegex,
};
