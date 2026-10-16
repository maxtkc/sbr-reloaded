// Solbee: a floating chat widget that matches what you type to a joke intent and never helps,
// unless you ask for the manager, who searches the site and points at the answer.
import { onPause, onResume } from '../../bus';
import { found } from '../../eggs';
import { blip } from '../../shared/sfx';
import { embeddingMatcher, keywordMatcher, type Intent, type Matcher } from './match';
import { siteSearch, type Hit } from './search';

interface Data {
  name: string;
  avatar: string;
  greeting: string[];
  thinking: string[];
  nudges: string[];
  fallbacks: string[];
  facts: string[];
  intents: Intent[];
  manager: {
    link: string;
    back: string;
    title: string;
    subtitle: string;
    escalate: string[];
    hold: string[];
    intro: string[];
    prefixes: string[];
    also: string;
    show: string;
    open: string;
    misses: string[];
    offline: string;
    photo: string;
    email: string;
  };
  index: string;
}

const CSS = `
.sbot{--sbot-red:var(--primary,#152b4e);--sbot-gold:var(--accent,#e3261c);--sbot-slow:1;
position:fixed;right:1rem;bottom:1rem;z-index:2147482000;font:400 .95rem/1.4 var(--sans,system-ui,sans-serif);color:#1d1a17}
.sbot-btn{position:relative;width:4rem;height:4rem;border-radius:50%;border:3px solid var(--sbot-gold);padding:0;
background:var(--sbot-red);cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.sbot-btn img{width:100%;height:100%;border-radius:50%;object-fit:cover;object-position:center top;display:block}
.sbot-badge{position:absolute;top:-.3rem;left:-.3rem;background:var(--sbot-gold);color:#000;font-weight:700;
font-size:.75rem;border-radius:1rem;padding:.1rem .45rem;pointer-events:none}
.sbot-nudge{position:absolute;right:4.6rem;bottom:.6rem;width:max-content;max-width:min(16rem,calc(100vw - 7rem));
background:#fff;border:1px solid #e4dccd;border-radius:.8rem .8rem 0 .8rem;padding:.5rem .7rem;
box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;animation:sbot-pop calc(.3s * var(--sbot-slow)) ease-out}
.sbot-panel{position:absolute;right:0;bottom:4.8rem;width:21rem;height:28rem;max-height:calc(100vh - 7rem);
display:flex;flex-direction:column;background:#fff;border-radius:.8rem;overflow:hidden;
box-shadow:0 8px 30px rgba(0,0,0,.35);transform-origin:bottom right;animation:sbot-pop calc(.2s * var(--sbot-slow)) ease-out}
.sbot-panel.sbot-closing{animation:sbot-out calc(.15s * var(--sbot-slow)) ease-in forwards}
.sbot-head{display:flex;align-items:center;gap:.6rem;background:var(--sbot-red);color:#fff;padding:.5rem .7rem}
.sbot-head img{width:2.2rem;height:2.2rem;border-radius:50%;background:var(--sbot-gold);object-fit:cover;object-position:center top}
.sbot-head strong{display:block;font-size:1rem}
.sbot-head small{display:block;opacity:.85;font-size:.72rem}
.sbot-x{margin-left:auto;background:none;border:0;color:#fff;font:700 1.4rem/1 sans-serif;cursor:pointer;padding:.2rem .4rem}
.sbot-log{flex:1;overflow-y:auto;padding:.7rem;display:flex;flex-direction:column;gap:.5rem;background:#fbf8f2}
.sbot-msg{max-width:85%;padding:.45rem .7rem;border-radius:.8rem;white-space:pre-wrap;overflow-wrap:anywhere}
.sbot-bot{align-self:flex-start;background:#fff;border:1px solid #e4dccd;border-bottom-left-radius:0}
.sbot-me{align-self:flex-end;background:var(--sbot-red);color:#fff;border-bottom-right-radius:0}
.sbot-status{align-self:flex-start;font-size:.8rem;font-style:italic;color:#5d564e}
.sbot-dots span{display:inline-block;width:.45rem;height:.45rem;margin:0 .12rem;border-radius:50%;background:#5d564e;
animation:sbot-dot calc(1s * var(--sbot-slow)) infinite ease-in-out}
.sbot-dots span:nth-child(2){animation-delay:calc(.15s * var(--sbot-slow))}
.sbot-dots span:nth-child(3){animation-delay:calc(.3s * var(--sbot-slow))}
.sbot-mgr{display:flex;justify-content:flex-end;padding:.2rem .7rem;background:#fbf8f2;border-bottom:1px solid #e4dccd}
.sbot-mgr button{background:none;border:0;padding:0;font:inherit;font-size:.72rem;color:#5d564e;text-decoration:underline;cursor:pointer}
.sbot-mgr button:disabled{opacity:.5;cursor:default}
.sbot-quote{margin-top:.35rem;padding-left:.55rem;border-left:3px solid var(--sbot-gold)}
.sbot-acts{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem}
.sbot-acts a,.sbot-acts button{font:600 .8rem var(--sans,sans-serif);border:1px solid var(--sbot-red);color:var(--sbot-red);
background:#fff;border-radius:1rem;padding:.15rem .65rem;cursor:pointer;text-decoration:none}
.sbot-also{margin-top:.45rem;font-size:.8rem}
.sbot-also button{background:none;border:0;padding:0;font:inherit;color:var(--sbot-red);text-decoration:underline;cursor:pointer}
.sbot-flash{scroll-margin:6rem;animation:sbot-flash calc(2.4s * var(--sbot-slow,1)) ease-out}
@keyframes sbot-flash{0%,45%{outline:3px solid var(--accent,#e3261c);outline-offset:6px}100%{outline:3px solid transparent;outline-offset:6px}}
.sbot-form{display:flex;border-top:1px solid #e4dccd}
.sbot-form input{flex:1;min-width:0;border:0;padding:.7rem;font:inherit}
.sbot-form button{border:0;background:var(--sbot-red);color:#fff;font:600 .9rem var(--sans,sans-serif);padding:0 1rem;cursor:pointer}
@keyframes sbot-pop{from{transform:scale(.8);opacity:0}}
@keyframes sbot-out{to{transform:scale(.8);opacity:0}}
@keyframes sbot-dot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-.3rem);opacity:1}}
@media (max-width:30rem){.sbot-panel{position:fixed;left:.5rem;right:.5rem;bottom:5.5rem;width:auto;height:auto;top:4.5rem;max-height:none}}
@media (prefers-reduced-motion:reduce){.sbot{--sbot-slow:3}}
`;

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const SHOW_KEY = 'sbot-show';
const isPhone = () => matchMedia('(max-width:30rem)').matches;

interface Line {
  who: 'bot' | 'me';
  text: string;
  quote?: string;
}

// First sentences of a passage, about 280 characters at most.
function excerpt(text: string): string {
  let out = '';
  for (const s of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    if (out && out.length + s.length > 280) break;
    out += s;
  }
  out = out.trim();
  return out.length > 320 ? `${out.slice(0, 300).replace(/\s+\S*$/, '')}...` : out;
}

const samePage = (a: URL) => a.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '');

// The block containing the passage: the first matching paragraph or list item at or after the anchor element.
function findTarget(id: string, text: string): HTMLElement | null {
  const anchor = id ? document.getElementById(id) : null;
  const start = squash(text).slice(0, 40);
  if (start) {
    for (const node of document.querySelectorAll<HTMLElement>(
      'p, li, dd, dl, td, blockquote, address',
    )) {
      if (node.closest('.sbot, header, nav')) continue;
      if (
        anchor &&
        anchor !== node &&
        !(anchor.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
        continue;
      if (squash(node.textContent ?? '').includes(start)) return node;
    }
  }
  return anchor;
}

function flash(target: HTMLElement): void {
  target.classList.remove('sbot-flash');
  void target.offsetWidth;
  target.classList.add('sbot-flash');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.addEventListener('animationend', () => target.classList.remove('sbot-flash'), {
    once: true,
  });
}
const rand = (min: number, max: number) => min + Math.random() * (max - min);

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

function readData(): Data | null {
  const script = document.getElementById('assistant-data');
  if (!script?.textContent) return null;
  return JSON.parse(script.textContent) as Data;
}

export default function assistant(matcherType: 'keyword' | 'embedding'): (() => void) | void {
  const data = readData();
  if (!data) return;
  const match: Matcher =
    matcherType === 'embedding' ? embeddingMatcher(data.intents) : keywordMatcher(data.intents);
  const site = siteSearch(data.index);
  const mgr = data.manager;

  const style = el('style', '', CSS);
  const root = el('div', 'sbot');

  const btn = el('button', 'sbot-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', `Chat with ${data.name}`);
  btn.setAttribute('aria-expanded', 'false');
  const face = el('img');
  face.src = data.avatar;
  face.alt = '';
  const badge = el('span', 'sbot-badge', '1');
  badge.setAttribute('aria-hidden', 'true');
  btn.append(face, badge);

  const panel = el('div', 'sbot-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', data.name);
  panel.hidden = true;
  const head = el('div', 'sbot-head');
  const headFace = el('img');
  headFace.src = data.avatar;
  headFace.alt = '';
  const title = el('div');
  const titleName = el('strong', '', `${data.name} (beta)`);
  const titleSub = el('small', '', 'May produce inaccurate information about everything.');
  title.append(titleName, titleSub);
  const x = el('button', 'sbot-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close chat');
  head.append(headFace, title, x);

  const mgrRow = el('div', 'sbot-mgr');
  const mgrBtn = el('button', '', mgr.link);
  mgrBtn.type = 'button';
  mgrRow.append(mgrBtn);

  const log = el('div', 'sbot-log');
  log.setAttribute('aria-live', 'polite');
  const form = el('form', 'sbot-form');
  const input = el('input');
  input.type = 'text';
  input.placeholder = 'Ask me anything (please don’t)';
  input.setAttribute('aria-label', 'Message');
  input.maxLength = 300;
  const send = el('button', '', 'Send');
  send.type = 'submit';
  form.append(input, send);
  panel.append(head, mgrRow, log, form);
  root.append(panel, btn);
  document.head.append(style);
  document.body.append(root);

  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const scroll = () => (log.scrollTop = log.scrollHeight);
  const say = (text: string, who: 'bot' | 'me') => {
    const msg = el('div', `sbot-msg sbot-${who}`, text);
    log.append(msg);
    scroll();
    return msg;
  };

  let greeted = false;
  let nudge: HTMLElement | null = null;
  const dropNudge = () => {
    nudge?.remove();
    nudge = null;
  };

  const isOpen = () => !panel.hidden && !panel.classList.contains('sbot-closing');

  function openPanel(focus = true): void {
    dropNudge();
    badge.remove();
    panel.classList.remove('sbot-closing');
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (!greeted) {
      greeted = true;
      say(pick(data!.greeting), 'bot');
    }
    if (focus) input.focus();
  }

  // Plays the shrink animation, then hides the panel unless it was reopened meanwhile.
  function closePanel(): void {
    if (!isOpen()) return;
    btn.setAttribute('aria-expanded', 'false');
    panel.classList.add('sbot-closing');
    const finish = () => {
      if (!panel.classList.contains('sbot-closing')) return;
      panel.classList.remove('sbot-closing');
      panel.hidden = true;
    };
    panel.addEventListener('animationend', function end(e) {
      if (e.target !== panel) return;
      panel.removeEventListener('animationend', end);
      finish();
    });
    later(finish, 600);
  }

  // The log as plain lines, for carrying the chat across a page change.
  const transcript = (): Line[] =>
    [...log.querySelectorAll<HTMLElement>('.sbot-msg:not(.sbot-dots)')].map((m) => ({
      who: m.classList.contains('sbot-me') ? 'me' : 'bot',
      text: m.firstChild?.textContent ?? '',
      quote: m.querySelector<HTMLElement>('.sbot-quote')?.innerText,
    }));

  // Typing indicator, optionally cycling status lines while it "thinks" for far too long.
  function typing(): { status: HTMLElement; done: () => void } {
    const dots = el('div', 'sbot-msg sbot-bot sbot-dots');
    dots.append(el('span'), el('span'), el('span'));
    const status = el('div', 'sbot-status');
    log.append(dots, status);
    scroll();
    return {
      status,
      done: () => {
        dots.remove();
        status.remove();
      },
    };
  }

  // Replies serialize so overlapping messages answer in order.
  let queue = Promise.resolve();
  const lastReply = new Map<string, string>();

  function reply(message: string): void {
    if (manager) return managerReply(message);
    queue = queue.then(async () => {
      const indicator = typing();
      const slow = Math.random() < 1 / 7;
      let status = 0;
      const cycle = window.setInterval(() => {
        indicator.status.textContent = data!.thinking[status++ % data!.thinking.length];
        scroll();
      }, 2500);
      if (slow) indicator.status.textContent = pick(data!.thinking);
      const wait = slow ? rand(8000, 15000) : rand(600, 2500);
      const [intent] = await Promise.all([
        match(message),
        new Promise<void>((resolve) => later(resolve, wait)),
      ]);
      clearInterval(cycle);
      indicator.done();

      const pool = intent ? intent.replies : data!.fallbacks;
      const key = intent?.id ?? '';
      const options = pool.length > 1 ? pool.filter((r) => r !== lastReply.get(key)) : pool;
      let text = pick(options);
      lastReply.set(key, text);
      if (Math.random() < 1 / 5) text += `\n\n${pick(data!.facts)}`;
      say(text, 'bot');
      blip();
    });
  }

  // Manager mode: Soleh answers from the site search index.
  let manager = false;

  // Scrolls to the passage, or stores it and navigates when it is on another page.
  // On phones the panel covers the page, so it closes first; on desktop it stays open.
  function show(href: string, text: string): void {
    const dest = new URL(href, location.href);
    if (!samePage(dest)) {
      try {
        const open = !isPhone();
        sessionStorage.setItem(
          SHOW_KEY,
          JSON.stringify({
            path: dest.pathname,
            id: dest.hash.slice(1),
            text,
            open,
            manager,
            log: open ? transcript() : [],
          }),
        );
      } catch {
        // Without storage the page still opens at the anchor.
      }
      location.href = dest.href;
      return;
    }
    const target = findTarget(decodeURIComponent(dest.hash.slice(1)), text);
    if (!target) return;
    if (isPhone()) closePanel();
    flash(target);
  }

  function action(label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', '', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function sayHits(hits: Hit[]): void {
    const [top, ...rest] = hits;
    const msg = say(pick(mgr.prefixes), 'bot');
    const quote = el('div', 'sbot-quote');
    if (top.title && !top.text.startsWith(top.title))
      quote.append(el('strong', '', top.title), el('br'));
    quote.append(excerpt(top.text));
    msg.append(quote);
    // Internal links (e.g. a quick link to the map) are better targets than the place the link sits.
    const internal =
      top.link?.startsWith('/') && !/\.\w+$/.test(new URL(top.link, location.href).pathname);
    const acts = el('div', 'sbot-acts');
    acts.append(action(mgr.show, () => (internal ? show(top.link!, '') : show(top.url, top.text))));
    if (top.link && !internal) {
      const a = el('a', '', mgr.open);
      a.href = top.link;
      a.target = '_blank';
      a.rel = 'noopener';
      acts.append(a);
    }
    msg.append(acts);
    const others = rest.filter((h) => h.url !== top.url && h.score >= top.score * 0.75);
    if (others.length) {
      const also = el('div', 'sbot-also', `${mgr.also} `);
      others.forEach((h, i) => {
        if (i) also.append(', ');
        also.append(action(h.title || excerpt(h.text).slice(0, 40), () => show(h.url, h.text)));
      });
      msg.append(also);
    }
    scroll();
  }

  function managerReply(message: string): void {
    queue = queue.then(async () => {
      const indicator = typing();
      const [hits] = await Promise.all([
        site.search(message).catch((err) => {
          console.error('assistant site search failed', err);
          return null;
        }),
        new Promise<void>((resolve) => later(resolve, rand(600, 1500))),
      ]);
      indicator.done();
      if (!hits) say(mgr.offline, 'bot');
      else if (hits.length) sayHits(hits);
      else {
        const msg = say(pick(mgr.misses), 'bot');
        if (mgr.email) {
          const acts = el('div', 'sbot-acts');
          const a = el('a', '', mgr.email);
          a.href = `mailto:${mgr.email}`;
          acts.append(a);
          msg.append(acts);
          scroll();
        }
      }
      blip();
    });
  }

  function setHeader(): void {
    headFace.src = manager ? mgr.photo : data!.avatar;
    titleName.textContent = manager ? mgr.title : `${data!.name} (beta)`;
    titleSub.textContent = manager
      ? mgr.subtitle
      : 'May produce inaccurate information about everything.';
    panel.setAttribute('aria-label', manager ? mgr.title : data!.name);
  }

  function escalate(): void {
    manager = true;
    mgrBtn.disabled = true;
    site.preload();
    queue = queue.then(async () => {
      say(pick(mgr.escalate), 'bot');
      const indicator = typing();
      let line = 0;
      indicator.status.textContent = mgr.hold[line++ % mgr.hold.length];
      const cycle = window.setInterval(() => {
        indicator.status.textContent = mgr.hold[line++ % mgr.hold.length];
      }, 1800);
      await new Promise<void>((resolve) => later(resolve, rand(3000, 6000)));
      clearInterval(cycle);
      indicator.done();
      setHeader();
      say(pick(mgr.intro), 'bot');
      blip();
      mgrBtn.textContent = mgr.back;
      mgrBtn.disabled = false;
    });
  }

  function deescalate(): void {
    manager = false;
    mgrBtn.disabled = true;
    queue = queue.then(() => {
      setHeader();
      say(pick(data!.greeting), 'bot');
      mgrBtn.textContent = mgr.link;
      mgrBtn.disabled = false;
    });
  }

  mgrBtn.addEventListener('click', () => (manager ? deescalate() : escalate()));

  // Highlights a passage that "Show me" navigated here for, once the browser's smooth jump to the hash has stopped.
  // On desktop the chat reopens as it was left.
  try {
    const pending = JSON.parse(sessionStorage.getItem(SHOW_KEY) ?? 'null') as {
      path: string;
      id: string;
      text: string;
      open?: boolean;
      manager?: boolean;
      log?: Line[];
    } | null;
    sessionStorage.removeItem(SHOW_KEY);
    if (pending && samePage(new URL(pending.path, location.href))) {
      if (pending.open) {
        if (pending.manager) {
          manager = true;
          site.preload();
          setHeader();
          mgrBtn.textContent = mgr.back;
        }
        for (const line of pending.log ?? []) {
          const msg = say(line.text, line.who);
          if (line.quote) msg.append(el('div', 'sbot-quote', line.quote));
        }
        greeted = (pending.log ?? []).length > 0;
        openPanel(false);
        scroll();
      }
      let lastY = -1;
      let tries = 0;
      const settle = () => {
        if (scrollY === lastY || ++tries > 30) {
          const target = findTarget(decodeURIComponent(pending.id), pending.text);
          if (target) flash(target);
        } else {
          lastY = scrollY;
          later(settle, 150);
        }
      };
      later(settle, 150);
    }
  } catch {
    // Storage unavailable: nothing to highlight.
  }

  // Unprompted popup beside the closed button, once per page, 30-60s in. Timer restarts on resume.
  let nudgeId: number | undefined;
  let nudged = false;
  const scheduleNudge = () => {
    if (nudged) return;
    nudgeId = window.setTimeout(
      () => {
        nudged = true;
        if (!panel.hidden) return;
        nudge = el('div', 'sbot-nudge', pick(data!.nudges));
        nudge.addEventListener('click', () => openPanel());
        root.append(nudge);
        blip();
        later(dropNudge, 12000);
      },
      rand(30000, 60000),
    );
  };
  scheduleNudge();
  const offPause = onPause(() => clearTimeout(nudgeId));
  const offResume = onResume(scheduleNudge);

  btn.addEventListener('click', () => (isOpen() ? closePanel() : openPanel()));
  x.addEventListener('click', () => {
    closePanel();
    btn.focus();
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePanel();
      btn.focus();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    say(message, 'me');
    found('assistant');
    reply(message);
  });

  return () => {
    clearTimeout(nudgeId);
    timers.forEach(clearTimeout);
    offPause();
    offResume();
    root.remove();
    style.remove();
  };
}
