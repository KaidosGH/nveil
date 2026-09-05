import { defaultSchema } from 'rehype-sanitize';

/**
 * Strict sanitize allowlist for user-provided markdown: structural tags
 * only, links restricted to http(s)/mailto. Everything else — scripts,
 * iframes, inline HTML, event handlers, javascript: URLs — is stripped
 * before rendering. Raw HTML is never executed or rendered.
 *
 * Single source of truth, shared by components/markdown-renderer.tsx and
 * tests/markdown-renderer.test.mjs so the tested allowlist IS the shipped
 * one (no drift between the two).
 */
export const markdownSchema = {
  ...defaultSchema,
  tagNames: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'strong', 'em', 'del', 's',
    'ul', 'ol', 'li', 'blockquote',
    'code', 'pre', 'a', 'hr', 'br',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  protocols: { href: ['http', 'https', 'mailto'] },
  attributes: {
    ...defaultSchema.attributes,
    a: ['href', 'title'],
    code: [['className', /^language-./]],
  },
};
