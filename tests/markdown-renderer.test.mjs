// Smoke test for the MarkdownRenderer wiring: the plugin ORDER (sanitize
// before highlight) is the deliberate, security-relevant part — highlight
// must only ever decorate sanitized code text.
// Run: node tests/markdown-renderer.test.mjs
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';

// Mirrors components/markdown-renderer.tsx — keep in sync.
const schema = {
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

const md = [
  '# Heading',
  '',
  '```js',
  'const x = 1; // comment',
  '```',
  '',
  '```',
  'SELECT * FROM users WHERE id = 1;',
  '```',
  '',
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[link](javascript:alert(1))',
].join('\n');

const tree = await unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeHighlight)
  .run(unified().use(remarkParse).parse(md));

const tags = new Set();
const classNames = new Set();
const hrefs = [];
(function walk(node) {
  if (node.tagName) tags.add(node.tagName);
  if (node.properties?.className) classNames.add(...node.properties.className);
  if (node.properties?.href) hrefs.push(String(node.properties.href));
  for (const child of node.children ?? []) walk(child);
})(tree);

const checks = {
  'fenced code highlighted (hljs spans)': [...classNames].some((c) => c.startsWith('hljs-')),
  // rehype-highlight consumes the language-* class when it decorates the node.
  'code element marked hljs': classNames.has('hljs'),
  'script stripped': !tags.has('script'),
  'img stripped': !tags.has('img'),
  'javascript: link neutralized': !hrefs.some((h) => h.startsWith('javascript:')),
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
