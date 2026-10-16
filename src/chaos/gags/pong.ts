// Pong edges: resting the cursor in a viewport corner starts a rally along the nearer edge against a committee face
// on the opposite edge. A missed ball flies into a random visible element and cracks it.
import { isPaused, onPause, onResume } from '../bus';
import { found } from '../eggs';
import { beep, blip, boom } from '../shared/sfx';

interface Data {
  you: string;
  taunts: string[];
  excuses: string[];
  smashes: string[];
}

interface Member {
  name: string;
  face: string;
}

type Edge = 'top' | 'bottom' | 'left' | 'right';

// Size of the corner zone that starts a rally, in px.
const CORNER = 24;
// Time the cursor must rest in a corner, in ms.
const CAMP = 500;
const COOLDOWN = 1000;
const INSET = 4;
const THICK = 10;
const RADIUS = 8;
const FACE = 22;
const MAX_CRACKS = 25;
// Elements a missed ball can smash.
const TARGETS = 'h1,h2,h3,p,li,img,figure,blockquote,button,.card';
// Chaos UI that never gets smashed.
const SKIP =
  '.sbot,.cap,.pong-crack,.pong-score,.pong-bubble,.chaos-overlay,.rr,.gv-layer,.gv-gone,.gv-porters,.gv-toast,.eggs-toggle,.eggs-list';

const CSS = `
.pong-canvas{position:fixed;inset:0;z-index:2147481000;pointer-events:none;display:none}
.pong-score{position:fixed;left:1rem;bottom:1rem;z-index:2147481000;pointer-events:none;
font:700 .9rem/1 var(--sans,system-ui,sans-serif);color:var(--primary,#152b4e);background:var(--primary-light,#82b3bb);
border:2px solid var(--accent,#e3261c);border-radius:.3rem;padding:.4rem .6rem;display:none}
.pong-bubble{position:fixed;z-index:2147481000;pointer-events:none;max-width:14rem;background:#fff;color:#1d1a17;
font:400 .85rem/1.3 var(--sans,system-ui,sans-serif);border:2px solid var(--primary,#152b4e);border-radius:.6rem;
padding:.4rem .6rem;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.pong-crack{position:absolute;pointer-events:none;z-index:2147482500;overflow:hidden}
.pong-crack svg{position:absolute;inset:0;width:100%;height:100%}
.pong-crack span{position:absolute;transform:translate(-50%,-50%) rotate(-6deg);white-space:nowrap;
font:700 .75rem/1 var(--sans,system-ui,sans-serif);color:#fff;background:var(--accent,#e3261c);padding:.25rem .4rem;
border-radius:.2rem;opacity:.9}
`;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function readJson<T>(id: string): T | null {
  const text = document.getElementById(id)?.textContent;
  return text ? (JSON.parse(text) as T) : null;
}

// Jagged crack lines radiating from (x, y) inside a w x h box.
function crackSvg(w: number, h: number, x: number, y: number): string {
  const reach = Math.max(w, h) * 0.6;
  const rays = 6 + Math.floor(Math.random() * 4);
  let paths = '';
  for (let i = 0; i < rays; i++) {
    let angle = (i / rays) * Math.PI * 2 + Math.random() * 0.5;
    let px = x;
    let py = y;
    let d = `M${px.toFixed(1)} ${py.toFixed(1)}`;
    const steps = 4 + Math.floor(Math.random() * 3);
    for (let s = 0; s < steps; s++) {
      angle += (Math.random() - 0.5) * 0.8;
      const len = (reach / steps) * (0.6 + Math.random() * 0.8);
      px += Math.cos(angle) * len;
      py += Math.sin(angle) * len;
      d += ` L${px.toFixed(1)} ${py.toFixed(1)}`;
    }
    paths += `<path d="${d}"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="none" stroke-linejoin="round">
<g stroke="rgba(255,255,255,.8)" stroke-width="3">${paths}</g><g stroke="#1d1a17" stroke-width="1.4">${paths}</g></svg>`;
}

// True if el sits in a fixed or sticky container, where page-positioned cracks would drift.
function inFixed(el: Element): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const pos = getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

// Random visible element to smash, or null if none is on screen.
function randomTarget(): HTMLElement | null {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const candidates = [...document.querySelectorAll<HTMLElement>(TARGETS)].filter((el) => {
    if (el.closest(SKIP)) return false;
    const r = el.getBoundingClientRect();
    return (
      r.width > 20 && r.height > 10 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
    );
  });
  for (let i = 0; i < 5 && candidates.length; i++) {
    const el = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
    if (!inFixed(el)) return el;
  }
  return null;
}

export default function pong(): (() => void) | void {
  if (matchMedia('(hover: none) and (pointer: coarse)').matches) return;
  const data = readJson<Data>('pong-data');
  const roster = readJson<Member[]>('roster-data');
  if (!data || !roster?.length) return;

  // Speeds halve under reduced motion.
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.5 : 1;
  const START_SPEED = 380 * slow;
  const MAX_SPEED = 1300 * slow;
  const AI_SPEED = 430 * slow;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const canvas = document.createElement('canvas');
  canvas.className = 'pong-canvas';
  const ctx = canvas.getContext('2d')!;
  const score = document.createElement('div');
  score.className = 'pong-score';
  score.setAttribute('aria-hidden', 'true');
  document.body.append(canvas, score);

  let W = 0;
  let H = 0;
  function resize() {
    W = document.documentElement.clientWidth;
    H = document.documentElement.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  let mx = 0;
  let my = 0;
  let playerScore = 0;
  let aiScore = 0;
  let lastEnd = -Infinity;
  let raf = 0;
  let last = 0;
  const cracks: HTMLElement[] = [];
  const timers = new Set<number>();
  let bubble: HTMLElement | null = null;

  // Rally state. Coordinates are local: u runs along the player's edge, v runs from the player edge (0) across to
  // the AI edge (depth()).
  let rally: {
    edge: Edge;
    member: Member;
    img: HTMLImageElement;
    u: number;
    v: number;
    vu: number;
    vv: number;
    speed: number;
    ai: number;
    aim: number;
    // Set once the ball is missed: screen-space flight to the smashed element.
    fly?: { x0: number; y0: number; x1: number; y1: number; t: number; el: HTMLElement | null };
  } | null = null;

  const horizontal = (e: Edge) => e === 'top' || e === 'bottom';
  const length = (e: Edge) => (horizontal(e) ? W : H);
  const depth = (e: Edge) => (horizontal(e) ? H : W);
  const along = (e: Edge) => (horizontal(e) ? mx : my);

  function toScreen(e: Edge, u: number, v: number): [number, number] {
    switch (e) {
      case 'left':
        return [v, u];
      case 'right':
        return [W - v, u];
      case 'top':
        return [u, v];
      case 'bottom':
        return [u, H - v];
    }
  }

  const paddleLen = (e: Edge) => Math.min(120, length(e) * 0.25);
  // Player paddle center: the cursor, clamped so the paddle stays on screen.
  const playerU = (e: Edge) =>
    Math.max(paddleLen(e) / 2, Math.min(length(e) - paddleLen(e) / 2, along(e)));

  function showScore() {
    const name = rally?.member.name.split(' ')[0] ?? '';
    score.textContent = `${data!.you} ${playerScore} - ${aiScore} ${name}`;
    score.style.display = 'block';
  }

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function say(text: string, x: number, y: number) {
    bubble?.remove();
    const b = document.createElement('div');
    b.className = 'pong-bubble';
    b.textContent = text;
    document.body.append(b);
    const r = b.getBoundingClientRect();
    b.style.left = `${Math.max(8, Math.min(W - r.width - 8, x - r.width / 2))}px`;
    b.style.top = `${Math.max(8, Math.min(H - r.height - 8, y - r.height - FACE - 8))}px`;
    bubble = b;
    later(() => {
      b.remove();
      if (bubble === b) bubble = null;
    }, 2500);
  }

  function smash(el: HTMLElement | null, x: number, y: number) {
    boom(250, 0.25);
    if (!el) return;
    el.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: 'translate(-6px,2px) rotate(-1deg)' },
        { transform: 'translate(5px,-3px) rotate(1deg)' },
        { transform: 'translate(-3px,1px)' },
        { transform: 'translate(0,0)' },
      ],
      { duration: 400 / slow },
    );
    const r = el.getBoundingClientRect();
    const crack = document.createElement('div');
    crack.className = 'pong-crack';
    crack.style.left = `${r.left + scrollX}px`;
    crack.style.top = `${r.top + scrollY}px`;
    crack.style.width = `${r.width}px`;
    crack.style.height = `${r.height}px`;
    crack.innerHTML = crackSvg(r.width, r.height, x - r.left, y - r.top);
    const label = document.createElement('span');
    label.textContent = pick(data!.smashes);
    label.style.left = `${x - r.left}px`;
    label.style.top = `${y - r.top}px`;
    crack.append(label);
    document.body.append(crack);
    cracks.push(crack);
    if (cracks.length > MAX_CRACKS) cracks.shift()!.remove();
  }

  function startRally(edge: Edge) {
    found('pong');
    const member = pick(roster!);
    const img = new Image();
    img.src = member.face;
    const angle = (Math.random() - 0.5) * 1.2;
    const L = length(edge);
    rally = {
      edge,
      member,
      img,
      u: Math.max(RADIUS, Math.min(L - RADIUS, along(edge))),
      v: INSET + THICK + RADIUS + 2,
      vu: START_SPEED * Math.sin(angle),
      vv: START_SPEED * Math.cos(angle),
      speed: START_SPEED,
      ai: L / 2,
      aim: 0,
    };
    canvas.style.display = 'block';
    showScore();
    blip();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function endRally() {
    rally = null;
    lastEnd = performance.now();
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
    canvas.style.display = 'none';
  }

  // Ball got past a paddle: score it and send the ball into a random element.
  function miss(byPlayer: boolean) {
    const r = rally!;
    if (byPlayer) aiScore++;
    else playerScore++;
    showScore();
    const [x0, y0] = toScreen(r.edge, r.u, r.v);
    const el = randomTarget();
    const box = el?.getBoundingClientRect();
    const x1 = box ? box.left + box.width * (0.3 + Math.random() * 0.4) : x0;
    const y1 = box ? box.top + box.height * (0.3 + Math.random() * 0.4) : y0;
    r.fly = { x0, y0, x1, y1, t: 0, el };
    const [fx, fy] = toScreen(r.edge, r.ai, depth(r.edge) - INSET - THICK - FACE);
    say(pick(byPlayer ? data!.taunts : data!.excuses), fx, fy);
  }

  function step(dt: number) {
    const r = rally!;
    if (r.fly) {
      r.fly.t += dt / (0.35 / slow);
      if (r.fly.t >= 1) {
        smash(r.fly.el, r.fly.x1, r.fly.y1);
        endRally();
      }
      return;
    }
    const L = length(r.edge);
    const D = depth(r.edge);
    const len = paddleLen(r.edge);
    const near = INSET + THICK;
    const far = D - INSET - THICK;
    const prevV = r.v;
    r.u += r.vu * dt;
    r.v += r.vv * dt;

    // Side walls.
    if (r.u < RADIUS || r.u > L - RADIUS) {
      r.u = Math.max(RADIUS, Math.min(L - RADIUS, r.u));
      r.vu = -r.vu;
      beep(330, 40, 'square', 0.05);
    }

    // AI tracks the ball (plus its aim error) while it is incoming, otherwise drifts to the middle.
    const target = r.vv > 0 ? r.u + r.aim : L / 2;
    const move = Math.max(-AI_SPEED * dt, Math.min(AI_SPEED * dt, target - r.ai));
    r.ai = Math.max(len / 2, Math.min(L - len / 2, r.ai + move));

    const bounce = (center: number, toward: 1 | -1) => {
      const off = Math.max(-1, Math.min(1, (r.u - center) / (len / 2)));
      r.speed = Math.min(MAX_SPEED, r.speed * 1.08);
      const a = off * 1.05;
      r.vu = r.speed * Math.sin(a);
      r.vv = toward * r.speed * Math.cos(a);
      blip();
    };

    if (r.vv < 0 && prevV - RADIUS >= near && r.v - RADIUS < near) {
      if (Math.abs(r.u - playerU(r.edge)) <= len / 2 + RADIUS) {
        r.v = near + RADIUS;
        bounce(playerU(r.edge), 1);
        r.aim = (Math.random() - 0.5) * len * 1.4;
      }
    } else if (r.vv > 0 && prevV + RADIUS <= far && r.v + RADIUS > far) {
      if (Math.abs(r.u - r.ai) <= len / 2 + RADIUS) {
        r.v = far - RADIUS;
        bounce(r.ai, -1);
      }
    }

    if (r.v < -RADIUS) miss(true);
    else if (r.v > D + RADIUS) miss(false);
  }

  function paddle(e: Edge, center: number, v: number, color: string) {
    const len = paddleLen(e);
    const [x0, y0] = toScreen(e, center - len / 2, v);
    const [x1, y1] = toScreen(e, center + len / 2, v + THICK);
    ctx.fillStyle = color;
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  }

  function draw() {
    const r = rally!;
    ctx.clearRect(0, 0, W, H);
    const D = depth(r.edge);
    const L = length(r.edge);

    // Dashed net halfway across.
    ctx.strokeStyle = 'rgba(31,61,122,.25)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(...toScreen(r.edge, 0, D / 2));
    ctx.lineTo(...toScreen(r.edge, L, D / 2));
    ctx.stroke();
    ctx.setLineDash([]);

    paddle(r.edge, playerU(r.edge), INSET, '#82b3bb');
    // AI paddle is gold on the top edge, where red clashes with the header.
    const aiColor = r.edge === 'bottom' ? '#e3261c' : '#152b4e';
    paddle(r.edge, r.ai, D - INSET - THICK, aiColor);

    // AI face just inside its paddle.
    const [fx, fy] = toScreen(r.edge, r.ai, D - INSET - THICK - FACE - 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, FACE, 0, Math.PI * 2);
    ctx.fillStyle = aiColor;
    ctx.fill();
    if (r.img.complete && r.img.naturalWidth) {
      ctx.clip();
      ctx.drawImage(r.img, fx - FACE, fy - FACE, FACE * 2, FACE * 2);
    }
    ctx.restore();
    ctx.strokeStyle = '#e3261c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(fx, fy, FACE, 0, Math.PI * 2);
    ctx.stroke();

    let bx: number;
    let by: number;
    let rad = RADIUS;
    if (r.fly) {
      const t = r.fly.t;
      bx = r.fly.x0 + (r.fly.x1 - r.fly.x0) * t;
      by = r.fly.y0 + (r.fly.y1 - r.fly.y0) * t;
      rad = RADIUS * (1 + t);
    } else {
      [bx, by] = toScreen(r.edge, r.u, r.v);
    }
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, Math.PI * 2);
    ctx.fillStyle = '#e3261c';
    ctx.fill();
    ctx.strokeStyle = '#1d1a17';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function frame(now: number) {
    if (!rally) return;
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    step(dt);
    if (!rally) return;
    draw();
    raf = requestAnimationFrame(frame);
  }

  let camp = 0;

  function onMove(e: MouseEvent) {
    mx = e.clientX;
    my = e.clientY;
    if (rally || isPaused() || document.querySelector('.cap')) return;
    if (performance.now() - lastEnd < COOLDOWN) return;
    const gaps: [Edge, number][] = [
      ['left', mx],
      ['right', W - mx],
      ['top', my],
      ['bottom', H - my],
    ];
    const near = gaps.filter(([, gap]) => gap >= 0 && gap <= CORNER);
    if (near.length < 2) return cancelCamp();
    if (camp) return;
    const [edge] = near.reduce((a, b) => (b[1] < a[1] ? b : a));
    camp = window.setTimeout(() => {
      camp = 0;
      if (!rally && !isPaused()) startRally(edge);
    }, CAMP);
  }

  function cancelCamp() {
    clearTimeout(camp);
    camp = 0;
  }

  function onResize() {
    resize();
    if (rally) rally.u = Math.max(RADIUS, Math.min(length(rally.edge) - RADIUS, rally.u));
  }

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mouseleave', cancelCamp);
  addEventListener('resize', onResize);
  const offPause = onPause(() => {
    cancelCamp();
    cancelAnimationFrame(raf);
    canvas.style.display = 'none';
    if (bubble) bubble.style.display = 'none';
  });
  const offResume = onResume(() => {
    if (bubble) bubble.style.display = '';
    if (!rally) return;
    canvas.style.display = 'block';
    last = performance.now();
    raf = requestAnimationFrame(frame);
  });

  return () => {
    endRally();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseleave', cancelCamp);
    cancelCamp();
    removeEventListener('resize', onResize);
    offPause();
    offResume();
    timers.forEach(clearTimeout);
    [canvas, score, style, bubble, ...cracks].forEach((n) => n?.remove());
  };
}
