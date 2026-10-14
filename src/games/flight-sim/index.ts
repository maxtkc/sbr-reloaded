// Johnian Flight Simulator: an arcade plane over St John's extruded from OSM, with rings over the landmarks.
import * as THREE from 'three';
import { beep, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';
import {
  bankOf,
  disposePlane,
  forwardOf,
  makePlane,
  resetPlane,
  stepPlane,
  STALL_SPEED,
  type Controls,
} from './plane';
import { ATTRIBUTION, BOUNDS, MARKERS, START, World, type Marker } from './world';

// Plane centre height when the wheels touch the ground.
const WHEELS = 1.4;
const RING = 9;
// Distance past the extract edge where the plane is steered back.
const OFF_MAP = 250;
const MAX_DEBRIS = 40;

const CSS = `
.fs{position:absolute;inset:0;overflow:hidden;user-select:none;font:14px/1.3 system-ui,sans-serif;color:#fff}
.fs canvas{display:block;width:100%;height:100%}
.fs .gauges{position:absolute;left:10px;top:10px;padding:6px 10px;background:rgba(0,0,0,.45);border-left:3px solid #d1b948;font:600 14px/1.5 ui-monospace,monospace;pointer-events:none}
.fs .thr{width:120px;height:6px;background:#333;margin-top:3px}.fs .thr i{display:block;height:100%;background:#d1b948}
.fs .nav{position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:4px 12px;background:rgba(0,0,0,.45);pointer-events:none;white-space:nowrap}
.fs .arrow{width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:16px solid #d1b948}
.fs .count{position:absolute;right:10px;top:10px;padding:6px 10px;background:rgba(0,0,0,.45);pointer-events:none}
.fs .warn{position:absolute;left:50%;top:30%;transform:translateX(-50%);font:800 28px/1 system-ui,sans-serif;color:#ff3b3b;text-shadow:0 0 6px #000;display:none;pointer-events:none;text-align:center}
.fs .log{position:absolute;left:10px;bottom:28px;max-width:min(36rem,80%);display:flex;flex-direction:column;gap:3px;pointer-events:none}
.fs .log p{margin:0;padding:4px 8px;background:rgba(0,0,0,.55);border-left:3px solid #d1b948;transition:opacity 1s}
.fs .attrib{position:absolute;right:6px;bottom:4px;font-size:11px;opacity:.8;pointer-events:none;text-shadow:1px 1px #000}
.fs .panel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,10,20,.55);cursor:pointer}
.fs .panel>div{max-width:34rem;margin:1rem;padding:1.2rem 1.4rem;background:#1f2233;border:3px solid #7a0f1f;box-shadow:inset 0 0 0 2px #d1b948}
.fs .panel h2{margin:0 0 .5rem;font:700 1.8rem/1.1 Georgia,serif;color:#d1b948}
.fs .panel p{margin:.4rem 0}
.fs .panel table{border-collapse:collapse;margin:.6rem 0;font-size:13px}
.fs .panel td{padding:1px 10px 1px 0}.fs .panel td:first-child{color:#d1b948;white-space:nowrap}
.fs .panel .go{display:inline-block;margin-top:.6rem;padding:.4rem 1rem;background:#7a0f1f;border:2px solid #d1b948;font-weight:700}
.fs .panel .fact{font-style:italic;color:#ccc}
.fs .panel .small{font-size:12px;opacity:.8}
`;

interface Member {
  name: string;
  role: string;
  face: string;
}

interface Ring {
  marker: Marker;
  pos: THREE.Vector3;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
  label: THREE.Sprite;
  visited: boolean;
}

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

type Mode = 'menu' | 'fly' | 'paused' | 'crashed';
type Crash = keyof typeof data.crash;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.append(e);
  return e;
}

function readRoster(): Member[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

// Canvas text sprite, height in world units.
function label(text: string, height: number, bg: string, fg: string): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '700 40px system-ui, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 32;
  c.height = 60;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.font = font;
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.fillText(text, 16, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set((height * c.width) / c.height, height, 1);
  s.renderOrder = 100;
  return s;
}

export default function start(root: HTMLElement): () => void {
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const style = document.createElement('style');
  style.textContent = CSS;
  const wrap = el('div', 'fs', root);
  wrap.append(style);

  // Renderer, scene, lights.
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  wrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const sky = new THREE.Color(0xa9cdf0);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 500, 2200);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 5000);
  scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x5a5040, 2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
  sun.position.set(-0.5, 1, 0.3);
  scene.add(sun);

  const world = new World();
  scene.add(world.group);

  // Landmark rings over gold beams, stacked when close together.
  const ringGeom = new THREE.TorusGeometry(RING, 0.9, 10, 40);
  const beamGeom = new THREE.CylinderGeometry(0.6, 0.6, 1, 8);
  const ringMat = new THREE.MeshLambertMaterial({ color: 0xd1b948, emissive: 0x6a5300 });
  const doneMat = new THREE.MeshLambertMaterial({ color: 0x7ad17a, emissive: 0x1d5a1d });
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe27a,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const rings: Ring[] = [];
  for (const m of MARKERS) {
    let alt = world.tallestNear(m.x, m.z, 25) + 22;
    while (
      rings.some(
        (r) => Math.hypot(r.pos.x - m.x, r.pos.z - m.z) < 70 && Math.abs(r.pos.y - alt) < 22,
      )
    )
      alt += 24;
    const pos = new THREE.Vector3(m.x, alt, m.z);
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.copy(pos);
    const beam = new THREE.Mesh(beamGeom, beamMat);
    beam.scale.y = alt - RING;
    beam.position.set(m.x, (alt - RING) / 2, m.z);
    const lab = label(m.name, 8, 'rgba(122,15,31,0.92)', '#f4e3a1');
    lab.position.set(m.x, alt + RING + 6, m.z);
    scene.add(ring, beam, lab);
    rings.push({ marker: m, pos, ring, beam, label: lab, visited: false });
  }

  // Plane, piloted by a random roster member.
  const roster = readRoster();
  const pilot = roster.length ? pick(roster) : undefined;
  const faceTex = pilot ? new THREE.TextureLoader().load(pilot.face) : undefined;
  if (faceTex) faceTex.colorSpace = THREE.SRGBColorSpace;
  const plane = makePlane(faceTex);
  scene.add(plane.mesh);

  // Blob shadow under the plane.
  const shadowGeom = new THREE.CircleGeometry(4, 20);
  shadowGeom.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeom, shadowMat);
  shadow.renderOrder = 50;
  scene.add(shadow);

  // Crash debris and fireball.
  const debrisGeom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const debrisMats = [0x9b1c2e, 0xd1b948, 0x23407a, 0x333333].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  const debris: Debris[] = [];
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0 });
  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fireMat);
  fire.visible = false;
  scene.add(fire);
  let fireT = 0;

  // HUD.
  const gauges = el('div', 'gauges', wrap);
  const spd = el('div', '', gauges);
  const alt = el('div', '', gauges);
  const thrRow = el('div', '', gauges, 'THR');
  const thrBar = el('i', '', el('div', 'thr', thrRow));
  const nav = el('div', 'nav', wrap);
  const arrow = el('div', 'arrow', nav);
  const navText = el('span', '', nav);
  const count = el('div', 'count', wrap);
  const warn = el('div', 'warn', wrap);
  const log = el('div', 'log', wrap);
  el('div', 'attrib', wrap, ATTRIBUTION);
  const panel = el('div', 'panel', wrap);
  const timers: number[] = [];

  function say(text: string): void {
    const p = el('p', '', log, text);
    while (log.children.length > 3) log.firstElementChild!.remove();
    timers.push(
      window.setTimeout(() => (p.style.opacity = '0'), 7000),
      window.setTimeout(() => p.remove(), 8000),
    );
  }

  let mode: Mode = 'menu';
  function showPanel(kind: Mode, text = ''): void {
    panel.replaceChildren();
    panel.style.display = '';
    const box = el('div', '', panel);
    if (kind === 'menu') {
      el('h2', '', box, data.title);
      el('p', '', box, data.intro);
      el('p', 'small', box, data.address);
      el(
        'p',
        'small',
        box,
        pilot
          ? data.pilot.replace('{name}', pilot.name).replace('{role}', pilot.role)
          : data.noPilot,
      );
      const t = el('table', '', box);
      for (const [k, v] of data.controls) {
        const tr = el('tr', '', t);
        el('td', '', tr, k);
        el('td', '', tr, v);
      }
      el('div', 'go', box, data.start);
    } else if (kind === 'paused') {
      el('h2', '', box, 'Paused');
      el('p', 'fact', box, pick(data.facts));
      el('div', 'go', box, data.paused);
    } else {
      el('h2', '', box, 'Crashed');
      el('p', '', box, text);
      el('p', 'fact', box, `Real info: ${pick(data.facts)}`);
      el(
        'p',
        'small',
        box,
        `${data.remaining}: ${rings.filter((r) => r.visited).length}/${rings.length}`,
      );
      el('div', 'go', box, data.restart);
    }
  }

  function fly(): void {
    if (mode === 'crashed' || mode === 'menu') reset();
    mode = 'fly';
    panel.style.display = 'none';
    last = performance.now();
  }

  function pause(): void {
    if (mode !== 'fly') return;
    mode = 'paused';
    keys.clear();
    showPanel('paused');
  }

  function reset(): void {
    resetPlane(plane, START.x, START.z, START.alt, START.heading);
    plane.mesh.visible = true;
    plane.mesh.position.copy(plane.pos);
    plane.mesh.quaternion.copy(plane.quat);
    snapCamera = true;
    landedSaid = false;
  }

  function crash(kind: Crash): void {
    if (mode !== 'fly') return;
    mode = 'crashed';
    boom(700, 0.4);
    shake = 1;
    plane.mesh.visible = false;
    fire.position.copy(plane.pos);
    fire.visible = true;
    fireT = 0;
    for (let i = 0; i < 24; i++) {
      if (debris.length >= MAX_DEBRIS) scene.remove(debris.shift()!.mesh);
      const mesh = new THREE.Mesh(debrisGeom, pick(debrisMats));
      mesh.position.copy(plane.pos);
      const vel = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.8 + 0.2,
        Math.random() - 0.5,
      )
        .multiplyScalar(22)
        .addScaledVector(plane.vel, 0.3);
      scene.add(mesh);
      debris.push({ mesh, vel, life: 4 + Math.random() * 2 });
    }
    timers.push(
      window.setTimeout(
        () => mode === 'crashed' && showPanel('crashed', pick(data.crash[kind])),
        1200,
      ),
    );
  }

  // Input.
  const keys = new Set<string>();
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape') return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.code === 'Space' && mode !== 'fly' && !e.repeat) {
      fly();
      return;
    }
    if (e.code === 'KeyP' && !e.repeat) {
      if (mode === 'fly') pause();
      else if (mode === 'paused') fly();
      return;
    }
    if (e.code === 'KeyC' && !e.repeat) {
      cockpit = !cockpit;
      snapCamera = true;
    }
    keys.add(e.code);
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => pause();
  panel.addEventListener('click', fly);
  addEventListener('keydown', onKeyDown, true);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  function resize(): void {
    const w = root.clientWidth || 1;
    const h = root.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  const ctl: Controls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
  const fwd = new THREE.Vector3();
  const nose = new THREE.Vector3();
  const [bx0, bz0, bx1, bz1] = BOUNDS;
  let cockpit = false;
  let snapCamera = true;
  let landedSaid = false;
  let shake = 0;
  let stallBeep = 0;
  let offMapSaid = 0;

  function axis(neg: string[], pos: string[]): number {
    return (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);
  }

  function update(dt: number): void {
    ctl.throttle = axis(['KeyS'], ['KeyW']);
    // Up arrow pushes the nose down, like a stick.
    ctl.pitch = axis(['ArrowUp'], ['ArrowDown']);
    ctl.roll = axis(['ArrowLeft'], ['ArrowRight']);
    ctl.yaw = axis(['KeyA'], ['KeyD']);

    // Past the edge of the map: bank back toward the middle.
    const out = Math.max(
      bx0 - plane.pos.x,
      plane.pos.x - bx1,
      bz0 - plane.pos.z,
      plane.pos.z - bz1,
    );
    if (out > OFF_MAP && !plane.onGround) {
      forwardOf(plane, fwd);
      const tx = (bx0 + bx1) / 2 - plane.pos.x;
      const tz = (bz0 + bz1) / 2 - plane.pos.z;
      const cross =
        (fwd.x * tz - fwd.z * tx) / (Math.hypot(tx, tz) * Math.hypot(fwd.x, fwd.z) || 1);
      const ahead = fwd.x * tx + fwd.z * tz > 0;
      ctl.roll = ahead ? THREE.MathUtils.clamp(cross * 3, -1, 1) : 1;
      offMapSaid -= dt;
      if (offMapSaid <= 0) {
        say(data.offMap);
        offMapSaid = 12;
      }
    }

    stepPlane(plane, ctl, dt);
    forwardOf(plane, fwd);

    // Buildings: the body or the nose inside one below its roof.
    nose.copy(plane.pos).addScaledVector(fwd, 4.5);
    if (
      plane.pos.y < world.roofAt(plane.pos.x, plane.pos.z) + 0.3 ||
      nose.y < world.roofAt(nose.x, nose.z)
    ) {
      crash('building');
      return;
    }

    // Ground: gentle, level and slow enough lands; anything else crashes.
    if (plane.onGround) {
      if (plane.pos.y > WHEELS + 0.2) plane.onGround = false;
      else plane.pos.y = WHEELS;
      if (world.isWater(plane.pos.x, plane.pos.z)) crash('water');
    } else if (plane.pos.y <= WHEELS) {
      if (world.isWater(plane.pos.x, plane.pos.z)) return crash('water');
      if (plane.vel.y < -8 || Math.abs(bankOf(plane)) > 25 || fwd.y < -0.35 || plane.speed > 48)
        return crash('ground');
      plane.onGround = true;
      plane.pos.y = WHEELS;
      plane.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-fwd.x, -fwd.z));
      beep(220, 120);
      if (!landedSaid) say(pick(data.landed));
      landedSaid = true;
    }
    plane.mesh.position.copy(plane.pos);
    plane.mesh.quaternion.copy(plane.quat);

    // Rings.
    for (const r of rings) {
      if (r.visited || plane.pos.distanceTo(r.pos) > RING + 1) continue;
      r.visited = true;
      r.ring.material = doneMat;
      r.beam.visible = false;
      fanfare();
      say(data.markers[r.marker.id as keyof typeof data.markers]);
      if (rings.every((x) => x.visited))
        timers.push(window.setTimeout(() => say(data.allVisited), 2500));
    }

    stallBeep -= dt;
    if (plane.stalled && stallBeep <= 0) {
      beep(660, 90);
      stallBeep = 0.5;
    }
  }

  function updateHud(): void {
    spd.textContent = `SPD ${String(Math.round(plane.speed * 1.944)).padStart(3)} kt`;
    alt.textContent = `ALT ${String(Math.round(plane.pos.y - WHEELS)).padStart(3)} m`;
    thrBar.style.width = `${Math.round(plane.throttle * 100)}%`;
    const stalled = mode === 'fly' && plane.stalled && plane.speed < STALL_SPEED;
    warn.style.display = stalled ? 'block' : 'none';
    warn.textContent = data.stall;
    count.textContent = `${data.remaining}: ${rings.filter((r) => r.visited).length}/${rings.length}`;

    // Arrow to the nearest ring not yet flown through.
    let best: Ring | undefined;
    let bestD = Infinity;
    for (const r of rings) {
      const d = Math.hypot(r.pos.x - plane.pos.x, r.pos.z - plane.pos.z);
      if (!r.visited && d < bestD) {
        best = r;
        bestD = d;
      }
    }
    nav.style.display = best ? '' : 'none';
    if (!best) return;
    forwardOf(plane, fwd);
    const heading = Math.atan2(fwd.x, -fwd.z);
    const bearing = Math.atan2(best.pos.x - plane.pos.x, -(best.pos.z - plane.pos.z));
    arrow.style.transform = `rotate(${bearing - heading}rad)`;
    navText.textContent = `${best.marker.name} ${Math.round(bestD)} m`;
  }

  const camTarget = new THREE.Vector3();
  const look = new THREE.Vector3();
  function updateCamera(dt: number): void {
    forwardOf(plane, fwd);
    if (cockpit && plane.mesh.visible) {
      camera.position.set(0, 2.3, -1.2).applyQuaternion(plane.quat).add(plane.pos);
      camera.quaternion.copy(plane.quat);
    } else {
      // Chase camera behind and above, following the horizontal heading.
      const flat = new THREE.Vector3(fwd.x, 0, fwd.z);
      if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
      flat.normalize();
      camTarget
        .copy(plane.pos)
        .addScaledVector(flat, -22)
        .add(new THREE.Vector3(0, 7 + fwd.y * -8, 0));
      camTarget.y = Math.max(camTarget.y, world.roofAt(camTarget.x, camTarget.z) + 2, 1.5);
      if (snapCamera) camera.position.copy(camTarget);
      else camera.position.lerp(camTarget, 1 - Math.exp(-dt * 4));
      look.copy(plane.pos).addScaledVector(fwd, 12);
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
    }
    snapCamera = false;
    if (shake > 0.01) {
      const s = shake * (slow < 1 ? 0.4 : 1);
      camera.position.add(
        new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).multiplyScalar(s * 2),
      );
      shake *= Math.exp(-dt * 3);
    }
  }

  reset();
  showPanel('menu');
  let last = performance.now();
  let raf = 0;
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000) * slow;
    last = now;
    if (mode === 'fly') update(dt);

    for (const r of rings) r.ring.rotation.y += dt * 0.8;
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      d.vel.y -= 9.8 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += dt * 4;
      d.mesh.rotation.z += dt * 3;
      if (d.mesh.position.y < 0.4) {
        d.mesh.position.y = 0.4;
        d.vel.multiplyScalar(0.5).setY(Math.abs(d.vel.y) * 0.3);
      }
      if (d.life > 0) continue;
      scene.remove(d.mesh);
      debris.splice(i, 1);
    }
    if (fire.visible) {
      fireT += dt;
      fire.scale.setScalar(2 + fireT * 14);
      fireMat.opacity = Math.max(0, 0.9 - fireT * 0.8);
      if (fireMat.opacity <= 0) fire.visible = false;
    }

    shadow.visible = plane.mesh.visible;
    shadow.position.set(plane.pos.x, world.roofAt(plane.pos.x, plane.pos.z) + 0.05, plane.pos.z);
    shadowMat.opacity = THREE.MathUtils.clamp(
      0.35 - (plane.pos.y - shadow.position.y) / 300,
      0.05,
      0.35,
    );

    updateCamera(dt);
    updateHud();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    timers.forEach(clearTimeout);
    removeEventListener('keydown', onKeyDown, true);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
    for (const r of rings) {
      r.label.material.map?.dispose();
      r.label.material.dispose();
    }
    ringGeom.dispose();
    beamGeom.dispose();
    ringMat.dispose();
    doneMat.dispose();
    beamMat.dispose();
    shadowGeom.dispose();
    shadowMat.dispose();
    debrisGeom.dispose();
    debrisMats.forEach((m) => m.dispose());
    fire.geometry.dispose();
    fireMat.dispose();
    faceTex?.dispose();
    disposePlane(plane);
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    wrap.remove();
  };
}
