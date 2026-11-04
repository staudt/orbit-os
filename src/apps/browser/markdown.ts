/** Tiny Markdown parser for the text browser: blocks of styled inline runs with numbered links. */

export interface Inline {
  text: string;
  b?: boolean;
  i?: boolean;
  code?: boolean;
  /** 1-based link number */
  link?: number;
}

export type Block =
  | { t: 'h'; level: number; runs: Inline[] }
  | { t: 'p'; runs: Inline[] }
  | { t: 'li'; bullet: string; depth: number; runs: Inline[] }
  | { t: 'quote'; runs: Inline[] }
  | { t: 'code'; lines: string[] }
  | { t: 'hr' };

export interface Page {
  title: string;
  blocks: Block[];
  links: string[];
}

/** Resolve a link against the page URL; returns null for links we can't follow. */
export function resolveUrl(href: string, base: string): string | null {
  href = href.trim().replace(/^<|>$/g, '');
  if (!href || href.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(href)) return null;
  if (/^orbit:/i.test(href)) return href;
  try {
    if (/^orbit:/i.test(base)) return new URL(href).href;
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/** Parse inline markdown (links, images, bold, italic, code) into runs. */
export function parseInline(src: string, links: string[], base: string): Inline[] {
  const out: Inline[] = [];
  let b = false, i = false;
  let buf = '';
  const flush = (extra?: Partial<Inline>) => {
    if (buf) out.push({ text: buf, ...(b ? { b } : {}), ...(i ? { i } : {}), ...extra });
    buf = '';
  };
  let k = 0;
  while (k < src.length) {
    const ch = src[k];
    // escaped characters
    if (ch === '\\' && k + 1 < src.length && /[\\`*_{}[\]()#+\-.!|>~]/.test(src[k + 1])) { buf += src[k + 1]; k += 2; continue; }
    // inline code
    if (ch === '`') {
      const j = src.indexOf('`', k + 1);
      if (j > k) {
        flush();
        out.push({ text: src.slice(k + 1, j), code: true });
        k = j + 1;
        continue;
      }
    }
    // images: ![alt](src)  ->  [IMG: alt]
    if (ch === '!' && src[k + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(src.slice(k));
      if (m) {
        flush();
        const alt = m[1].trim();
        out.push({ text: `[IMG${alt ? ': ' + alt : ''}]`, i: true });
        k += m[0].length;
        continue;
      }
    }
    // links: [text](url "title")   (link text may itself contain an image)
    if (ch === '[') {
      const m = /^\[((?:[^\][]|\[[^\]]*\])*)\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))*)(?:\s+"[^"]*")?\s*\)/.exec(src.slice(k));
      if (m) {
        flush();
        const url = resolveUrl(m[2], base);
        const inner = parseInline(m[1].replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') || m[2], [], base);
        const text = inner.map((r) => r.text).join('').trim() || m[2];
        if (url) {
          links.push(url);
          out.push({ text, link: links.length, ...(b ? { b } : {}) });
        } else out.push({ text });
        k += m[0].length;
        continue;
      }
    }
    // autolinks <https://...>
    if (ch === '<') {
      const m = /^<(https?:\/\/[^>\s]+)>/.exec(src.slice(k));
      if (m) {
        flush();
        links.push(m[1]);
        out.push({ text: m[1], link: links.length });
        k += m[0].length;
        continue;
      }
    }
    // bold / italic markers
    if ((ch === '*' || ch === '_') && src[k + 1] === ch) {
      flush();
      b = !b;
      k += 2;
      continue;
    }
    if (ch === '*' || (ch === '_' && (k === 0 || /\W/.test(src[k - 1]) || /\W/.test(src[k + 1] ?? ' ')))) {
      // a lone * between spaces is just a star
      if (!(src[k - 1] === ' ' && src[k + 1] === ' ')) {
        flush();
        i = !i;
        k++;
        continue;
      }
    }
    buf += ch;
    k++;
  }
  flush();
  // decode a few HTML entities that leak through readers
  for (const r of out) r.text = r.text.replace(/[\u200b-\u200d\ufeff\u2060\u00ad]/g, '').replace(/\u2122/g, 'TM').replace(/\u00bd/g, '1/2').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return out;
}

export function parseMarkdown(md: string, base: string, fallbackTitle = ''): Page {
  const links: string[] = [];
  const blocks: Block[] = [];
  let title = fallbackTitle;
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', runs: parseInline(para.join(' '), links, base) });
    para = [];
  };
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const line = raw.replace(/\s+$/, '');
    if (/^```/.test(line.trim())) {
      flushPara();
      const code: string[] = [];
      n++;
      while (n < lines.length && !/^```/.test(lines[n].trim())) code.push(lines[n++].replace(/\t/g, '  '));
      blocks.push({ t: 'code', lines: code });
      continue;
    }
    if (!line.trim()) { flushPara(); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (h) {
      flushPara();
      blocks.push({ t: 'h', level: h[1].length, runs: parseInline(h[2], links, base) });
      if (!title && h[1].length === 1) title = h[2].replace(/[*_`[\]]/g, '');
      continue;
    }
    // setext headings
    if (para.length === 1 && /^(=+|-+)$/.test(line.trim()) && line.trim().length >= 3) {
      const text = para[0];
      para = [];
      blocks.push({ t: 'h', level: line.trim()[0] === '=' ? 1 : 2, runs: parseInline(text, links, base) });
      if (!title) title = text;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); blocks.push({ t: 'hr' }); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, '    ').length / 2));
      const bullet = /\d/.test(li[2]) ? li[2].replace(')', '.') : '•';
      blocks.push({ t: 'li', bullet, depth, runs: parseInline(li[3], links, base) });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) { flushPara(); if (q[1].trim()) blocks.push({ t: 'quote', runs: parseInline(q[1], links, base) }); continue; }
    // tables: render rows as plain text with separators
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      if (/^\s*\|?\s*:?-{2,}/.test(line.replace(/\|/g, ''))) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      blocks.push({ t: 'p', runs: parseInline(cells.join('  ·  '), links, base) });
      continue;
    }
    // indented code
    if (/^( {4}|\t)/.test(raw) && !para.length) {
      flushPara();
      const code: string[] = [];
      while (n < lines.length && (/^( {4}|\t)/.test(lines[n]) || !lines[n].trim())) code.push(lines[n++].replace(/^( {4}|\t)/, ''));
      n--;
      while (code.length && !code[code.length - 1].trim()) code.pop();
      blocks.push({ t: 'code', lines: code });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return { title: title || base, blocks, links };
}

/** Split a reader-proxy response ("Title: … URL Source: … Markdown Content: …") into title and body. */
export function parseReaderResponse(text: string): { title: string; source: string; body: string } {
  let title = '', source = '';
  const mc = text.indexOf('Markdown Content:');
  const head = mc >= 0 ? text.slice(0, mc) : '';
  const body = mc >= 0 ? text.slice(mc + 'Markdown Content:'.length) : text;
  for (const l of head.split('\n')) {
    const m = /^(Title|URL Source):\s*(.*)$/.exec(l.trim());
    if (m && m[1] === 'Title') title = m[2];
    if (m && m[1] === 'URL Source') source = m[2];
  }
  return { title, source, body: body.trim() };
}

/** Plain-text version of a page (for "Save Page as Text"). */
export function pageToText(p: Page): string {
  const txt = (runs: Inline[]) => runs.map((r) => (r.link ? `${r.text} [${r.link}]` : r.text)).join('');
  const out: string[] = [p.title, '='.repeat(Math.min(60, p.title.length)), ''];
  for (const b of p.blocks) {
    if (b.t === 'h') out.push('', txt(b.runs).toUpperCase(), '');
    else if (b.t === 'p') out.push(txt(b.runs), '');
    else if (b.t === 'li') out.push(`${'  '.repeat(b.depth)}${b.bullet === '•' ? '*' : b.bullet} ${txt(b.runs)}`);
    else if (b.t === 'quote') out.push(`> ${txt(b.runs)}`);
    else if (b.t === 'code') out.push(...b.lines.map((l) => '    ' + l), '');
    else out.push('----------');
  }
  if (p.links.length) {
    out.push('', 'LINKS');
    p.links.forEach((l, i) => out.push(`[${i + 1}] ${l}`));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
