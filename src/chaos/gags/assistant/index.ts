// Solbee: a floating chat widget that matches what you type to a joke intent and never helps.
import { onPause, onResume } from '../../bus';
import { found } from '../../eggs';
import { blip } from '../../shared/sfx';
import { embeddingMatcher, keywordMatcher, type Intent, type Matcher } from './match';

interface Data {
  name: string;
  avatar: string;
  greeting: string[];
  thinking: string[];
  nudges: string[];
  fallbacks: string[];
  facts: string[];
  intents: Intent[];
}

const CSS = `
.sbot{--sbot-red:var(--primary,#1b2a4a);--sbot-gold:var(--accent,#c8102e);--sbot-slow:1;
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
box-shadow:0 8px 30px rgba(0,0,0,.35);animation:sbot-pop calc(.2s * var(--sbot-slow)) ease-out}
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
.sbot-form{display:flex;border-top:1px solid #e4dccd}
.sbot-form input{flex:1;min-width:0;border:0;padding:.7rem;font:inherit}
.sbot-form button{border:0;background:var(--sbot-red);color:#fff;font:600 .9rem var(--sans,sans-serif);padding:0 1rem;cursor:pointer}
@keyframes sbot-pop{from{transform:scale(.8);opacity:0}}
@keyframes sbot-dot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-.3rem);opacity:1}}
@media (max-width:30rem){.sbot-panel{position:fixed;left:.5rem;right:.5rem;bottom:5.5rem;width:auto;height:auto;top:4.5rem;max-height:none}}
@media (prefers-reduced-motion:reduce){.sbot{--sbot-slow:3}}
`;

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
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
  title.append(
    el('strong', '', `${data.name} (beta)`),
    el('small', '', 'May produce inaccurate information about everything.'),
  );
  const x = el('button', 'sbot-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close chat');
  head.append(headFace, title, x);

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
  panel.append(head, log, form);
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
    log.append(el('div', `sbot-msg sbot-${who}`, text));
    scroll();
  };

  let greeted = false;
  let nudge: HTMLElement | null = null;
  const dropNudge = () => {
    nudge?.remove();
    nudge = null;
  };

  function openPanel(): void {
    dropNudge();
    badge.remove();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (!greeted) {
      greeted = true;
      say(pick(data!.greeting), 'bot');
    }
    input.focus();
  }

  function closePanel(): void {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

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
        nudge.addEventListener('click', openPanel);
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

  btn.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
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
