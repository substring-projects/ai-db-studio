import React, { useMemo } from 'react';
import { SqlCode } from '../Workbench/SqlCode';

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'heading'; text: string }
  | { type: 'code'; language: string; code: string };

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*```(\w*)/);
    if (fence) {
      const code: string[] = [];
      i += 1;
      // A fence still being streamed has no closing line yet: show what has arrived.
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', language: fence[1].toLowerCase(), code: code.join('\n') });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)/);
    if (heading) {
      blocks.push({ type: 'heading', text: heading[1] });
      i += 1;
      continue;
    }
    const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
    const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? isNumbered(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

const Inline: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={i} className="rounded-[3px] bg-secondary px-1 py-px font-mono text-[0.88em]">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
};

/**
 * Renders assistant text. Statements that were submitted appear in their own SQL blocks,
 * so a fenced copy of one in the text is left out.
 */
export const MessageContent: React.FC<{ content: string; hideSql?: string[] }> = ({ content, hideSql }) => {
  const blocks = useMemo(() => {
    const hidden = new Set(hideSql?.map((sql) => sql.trim()));
    return parseBlocks(content).filter((block) => !(block.type === 'code' && hidden.has(block.code.trim())));
  }, [content, hideSql]);

  return (
    <div className="selectable space-y-2 text-sm leading-[22px]">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return <p key={i} className="font-semibold"><Inline text={block.text} /></p>;
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} className={block.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
                {block.items.map((item, j) => (
                  <li key={j}><Inline text={item} /></li>
                ))}
              </Tag>
            );
          }
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-md border border-border bg-muted p-2.5">
                {block.language === 'sql' || !block.language ? (
                  <SqlCode sql={block.code} wrap={false} />
                ) : (
                  <code className="font-mono text-xxs leading-[18px]">{block.code}</code>
                )}
              </pre>
            );
          default:
            return <p key={i} className="whitespace-pre-wrap break-words"><Inline text={block.text} /></p>;
        }
      })}
    </div>
  );
};
