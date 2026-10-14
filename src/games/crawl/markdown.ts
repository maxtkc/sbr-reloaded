// Minimal markdown-to-DOM for guide.md: headings, paragraphs, lists, checklists, pipe tables, bold, italic, links.

// Appends inline markdown as text nodes, <strong> and <em>. Links keep only their text.
function inline(parent: HTMLElement, src: string): void {
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]*)\]\([^)]*\)|<br>/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index > last) parent.append(src.slice(last, m.index));
    if (m[1] !== undefined) {
      const el = document.createElement('strong');
      inline(el, m[1]);
      parent.append(el);
    } else if (m[2] !== undefined) {
      const el = document.createElement('em');
      inline(el, m[2]);
      parent.append(el);
    } else if (m[3] !== undefined) {
      const el = document.createElement('span');
      el.className = 'link';
      inline(el, m[3]);
      parent.append(el);
    } else {
      parent.append(document.createElement('br'));
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) parent.append(src.slice(last));
}

function el(tag: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) inline(e, text);
  return e;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

// Renders markdown blocks into a fragment.
export function render(md: string): DocumentFragment {
  const out = document.createDocumentFragment();
  // Headings always stand alone, even without blank lines around them.
  const blocks = md
    .replace(/^(#{1,6}\s.*)$/gm, '\n$1\n')
    .trim()
    .split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const first = lines[0];
    const heading = /^(#{1,6})\s+(.*)$/.exec(first);
    if (heading && lines.length === 1) {
      out.append(el(`h${Math.min(heading[1].length, 6)}`, heading[2]));
    } else if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
      const ul = el('ul');
      for (const l of lines) {
        const item = l.replace(/^\s*[-*]\s+/, '');
        const check = /^\[( |x)\]\s+(.*)$/.exec(item);
        const li = el('li', check ? check[2] : item);
        if (check) li.className = check[1] === 'x' ? 'check done' : 'check';
        ul.append(li);
      }
      out.append(ul);
    } else if (lines.every((l) => /^\d+\.\s/.test(l))) {
      const ol = el('ol');
      for (const l of lines) ol.append(el('li', l.replace(/^\d+\.\s+/, '')));
      out.append(ol);
    } else if (lines.every((l) => l.trim().startsWith('|'))) {
      const table = el('table');
      lines
        .filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l))
        .forEach((l, i) => {
          const tr = el('tr');
          for (const c of cells(l)) tr.append(el(i === 0 ? 'th' : 'td', c));
          table.append(tr);
        });
      out.append(table);
    } else {
      out.append(el('p', lines.join(' ').replace(/<br>\s*/g, '<br>')));
    }
  }
  return out;
}
