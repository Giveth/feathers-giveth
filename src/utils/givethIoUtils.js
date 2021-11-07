const convertGivethIoToTraceImage = image => {
  const imageIpfsPath = image.match(/\/ipfs\/.*/);
  return imageIpfsPath ? imageIpfsPath[0] : image;
};

module.exports = {
  convertGivethIoToTraceImage,
};
