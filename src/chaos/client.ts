// Page runtime: starts enabled gags and turns game triggers into overlay launches.
import { gags, games } from './registry';
import { open } from './overlay';
import { url } from '../lib/url';
import './egg-counter';

// Finds the registered game a clicked element belongs to, if any.
function gameFor(target: Element): string | undefined {
  const hook = target.closest('[data-game]')?.getAttribute('data-game');
  if (hook && hook in games) return hook;
  for (const [slug, game] of Object.entries(games)) {
    if (game.trigger && target.closest(game.trigger)) return slug;
  }
}

// Capture phase, registered before gags, so game triggers win over gag click handlers.
document.addEventListener(
  'click',
  (e) => {
    if (!(e.target instanceof Element)) return;
    const slug = gameFor(e.target);
    if (!slug) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const { closeLabel, bypassLabel } = games[slug];
    const href = e.target.closest('a[href]')?.getAttribute('href');
    open(slug, closeLabel, bypassLabel && href ? { label: bypassLabel, href } : undefined);
  },
  true,
);

// Opens a game straight away on its autoOpen page, unless the URL points at a section.
const here = location.pathname.replace(/\/$/, '');
for (const [slug, game] of Object.entries(games)) {
  if (!location.hash && game.autoOpen && url(game.autoOpen).replace(/\/$/, '') === here) {
    open(slug, game.closeLabel);
    break;
  }
}

for (const [id, gag] of Object.entries(gags)) {
  if (!gag.enabled) continue;
  try {
    gag.init();
  } catch (err) {
    console.error(`gag ${id} failed`, err);
  }
}
