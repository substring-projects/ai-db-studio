import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ImageOff } from 'lucide-react';
import { isSafeExternalUrl, unwrapMarkdownFences } from '../../lib/markdown';
import { SqlCode } from '../Workbench/SqlCode';
import { CopyButton } from '../ui/feedback';

const heading = 'font-semibold leading-snug text-foreground';

/** Code in a message, with its language and a copy button. */
const CodeBlock: React.FC<{ language?: string; code: string }> = ({ language, code }) => (
  <div className="group/code relative overflow-hidden rounded-md border border-border bg-muted">
    <div className="absolute right-1 top-1 opacity-0 transition-opacity duration-75 focus-within:opacity-100 group-hover/code:opacity-100">
      <CopyButton text={code} label="Copy code" />
    </div>
    {language && language !== 'sql' && (
      <div className="border-b border-border px-2.5 py-1 font-mono text-2xs text-muted-foreground">{language}</div>
    )}
    <pre className="overflow-x-auto p-2.5">
      {language === 'sql' || !language ? (
        <SqlCode sql={code} wrap={false} />
      ) : (
        <code className="selectable font-mono text-xxs leading-[18px]">{code}</code>
      )}
    </pre>
  </div>
);

const buildComponents = (hidden: Set<string>): Components => ({
  h1: ({ children }) => <h1 className={`${heading} mt-4 border-b border-border pb-1 text-lg first:mt-0`}>{children}</h1>,
  h2: ({ children }) => <h2 className={`${heading} mt-4 text-base first:mt-0`}>{children}</h2>,
  h3: ({ children }) => <h3 className={`${heading} mt-3 text-sm first:mt-0`}>{children}</h3>,
  h4: ({ children }) => <h4 className={`${heading} mt-3 text-sm first:mt-0`}>{children}</h4>,
  h5: ({ children }) => <h5 className={`${heading} mt-2 text-xs first:mt-0`}>{children}</h5>,
  h6: ({ children }) => <h6 className={`${heading} mt-2 text-xs text-muted-foreground first:mt-0`}>{children}</h6>,
  p: ({ children }) => <p className="break-words">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={className?.includes('contains-task-list') ? 'space-y-1' : 'list-disc space-y-1 pl-5'}>{children}</ul>
  ),
  ol: ({ children, start }) => (
    <ol start={start} className="list-decimal space-y-1 pl-5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="break-words [&>ol]:mt-1 [&>ul]:mt-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="space-y-2 border-l-2 border-input pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  // Opened in the system browser by the main process, which also rejects unsafe addresses.
  a: ({ href, children }) =>
    href && isSafeExternalUrl(href) ? (
      <a href={href} target="_blank" rel="noreferrer" title={href} className="text-primary underline underline-offset-2">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Loading an image would contact whatever address the model wrote, which could carry data out in its URL.
  img: ({ alt, src }) => (
    <span title={src} className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xxs text-muted-foreground">
      <ImageOff className="size-3" /> {alt || 'Image not loaded'}
    </span>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-chrome">{children}</thead>,
  th: ({ children, style }) => (
    <th style={style} className="border-b border-r border-border px-2.5 py-1.5 font-medium last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border-b border-r border-border/60 px-2.5 py-1.5 last:border-r-0 [tr:last-child>&]:border-b-0">
      {children}
    </td>
  ),
  code: ({ children }) => <code className="rounded-[3px] bg-secondary px-1 py-px font-mono text-[0.88em]">{children}</code>,
  input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} disabled className="mr-1.5 size-3 align-[-1px]" />,
  pre: ({ children }) => {
    const child = React.Children.toArray(children)[0] as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
    const language = child?.props?.className?.match(/language-([\w+-]+)/)?.[1]?.toLowerCase();
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    if (hidden.has(code.trim())) return null;
    return <CodeBlock language={language} code={code} />;
  },
});

/**
 * Renders assistant text as Markdown. Raw HTML in it stays plain text. Statements that were
 * submitted appear in their own SQL blocks, so a fenced copy of one in the text is left out.
 */
export const MessageContent: React.FC<{ content: string; hideSql?: string[] }> = React.memo(({ content, hideSql }) => {
  const hiddenKey = hideSql?.join('\u0000') ?? '';
  const components = useMemo(
    () => buildComponents(new Set(hiddenKey ? hiddenKey.split('\u0000').map((sql) => sql.trim()) : [])),
    [hiddenKey]
  );
  const markdown = useMemo(() => unwrapMarkdownFences(content), [content]);

  return (
    <div className="selectable space-y-2 text-sm leading-[22px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
});
MessageContent.displayName = 'MessageContent';
