import type { View } from '../render/canvas';
import { Camera, ZOOM_LEVELS } from '../render/camera';
import { Renderer } from '../render/renderer';
import { Fog } from '../sim/fog';
import type { GameMap } from '../sim/terrain';

/** The setup screen's background: the previewed map, fully revealed, drifting slowly. */
export class MenuBackdrop {
  private readonly renderer: Renderer;
  private readonly camera: Camera;
  private t = 0;

  constructor(
    private readonly view: View,
    private readonly map: GameMap,
  ) {
    const fog = new Fog(map.size);
    fog.revealAll();
    this.renderer = new Renderer(view, map, fog);
    this.camera = new Camera(map.size);
    this.camera.level = ZOOM_LEVELS.length - 1;
    this.camera.scale = ZOOM_LEVELS[this.camera.level];
  }

  frame(dtMs: number): void {
    this.t += Math.min(dtMs, 100) / 1000;
    const s = this.map.starts[0];
    const N = this.map.size;
    this.camera.setView(this.view.width, this.view.height);
    // A slow loop from the first base toward the map centre and back.
    const k = (1 - Math.cos(this.t * 0.04)) / 2;
    this.camera.centerOn(s.x + (N / 2 - s.x) * k + Math.sin(this.t * 0.11) * 4, s.y + (N / 2 - s.y) * k + Math.cos(this.t * 0.09) * 3);
    this.renderer.draw(this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
