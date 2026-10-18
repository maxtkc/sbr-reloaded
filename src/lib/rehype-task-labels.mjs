// Gives each markdown task-list checkbox an aria-label from its list item's text.
const text = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(text).join('');

export default function rehypeTaskLabels() {
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'li') {
      const box = findCheckbox(node);
      if (box) box.properties['aria-label'] = text(node).trim();
    }
    if (node.children) node.children.forEach(walk);
  };
  return walk;
}

function findCheckbox(node) {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue;
    if (child.tagName === 'input' && child.properties?.type === 'checkbox') return child;
    if (child.tagName === 'p') {
      const nested = findCheckbox(child);
      if (nested) return nested;
    }
  }
}
