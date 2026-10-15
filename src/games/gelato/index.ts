// Jack's Gelato stand: a lemonade-stand loop on Bene't Street. Plan the day, watch the queue, read the report.
import { beep, blip, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  name: string;
  face: string;
}

interface Weather {
  id: string;
  name: string;
  demand: number;
  pay: number;
  sky: string;
  rain: number;
  sun: boolean;
}

type Event = (typeof data.events)[number];
type Flavour = (typeof data.flavours)[number];
type PersonState = 'pass' | 'queue' | 'served' | 'leave';
type Phase = 'plan' | 'day' | 'closing' | 'report' | 'end';

interface Bubble {
  text: string;
  t: number;
}

interface Person {
  x: number;
  target: number;
  // 0 = back of the pavement (queue and shop floor), 1 = front (walking past).
  lane: number;
  dir: 1 | -1;
  state: PersonState;
  tourist: boolean;
  face?: HTMLImageElement;
  coat: string;
  flavour: number;
  bubble?: Bubble;
  // Lines a passer-by says when they reach the shop, then the seconds they stop for.
  remark?: readonly string[];
  pause: number;
  walk: number;
}

interface Arrival {
  t: number;
  tourist: boolean;
  will: number;
  flavour: number;
  patience: number;
  roster: number;
}

interface DayStats {
  sold: number;
  revenue: number;
  tubCost: number;
  lostPrice: number;
  lostQueue: number;
  lostSoldOut: number;
  lostClosing: number;
  byFlavour: number[];
}

const E = data.economy;
const WEATHER = data.weather as Weather[];
// Simulated day length in seconds (11:00 to 23:00).
const DAY = 18;
const OPEN_HOUR = 11;
const HOURS = 12;
const COATS = ['#3a5a8c', '#8c3a3a', '#3a7a4f', '#7a5a2a', '#5a3a7a', '#2a6a7a', '#555'];
const BUBBLE_TIME = 1.8;
const SCOOPS = ['#f6d0e0', '#c8e6c0', '#f0e6c8'];

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gbp = (n: number) => `${n < 0 ? '-' : ''}GBP ${Math.abs(n).toFixed(2)}`;

function readRoster(): RosterEntry[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

function loadBest(): number | null {
  try {
    const v = localStorage.getItem('gelato-best');
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('gelato-best', String(n));
  } catch {
    // Storage blocked: best is not kept.
  }
}

// Small DOM builder: h('p', { class: 'x' }, 'text', child).
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

const CSS = `
.gl { position: absolute; inset: 0; overflow: hidden; font-family: system-ui, sans-serif; }
.gl canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.gl-panel { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 0.5rem; box-sizing: border-box; background: rgba(20, 20, 30, 0.35); }
.gl-panel[hidden] { display: none; }
.gl-card { width: 100%; max-width: 30rem; max-height: 100%; overflow: auto; box-sizing: border-box;
  background: #f4efe4; color: #22202a; border: 3px solid #d1b948; border-radius: 10px; padding: 0.9rem 1rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4); }
.gl-card h2 { margin: 0 0 0.2rem; font: 700 1.3rem/1.2 Georgia, serif; color: #7a0f1f; }
.gl-card p { margin: 0.35rem 0; font-size: 0.92rem; line-height: 1.35; }
.gl-card .sub { color: #5a5560; font-size: 0.85rem; }
.gl-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0.45rem 0; }
.gl-row label { font-weight: 600; font-size: 0.95rem; }
.gl-step { display: flex; align-items: center; gap: 0.35rem; }
.gl-step output { min-width: 6.5rem; text-align: center; font-variant-numeric: tabular-nums; font-weight: 700; }
.gl button { font: inherit; cursor: pointer; border-radius: 6px; border: 1px solid #7a0f1f; background: #fff;
  color: #7a0f1f; padding: 0.35rem 0.6rem; touch-action: manipulation; }
.gl button:disabled { opacity: 0.4; cursor: default; }
.gl .gl-step button { width: 2.2rem; font-weight: 700; }
.gl .gl-go { display: block; width: 100%; margin-top: 0.7rem; padding: 0.6rem; background: #7a0f1f; color: #fff;
  font-weight: 700; border-color: #d1b948; }
.gl-flavours { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; margin: 0.3rem 0; }
.gl-flavours button { text-align: left; font-size: 0.85rem; color: #22202a; border-color: #bbb; }
.gl-flavours button[aria-pressed='true'] { background: #d1b948; border-color: #7a0f1f; font-weight: 700; }
.gl table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin: 0.4rem 0; }
.gl td { padding: 0.15rem 0; }
.gl td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.gl tr.total td { border-top: 1px solid #22202a; font-weight: 700; }
.gl .fact { background: #7a0f1f; color: #f4efe4; border-left: 4px solid #d1b948; padding: 0.4rem 0.6rem;
  border-radius: 4px; }
.gl a { color: #7a0f1f; font-weight: 600; }
@media (max-width: 420px) { .gl-flavours { grid-template-columns: 1fr; } }
`;

export default function start(root: HTMLElement): () => void {
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const roster = readRoster();
  const faces = roster.map((r) => {
    const img = new Image();
    img.src = r.face;
    return img;
  });

  const style = h('style', {}, CSS);
  const wrap = h('div', { class: 'gl' });
  const canvas = h('canvas');
  const panel = h('div', { class: 'gl-panel' });
  wrap.append(canvas, panel);
  root.append(style, wrap);
  const ctx = canvas.getContext('2d')!;

  let W = 0;
  let H = 0;
  function resize(): void {
    const dpr = devicePixelRatio || 1;
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  // Game state.
  let phase: Phase = 'plan';
  let day = 1;
  let cash = E.startCash;
  let stock = 0;
  let price = E.startPrice;
  let tubs = 4;
  let weather = WEATHER[0];
  let forecast = WEATHER[0];
  let event: Event = data.events[0];
  let menu: Flavour[] = [];
  let chosen: number[] = [];
  let stats: DayStats = emptyStats();
  let history: number[] = [];

  // Day simulation state.
  let simT = 0;
  let fast = false;
  let arrivals: Arrival[] = [];
  let nextArrival = 0;
  let serveTimer = 0;
  let people: Person[] = [];
  let queue: Person[] = [];
  let closingTimer = 0;
  const jack: Person = {
    get x() {
      return counterX() + unit() * 0.95;
    },
    target: 0,
    lane: 0,
    dir: -1,
    state: 'queue',
    tourist: false,
    coat: '#f4efe4',
    flavour: 0,
    pause: 0,
    walk: 0,
  };
  const clouds = [0.1, 0.45, 0.8].map((x) => ({ x, y: rand(0.04, 0.16), s: rand(0.8, 1.3) }));
  let rainSeed = 0;

  function emptyStats(): DayStats {
    return {
      sold: 0,
      revenue: 0,
      tubCost: 0,
      lostPrice: 0,
      lostQueue: 0,
      lostSoldOut: 0,
      lostClosing: 0,
      byFlavour: [],
    };
  }

  // Sizes derived from the viewport.
  const unit = () => Math.max(26, Math.min(64, H * 0.1, W * 0.09));
  const groundY = () => H * 0.62;
  const shopW = () => Math.min(W * 0.55, unit() * 6.5);
  const shopL = () => W / 2 - shopW() / 2;
  const shopR = () => W / 2 + shopW() / 2;
  const counterX = () => shopR() - unit() * 1.5;
  const spacing = () => unit() * 0.5;
  // Queue runs from the counter out of the shop door to the left.
  const slotX = (i: number) => counterX() - unit() * 0.4 - i * spacing();
  const backFeet = () => groundY() + unit() * 0.3;
  const frontFeet = () => groundY() + unit() * 1.5;
  const feetY = (p: Person) => backFeet() + p.lane * (frontFeet() - backFeet());

  // ---- Planning ----

  function newDay(): void {
    // Nothing to sell and no money for tubs.
    if (stock === 0 && cash < E.tubCost) {
      showEnd();
      return;
    }
    weather = pick(WEATHER);
    forecast =
      Math.random() < data.forecastAccuracy ? weather : pick(WEATHER.filter((w) => w !== weather));
    event = day === 1 ? data.events[0] : pick(data.events);
    const pool = [...data.flavours].sort(() => Math.random() - 0.5);
    menu = pool.slice(0, 6);
    chosen = [];
    tubs = Math.min(tubs, maxTubs());
    people = [];
    queue = [];
    showPlan();
  }

  const maxTubs = () => Math.max(0, Math.floor(cash / E.tubCost));

  function stepper(
    value: () => string,
    dec: () => void,
    inc: () => void,
    canDec: () => boolean,
    canInc: () => boolean,
  ) {
    const out = h('output', {}, value());
    const minus = h('button', { type: 'button', 'aria-label': 'Less' }, '-');
    const plus = h('button', { type: 'button', 'aria-label': 'More' }, '+');
    const sync = () => {
      out.textContent = value();
      minus.disabled = !canDec();
      plus.disabled = !canInc();
    };
    minus.addEventListener('click', () => {
      dec();
      blip();
      refresh();
    });
    plus.addEventListener('click', () => {
      inc();
      blip();
      refresh();
    });
    return { el: h('div', { class: 'gl-step' }, minus, out, plus), sync };
  }

  let refresh = () => {};

  function showPlan(): void {
    phase = 'plan';
    const card = h('div', { class: 'gl-card' });
    const priceStep = stepper(
      () => gbp(price),
      () => (price = Math.max(E.minPrice, price - 0.25)),
      () => (price = Math.min(E.maxPrice, price + 0.25)),
      () => price > E.minPrice,
      () => price < E.maxPrice,
    );
    const tubStep = stepper(
      () => `${tubs} (${gbp(tubs * E.tubCost)})`,
      () => (tubs = Math.max(0, tubs - 1)),
      () => (tubs = Math.min(maxTubs(), tubs + 1)),
      () => tubs > 0,
      () => tubs < maxTubs(),
    );
    const flavourBtns = menu.map((f, i) => {
      const b = h('button', { type: 'button', 'aria-pressed': 'false' }, f.name);
      b.addEventListener('click', () => {
        if (chosen.includes(i)) chosen = chosen.filter((c) => c !== i);
        else if (chosen.length < 3) chosen.push(i);
        else chosen = [...chosen.slice(1), i];
        blip();
        refresh();
      });
      return b;
    });
    const stockLine = h('p', { class: 'sub' });
    const go = h('button', { type: 'button', class: 'gl-go' }, 'Open the stand');
    go.addEventListener('click', openStand);

    refresh = () => {
      priceStep.sync();
      tubStep.sync();
      flavourBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(chosen.includes(i))));
      const total = stock + tubs * E.scoopsPerTub;
      stockLine.textContent = `Scoops ready: ${total} (${stock} left from yesterday). Pitch fee tonight: ${gbp(E.pitchFee)}.`;
      go.disabled = chosen.length === 0 || total === 0;
      go.textContent =
        chosen.length === 0
          ? 'Pick at least one flavour'
          : total === 0
            ? 'Buy some tubs'
            : 'Open the stand';
    };

    card.append(
      h('h2', {}, `Day ${day} of ${E.days}: ${data.weekdays[(day - 1) % 7]}`),
      day === 1 ? h('p', { class: 'sub' }, data.subtitle) : '',
      h(
        'p',
        {},
        h('strong', {}, 'Forecast: '),
        `${forecast.name} (Met Office confidence: ${Math.round(data.forecastAccuracy * 100)}%)`,
      ),
      h('p', {}, h('strong', {}, `${event.name}. `), event.blurb),
      h('p', {}, h('strong', {}, 'Cash: '), gbp(cash)),
      h('div', { class: 'gl-row' }, h('label', {}, 'Price per scoop'), priceStep.el),
      h('div', { class: 'gl-row' }, h('label', {}, `Tubs (${E.scoopsPerTub} scoops)`), tubStep.el),
      stockLine,
      h(
        'p',
        {},
        h('strong', {}, "Today's flavours "),
        h('span', { class: 'sub' }, '(pick up to 3)'),
      ),
      h('div', { class: 'gl-flavours' }, ...flavourBtns),
      go,
      day === 1 ? h('p', { class: 'sub' }, data.intro) : '',
    );
    panel.replaceChildren(card);
    panel.hidden = false;
    refresh();
  }

  // ---- Day ----

  function openStand(): void {
    stats = emptyStats();
    stats.tubCost = tubs * E.tubCost;
    stats.byFlavour = chosen.map(() => 0);
    cash -= stats.tubCost;
    stock += tubs * E.scoopsPerTub;
    arrivals = makeArrivals();
    nextArrival = 0;
    simT = 0;
    serveTimer = 0;
    fast = false;
    phase = 'day';
    panel.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    beep(660, 120, 'triangle', 0.08);
  }

  function makeArrivals(): Arrival[] {
    const n = Math.round(E.baseCustomers * weather.demand * event.demand * rand(0.85, 1.15));
    const list: Arrival[] = [];
    for (let i = 0; i < n; i++) {
      const tourist = Math.random() < event.tourists;
      // Each customer rates every offered flavour and wants their favourite.
      let best = 0;
      let flavour = 0;
      chosen.forEach((fi, ci) => {
        const score = menu[fi].appeal * rand(0.6, 1.4);
        if (score > best) {
          best = score;
          flavour = ci;
        }
      });
      list.push({
        // Two-random average peaks mid-afternoon.
        t: ((Math.random() + Math.random()) / 2) * DAY * 0.96,
        tourist,
        will: (tourist ? rand(4, 9) : rand(2.5, 6)) * weather.pay * best,
        flavour,
        patience: rand(8, 30) + (tourist ? 10 : 0),
        roster:
          faces.length && Math.random() < 0.12 ? Math.floor(Math.random() * faces.length) : -1,
      });
    }
    return list.sort((a, b) => a.t - b.t);
  }

  // Shows a speech bubble unless another one is already nearby.
  function say(p: Person, lines: readonly string[], chance = 1, time = BUBBLE_TIME): void {
    if (Math.random() >= chance) return;
    const text = pick(lines);
    const [l, r] = bubbleSpan(p.x, text);
    const clash = (o: Person) => {
      if (o === p || !o.bubble) return false;
      const [ol, or] = bubbleSpan(o.x, o.bubble.text);
      return l < or + 6 && ol < r + 6;
    };
    if (people.some(clash)) return;
    p.bubble = { text, t: time };
  }

  // Everyone walks along the front of the pavement; buyers step back into the queue.
  function spawn(a: Arrival): void {
    const u = unit();
    const dir = Math.random() < 0.5 ? 1 : -1;
    const p: Person = {
      x: dir > 0 ? -u : W + u,
      target: 0,
      lane: 1,
      dir,
      state: 'pass',
      tourist: a.tourist,
      face: a.roster >= 0 ? faces[a.roster] : undefined,
      coat: pick(COATS),
      flavour: a.flavour,
      pause: 0,
      walk: Math.random() * 6,
    };
    people.push(p);
    if (p.face) say(p, data.bubbles.roster, 0.6);
    let lines: readonly string[] | null = null;
    if (stock <= 0) {
      stats.lostSoldOut++;
      lines = data.bubbles.soldOut;
    } else if (price > a.will) {
      stats.lostPrice++;
      lines = data.bubbles.price;
    } else if (queue.length > a.patience) {
      stats.lostQueue++;
      lines = data.bubbles.queue;
    } else {
      p.state = 'queue';
      queue.push(p);
      // Start behind the tail when it stretches off the left edge.
      if (dir > 0) p.x = Math.min(p.x, slotX(queue.length - 1) - u * 2);
      if (!p.bubble) say(p, data.bubbles.join, 0.08);
    }
    if (lines) {
      // Stop in front of the shop, complain, walk on.
      p.remark = lines;
      p.target = W / 2 + rand(-0.35, 0.35) * shopW();
    }
  }

  function disperse(lines: readonly string[]): void {
    for (const p of queue) {
      p.state = 'leave';
      say(p, lines, 0.35);
    }
    queue = [];
  }

  function update(dt: number): void {
    rainSeed += dt;
    for (const c of clouds) {
      c.x += dt * 0.01 * c.s;
      if (c.x > 1.2) c.x = -0.2;
    }
    if (phase === 'day' || phase === 'closing') simulate(dt * (fast ? 4 : 1) * slow);
  }

  function simulate(dt: number): void {
    const u = unit();
    if (phase === 'day') {
      simT += dt;
      while (nextArrival < arrivals.length && arrivals[nextArrival].t <= simT)
        spawn(arrivals[nextArrival++]);
      // Serve the head of the queue once they reach the counter.
      serveTimer -= dt;
      const head = queue[0];
      if (head && serveTimer <= 0 && Math.abs(head.x - slotX(0)) < u * 0.15 && stock > 0) {
        queue.shift();
        head.state = 'served';
        stock--;
        stats.sold++;
        stats.revenue += price;
        stats.byFlavour[head.flavour]++;
        say(head, data.bubbles.served, 0.12);
        serveTimer = DAY / E.capacity;
        beep(1200 + Math.random() * 300, 40, 'triangle', 0.03);
        if (stock <= 0) {
          boom(200, 0.15);
          disperse(data.bubbles.soldOut);
        }
      }
      if (simT >= DAY) {
        phase = 'closing';
        closingTimer = 2.5;
        stats.lostClosing += queue.length;
        disperse(data.bubbles.closing);
      }
    } else {
      closingTimer -= dt;
    }

    const speed = u * 7;
    queue.forEach((p, i) => (p.target = slotX(i)));
    const gone = new Set<Person>();
    for (const p of people) {
      if (p.bubble) {
        p.bubble.t -= dt;
        if (p.bubble.t <= 0) p.bubble = undefined;
      }
      let goal = p.x;
      let lane = 1;
      if (p.state === 'queue') {
        goal = p.target;
        // Step back off the walkway once level with the tail, then stay in line.
        if (p.lane < 0.5 || Math.abs(goal - p.x) < u * 0.6) lane = 0;
      } else if (p.state === 'pass') {
        if (p.remark && Math.abs(p.target - p.x) < 1) {
          say(p, p.remark, 1, BUBBLE_TIME + 1);
          p.remark = undefined;
          p.pause = 0.8;
        }
        if (p.remark) goal = p.target;
        else if (p.pause > 0) p.pause -= dt;
        else goal = p.dir > 0 ? W + u * 2 : -u * 2;
      } else if (p.lane > 0.8) {
        // Served carry on the way they were going, the dispersed queue goes back out the door.
        goal = p.state === 'served' && p.dir > 0 ? W + u * 2 : -u * 2;
      }
      p.lane += Math.sign(lane - p.lane) * Math.min(Math.abs(lane - p.lane), dt * 3);
      const d = goal - p.x;
      const step = Math.min(Math.abs(d), speed * dt);
      p.x += Math.sign(d) * step;
      if (step > 0.01) p.walk += dt * 10;
      if (p.state !== 'queue' && (p.x < -u * 1.5 || p.x > W + u * 1.5) && Math.abs(d) < u)
        gone.add(p);
    }
    people = people.filter((p) => !gone.has(p));

    if (phase === 'closing' && (closingTimer <= 0 || people.length === 0)) endDay();
  }

  // ---- Report ----

  function endDay(): void {
    phase = 'report';
    cash += stats.revenue - E.pitchFee;
    const leftover = stock;
    stock = Math.floor(stock * E.melt);
    history.push(cash);
    const profit = stats.revenue - stats.tubCost - E.pitchFee;
    profit >= 0 ? fanfare() : beep(220, 400, 'sawtooth', 0.06);

    const sales = chosen.map((fi, ci) => ({ name: menu[fi].name, n: stats.byFlavour[ci] }));
    sales.sort((a, b) => b.n - a.n);
    const flop =
      sales.length > 1 && sales[0].n > 0 && sales[sales.length - 1].n === 0
        ? sales[sales.length - 1]
        : null;

    const row = (label: string, value: string, cls = '') =>
      h('tr', cls ? { class: cls } : {}, h('td', {}, label), h('td', {}, value));
    const buttery = h(
      'a',
      { href: data.butteryUrl, target: '_blank', rel: 'noopener' },
      'Buttery hours',
    );
    const last = day >= E.days || cash < 0;
    const next = h(
      'button',
      { type: 'button', class: 'gl-go' },
      last ? 'Close the books' : 'Next day',
    );
    next.addEventListener('click', () => {
      blip();
      if (last) showEnd();
      else {
        day++;
        newDay();
      }
    });

    const card = h(
      'div',
      { class: 'gl-card' },
      h('h2', {}, `Day ${day} report`),
      h(
        'p',
        { class: 'sub' },
        `Weather: ${weather.name}${weather === forecast ? '' : ` (forecast said ${forecast.name})`}. ${event.name}.`,
      ),
      h(
        'table',
        {},
        row('Scoops sold', `${stats.sold} at ${gbp(price)}`),
        row('Takings', gbp(stats.revenue)),
        row('Tubs', `-${gbp(stats.tubCost)}`),
        row('Pitch fee', `-${gbp(E.pitchFee)}`),
        row('Profit', gbp(profit), 'total'),
        row('Cash', gbp(cash), 'total'),
      ),
      h(
        'p',
        { class: 'sub' },
        `Walked off: ${stats.lostPrice} at the price, ${stats.lostQueue} at the queue, ${stats.lostSoldOut} sold out, ${stats.lostClosing} at closing time. ` +
          `${leftover} scoops left, ${stock} survive the night.`,
      ),
      sales[0].n
        ? h('p', {}, h('strong', {}, 'Bestseller: '), `${sales[0].name} (${sales[0].n})`)
        : h('p', {}, h('strong', {}, 'Bestseller: '), 'nothing. Not one scoop.'),
      flop ? h('p', {}, h('strong', {}, 'Nobody wanted: '), flop.name) : '',
      h('p', { class: 'sub' }, pick(data.reports)),
      h('p', { class: 'fact' }, pick(data.facts)),
      h('p', { class: 'sub' }, 'Cannot face the queue? Check the ', buttery, ' instead.'),
      next,
    );
    panel.replaceChildren(card);
    panel.hidden = false;
  }

  function showEnd(): void {
    phase = 'end';
    const bankrupt = cash < 0 || (stock === 0 && cash < E.tubCost);
    const best = loadBest();
    const record = !bankrupt && (best === null || cash > best);
    if (record) saveBest(cash);
    bankrupt ? boom(500, 0.25) : fanfare();
    const again = h('button', { type: 'button', class: 'gl-go' }, 'Start again');
    again.addEventListener('click', () => {
      blip();
      day = 1;
      cash = E.startCash;
      stock = 0;
      price = E.startPrice;
      tubs = 4;
      history = [];
      newDay();
    });
    panel.replaceChildren(
      h(
        'div',
        { class: 'gl-card' },
        h('h2', {}, bankrupt ? 'Repossessed' : 'Week over'),
        h('p', {}, bankrupt ? data.end.bankrupt : data.end.week),
        h(
          'p',
          {},
          h('strong', {}, 'Final cash: '),
          gbp(cash),
          ` (started with ${gbp(E.startCash)})`,
        ),
        h('p', { class: 'sub' }, `Cash by day: ${history.map((c) => Math.round(c)).join(', ')}`),
        h(
          'p',
          { class: 'sub' },
          record ? 'A new best week.' : best !== null ? `Best week: ${gbp(best)}` : '',
        ),
        h('p', { class: 'fact' }, data.facts[0]),
        again,
      ),
    );
    panel.hidden = false;
  }

  // ---- Drawing ----

  function draw(): void {
    const u = unit();
    const gy = groundY();
    const w = phase === 'plan' ? forecast : weather;
    ctx.fillStyle = w.sky;
    ctx.fillRect(0, 0, W, gy);
    if (w.sun) {
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(W * 0.12, H * 0.1, u * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = w.rain ? '#77808a' : '#e6e9ec';
      for (const c of clouds) {
        const cx = c.x * W;
        const cy = c.y * H;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(
            cx + (i - 1) * u * 0.7 * c.s,
            cy + (i === 1 ? -u * 0.2 : 0),
            u * 0.6 * c.s,
            u * 0.35 * c.s,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
    drawStreet(u, gy);
    if (event.coach && phase !== 'plan') drawCoach(u, gy);
    drawShop(u);
    // Back of the pavement first so passers-by walk in front of the queue.
    for (const p of [...people].sort((a, b) => a.lane - b.lane)) drawPerson(p, u, feetY(p));
    for (const p of people) if (p.bubble) drawBubble(p, u, feetY(p));
    if (w.rain && phase !== 'plan') drawRain(w.rain);
    if (phase === 'day' || phase === 'closing') drawHud(u);
  }

  function drawStreet(u: number, gy: number): void {
    const top = H * 0.2;
    const l = shopL();
    const r = shopR();
    // Corpus Christi wall: stone with crenellations, left of the shop.
    ctx.fillStyle = '#cbb991';
    ctx.fillRect(0, top + u * 0.4, l, gy - top - u * 0.4);
    for (let x = 0; x < l; x += u * 0.5) ctx.fillRect(x, top + u * 0.15, u * 0.3, u * 0.3);
    ctx.fillStyle = '#a8966e';
    for (let x = u * 0.4; x < l - u * 0.6; x += u * 1.4) {
      ctx.beginPath();
      ctx.moveTo(x, gy - u * 1.6);
      ctx.lineTo(x, gy - u * 2.4);
      ctx.arc(x + u * 0.25, gy - u * 2.4, u * 0.25, Math.PI, 0);
      ctx.lineTo(x + u * 0.5, gy - u * 1.6);
      ctx.fill();
    }
    if (l > u * 3) label("Bene't Street", u * 0.4, top + u * 0.9, u * 0.28, '#3a3020', 'left');

    // The Eagle pub: brick with a hanging sign, right of the shop.
    ctx.fillStyle = '#9a5a3c';
    ctx.fillRect(r, top, W - r, gy - top);
    ctx.fillStyle = '#e8e0c8';
    for (let x = r + u * 0.4; x < W - u * 0.5; x += u * 1.1) {
      ctx.fillRect(x, top + u * 0.5, u * 0.5, u * 0.7);
      ctx.fillRect(x, top + u * 1.6, u * 0.5, u * 0.7);
    }
    if (W - r > u * 1.6) {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(r + u * 0.25, gy - u * 2.6, u * 1.1, u * 0.45);
      label('THE EAGLE', r + u * 0.8, gy - u * 2.3, u * 0.2, '#d1b948');
    }

    // Pavement (two walking lanes) and road.
    const pave = u * 1.8;
    ctx.fillStyle = '#a7a39b';
    ctx.fillRect(0, gy, W, pave);
    ctx.fillStyle = '#8d8981';
    for (let x = 0; x < W; x += u * 0.8) ctx.fillRect(x, gy, 1, pave);
    ctx.fillStyle = '#6e6a64';
    ctx.fillRect(0, gy + pave - 3, W, 3);
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(0, gy + pave, W, H - gy - pave);
    ctx.fillStyle = '#d8d8d0';
    for (let x = 0; x < W; x += u * 1.6)
      ctx.fillRect(x, gy + pave + (H - gy - pave) / 2, u * 0.8, 3);
  }

  // Jack's, cut away to show the queue inside: door on the left, counter on the right.
  function drawShop(u: number): void {
    const top = H * 0.2;
    const gy = groundY();
    const l = shopL();
    const r = shopR();
    const sw = r - l;
    const ay = gy - u * 2.4;
    // Upper storey and fascia.
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(l, top, sw, ay - top);
    ctx.fillStyle = '#2d4a3e';
    ctx.fillRect(l, top + u * 0.3, sw, u * 0.6);
    label("JACK'S GELATO", W / 2, top + u * 0.72, Math.min(u * 0.34, sw / 9), '#f4efe4');
    // Interior: back wall and tiled floor.
    ctx.fillStyle = '#f6e3e8';
    ctx.fillRect(l, ay, sw, gy - ay);
    const tile = u * 0.3;
    for (let i = 0; i * tile < sw; i++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#e8e2d8' : '#5a5560';
        ctx.fillRect(
          l + i * tile,
          gy + j * tile * 0.6,
          Math.min(tile, r - l - i * tile),
          tile * 0.6,
        );
      }
    // Door frame on the left, wall on the right.
    ctx.fillStyle = '#2d4a3e';
    ctx.fillRect(l - u * 0.08, ay, u * 0.12, gy - ay + tile * 1.2);
    ctx.fillRect(r - u * 0.04, ay, u * 0.12, gy - ay + tile * 1.2);
    // Menu board on the back wall with today's price.
    ctx.fillStyle = '#222';
    ctx.fillRect(l + u * 0.35, ay + u * 0.55, u * 1.3, u * 0.7);
    label(gbp(price), l + u * 1, ay + u * 0.88, u * 0.2, '#fff');
    label(`${chosen.length || '?'} flavours`, l + u * 1, ay + u * 1.12, u * 0.15, '#d1b948');
    // Jack behind the counter.
    drawPerson(jack, u, backFeet());
    // Counter with tubs under the glass.
    const cx = counterX();
    const ct = backFeet() - u * 0.9;
    ctx.fillStyle = '#6a5040';
    ctx.fillRect(cx, ct, u * 0.6, backFeet() - ct);
    ctx.fillStyle = '#d1b948';
    ctx.fillRect(cx, ct, u * 0.6, u * 0.08);
    ctx.fillStyle = 'rgba(200, 230, 255, 0.6)';
    ctx.fillRect(cx + u * 0.05, ct - u * 0.25, u * 0.5, u * 0.25);
    chosen.forEach((_, i) => {
      ctx.fillStyle = SCOOPS[i % SCOOPS.length];
      ctx.fillRect(cx + u * (0.08 + i * 0.16), ct - u * 0.12, u * 0.13, u * 0.12);
    });
    // Striped awning with a scalloped edge.
    const n = Math.ceil(sw / (u * 0.4));
    const sx = sw / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#f4efe4' : '#c0392b';
      ctx.fillRect(l + i * sx, ay - u * 0.1, sx, u * 0.4);
      ctx.beginPath();
      ctx.arc(l + (i + 0.5) * sx, ay + u * 0.3, sx / 2, 0, Math.PI);
      ctx.fill();
    }
    if (stock <= 0 && phase !== 'plan') {
      ctx.save();
      ctx.translate(W / 2, ay - u * 0.55);
      ctx.rotate(-0.12);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-u * 0.9, -u * 0.25, u * 1.8, u * 0.5);
      label('SOLD OUT', 0, u * 0.09, u * 0.26, '#fff');
      ctx.restore();
    }
  }

  function drawCoach(u: number, gy: number): void {
    const y = gy + u * 1.95;
    const w = u * 5;
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(u * 0.2, y, w, u * 1.3);
    ctx.fillStyle = '#3a5a8c';
    ctx.fillRect(u * 0.2, y + u * 0.75, w, u * 0.2);
    ctx.fillStyle = '#6a8aa8';
    for (let x = u * 0.4; x < w; x += u * 0.7) ctx.fillRect(x, y + u * 0.15, u * 0.5, u * 0.45);
    ctx.fillStyle = '#222';
    for (const x of [u * 1.1, w - u * 0.6]) {
      ctx.beginPath();
      ctx.arc(x, y + u * 1.3, u * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    label('HEATHROW DAY TRIPS', u * 0.2 + w / 2, y + u * 1.12, u * 0.17, '#fff');
  }

  function drawPerson(p: Person, u: number, feet: number): void {
    const x = p.x;
    const swing = Math.sin(p.walk) * u * 0.08;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = Math.max(2, u * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - u * 0.08, feet - u * 0.3);
    ctx.lineTo(x - u * 0.08 + swing, feet);
    ctx.moveTo(x + u * 0.08, feet - u * 0.3);
    ctx.lineTo(x + u * 0.08 - swing, feet);
    ctx.stroke();
    ctx.fillStyle = p.coat;
    ctx.beginPath();
    ctx.roundRect(x - u * 0.2, feet - u * 0.85, u * 0.4, u * 0.6, u * 0.1);
    ctx.fill();
    const hy = feet - u * 1.05;
    const r = u * 0.2;
    if (p.face?.complete && p.face.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, hy, r * 1.2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(p.face, x - r * 1.2, hy - r * 1.2, r * 2.4, r * 2.4);
      ctx.restore();
    } else {
      ctx.fillStyle = '#e8c4a0';
      ctx.beginPath();
      ctx.arc(x, hy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.tourist && !p.face) {
      ctx.fillStyle = '#d8c89a';
      ctx.fillRect(x - r * 1.3, hy - r * 0.7, r * 2.6, r * 0.25);
      ctx.fillRect(x - r * 0.8, hy - r * 1.3, r * 1.6, r * 0.65);
    }
    const w = phase === 'plan' ? forecast : weather;
    const indoors = p.lane < 0.5 && x > shopL() && x < shopR();
    if (w.rain && !indoors) {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + u * 0.22, feet - u * 0.55);
      ctx.lineTo(x + u * 0.22, hy - u * 0.45);
      ctx.stroke();
      ctx.fillStyle = p.coat;
      ctx.beginPath();
      ctx.arc(x + u * 0.22, hy - u * 0.3, u * 0.42, Math.PI, 0);
      ctx.fill();
    }
    if (p.state === 'served') {
      ctx.fillStyle = '#d9a35a';
      ctx.beginPath();
      ctx.moveTo(x + u * 0.22, feet - u * 0.6);
      ctx.lineTo(x + u * 0.38, feet - u * 0.6);
      ctx.lineTo(x + u * 0.3, feet - u * 0.35);
      ctx.fill();
      ctx.fillStyle = SCOOPS[p.flavour % SCOOPS.length];
      ctx.beginPath();
      ctx.arc(x + u * 0.3, feet - u * 0.65, u * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const bubbleFont = () => `600 ${Math.max(11, unit() * 0.24)}px system-ui, sans-serif`;

  // Left and right edges of a bubble over x, kept on screen.
  function bubbleSpan(x: number, text: string): [number, number] {
    ctx.font = bubbleFont();
    const w = ctx.measureText(text).width + 12;
    const l = Math.max(4, Math.min(W - w - 4, x - w / 2));
    return [l, l + w];
  }

  function drawBubble(p: Person, u: number, feet: number): void {
    const b = p.bubble!;
    const size = Math.max(11, u * 0.24);
    const [bx, br] = bubbleSpan(p.x, b.text);
    const tw = br - bx - 12;
    const by = feet - u * 1.75 - size;
    ctx.globalAlpha = Math.min(1, b.t * 3);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#22202a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + 12, size + 10, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#22202a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, bx + 6, by + (size + 10) / 2);
    ctx.globalAlpha = 1;
  }

  function drawRain(amount: number): void {
    ctx.strokeStyle = 'rgba(210, 220, 235, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = Math.round(160 * amount);
    for (let i = 0; i < n; i++) {
      const sx = ((i * 97.3) % 1) * W + ((i * 53) % W);
      const y = (((i * 131) % H) + rainSeed * H * 1.4) % H;
      const x = (sx - y * 0.2 + W) % W;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
    }
    ctx.stroke();
  }

  function drawHud(u: number): void {
    const t = Math.min(simT, DAY) / DAY;
    const mins = Math.floor(t * HOURS * 60);
    const clock = `${String(OPEN_HOUR + Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const size = Math.max(12, Math.min(18, u * 0.3));
    const lines = [
      `Day ${day}  ${clock}  ${weather.name}`,
      `Sold ${stats.sold}  Stock ${stock}  Queue ${queue.length}`,
      `Takings ${gbp(stats.revenue)}`,
    ];
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    ctx.fillStyle = 'rgba(122, 15, 31, 0.9)';
    ctx.fillRect(8, 8, w, size * 1.35 * lines.length + 12);
    ctx.fillStyle = '#d1b948';
    ctx.fillRect(8, 8 + size * 1.35 * lines.length + 12, w, 3);
    ctx.fillStyle = '#f4efe4';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 18, 14 + i * size * 1.35));
    label(
      fast ? 'Fast forward x4 (tap or Space for normal)' : 'Tap or Space to speed up',
      W / 2,
      H - size,
      size * 0.85,
      '#f4efe4',
    );
  }

  function label(
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'center',
  ): void {
    ctx.font = `700 ${size}px Georgia, serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  // ---- Loop and input ----

  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const toggleFast = () => {
    if (phase !== 'day' && phase !== 'closing') return false;
    fast = !fast;
    blip();
    return true;
  };
  const onPointer = () => void toggleFast();
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && toggleFast()) e.preventDefault();
  };
  canvas.addEventListener('pointerdown', onPointer);
  addEventListener('keydown', onKey);

  newDay();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onPointer);
    removeEventListener('keydown', onKey);
    wrap.remove();
    style.remove();
  };
}
