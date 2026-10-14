// Full-viewport iframe overlay for /games/<slug>?embed=1. One at a time.
import { url } from '../lib/url';
import { pause, resume } from './bus';

const CSS = `
.chaos-overlay{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex}
.chaos-overlay iframe{flex:1;border:0;width:100%;height:100%}
.chaos-overlay .chaos-close{position:absolute;top:.5rem;right:.5rem;z-index:1;width:2.5rem;height:2.5rem;
border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#000;font:700 1.4rem/1 sans-serif;cursor:pointer}
.chaos-overlay .chaos-close.labelled{width:auto;height:2.2rem;padding:0 .9rem;border-radius:1.1rem;font-size:.95rem}
`;

let current: { el: HTMLElement; opener: Element | null; overflow: string } | null = null;

function injectStyles(): void {
  if (document.getElementById('chaos-overlay-css')) return;
  const style = document.createElement('style');
  style.id = 'chaos-overlay-css';
  style.textContent = CSS;
  document.head.append(style);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}

function onMessage(e: MessageEvent): void {
  if (e.origin === location.origin && e.data?.type === 'chaos:close') close();
}

export function isOpen(): boolean {
  return current !== null;
}

// closeLabel replaces the X with a text button.
export function open(slug: string, closeLabel?: string): void {
  if (current) close();
  injectStyles();
  const el = document.createElement('div');
  el.className = 'chaos-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');

  const iframe = document.createElement('iframe');
  iframe.src = url(`/games/${slug}?embed=1`);
  iframe.title = slug;
  iframe.allow = 'autoplay; fullscreen; gamepad; accelerometer; gyroscope';

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'chaos-close';
  x.setAttribute('aria-label', closeLabel ?? 'Close game');
  x.textContent = closeLabel ?? '×';
  if (closeLabel) x.classList.add('labelled');
  x.addEventListener('click', close);

  el.append(iframe, x);
  current = {
    el,
    opener: document.activeElement,
    overflow: document.documentElement.style.overflow,
  };
  document.documentElement.style.overflow = 'hidden';
  document.body.append(el);
  addEventListener('keydown', onKey);
  addEventListener('message', onMessage);
  pause();
  iframe.addEventListener('load', () => iframe.contentWindow?.focus(), { once: true });
}

export function close(): void {
  if (!current) return;
  const { el, opener, overflow } = current;
  current = null;
  removeEventListener('keydown', onKey);
  removeEventListener('message', onMessage);
  el.remove();
  document.documentElement.style.overflow = overflow;
  if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
  resume();
}
