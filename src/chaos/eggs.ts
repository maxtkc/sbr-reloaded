// Found easter eggs, kept in localStorage. found() fires 'chaos:egg' on document the first time an id is seen.
const KEY = 'sbr-eggs';

export function foundSet(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function found(id: string): void {
  const ids = foundSet();
  if (ids.has(id)) return;
  ids.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the egg still counts for this page view via the event.
  }
  document.dispatchEvent(new CustomEvent('chaos:egg', { detail: id }));
}
