// Kaplay bootstrap: a canvas filling root, non-global context, and a stop fn.
import type { KAPLAYCtx, KAPLAYOpt } from 'kaplay';

export async function startKaplay(
  root: HTMLElement,
  opts: KAPLAYOpt = {},
): Promise<{ k: KAPLAYCtx; stop: () => void }> {
  const { default: kaplay } = await import('kaplay');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  root.append(canvas);
  const k = kaplay({ canvas, global: false, background: [20, 20, 30], ...opts });
  canvas.focus();
  return {
    k,
    stop: () => {
      k.quit();
      canvas.remove();
    },
  };
}
