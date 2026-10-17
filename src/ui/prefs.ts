// Pseudo et couleur mémorisés sur l'appareil (spec §3). Le stockage peut être bloqué : jamais d'exception.
import { RENDER } from '../config/render';
import type { ColorIndex } from '../net/protocol';

export type Prefs = { name: string; color: ColorIndex };

const NAME_KEY = 'snk-name';
const COLOR_KEY = 'snk-color';

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadPrefs(storage: Storage | null = defaultStorage()): Prefs {
  let name = '';
  let color = 0;
  try {
    name = storage?.getItem(NAME_KEY) ?? '';
    const c = Number(storage?.getItem(COLOR_KEY));
    if (Number.isInteger(c) && c >= 0 && c < RENDER.playerColors.length) color = c;
  } catch {
    // stockage indisponible : valeurs par défaut
  }
  return { name, color };
}

export function savePrefs(p: Prefs, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(NAME_KEY, p.name);
    storage?.setItem(COLOR_KEY, String(p.color));
  } catch {
    // tant pis : on redemandera
  }
}
