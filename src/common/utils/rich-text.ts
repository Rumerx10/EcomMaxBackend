import xss, { type IFilterXSSOptions } from 'xss';

// The same allowlist as the client's lib/richText.ts: only the markup the description editor
// produces survives. Sanitising when saving protects every store's frontend, including ones
// that render descriptions without their own sanitiser.
const SANITIZE_OPTIONS: IFilterXSSOptions = {
  whiteList: {
    p: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    strong: [],
    em: [],
    u: [],
    s: [],
    code: [],
    pre: [],
    br: [],
    hr: [],
    blockquote: [],
    ul: [],
    ol: ['start'],
    li: [],
    a: ['href', 'target', 'rel'],
    span: ['style'],
    mark: ['style', 'data-color'],
    img: ['src', 'alt', 'title', 'style', 'data-align'],
  },
  css: {
    whiteList: {
      'text-align': true,
      color: true,
      'background-color': true,
      width: true,
    },
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

export const sanitizeHtml = (html: string) => xss(html, SANITIZE_OPTIONS);
