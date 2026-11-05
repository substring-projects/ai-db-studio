import test from 'node:test';
import assert from 'node:assert';
import { isSafeExternalUrl, unwrapMarkdownFences } from '../src/renderer/lib/markdown.ts';

test('a markdown block becomes ordinary text', () => {
  assert.equal(unwrapMarkdownFences('```markdown\n# Title\n\nBody\n```'), '# Title\n\nBody');
  assert.equal(unwrapMarkdownFences('Here:\n\n```md\n- a\n```\n\nDone'), 'Here:\n\n- a\n\nDone');
});

test('nested code stays inside the unwrapped document', () => {
  const input = '```markdown\n# Doc\n\n```sql\nSELECT 1;\n```\n\nAfter\n```\n\nOutside';
  assert.equal(unwrapMarkdownFences(input), '# Doc\n\n```sql\nSELECT 1;\n```\n\nAfter\n\nOutside');
});

test('a block still arriving renders what has come so far', () => {
  assert.equal(unwrapMarkdownFences('```markdown\n# Title\n\n| a |'), '# Title\n\n| a |');
  assert.equal(unwrapMarkdownFences('```markdown\n# T\n```sql\nSELECT'), '# T\n```sql\nSELECT');
});

test('other code blocks are left alone, even if they contain a markdown fence', () => {
  const sql = '```sql\nSELECT 1;\n```';
  assert.equal(unwrapMarkdownFences(sql), sql);
  const python = '```python\nx = """\n```markdown\nnot a doc\n```';
  assert.equal(unwrapMarkdownFences(python), python);
});

test('longer fences can hold a markdown example', () => {
  assert.equal(unwrapMarkdownFences('````markdown\n# A\n```\ncode\n```\n````'), '# A\n```\ncode\n```');
});

test('text without fences is unchanged', () => {
  const text = '# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  assert.equal(unwrapMarkdownFences(text), text);
});

test('only web and mail links may open', () => {
  for (const url of ['https://example.com', 'http://example.com/a?b=1', 'mailto:a@example.com']) {
    assert.equal(isSafeExternalUrl(url), true, url);
  }
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'x-custom://open', 'relative/path', '']) {
    assert.equal(isSafeExternalUrl(url), false, url);
  }
});
