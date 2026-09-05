import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { markdownSchema as schema } from '@/lib/markdown-schema';

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
