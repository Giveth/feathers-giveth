const removeHexPrefix = hex => {
  if (hex && typeof hex === 'string' && hex.toLowerCase().startswith('0x')) {
    return hex.substring(2);
  }
  return hex;
};

module.exports = {
  removeHexPrefix,
};
