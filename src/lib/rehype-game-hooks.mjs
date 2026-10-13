// Wraps configured phrases in text nodes with <span data-game="<slug>">.
export default function rehypeGameHooks({ hooks }) {
  const split = (text) => {
    for (const { pattern, game } of hooks) {
      const m = pattern.exec(text);
      if (!m) continue;
      const before = text.slice(0, m.index);
      const after = text.slice(m.index + m[0].length);
      return [
        ...(before ? split(before) : []),
        {
          type: 'element',
          tagName: 'span',
          properties: { dataGame: game },
          children: [{ type: 'text', value: m[0] }],
        },
        ...(after ? split(after) : []),
      ];
    }
    return [{ type: 'text', value: text }];
  };
  const walk = (node) => {
    if (!node.children || (node.type === 'element' && node.tagName === 'a')) return;
    node.children = node.children.flatMap((child) =>
      child.type === 'text' ? split(child.value) : (walk(child), [child]),
    );
  };
  return walk;
}
