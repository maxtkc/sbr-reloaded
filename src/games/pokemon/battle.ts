// Joke battle screen: wild encounter, FIGHT/BAG/SBR/RUN menu, text queue with a typewriter.
import type { KAPLAYCtx, Color } from 'kaplay';
import { beep, blip, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

export type Button = 'a' | 'b' | 'up' | 'down' | 'left' | 'right';
export type Outcome = 'win' | 'lose' | 'flee';
type Encounter = (typeof data.encounters)[number];

export interface Battle {
  press(b: Button): void;
  click(x: number, y: number): void;
  update(dt: number): void;
  draw(): void;
}

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const PLAYER_MAX = 30;
const TYPE_RATE = 55;

export function createBattle(k: KAPLAYCtx, enc: Encounter, onEnd: (o: Outcome) => void): Battle {
  const W = () => k.width();
  const H = () => k.height();
  const size = () => Math.min(H() * 0.034, W() * 0.042);

  let enemyHp = enc.hp;
  let playerHp = PLAYER_MAX;
  let shownEnemy = enemyHp;
  let shownPlayer = playerHp;
  let enemyFlash = 0;
  let playerShake = 0;
  let enemyIn = 0;
  let time = 0;
  let mode: 'text' | 'menu' | 'moves' = 'text';
  let cursor = 0;
  let queue: string[] = [];
  let typed = 0;
  let next: () => void = () => {};
  let ended = false;

  function say(lines: string[], then: () => void): void {
    mode = 'text';
    queue = lines;
    typed = 0;
    next = then;
  }

  function toMenu(): void {
    mode = 'menu';
    cursor = 0;
  }

  function finish(o: Outcome): void {
    if (ended) return;
    ended = true;
    onEnd(o);
  }

  function enemyTurn(): void {
    const dmg = 4 + Math.floor(Math.random() * 6);
    say([`${enc.name} used ${pick(enc.attacks)}!`, `"${pick(enc.taunts)}"`], () => {
      playerHp = Math.max(0, playerHp - dmg);
      playerShake = 0.4;
      boom(150, 0.15);
      if (playerHp <= 0) say([data.youFaint, data.factPrefix + enc.fact], () => finish('lose'));
      else toMenu();
    });
  }

  function useMove(i: number): void {
    const m = data.moves[i];
    say([`${data.you} used ${m.name}!`, pick(m.lines)], () => {
      enemyHp = Math.max(0, enemyHp - Math.ceil(enc.hp * (0.25 + Math.random() * 0.25)));
      enemyFlash = 0.5;
      beep(220, 120, 'sawtooth', 0.08);
      if (enemyHp > 0) return enemyTurn();
      fanfare();
      say([`${enc.name} fainted!`, enc.win, data.factPrefix + enc.fact], () => finish('win'));
    });
  }

  function choose(i: number): void {
    blip();
    if (i === 0) {
      mode = 'moves';
      cursor = 0;
    } else if (i === 1) {
      say([`${data.you} opened the BAG.`, pick(data.bag)], enemyTurn);
    } else if (i === 2) {
      say([`${data.you} called the SBR!`, pick(data.sbr)], () => {
        playerHp = Math.min(PLAYER_MAX, playerHp + 10);
        enemyTurn();
      });
    } else if (Math.random() < 1 / 3) {
      say([pick(data.runFail)], enemyTurn);
    } else {
      say([data.runOk, enc.flee, data.factPrefix + enc.fact], () => finish('flee'));
    }
  }

  // Advance the text queue; completes the typewriter first.
  function advance(): void {
    const line = queue[0] ?? '';
    if (typed < line.length) {
      typed = line.length;
      return;
    }
    queue = queue.slice(1);
    typed = 0;
    if (queue.length) blip();
    else next();
  }

  say([data.wildIntro.replace('{name}', enc.name), enc.intro], toMenu);

  // Bottom box and the 2x2 option rects for menu clicks.
  const box = () => ({ x: 0, y: H() * 0.74, w: W(), h: H() * 0.26 });
  function optionRects(): { x: number; y: number; w: number; h: number }[] {
    const b = box();
    const left = mode === 'moves' ? b.x : b.x + b.w * 0.5;
    const ow = (b.x + b.w - left) / 2;
    const oh = b.h / 2;
    return [0, 1, 2, 3].map((i) => ({
      x: left + (i % 2) * ow,
      y: b.y + Math.floor(i / 2) * oh,
      w: ow,
      h: oh,
    }));
  }

  const SKIN = k.rgb(240, 200, 165);
  const INK = k.rgb(30, 30, 40);

  function drawEnemy(cx: number, cy: number, s: number): void {
    const flashOn = enemyFlash > 0 && Math.floor(enemyFlash * 12) % 2 === 0;
    const op = flashOn ? 0.25 : 1;
    const c = (col: Color) => ({ color: col, opacity: op });
    if (enc.kind === 'goose') {
      k.drawEllipse({
        pos: k.vec2(cx, cy + s * 0.2),
        radiusX: s * 0.5,
        radiusY: s * 0.3,
        ...c(k.rgb(235, 235, 230)),
      });
      k.drawRect({
        pos: k.vec2(cx - s * 0.38, cy - s * 0.45),
        width: s * 0.12,
        height: s * 0.6,
        ...c(k.rgb(50, 50, 55)),
      });
      k.drawCircle({
        pos: k.vec2(cx - s * 0.32, cy - s * 0.48),
        radius: s * 0.12,
        ...c(k.rgb(50, 50, 55)),
      });
      k.drawTriangle({
        p1: k.vec2(cx - s * 0.42, cy - s * 0.52),
        p2: k.vec2(cx - s * 0.42, cy - s * 0.42),
        p3: k.vec2(cx - s * 0.62, cy - s * 0.47),
        ...c(k.rgb(240, 150, 40)),
      });
      k.drawCircle({
        pos: k.vec2(cx - s * 0.34, cy - s * 0.52),
        radius: s * 0.025,
        ...c(k.rgb(255, 255, 255)),
      });
      return;
    }
    const body: Record<string, Color> = {
      porter: k.rgb(30, 40, 70),
      tourist: k.rgb(240, 120, 170),
      tout: k.rgb(235, 235, 245),
      supervisor: k.rgb(120, 90, 60),
    };
    k.drawRect({
      pos: k.vec2(cx - s * 0.3, cy - s * 0.05),
      width: s * 0.6,
      height: s * 0.55,
      radius: s * 0.12,
      ...c(body[enc.kind] ?? INK),
    });
    if (enc.kind === 'tout') {
      for (let i = 0; i < 4; i++) {
        k.drawRect({
          pos: k.vec2(cx - s * 0.3, cy + s * (0.02 + i * 0.12)),
          width: s * 0.6,
          height: s * 0.05,
          ...c(k.rgb(40, 70, 150)),
        });
      }
    }
    k.drawCircle({ pos: k.vec2(cx, cy - s * 0.22), radius: s * 0.2, ...c(SKIN) });
    k.drawCircle({ pos: k.vec2(cx - s * 0.07, cy - s * 0.22), radius: s * 0.025, ...c(INK) });
    k.drawCircle({ pos: k.vec2(cx + s * 0.07, cy - s * 0.22), radius: s * 0.025, ...c(INK) });
    if (enc.kind === 'porter') {
      k.drawEllipse({
        pos: k.vec2(cx, cy - s * 0.36),
        radiusX: s * 0.27,
        radiusY: s * 0.05,
        ...c(INK),
      });
      k.drawCircle({ pos: k.vec2(cx, cy - s * 0.4), radius: s * 0.16, ...c(INK) });
      k.drawRect({
        pos: k.vec2(cx - s * 0.04, cy),
        width: s * 0.08,
        height: s * 0.25,
        ...c(k.rgb(209, 185, 72)),
      });
    } else if (enc.kind === 'tourist') {
      k.drawEllipse({
        pos: k.vec2(cx, cy - s * 0.38),
        radiusX: s * 0.32,
        radiusY: s * 0.07,
        ...c(k.rgb(250, 230, 120)),
      });
      k.drawRect({
        pos: k.vec2(cx - s * 0.12, cy + s * 0.05),
        width: s * 0.24,
        height: s * 0.15,
        ...c(INK),
      });
      k.drawCircle({
        pos: k.vec2(cx, cy + s * 0.125),
        radius: s * 0.05,
        ...c(k.rgb(120, 160, 220)),
      });
    } else if (enc.kind === 'tout') {
      k.drawEllipse({
        pos: k.vec2(cx, cy - s * 0.36),
        radiusX: s * 0.3,
        radiusY: s * 0.05,
        ...c(k.rgb(230, 200, 110)),
      });
      k.drawRect({
        pos: k.vec2(cx - s * 0.16, cy - s * 0.5),
        width: s * 0.32,
        height: s * 0.13,
        ...c(k.rgb(230, 200, 110)),
      });
      k.drawRect({
        pos: k.vec2(cx - s * 0.16, cy - s * 0.4),
        width: s * 0.32,
        height: s * 0.035,
        ...c(k.rgb(122, 15, 31)),
      });
      k.drawRect({
        pos: k.vec2(cx + s * 0.25, cy),
        width: s * 0.2,
        height: s * 0.26,
        ...c(k.rgb(250, 250, 200)),
      });
    } else if (enc.kind === 'supervisor') {
      for (const gx of [-0.07, 0.07]) {
        k.drawCircle({
          pos: k.vec2(cx + s * gx, cy - s * 0.22),
          radius: s * 0.055,
          fill: false,
          outline: { width: 2, color: INK },
          opacity: op,
        });
      }
      k.drawRect({
        pos: k.vec2(cx - s * 0.17, cy - s * 0.44),
        width: s * 0.34,
        height: s * 0.08,
        ...c(k.rgb(200, 200, 200)),
      });
      k.drawRect({
        pos: k.vec2(cx + s * 0.22, cy + s * 0.05),
        width: s * 0.25,
        height: s * 0.3,
        ...c(k.rgb(255, 255, 255)),
      });
      for (let i = 0; i < 4; i++) {
        k.drawRect({
          pos: k.vec2(cx + s * 0.25, cy + s * (0.1 + i * 0.06)),
          width: s * 0.19,
          height: s * 0.015,
          ...c(k.rgb(200, 40, 40)),
        });
      }
    }
  }

  // The player seen from behind: red blazer, scarf, hair.
  function drawPlayer(cx: number, cy: number, s: number): void {
    const dx = playerShake > 0 ? Math.sin(time * 60) * s * 0.05 : 0;
    k.drawRect({
      pos: k.vec2(cx - s * 0.35 + dx, cy - s * 0.05),
      width: s * 0.7,
      height: s * 0.6,
      radius: s * 0.14,
      color: k.rgb(170, 20, 40),
    });
    k.drawRect({
      pos: k.vec2(cx - s * 0.22 + dx, cy - s * 0.08),
      width: s * 0.44,
      height: s * 0.1,
      color: k.rgb(209, 185, 72),
    });
    k.drawCircle({
      pos: k.vec2(cx + dx, cy - s * 0.25),
      radius: s * 0.22,
      color: k.rgb(90, 60, 40),
    });
  }

  function hpBar(x: number, y: number, w: number, hp: number, max: number): void {
    const f = Math.max(0, hp / max);
    const col = f > 0.5 ? k.rgb(70, 200, 90) : f > 0.2 ? k.rgb(240, 200, 50) : k.rgb(220, 60, 50);
    k.drawRect({
      pos: k.vec2(x, y),
      width: w,
      height: size() * 0.45,
      color: k.rgb(60, 60, 60),
      radius: 3,
    });
    k.drawRect({ pos: k.vec2(x, y), width: w * f, height: size() * 0.45, color: col, radius: 3 });
  }

  function infoBox(
    x: number,
    y: number,
    w: number,
    name: string,
    lv: number,
    hp: number,
    max: number,
    nums: boolean,
  ): void {
    const fs = size();
    const h = fs * (nums ? 3.4 : 2.6);
    k.drawRect({
      pos: k.vec2(x, y),
      width: w,
      height: h,
      color: k.rgb(248, 246, 232),
      outline: { width: 3, color: INK },
      radius: 8,
    });
    k.drawText({ text: name, pos: k.vec2(x + fs * 0.5, y + fs * 0.35), size: fs, color: INK });
    k.drawText({
      text: `Lv${lv}`,
      pos: k.vec2(x + w - fs * 0.5, y + fs * 0.35),
      size: fs * 0.85,
      color: INK,
      anchor: 'topright',
    });
    k.drawText({
      text: 'HP',
      pos: k.vec2(x + fs * 0.5, y + fs * 1.6),
      size: fs * 0.7,
      color: k.rgb(200, 120, 30),
    });
    hpBar(x + fs * 2, y + fs * 1.65, w - fs * 2.6, hp, max);
    if (nums) {
      k.drawText({
        text: `${Math.ceil(hp)}/${max}`,
        pos: k.vec2(x + w - fs * 0.5, y + fs * 2.3),
        size: fs * 0.8,
        color: INK,
        anchor: 'topright',
      });
    }
  }

  return {
    press(b) {
      if (ended) return;
      if (mode === 'text') {
        if (b === 'a') advance();
        return;
      }
      if (b === 'a') {
        if (mode === 'menu') choose(cursor);
        else useMove(cursor);
      } else if (b === 'b') {
        if (mode === 'moves') {
          mode = 'menu';
          cursor = 0;
        }
      } else {
        const col = cursor % 2;
        const row = Math.floor(cursor / 2);
        if (b === 'left' || b === 'right') cursor = row * 2 + (1 - col);
        else cursor = (1 - row) * 2 + col;
        beep(660, 30, 'square', 0.04);
      }
    },
    click(x, y) {
      if (ended) return;
      if (mode === 'text') return advance();
      const i = optionRects().findIndex(
        (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
      );
      if (i < 0) return;
      cursor = i;
      if (mode === 'menu') choose(i);
      else useMove(i);
    },
    update(dt) {
      time += dt;
      enemyIn = Math.min(1, enemyIn + dt * 2);
      enemyFlash = Math.max(0, enemyFlash - dt);
      playerShake = Math.max(0, playerShake - dt);
      shownEnemy += (enemyHp - shownEnemy) * Math.min(1, dt * 6);
      shownPlayer += (playerHp - shownPlayer) * Math.min(1, dt * 6);
      if (mode === 'text') typed = Math.min((queue[0] ?? '').length, typed + dt * TYPE_RATE);
    },
    draw() {
      const w = W();
      const h = H();
      const fs = size();
      k.drawRect({
        pos: k.vec2(0, 0),
        width: w,
        height: h,
        gradient: [k.rgb(225, 240, 250), k.rgb(200, 230, 190)],
      });

      const s = Math.min(h * 0.28, w * 0.36);
      const ex = w * 0.72 + (1 - enemyIn) * w * 0.5;
      const ey = h * 0.3;
      k.drawEllipse({
        pos: k.vec2(w * 0.72, ey + s * 0.5),
        radiusX: s * 0.8,
        radiusY: s * 0.16,
        color: k.rgb(150, 200, 120),
      });
      drawEnemy(ex, ey, s);

      const px = w * 0.25 - (1 - enemyIn) * w * 0.5;
      const py = h * 0.6;
      k.drawEllipse({
        pos: k.vec2(w * 0.25, py + s * 0.45),
        radiusX: s * 0.8,
        radiusY: s * 0.16,
        color: k.rgb(150, 200, 120),
      });
      drawPlayer(px, py, s * 1.1);

      // Info boxes sit beside their sprite's resting spot: enemy box to its left, player box to its right.
      const ibw = Math.min(w * 0.44, fs * 13);
      const gap = fs * 0.5;
      const margin = w * 0.02;
      let eBoxX = w * 0.72 - s * 0.55 - gap - ibw;
      let eBoxY = ey - s * 0.05 - fs * 1.3;
      if (eBoxX < margin) {
        // No room beside it: go above the sprite instead.
        eBoxX = margin;
        eBoxY = Math.max(margin, ey - s * 0.65 - gap - fs * 2.6);
      }
      let pBoxX = w * 0.25 + s * 0.45 + gap;
      let pBoxY = py + s * 0.05 - fs * 1.7;
      if (pBoxX + ibw > w - margin) {
        pBoxX = w - margin - ibw;
        pBoxY = py - s * 0.6 - gap - fs * 3.4;
      }
      infoBox(eBoxX, eBoxY, ibw, enc.name, 5 + enc.hp / 10, shownEnemy, enc.hp, false);
      infoBox(pBoxX, pBoxY, ibw, data.you, data.youLevel, shownPlayer, PLAYER_MAX, true);

      const b = box();
      k.drawRect({
        pos: k.vec2(b.x, b.y),
        width: b.w,
        height: b.h,
        color: k.rgb(248, 246, 232),
        outline: { width: 4, color: k.rgb(122, 15, 31) },
      });
      const pad = fs * 0.8;
      if (mode === 'text') {
        const line = queue[0] ?? '';
        k.drawText({
          text: line.slice(0, Math.floor(typed)),
          pos: k.vec2(b.x + pad, b.y + pad),
          size: fs,
          width: b.w - pad * 2,
          color: INK,
          lineSpacing: fs * 0.3,
        });
        if (typed >= line.length && Math.floor(time * 3) % 2 === 0) {
          const ax = b.x + b.w - pad;
          const ay = b.y + b.h - pad;
          k.drawTriangle({
            p1: k.vec2(ax - fs * 0.6, ay - fs * 0.4),
            p2: k.vec2(ax, ay - fs * 0.4),
            p3: k.vec2(ax - fs * 0.3, ay),
            color: k.rgb(122, 15, 31),
          });
        }
        return;
      }
      if (mode === 'menu') {
        k.drawText({
          text: data.fightPrompt,
          pos: k.vec2(b.x + pad, b.y + pad),
          size: fs,
          width: b.w * 0.5 - pad * 2,
          color: INK,
        });
      }
      const labels = mode === 'menu' ? data.menu : data.moves.map((m) => m.name);
      optionRects().forEach((r, i) => {
        const tx = r.x + fs * 1.4;
        const ty = r.y + r.h / 2;
        if (i === cursor) {
          k.drawTriangle({
            p1: k.vec2(r.x + fs * 0.4, ty - fs * 0.35),
            p2: k.vec2(r.x + fs * 0.4, ty + fs * 0.35),
            p3: k.vec2(r.x + fs * 0.95, ty),
            color: k.rgb(122, 15, 31),
          });
        }
        k.drawText({
          text: labels[i],
          pos: k.vec2(tx, ty),
          size: fs * (mode === 'moves' ? 0.85 : 1),
          width: r.w - fs * 1.6,
          anchor: 'left',
          color: i === cursor ? k.rgb(122, 15, 31) : INK,
        });
      });
    },
  };
}
