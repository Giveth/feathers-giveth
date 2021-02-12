module.exports = title => {
  return title
    .replace(/[^a-zA-Z\d\s_()-./\\]/g, '')
    .replace(/(\s|_|\(|\)|\/|\\|\.)+/g, '-')
    .toLowerCase();
}