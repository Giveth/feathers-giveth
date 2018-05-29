import commons from 'feathers-hooks-common';
import sanitizeHtml from 'sanitize-html';

export default (...fieldNames) => context => {
  commons.checkContext(context, 'before', ['create', 'update', 'patch']);

  const items = commons.getItems(context);

  const sanitize = item => {
    fieldNames.forEach(fieldName => {
      if (item[fieldName]) {
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

  Array.isArray(items) ? items.forEach(item => sanitize(item)) : sanitize(items);

  commons.replaceItems(context, items);

  return context;
};
