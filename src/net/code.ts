// Sans 0, O, 1, I, L : évite les confusions à la saisie.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

export function generateCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(input: string): string | null {
  const code = input.replace(/\s+/g, '').toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const c of code) if (!CODE_ALPHABET.includes(c)) return null;
  return code;
}

export function peerIdForCode(code: string): string {
  return `snakopouille-code-${code}`;
}
