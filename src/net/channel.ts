import type { Msg } from './protocol';

/** Lien vers un pair : voie fiable ordonnée + voie rapide sans retransmission. */
export interface Channel {
  sendReliable(m: Msg): void;
  sendFast(m: Msg): void;
  /** Un seul abonné : un nouvel appel remplace le précédent. */
  onMessage(fn: (m: Msg) => void): void;
  onClose(fn: () => void): void;
  close(): void;
}

type End = { msg: (m: Msg) => void; closed: () => void };

/**
 * Deux bouts reliés en mémoire, livraison synchrone. Sert à l'hôte pour son propre joueur
 * et aux tests. `dropFast` simule les pertes de la voie rapide.
 */
export function memoryChannelPair(opts: { dropFast?: () => boolean } = {}): [Channel, Channel] {
  const ends: [End, End] = [
    { msg: () => undefined, closed: () => undefined },
    { msg: () => undefined, closed: () => undefined },
  ];
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    ends[0].closed();
    ends[1].closed();
  };
  const make = (me: 0 | 1): Channel => {
    const other = ends[1 - me];
    return {
      sendReliable: (m) => {
        if (open) other.msg(m);
      },
      sendFast: (m) => {
        if (open && !opts.dropFast?.()) other.msg(m);
      },
      onMessage: (fn) => {
        ends[me].msg = fn;
      },
      onClose: (fn) => {
        ends[me].closed = fn;
      },
      close,
    };
  };
  return [make(0), make(1)];
}
