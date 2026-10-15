// Footer "n/N Easter Eggs found" button and the dialog listing every egg and whether it has been found.
import { eggList } from './registry';
import { foundSet } from './eggs';

const toggle = document.querySelector<HTMLButtonElement>('[data-eggs]');
const dialog = document.querySelector<HTMLDialogElement>('.eggs-list');
const list = dialog?.querySelector('ul');

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
  toggle.addEventListener('click', () => dialog.showModal());
  // A click on the backdrop lands on the dialog itself.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  render();
  toggle.hidden = false;
}
