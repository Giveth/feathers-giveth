const commons = require('feathers-hooks-common');
const sanitizeHtml = require('sanitize-html');

module.exports = (...fieldNames) => context => {
  commons.checkContext(context, 'before', ['create', 'update', 'patch']);

  const items = commons.getItems(context);

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
          ],
          allowedAttributes: {
            iframe: ['src', 'allowfullscreen', 'frameborder'],
            a: ['target', 'href'],
            img: ['src'],
          },
          allowedClasses: {
            '*': ['ql-indent-*'],
            iframe: ['ql-video'],
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
