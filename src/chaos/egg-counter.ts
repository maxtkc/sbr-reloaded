// Footer "n/N Easter Eggs found" button and the dialog listing every egg and whether it has been found,
// plus today's daily puzzle scores.
import { eggList, games } from './registry';
import { foundSet } from './eggs';
import { loadStore, stats, streak, today } from '../games/daily/core';

const toggle = document.querySelector<HTMLButtonElement>('[data-eggs]');
const dialog = document.querySelector<HTMLDialogElement>('.eggs-list');
const list = dialog?.querySelector('ul.eggs');
const daily = dialog?.querySelector<HTMLElement>('.daily');

// One row per daily puzzle: today's score, streak and totals.
function renderDaily(): void {
  const list = daily?.querySelector('ul');
  if (!daily || !list) return;
  const slugs = Object.keys(games).filter((s) => s.startsWith('daily-'));
  daily.hidden = slugs.length === 0;
  const store = loadStore();
  const date = today();
  list.replaceChildren(
    ...slugs.map((slug) => {
      const day = store[slug]?.[date];
      const li = document.createElement('li');
      li.className = day?.solved ? 'got' : '';
      li.textContent = games[slug].title;
      const state = document.createElement('span');
      state.className = 'state';
      state.textContent = day ? day.score : 'Not played';
      const { played, solved } = stats(slug, store);
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `Streak ${streak(slug, store)} - played ${played} - solved ${solved}`;
      li.append(state, meta);
      return li;
    }),
  );
}

if (toggle && dialog && list) {
  const eggs = eggList();
  // Also tracks eggs from events, for when storage is blocked.
  const seen = foundSet();

  const render = () => {
    const n = eggs.filter((e) => seen.has(e.id)).length;
    toggle.textContent = `${n}/${eggs.length} Easter Eggs found`;
    list.replaceChildren(
      ...eggs.map((e) => {
        const li = document.createElement('li');
        const got = seen.has(e.id);
        li.className = got ? 'got' : '';
        li.textContent = e.name;
        const state = document.createElement('span');
        state.className = 'state';
        state.textContent = got ? 'Found' : 'Not found';
        li.append(state);
        return li;
      }),
    );
  };

  document.addEventListener('chaos:egg', (e) => {
    seen.add((e as CustomEvent<string>).detail);
    render();
  });
  addEventListener('sbr-daily', renderDaily);
  addEventListener('storage', (e) => {
    if (e.key === 'sbr-daily') renderDaily();
  });
  toggle.addEventListener('click', () => {
    renderDaily();
    dialog.showModal();
  });
  // A click on the backdrop lands on the dialog itself.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  render();
  renderDaily();
  toggle.hidden = false;
}
