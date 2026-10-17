import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { Match, SIM_DT } from '../../src/game/match';
import { targetLengthFor } from '../../src/game/sizing';
import type { SnakeInput } from '../../src/game/types';

test('tick with 20k snake under budget', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({ id: `P${i}`, name: `P${i}`, color: '#fff' }));
  const m = new Match(players, GAMEPLAY, 1, ['#ffd84a']);
  for (let i = 0; i < 300; i++) m.host.food.spawnNatural(1);
  const big = m.snakes[0];
  big.points = 20000;
  // Corps en « tondeuse » à sa longueur cible.
  const target = targetLengthFor(20000, GAMEPLAY);
  big.path.reset({ x: 150, y: 150 });
  let dir = 1;
  let x = 150;
  let y = 150;
  while (big.path.length() < target) {
    x += dir * 2;
    if (x > 1450 || x < 150) {
      dir = -dir;
      x += dir * 2;
      for (let k = 0; k < 75; k++) big.path.moveHead({ x, y: (y += 2) });
      if (y > 850) y = 150;
    }
    big.path.moveHead({ x, y });
  }
  big.angle = dir > 0 ? 0 : Math.PI;
  const inputs = new Map<string, SnakeInput>([[big.id, { target: null, boost: true }]]);
  const t0 = performance.now();
  for (let i = 0; i < 120; i++) m.tick(SIM_DT, inputs);
  const avg = (performance.now() - t0) / 120;
  console.log(`avg tick ${avg.toFixed(3)} ms, big samples ${big.path.count()}`);
  expect(avg).toBeLessThan(2);
});
