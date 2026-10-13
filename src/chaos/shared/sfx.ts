// WebAudio beeps. Every call no-ops if audio is unavailable.
let ctx: AudioContext | null | undefined;

function audio(): AudioContext | null {
  if (ctx === undefined) {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
  }
  if (ctx?.state === 'suspended') void ctx.resume();
  return ctx;
}

export function beep(
  freq: number,
  ms = 100,
  type: OscillatorType = 'square',
  vol = 0.1,
  delay = 0,
): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay / 1000;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

export const blip = () => beep(880, 60);

// Short white-noise burst.
export function boom(ms = 300, vol = 0.3): void {
  const a = audio();
  if (!a) return;
  const len = Math.floor((a.sampleRate * ms) / 1000);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const gain = a.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(gain).connect(a.destination);
  src.start();
}

export function fanfare(): void {
  [523, 659, 784, 1047].forEach((f, i) => beep(f, 150, 'square', 0.08, i * 120));
}
