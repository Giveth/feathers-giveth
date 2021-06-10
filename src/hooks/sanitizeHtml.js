const commons = require('feathers-hooks-common');
const sanitizeHtml = require('sanitize-html');

module.exports = (...fieldNames) => context => {
  commons.checkContext(context, 'before', ['create', 'update', 'patch']);

  const items = commons.getItems(context);

  const hexReg = /^#(0x)?[0-9a-f]+$/i;
  const rgbReg = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

  const sanitize = item => {
    fieldNames.forEach(fieldName => {
      if (item[fieldName]) {
        // eslint-disable-next-line no-param-reassign
        item[fieldName] = sanitizeHtml(item[fieldName], {
          allowedTags: [
            'p',
            'h1',
            'h2',
            'strong',
            'em',
            'u',
            's',
            'blockquote',
            'ol',
            'ul',
            'li',
            'img',
            'iframe',
            'a',
            'br',
            'span',
          ],
          allowedAttributes: {
            iframe: ['src', 'allowfullscreen', 'frameborder'],
            a: ['target', 'href'],
            img: ['src', 'width'],
            '*': ['style'],
          },
          allowedClasses: {
            '*': ['ql-indent-*'],
            iframe: ['ql-video'],
          },
          allowedStyles: {
            '*': {
              color: [hexReg, rgbReg],
              'background-color': [hexReg, rgbReg],
            },
          },
        });
      }
    });
  };

  // items may be undefined if we are removing by id;
  if (items === undefined) return context;

  if (Array.isArray(items)) {
    items.forEach(item => sanitize(item));
  } else {
    sanitize(items);
  }

  commons.replaceItems(context, items);

  return context;
};
