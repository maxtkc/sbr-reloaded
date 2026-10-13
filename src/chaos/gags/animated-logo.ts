// Animates the split college arms: yale head-bob, tongue flick, independent horn swivel, ear twitch, tail swish,
// and the eagle flapping its wings. Each motion loops on its own random timer.
import { isPaused, onPause, onResume } from '../bus';

interface Motion {
  part: string;
  keyframes: Keyframe[];
  duration: number;
  iterations?: number;
  // Random delay range between plays, in ms.
  every: [number, number];
  // Parts animated together with this one (same timer).
  with?: { part: string; keyframes: Keyframe[] }[];
}

const rot = (...deg: number[]): Keyframe[] => deg.map((d) => ({ transform: `rotate(${d}deg)` }));

// Sign flips the rotation direction so both yales mirror each other.
function yaleMotions(side: 'left' | 'right'): Motion[] {
  const s = side === 'left' ? 1 : -1;
  const p = (name: string) => `${side}-yale${name}`;
  return [
    {
      part: p('-group'),
      keyframes: rot(0, -2 * s, 0.5 * s, 0),
      duration: 700,
      every: [2000, 5000],
    },
    {
      part: p('-tongue'),
      keyframes: [
        { transform: 'rotate(0deg) scaleX(1)' },
        { transform: `rotate(${8 * s}deg) scaleX(1.35)` },
        { transform: 'rotate(0deg) scaleX(1)' },
      ],
      duration: 300,
      iterations: 2,
      every: [1500, 4000],
    },
    {
      part: p('-horn-front'),
      keyframes: rot(0, 15 * s, -10 * s, 0),
      duration: 900,
      every: [2000, 6000],
    },
    {
      part: p('-horn-back'),
      keyframes: rot(0, -15 * s, 12 * s, 0),
      duration: 1000,
      every: [2000, 6000],
    },
    {
      part: p('-ear'),
      keyframes: rot(0, -12 * s, 0),
      duration: 250,
      iterations: 2,
      every: [3000, 7000],
    },
    {
      part: p('-tail'),
      keyframes: rot(0, 20 * s, -20 * s, 0),
      duration: 600,
      iterations: 3,
      every: [2000, 5000],
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
    every: [6000, 12000],
    with: [
      { part: 'eagle-wing-r', keyframes: rot(0, -25, 0) },
      {
        part: 'eagle-body',
        keyframes: [
          { transform: 'none' },
          { transform: 'translateY(-12px)' },
          { transform: 'none' },
        ],
      },
    ],
  },
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export default function init(): (() => void) | void {
  const svgs = document.querySelectorAll<SVGSVGElement>('svg.arms-anim');
  if (!svgs.length) return;

  // Reduced motion slows everything down instead of disabling it.
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 3 : 1;
  const timers = new Set<number>();
  const running = new Set<Animation>();

  function play(svg: SVGSVGElement, m: Motion): void {
    const targets = [{ part: m.part, keyframes: m.keyframes }, ...(m.with ?? [])];
    for (const t of targets) {
      const el = svg.querySelector(`[data-part="${t.part}"]`);
      if (!el) continue;
      const anim = el.animate(t.keyframes, {
        duration: m.duration * slow,
        iterations: m.iterations ?? 1,
        easing: 'ease-in-out',
      });
      running.add(anim);
      anim.finished.then(
        () => running.delete(anim),
        () => running.delete(anim),
      );
    }
  }

  function schedule(svg: SVGSVGElement, m: Motion): void {
    if (isPaused()) return;
    const id = window.setTimeout(
      () => {
        timers.delete(id);
        play(svg, m);
        schedule(svg, m);
      },
      rand(...m.every) * slow,
    );
    timers.add(id);
  }

  function start(): void {
    svgs.forEach((svg) => MOTIONS.forEach((m) => schedule(svg, m)));
  }

  function stopTimers(): void {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  const offPause = onPause(() => {
    stopTimers();
    running.forEach((a) => a.pause());
  });
  const offResume = onResume(() => {
    running.forEach((a) => a.play());
    start();
  });

  start();

  return () => {
    stopTimers();
    running.forEach((a) => a.cancel());
    running.clear();
    offPause();
    offResume();
  };
}
