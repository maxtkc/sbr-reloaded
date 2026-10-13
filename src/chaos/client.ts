// Page runtime: starts enabled gags and turns game triggers into overlay launches.
import { gags, games } from './registry';
import { open } from './overlay';

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
    open(slug);
  },
  true,
);

for (const [id, gag] of Object.entries(gags)) {
  if (!gag.enabled) continue;
  try {
    gag.init();
  } catch (err) {
    console.error(`gag ${id} failed`, err);
  }
}
