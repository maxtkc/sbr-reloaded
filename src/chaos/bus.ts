// Pause/resume bus: gags stop timers and animations while a game overlay is open.
type Listener = () => void;

const pauseListeners = new Set<Listener>();
const resumeListeners = new Set<Listener>();
let paused = false;

function subscribe(set: Set<Listener>, fn: Listener): () => void {
  set.add(fn);
  return () => set.delete(fn);
}

export const onPause = (fn: Listener) => subscribe(pauseListeners, fn);
export const onResume = (fn: Listener) => subscribe(resumeListeners, fn);
export const isPaused = () => paused;

export function pause(): void {
  if (paused) return;
  paused = true;
  pauseListeners.forEach((fn) => fn());
}

export function resume(): void {
  if (!paused) return;
  paused = false;
  resumeListeners.forEach((fn) => fn());
}
