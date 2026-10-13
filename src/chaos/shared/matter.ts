// Matter.js bootstrap: engine plus running runner, and an optional debug canvas renderer.
import type MatterNS from 'matter-js';

export interface MatterWorld {
  Matter: typeof MatterNS;
  engine: MatterNS.Engine;
  runner: MatterNS.Runner;
  render?: MatterNS.Render;
  stop: () => void;
}

export async function startMatter(
  root?: HTMLElement,
  renderOpts: MatterNS.IRendererOptions = {},
): Promise<MatterWorld> {
  const Matter = (await import('matter-js')).default;
  const engine = Matter.Engine.create();
  const runner = Matter.Runner.create();
  let render: MatterNS.Render | undefined;
  if (root) {
    render = Matter.Render.create({
      element: root,
      engine,
      options: {
        width: root.clientWidth,
        height: root.clientHeight,
        wireframes: false,
        background: 'transparent',
        ...renderOpts,
      },
    });
    Matter.Render.run(render);
  }
  Matter.Runner.run(runner, engine);
  return {
    Matter,
    engine,
    runner,
    render,
    stop: () => {
      Matter.Runner.stop(runner);
      if (render) {
        Matter.Render.stop(render);
        render.canvas.remove();
      }
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    },
  };
}
