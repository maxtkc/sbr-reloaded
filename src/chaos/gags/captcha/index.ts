// "Are you a robot": form submits and form/CMS links first go through a fake captcha that never passes.
import { isPaused } from '../../bus';
import { found } from '../../eggs';
import { blip, siren } from '../../shared/sfx';
import { grid, type Tile } from './tiles';

interface Data {
  brand: string;
  checkbox: string;
  hints: string[];
  verifying: string[];
  failures: string[];
  giveUp: string;
  siren: string[];
  sirenDetails: string[];
  letThrough: string[];
}

type Action =
  | { kind: 'link'; href: string; blank: boolean }
  | { kind: 'form'; form: HTMLFormElement; submitter: HTMLElement | null };

// Links that get the captcha: Google Forms, GitHub issue forms, the CMS, and anything marked data-captcha.
const LINKS = [
  'a[href*="docs.google.com/forms"]',
  'a[href*="forms.gle"]',
  'a[href*="/issues/new"]',
  'a[href$="/admin"]',
  'a[href$="/admin/"]',
  '[data-captcha]',
].join(',');

// Forms that skip the captcha (Solbee's chat box).
const SKIP_FORMS = '.sbot-form';

// Attempts before the give-up button appears.
const GIVE_UP_AFTER = 3;

const CSS = `
.cap{--cap-slow:1;position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:1rem;
background:rgba(0,0,0,.45);font:400 .95rem/1.4 var(--sans,system-ui,sans-serif);color:#1d1a17}
.cap-box{width:min(25rem,100%);background:#fff;border-radius:.3rem;box-shadow:0 8px 30px rgba(0,0,0,.4);overflow:hidden;
animation:cap-pop calc(.2s * var(--cap-slow)) ease-out}
.cap-check{display:flex;align-items:center;gap:.8rem;padding:1.1rem;border:1px solid #d3d3d3;margin:1rem;
border-radius:.2rem;background:#f9f9f9}
.cap-tick{width:1.9rem;height:1.9rem;flex:none;border:2px solid #c1c1c1;border-radius:.15rem;background:#fff;cursor:pointer;padding:0}
.cap-tick.cap-spin{border-radius:50%;border-color:#4a90e2 #4a90e2 #4a90e2 transparent;
animation:cap-rot calc(.8s * var(--cap-slow)) linear infinite}
.cap-check label{flex:1;cursor:pointer}
.cap-brand{text-align:center;font-size:.65rem;color:#5d564e;line-height:1.2}
.cap-brand b{display:block;font-size:.75rem;color:var(--primary-light,#3a5a8c)}
.cap-head{background:#4a90e2;color:#fff;padding:.9rem 1rem}
.cap-head strong{display:block;font-size:1.2rem}
.cap-head small{display:block;font-size:.8rem;opacity:.9}
.cap-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.25rem;padding:.25rem}
.cap-tile{position:relative;padding:0;border:0;background:none;cursor:pointer;aspect-ratio:1;overflow:hidden}
.cap-tile svg{display:block;width:100%;height:100%;transition:transform calc(.2s * var(--cap-slow))}
.cap-tile.cap-on svg{transform:scale(.82)}
.cap-tile.cap-on::after{content:"";position:absolute;top:.3rem;left:.3rem;width:1.3rem;height:1.3rem;border-radius:50%;
background:#4a90e2 no-repeat center/70% url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M1 5l3 3 5-6' fill='none' stroke='white' stroke-width='1.6'/%3E%3C/svg%3E")}
.cap-tile path,.cap-tile ellipse{--cap-t:calc(3s * var(--cap-slow)) ease-in-out;
transition:d var(--cap-t),fill var(--cap-t),opacity var(--cap-t),transform var(--cap-t)}
.cap-fur{fill:#d9622b}
.cap-inner{fill:#3a2418}
.cap-mask{fill:#fff}
.cap-eye,.cap-pupil{fill:#1d1a17}
.cap-nose{fill:#1d1a17}
.cap-pupil{opacity:0;transform-box:fill-box;transform-origin:center;transform:scaleY(0)}
.cap-whiskers{fill:none;stroke:#1d1a17;stroke-width:1.2;opacity:0;transform-box:fill-box;transform-origin:center;
transform:scaleX(.2)}
.cap-morph .cap-fur{fill:#8a8580}
.cap-morph .cap-inner{fill:#e58fa0}
.cap-morph .cap-mask{fill:#e8e2da}
.cap-morph .cap-eye{fill:#9bc53d}
.cap-morph .cap-nose{fill:#e58fa0}
.cap-morph .cap-pupil{opacity:1;transform:none}
.cap-morph .cap-whiskers{opacity:1;transform:none}
.cap-morph .cap-earl{d:path("M18 46 L24 16 L46 32 Z")}
.cap-morph .cap-earr{d:path("M82 46 L76 16 L54 32 Z")}
.cap-morph .cap-inl{d:path("M24 40 L27 22 L38 32 Z")}
.cap-morph .cap-inr{d:path("M76 40 L73 22 L62 32 Z")}
.cap-morph .cap-head{d:path("M16 60 C16 41.2 31.2 26 50 26 C68.8 26 84 41.2 84 60 C84 78.8 68.8 94 50 94 C31.2 94 16 78.8 16 60 Z")}
.cap-morph .cap-mask{d:path("M36 74 C36 79.5 42.3 84 50 84 C57.7 84 64 79.5 64 74 C64 68.5 57.7 64 50 64 C42.3 64 36 68.5 36 74 Z")}
.cap-morph .cap-eyel{d:path("M31 54 C31 46 43 46 43 54 C43 62 31 62 31 54 Z")}
.cap-morph .cap-eyer{d:path("M69 54 C69 46 57 46 57 54 C57 62 69 62 69 54 Z")}
.cap-morph .cap-nose{d:path("M46 68 C48 68 52 68 54 68 C53 70 51 72 50 73 C49 72 47 70 46 68 Z")}
.cap-foot{display:flex;align-items:center;gap:.5rem;padding:.6rem;border-top:1px solid #e4e4e4}
.cap-msg{flex:1;font-size:.85rem;color:#c0392b;min-height:1.2em}
.cap-btn{border:0;border-radius:.2rem;background:#4a90e2;color:#fff;font:600 .9rem var(--sans,sans-serif);
padding:.6rem 1rem;cursor:pointer;text-transform:uppercase;text-decoration:none}
.cap-btn[disabled]{opacity:.6;cursor:wait}
.cap-btn.cap-quit{background:#fff;color:#5d564e;border:1px solid #c1c1c1}
.cap-siren{text-align:center;padding:1.5rem 1rem;color:#fff;animation:cap-flash calc(.5s * var(--cap-slow)) steps(1) infinite}
.cap-siren strong{display:block;font-size:1.4rem;line-height:1.2;margin:.8rem 0 .5rem}
.cap-siren p{margin:.4rem 0}
.cap-siren .cap-btn{display:inline-block;margin-top:.6rem;background:#fff;color:#1d1a17}
.cap-light{width:3.5rem;height:2rem;margin:0 auto;border-radius:1.75rem 1.75rem .3rem .3rem;
background:linear-gradient(90deg,#e8202a 50%,#2a5ee8 50%);box-shadow:0 0 1.5rem #fff;
animation:cap-beam calc(.5s * var(--cap-slow)) steps(1) infinite}
@keyframes cap-pop{from{transform:scale(.9);opacity:0}}
@keyframes cap-rot{to{transform:rotate(360deg)}}
@keyframes cap-flash{0%{background:#b3121b}50%{background:#1b3fb3}}
@keyframes cap-beam{0%{transform:scaleX(1)}50%{transform:scaleX(-1)}}
@media (prefers-reduced-motion:reduce){.cap{--cap-slow:3}}
`;

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className: string, text: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

function readData(): Data | null {
  const script = document.getElementById('captcha-data');
  if (!script?.textContent) return null;
  return JSON.parse(script.textContent) as Data;
}

export default function captcha(): (() => void) | void {
  const data = readData();
  if (!data) return;
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 3 : 1;

  const style = el('style', '', CSS);
  document.head.append(style);

  let root: HTMLDivElement | null = null;
  let action: Action | null = null;
  let returnFocus: HTMLElement | null = null;
  // Forms let through once after the siren.
  const passing = new WeakSet<HTMLFormElement>();
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms * slow);
    timers.add(id);
  };

  function close(): void {
    timers.forEach(clearTimeout);
    timers.clear();
    root?.remove();
    root = null;
    action = null;
    returnFocus?.focus();
  }

  function proceed(): void {
    const a = action;
    close();
    if (!a) return;
    if (a.kind === 'link') {
      location.assign(a.href);
    } else {
      passing.add(a.form);
      a.form.requestSubmit(a.submitter instanceof HTMLButtonElement ? a.submitter : null);
    }
  }

  function show(box: HTMLElement): void {
    found('captcha');
    root?.replaceChildren(box);
  }

  // Stage 1: the checkbox.
  function checkboxStage(): void {
    const box = el('div', 'cap-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', data!.brand);
    const row = el('div', 'cap-check');
    const tick = button('cap-tick', '');
    tick.id = 'cap-tick';
    tick.setAttribute('aria-label', data!.checkbox);
    const label = el('label', '', data!.checkbox);
    label.htmlFor = 'cap-tick';
    const brand = el('div', 'cap-brand');
    brand.append(el('b', '', data!.brand), 'Privacy - Terms');
    row.append(tick, label, brand);
    box.append(row);
    show(box);
    tick.focus();
    tick.addEventListener(
      'click',
      () => {
        blip();
        tick.classList.add('cap-spin');
        tick.disabled = true;
        later(() => imageStage(0), 1100);
      },
      { once: true },
    );
  }

  // Stage 2: select the foxes. Selected foxes turn into cats and verify never passes.
  function imageStage(attempts: number, message = ''): void {
    const box = el('div', 'cap-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', data!.brand);
    const head = el('div', 'cap-head');
    head.append(
      'Select all images with',
      el('strong', '', 'a fox'),
      el('small', '', pick(data!.hints)),
    );
    const tiles = el('div', 'cap-grid');
    grid().forEach((tile: Tile) => {
      const b = button('cap-tile', '');
      b.innerHTML = tile.svg;
      b.setAttribute('aria-label', tile.label);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const on = b.classList.toggle('cap-on');
        b.setAttribute('aria-pressed', String(on));
        if (on && tile.fox) {
          later(() => {
            b.classList.add('cap-morph');
            b.setAttribute('aria-label', 'a cat');
          }, 300);
        }
      });
      tiles.append(b);
    });
    const foot = el('div', 'cap-foot');
    const msg = el('div', 'cap-msg', message);
    msg.setAttribute('aria-live', 'polite');
    const verify = button('cap-btn', 'Verify');
    foot.append(msg);
    if (attempts >= GIVE_UP_AFTER) {
      const quit = button('cap-btn cap-quit', data!.giveUp);
      quit.addEventListener('click', sirenStage);
      foot.append(quit);
    }
    foot.append(verify);
    box.append(head, tiles, foot);
    show(box);
    verify.focus();
    verify.addEventListener('click', () => {
      verify.disabled = true;
      msg.style.color = '#5d564e';
      msg.textContent = pick(data!.verifying);
      later(() => imageStage(attempts + 1, pick(data!.failures)), 900);
    });
  }

  // Stage 3: siren, then let the action through.
  function sirenStage(): void {
    const box = el('div', 'cap-box cap-siren');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-label', data!.brand);
    const details = el('p', '', pick(data!.sirenDetails));
    box.append(el('div', 'cap-light'), el('strong', '', pick(data!.siren)), details);
    show(box);
    siren(2400 * slow);
    later(() => {
      box.append(el('p', '', pick(data!.letThrough)));
      const a = action;
      if (a?.kind === 'link' && a.blank) {
        // New-tab links need a real click to get past popup blockers.
        const go = el('a', 'cap-btn', 'Continue');
        go.href = a.href;
        go.target = '_blank';
        go.rel = 'noopener';
        go.addEventListener('click', () => {
          action = null;
          close();
        });
        box.append(go);
        go.focus();
      } else {
        later(proceed, 1500);
      }
    }, 2500);
  }

  function open(next: Action): void {
    if (root) return;
    action = next;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root = el('div', 'cap');
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    document.body.append(root);
    checkboxStage();
  }

  const onClick = (e: MouseEvent) => {
    if (isPaused() || e.defaultPrevented || !(e.target instanceof Element)) return;
    if (e.type === 'auxclick' && e.button !== 1) return;
    if (e.target.closest('.cap')) return;
    const link = e.target.closest(LINKS);
    if (!link) return;
    const href = link instanceof HTMLAnchorElement ? link.href : link.getAttribute('data-captcha');
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    const blank =
      (link instanceof HTMLAnchorElement && link.target === '_blank') ||
      e.type === 'auxclick' ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey;
    open({ kind: 'link', href, blank });
  };

  const onSubmit = (e: SubmitEvent) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (passing.delete(form)) return;
    if (isPaused() || form.matches(SKIP_FORMS) || form.closest('.cap')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open({ kind: 'form', form, submitter: e.submitter });
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('submit', onSubmit, true);

  return () => {
    close();
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('auxclick', onClick, true);
    document.removeEventListener('submit', onSubmit, true);
    style.remove();
  };
}
