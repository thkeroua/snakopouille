export type Msg =
  | { t: 'hello'; name: string; role: 'host' | 'guest' }
  | { t: 'ping'; seq: number; ts: number } // ts = performance.now() de l'émetteur
  | { t: 'pong'; seq: number; ts: number } // renvoie le ts reçu tel quel
  | { t: 'heads'; seq: number; ts: number; data: number[] }; // 8 serpents × [x, y, angle, boost]

export type ChannelKind = 'reliable' | 'fast';
