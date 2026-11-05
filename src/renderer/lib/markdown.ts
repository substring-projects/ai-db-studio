const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const MARKDOWN_LANGUAGES = new Set(['markdown', 'md', 'mdown', 'gfm']);

/**
 * Models often send a whole document inside a ```markdown block. That block is meant to be read,
 * so its contents become ordinary text and get rendered. It usually holds fenced code of its own,
 * which a plain parser would take as the end of the block, so nested fences are tracked here.
 * A block with no end yet is still arriving: everything so far counts as its contents.
 */
export function unwrapMarkdownFences(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const open = lines[i].match(FENCE);
    if (!open) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const [, marker, language] = open;
    const isMarkdown = MARKDOWN_LANGUAGES.has(language.toLowerCase());
    if (!isMarkdown) out.push(lines[i]);
    i += 1;

    let depth = 0;
    while (i < lines.length) {
      const fence = lines[i].match(FENCE);
      // A shorter fence can't close this block or open a nested one: it's only content.
      const counts = fence && fence[1][0] === marker[0] && fence[1].length >= marker.length;
      if (counts && !fence[2] && depth === 0) break;
      if (isMarkdown && counts) {
        // Inside a markdown block, a fence with a language opens a nested one and a bare fence closes it.
        depth += fence[2] ? 1 : -1;
      }
      out.push(lines[i]);
      i += 1;
    }

    if (i < lines.length) {
      if (!isMarkdown) out.push(lines[i]);
      i += 1;
    }
  }
  return out.join('\n');
}

/** Only these open outside the app. A link from a model must not reach file: or custom schemes. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
