// Debug view (?sheet): every unit pose drawn large, for reviewing the art.
import type { View } from '../render/canvas';
import type { Tool } from '../render/figures';
import { UnitSprites } from '../render/unitSprites';

export function drawSpriteSheet(view: View, zoom = 4): void {
  const { ctx } = view;
  const sprites = new UnitSprites(Math.round(32 * zoom * view.dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5a8a3c';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const cell = 32 * zoom * view.dpr * 1.05;
  let col = 0, row = 0;
  const put = (type: 'villager' | 'scout', player: number, look: number, pose: Parameters<UnitSprites['get']>[3]) => {
    const sp = sprites.get(type, player, look, pose);
    const x = (col + 0.5) * cell * (type === 'scout' ? 1.5 : 1), y = (row + 0.9) * cell * 1.3;
    ctx.drawImage(sp.c, x - sp.ax, y - sp.ay);
    col++;
  };
  const base = { left: false, frame: 0, tool: 'none' as Tool, carry: null };
  for (const v of ['front', 'side', 'back'] as const) put('villager', 0, 0, { ...base, view: v, anim: 'idle' });
  for (let f = 0; f < 6; f++) put('villager', 1, 1, { ...base, view: 'side', anim: 'walk', frame: f });
  row++;
  col = 0;
  for (const tool of ['axe', 'pick', 'hammer', 'basket', 'knife', 'spear'] as Tool[]) put('villager', 0, 2 + (col % 2), { ...base, view: 'side', anim: 'work', frame: tool === 'axe' ? 0 : 2, tool });
  for (const carry of ['wood', 'food', 'gold'] as const) put('villager', 2, 4, { ...base, view: 'side', anim: 'walk', frame: 1, carry });
  row++;
  col = 0;
  for (const v of ['front', 'back'] as const) put('villager', 3, 5, { ...base, view: v, anim: 'walk', frame: 1, carry: 'stone' });
  put('scout', 0, 0, { ...base, view: 'side', anim: 'idle' });
  put('scout', 1, 0, { ...base, view: 'side', anim: 'walk', frame: 2 });
  put('scout', 2, 0, { ...base, view: 'front', anim: 'walk', frame: 1 });
  put('scout', 3, 0, { ...base, view: 'back', anim: 'walk', frame: 3 });
}
