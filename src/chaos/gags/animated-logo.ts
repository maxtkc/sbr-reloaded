// Animates the split college arms from pointer movement over them: yale head-bob, tongue flick, independent horn
// swivel, ear twitch, tail swish and the eagle flapping its wings. The arms are still at rest; movement builds up
// energy that decays over time, and more energy means more, bigger, faster motions plus a shake. Enough energy
// blows the arms apart, and the parts fly back into place a moment later.
import { isPaused, onPause, onResume } from '../bus';
import { found } from '../eggs';
import { blip, boom } from '../shared/sfx';

interface Motion {
  part: string;
  // Keyframes for an amplitude multiplier a (1 = rest-pose amplitude).
  keyframes: (a: number) => Keyframe[];
  duration: number;
  iterations?: number;
  // Mean delay between plays at full energy, in ms.
  every: number;
  // Parts animated together with this one.
  with?: { part: string; keyframes: (a: number) => Keyframe[] }[];
}

const rot =
  (...deg: number[]) =>
  (a: number): Keyframe[] =>
    deg.map((d) => ({ transform: `rotate(${d * a}deg)` }));

// Sign flips the rotation direction so both yales mirror each other.
function yaleMotions(side: 'left' | 'right'): Motion[] {
  const s = side === 'left' ? 1 : -1;
  const p = (name: string) => `${side}-yale${name}`;
  return [
    { part: p('-group'), keyframes: rot(0, -2 * s, 0.5 * s, 0), duration: 700, every: 1400 },
    {
      part: p('-tongue'),
      keyframes: (a) => [
        { transform: 'rotate(0deg) scaleX(1)' },
        { transform: `rotate(${8 * s * a}deg) scaleX(${1 + 0.35 * a})` },
        { transform: 'rotate(0deg) scaleX(1)' },
      ],
      duration: 300,
      iterations: 2,
      every: 1100,
    },
    { part: p('-horn-front'), keyframes: rot(0, 15 * s, -10 * s, 0), duration: 900, every: 1600 },
    { part: p('-horn-back'), keyframes: rot(0, -15 * s, 12 * s, 0), duration: 1000, every: 1600 },
    { part: p('-ear'), keyframes: rot(0, -12 * s, 0), duration: 250, iterations: 2, every: 2000 },
    {
      part: p('-tail'),
      keyframes: rot(0, 20 * s, -20 * s, 0),
      duration: 600,
      iterations: 3,
      every: 1400,
    },
  ];
}

const MOTIONS: Motion[] = [
  ...yaleMotions('left'),
  ...yaleMotions('right'),
  {
    part: 'eagle-wing-l',
    keyframes: rot(0, 25, 0),
    duration: 450,
    iterations: 3,
    every: 1800,
    with: [
      { part: 'eagle-wing-r', keyframes: rot(0, -25, 0) },
      {
        part: 'eagle-body',
        keyframes: (a) => [
          { transform: 'none' },
          { transform: `translateY(${-12 * a}px)` },
          { transform: 'none' },
        ],
      },
    ],
  },
];

// Energy added per px of pointer travel, and its decay time constant in ms. Steady movement at v px/ms holds
// energy near v * GAIN * DECAY, so explosion needs roughly 2 px/ms (a hard scribble).
const GAIN = 0.0008;
const DECAY = 600;
const EXPLODE = 1;
// Pointer gaps longer than this do not count as travel, in ms.
const GAP = 100;
// Energy where the shake starts, and its size at EXPLODE, in px and degrees.
const SHAKE_FROM = 0.35;
const SHAKE_PX = 6;
const SHAKE_DEG = 3;
// Explosion timings, in ms.
const FLY_OUT = 700;
const HOLD = 1500;
const FLY_BACK = 900;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export default function init(): (() => void) | void {
  const svgs = document.querySelectorAll<SVGSVGElement>('svg.arms-anim');
  if (!svgs.length) return;

  // Reduced motion slows everything down instead of disabling it.
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 3 : 1;
  const cleanups = [...svgs].map((svg) => drive(svg, slow));
  return () => cleanups.forEach((fn) => fn());
}

function drive(svg: SVGSVGElement, slow: number): () => void {
  const running = new Set<Animation>();
  const busy = new Set<Motion>();
  const { width: vbW, height: vbH } = svg.viewBox.baseVal;
  let energy = 0;
  let last = 0;
  let raf = 0;
  let pointer: { x: number; y: number; t: number } | null = null;
  let exploding = false;

  const part = (name: string) => svg.querySelector<SVGGElement>(`[data-part="${name}"]`);

  function track(anim: Animation, done?: () => void) {
    running.add(anim);
    const end = () => {
      running.delete(anim);
      done?.();
    };
    anim.finished.then(end, end);
  }

  function play(m: Motion) {
    const a = Math.min(2.5, 0.6 + energy * 1.6);
    const rate = 1 + energy * 1.5;
    busy.add(m);
    let left = 0;
    for (const t of [{ part: m.part, keyframes: m.keyframes }, ...(m.with ?? [])]) {
      const el = part(t.part);
      if (!el) continue;
      const anim = el.animate(t.keyframes(a), {
        duration: m.duration * slow,
        iterations: m.iterations ?? 1,
        easing: 'ease-in-out',
      });
      anim.playbackRate = rate;
      left++;
      track(anim, () => --left === 0 && busy.delete(m));
    }
    if (!left) busy.delete(m);
  }

  function shake() {
    const k = Math.max(0, (energy - SHAKE_FROM) / (EXPLODE - SHAKE_FROM));
    if (!k) {
      svg.style.translate = '';
      svg.style.rotate = '';
      return;
    }
    svg.style.translate = `${rand(-1, 1) * k * SHAKE_PX}px ${rand(-1, 1) * k * SHAKE_PX}px`;
    svg.style.rotate = `${rand(-1, 1) * k * SHAKE_DEG}deg`;
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(100, now - last);
    last = now;
    energy *= Math.exp(-dt / DECAY);
    if (energy >= EXPLODE) return explode();
    for (const m of MOTIONS) {
      if (busy.has(m)) continue;
      if (Math.random() < ((energy * dt) / m.every) * 2) play(m);
    }
    shake();
    if (energy > 0.005) raf = requestAnimationFrame(frame);
    else energy = 0;
  }

  function wake() {
    if (raf || exploding || isPaused()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function onMove(e: PointerEvent) {
    const t = e.timeStamp;
    if (pointer && t - pointer.t < GAP && !exploding && !isPaused()) {
      energy += Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) * GAIN;
      wake();
    }
    pointer = { x: e.clientX, y: e.clientY, t };
  }

  function onLeave() {
    pointer = null;
  }

  function explode() {
    exploding = true;
    energy = 0;
    pointer = null;
    cancelAnimationFrame(raf);
    raf = 0;
    running.forEach((a) => a.cancel());
    busy.clear();
    svg.style.translate = '';
    svg.style.rotate = '';
    boom(450, 0.4);
    found('animated-logo');
    // Leaf parts fly away from the middle of the arms; yale groups stay put so their parts scatter separately.
    const leaves = [...svg.querySelectorAll<SVGGElement>('g[data-part]')].filter(
      (g) => !g.querySelector('g'),
    );
    let left = leaves.length;
    for (const g of leaves) {
      const box = g.getBBox();
      const dx = box.x + box.width / 2 - vbW / 2;
      const dy = box.y + box.height / 2 - vbH / 2;
      const dir = Math.atan2(dy || rand(-1, 1), dx || rand(-1, 1)) + rand(-0.5, 0.5);
      const dist = vbW * rand(0.6, 1.4);
      const out = `translate(${Math.cos(dir) * dist}px,${Math.sin(dir) * dist}px) rotate(${rand(-540, 540)}deg)`;
      const keyframes = [
        { transform: 'none' },
        { transform: out, offset: FLY_OUT / (FLY_OUT + HOLD) },
        { transform: out },
      ];
      const anim = g.animate(keyframes, {
        duration: (FLY_OUT + HOLD) * slow,
        easing: 'ease-out',
        fill: 'forwards',
      });
      track(anim, () => {
        if (anim.playState !== 'finished') return;
        const back = g.animate([{ transform: out }, { transform: 'none' }], {
          duration: FLY_BACK * slow,
          delay: rand(0, 300) * slow,
          easing: 'ease-in-out',
        });
        track(back, () => {
          anim.cancel();
          if (--left === 0) {
            exploding = false;
            blip();
          }
        });
      });
    }
  }

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);
  const offPause = onPause(() => {
    cancelAnimationFrame(raf);
    raf = 0;
    energy = 0;
    svg.style.translate = '';
    svg.style.rotate = '';
    running.forEach((a) => a.pause());
  });
  const offResume = onResume(() => running.forEach((a) => a.play()));

  return () => {
    cancelAnimationFrame(raf);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerleave', onLeave);
    running.forEach((a) => a.cancel());
    running.clear();
    svg.style.translate = '';
    svg.style.rotate = '';
    offPause();
    offResume();
  };
}
