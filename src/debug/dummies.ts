// Serpents « mannequins » de DEBUG pour tester les collisions en solo.
// Ce n'est PAS la fonctionnalité « bots » prévue dans decisions.md.
import type { Rng } from '../game/rng';
import type { SnakeState } from '../game/snakeMotion';
import type { SnakeInput, Vec } from '../game/types';

const RETARGET_S = 2;
const BOOST_SHARE = 0.1;

const memory = new WeakMap<SnakeState, { target: Vec; until: number; boost: boolean }>();

export function dummyInput(s: SnakeState, time: number, rng: Rng, worldW = 1600, worldH = 1000): SnakeInput {
  let m = memory.get(s);
  if (!m || time >= m.until || !s.alive) {
    m = {
      target: { x: rng.range(50, worldW - 50), y: rng.range(50, worldH - 50) },
      until: time + RETARGET_S,
      boost: rng.next() < BOOST_SHARE,
    };
    memory.set(s, m);
  }
  return { target: m.target, boost: m.boost };
}
