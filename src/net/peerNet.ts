// Réseau réel : PeerJS (signalisation) + WebRTC. Validé à la main (spike, puis tablettes).
import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { GAMEPLAY } from '../config/gameplay';
import type { Channel } from './channel';
import { generateCode, peerIdForCode } from './code';
import type { Msg } from './protocol';
import { SLOTS, fetchPublicIp, peerIdForSlot, roomIdFromIp } from './roomId';
import { claimSlot } from './slots';

const PEER_OPTIONS: PeerOptions = {
  debug: 1,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
};
const CODE_ATTEMPTS = 5;
const PROBE_CLOSE_MS = 500;

export type GameInfo = { peerId: string; slot: number; name: string; players: number; max: number; playing: boolean };

const errType = (e: unknown): string => (e as { type?: string }).type ?? String(e);

export async function getRoomId(): Promise<string | null> {
  try {
    return await roomIdFromIp(await fetchPublicIp());
  } catch {
    return null;
  }
}

/** Ouvre un Peer sous `id` ; 'taken' si l'id est déjà utilisé. */
function openPeer(id: string, keep: Peer[]): Promise<'ok' | 'taken'> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, PEER_OPTIONS);
    peer.once('open', () => {
      keep.push(peer);
      resolve('ok');
    });
    peer.once('error', (e) => {
      if (keep.includes(peer)) return;
      peer.destroy();
      if (errType(e) === 'unavailable-id') resolve('taken');
      else reject(e);
    });
  });
}

/**
 * Voie fiable = la DataConnection PeerJS ; voie rapide = canal négocié sans retransmission
 * sur la même RTCPeerConnection (PeerJS `reliable:false` retransmet quand même, cf. spike).
 * Résout une fois les deux ouverts.
 */
async function toChannel(conn: DataConnection): Promise<Channel> {
  // Comme dans le spike (validé) : le canal rapide naît une fois la connexion PeerJS ouverte.
  if (!conn.open) await new Promise<void>((resolve) => conn.once('open', () => resolve()));
  const pc = conn.peerConnection;
  const fast = pc.createDataChannel('fast', { negotiated: true, id: 7, ordered: false, maxRetransmits: 0 });
  // Ce qui arrive avant l'abonnement (le 'join' d'un invité, typiquement) est gardé.
  const early: Msg[] = [];
  let onMsg: (m: Msg) => void = (m) => early.push(m);
  let onClosed: () => void = () => undefined;
  let closed = false;
  const fireClose = () => {
    if (closed) return;
    closed = true;
    onClosed();
  };
  conn.on('data', (raw) => onMsg(raw as Msg));
  conn.on('close', fireClose);
  conn.on('error', fireClose);
  pc.addEventListener('iceconnectionstatechange', () => {
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') fireClose();
  });
  fast.addEventListener('message', (e: MessageEvent) => {
    try {
      onMsg(JSON.parse(e.data as string) as Msg);
    } catch {
      // paquet illisible : ignoré
    }
  });
  const channel: Channel = {
    sendReliable: (m) => {
      if (!closed && conn.open) void conn.send(m);
    },
    sendFast: (m) => {
      if (!closed && fast.readyState === 'open') fast.send(JSON.stringify(m));
    },
    onMessage: (fn) => {
      onMsg = fn;
      for (const m of early.splice(0)) fn(m);
    },
    onClose: (fn) => {
      onClosed = fn;
    },
    close: () => {
      conn.close();
      fireClose();
    },
  };
  if (fast.readyState !== 'open') {
    await new Promise<void>((resolve) => fast.addEventListener('open', () => resolve(), { once: true }));
  }
  return channel;
}

export async function openHost(
  roomId: string | null,
  probeInfo: () => Msg,
  onGuest: (ch: Channel) => void,
): Promise<{ slot: number | null; code: string; destroy(): void }> {
  const peers: Peer[] = [];
  let slot: number | null = null;
  if (roomId) {
    try {
      slot = (await claimSlot((id) => openPeer(id, peers), roomId))?.slot ?? null;
    } catch {
      slot = null;
    }
  }
  let code = '';
  for (let i = 0; i < CODE_ATTEMPTS && !code; i++) {
    const candidate = generateCode();
    try {
      if ((await openPeer(peerIdForCode(candidate), peers)) === 'ok') code = candidate;
    } catch {
      break;
    }
  }
  const onConnection = (conn: DataConnection) => {
    const meta = (conn.metadata ?? {}) as { probe?: boolean };
    if (meta.probe) {
      conn.on('open', () => {
        void conn.send(probeInfo());
        setTimeout(() => conn.close(), PROBE_CLOSE_MS);
      });
      return;
    }
    void toChannel(conn).then(onGuest);
  };
  for (const p of peers) p.on('connection', onConnection);
  return {
    slot,
    code,
    destroy: () => {
      for (const p of peers) p.destroy();
    },
  };
}

export function findGames(roomId: string, timeoutMs: number = GAMEPLAY.net.probeTimeoutMs): Promise<GameInfo[]> {
  return new Promise((resolve) => {
    const peer = new Peer(PEER_OPTIONS);
    const found: GameInfo[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      peer.destroy();
      resolve(found.sort((a, b) => a.slot - b.slot));
    };
    // Sans réponse du serveur PeerJS, on rend une liste vide plutôt que d'attendre.
    const guard = setTimeout(finish, timeoutMs * 2);
    peer.on('error', () => undefined); // 'peer-unavailable' pour chaque slot libre
    peer.once('open', () => {
      const probes = SLOTS.map(
        (slot) =>
          new Promise<void>((done1) => {
            const peerId = peerIdForSlot(roomId, slot);
            const conn = peer.connect(peerId, { metadata: { probe: true }, serialization: 'json' });
            const timer = setTimeout(() => {
              conn.close();
              done1();
            }, timeoutMs);
            conn.on('data', (raw) => {
              const m = raw as Msg;
              if (m.t !== 'hello') return;
              found.push({ peerId, slot, name: String(m.name), players: m.players, max: m.max, playing: m.playing });
              clearTimeout(timer);
              conn.close();
              done1();
            });
          }),
      );
      void Promise.all(probes).then(() => {
        clearTimeout(guard);
        finish();
      });
    });
  });
}

export function connectToHost(peerId: string, timeoutMs: number = GAMEPLAY.net.connectTimeoutMs): Promise<Channel> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTIONS);
    let settled = false;
    const fail = (why: string) => {
      if (settled) return;
      settled = true;
      peer.destroy();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('timeout'), timeoutMs);
    peer.on('error', (e) => fail(errType(e) === 'peer-unavailable' ? 'unavailable' : errType(e)));
    peer.once('open', () => {
      const conn = peer.connect(peerId, { reliable: true, serialization: 'json', metadata: { channel: 'game' } });
      void toChannel(conn).then((ch) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Fermer le canal libère aussi le Peer de signalisation.
        const close = ch.close;
        ch.close = () => {
          close();
          peer.destroy();
        };
        resolve(ch);
      });
    });
  });
}
