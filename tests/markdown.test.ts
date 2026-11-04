import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseReaderResponse, resolveUrl } from '../src/apps/browser/markdown';
import { normalizeInput } from '../src/apps/browser/index';

describe('browser markdown', () => {
  it('parses headings, lists, links and code', () => {
    const p = parseMarkdown('# Title\n\nSome **bold** and [a link](/x) here.\n\n- one\n- [two](https://b.org)\n\n```\ncode()\n```', 'https://a.org/dir/page');
    expect(p.title).toBe('Title');
    expect(p.links).toEqual(['https://a.org/x', 'https://b.org/']);
    expect(p.blocks.map((b) => b.t)).toEqual(['h', 'p', 'li', 'li', 'code']);
  });
  it('skips unfollowable links and splits reader responses', () => {
    expect(resolveUrl('javascript:alert(1)', 'https://a.org')).toBeNull();
    expect(resolveUrl('#top', 'https://a.org')).toBeNull();
    const r = parseReaderResponse('Title: Hello\nURL Source: https://h.org/\n\nMarkdown Content:\nBody text');
    expect(r).toEqual({ title: 'Hello', source: 'https://h.org/', body: 'Body text' });
  });
  it('turns typed input into addresses or searches', () => {
    expect(normalizeInput('example.com')).toBe('https://example.com');
    expect(normalizeInput('orbit:Help')).toBe('orbit:help');
    expect(normalizeInput('retro computers')).toMatch(/duckduckgo.*retro%20computers/);
  });
});
