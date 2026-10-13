// Prefixes root-relative href/src attributes in rendered markdown with the site base path.
export default function rehypeBaseLinks({ base }) {
  const prefix = base.replace(/\/$/, '');
  const fix = (value) =>
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith(prefix + '/')
      ? prefix + value
      : value;
  const walk = (node) => {
    if (node.type === 'element' && node.properties) {
      if ('href' in node.properties) node.properties.href = fix(node.properties.href);
      if ('src' in node.properties) node.properties.src = fix(node.properties.src);
    }
    if (node.children) node.children.forEach(walk);
  };
  return walk;
}
