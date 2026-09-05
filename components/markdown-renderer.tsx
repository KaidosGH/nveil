import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';

/**
 * Strict sanitize allowlist: structural markdown only, links restricted to
 * http(s)/mailto. Everything else — scripts, iframes, inline HTML, event
 * handlers, javascript: URLs — is stripped before rendering. Raw HTML is
 * never executed or rendered.
 */
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

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-sm space-y-2 text-sm leading-relaxed break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_li_::marker]:text-muted-foreground [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:leading-relaxed [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_th]:border [&_th]:px-2 [&_td]:border [&_td]:px-2 [&_ul]:list-disc">
      <ReactMarkdown
        // Order matters: highlight runs AFTER sanitize, so it only ever
        // decorates already-sanitized code text with class-name spans — it
        // cannot introduce anything the allowlist didn't approve. detect:true
        // also highlights bare ``` fences (no language tag) via auto-detect;
        // a misdetection only shifts token colors, never the copied text.
        rehypePlugins={[[rehypeSanitize, schema], [rehypeHighlight, { detect: true }]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
