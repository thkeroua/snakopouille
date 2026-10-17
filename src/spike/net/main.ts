import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { readCandidateType, type CandidateType } from './candidate';
import { generateCode, normalizeCode, peerIdForCode } from './code';
import type { ChannelKind, Msg } from './protocol';
import { SLOTS, fetchPublicIp, peerIdForSlot, roomIdFromIp } from './roomId';
import { claimSlot } from './slots';
import { summarize, type Summary } from './stats';

const PEER_OPTIONS: PeerOptions = {
  debug: 1,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
};
const PROBE_TIMEOUT_MS = 4000;
const PING_HZ = 20;
const PHASE_MS = 30_000;
const LOST_AFTER_MS = 1000;
const HEADS_HZ = 20;

// ---------- UI ----------

document.head.insertAdjacentHTML(
  'beforeend',
  `<style>
    body { margin: 0; background: #0b0e1f; color: #e8ebff; font: 18px sans-serif; }
    main { max-width: 900px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    button, input { font: inherit; padding: 14px 18px; border-radius: 10px; border: 0; }
    button { background: #1b2140; color: #5dff8a; font-weight: bold; min-height: 56px; }
    button:disabled { opacity: .4; }
    input { background: #fff; color: #000; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .row > * { flex: 1 1 200px; }
    #status { color: #9aa3d0; }
    #games button { width: 100%; margin-top: 6px; color: #ffd84a; }
    pre { background: #000; padding: 12px; border-radius: 8px; white-space: pre-wrap; font-size: 14px; margin: 0; }
    #log { max-height: 240px; overflow: auto; color: #9aa3d0; }
    h2 { margin: 8px 0 0; font-size: 18px; color: #ff4af0; }
  </style>`,
);

document.getElementById('app')!.innerHTML = `
  <main>
    <h1>Snakopouille — test réseau</h1>
    <input id="name" placeholder="Pseudo" maxlength="16">
    <div id="status">IP publique : recherche…</div>
    <div class="row">
      <button id="host">Héberger</button>
      <button id="search" disabled>Chercher des parties</button>
    </div>
    <div id="games"></div>
    <div class="row">
      <input id="code" placeholder="Code (ex. K7QZ)" maxlength="6" autocapitalize="characters">
      <button id="joinCode">Rejoindre par code</button>
    </div>
    <h2>Résultats</h2>
    <pre id="results">(pas encore de mesure)</pre>
    <button id="copy">Copier les résultats</button>
    <h2>Journal</h2>
    <pre id="log"></pre>
  </main>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $<HTMLInputElement>('name');
const statusEl = $('status');
const hostBtn = $<HTMLButtonElement>('host');
const searchBtn = $<HTMLButtonElement>('search');
const gamesEl = $('games');
const codeInput = $<HTMLInputElement>('code');
const joinCodeBtn = $<HTMLButtonElement>('joinCode');
const resultsEl = $('results');
const logEl = $('log');

nameInput.value = localStorage.getItem('spike-name') ?? '';
nameInput.addEventListener('change', () => localStorage.setItem('spike-name', nameInput.value));
const myName = () => nameInput.value.trim() || 'Anonyme';

const logLines: string[] = [];
const errors: string[] = [];
function log(msg: string) {
  logLines.push(`${new Date().toLocaleTimeString()} ${msg}`);
  if (logLines.length > 30) logLines.shift();
  logEl.textContent = logLines.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}
function logError(msg: string) {
  errors.push(msg);
  log(`ERREUR ${msg}`);
}

// ---------- état commun ----------

let publicIp: string | null = null;
let roomId: string | null = null;
let mode: 'slot' | 'code' | null = null;

(async () => {
  try {
    publicIp = await fetchPublicIp();
    roomId = await roomIdFromIp(publicIp);
    statusEl.textContent = `IP publique : ${maskIp(publicIp)} — salon : ${roomId}`;
    searchBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = 'IP publique indisponible — utilisez le code';
    logError(`ipify: ${String(e)}`);
  }
})();

function maskIp(ip: string): string {
  const parts = ip.split('.');
  return parts.length === 4 ? `x.x.${parts[2]}.${parts[3]}` : ip;
}

function errType(e: unknown): string {
  return (e as { type?: string }).type ?? String(e);
}

// ---------- hôte ----------

hostBtn.addEventListener('click', async () => {
  hostBtn.disabled = searchBtn.disabled = joinCodeBtn.disabled = true;
  const peers: Peer[] = [];
  let slotLabel = 'aucun slot (pas d’IP publique)';

  if (roomId) {
    try {
      const claim = await claimSlot((id) => openPeer(id, peers), roomId);
      slotLabel = claim ? `slot ${claim.slot}` : 'les 4 slots sont pris';
    } catch (e) {
      logError(`slot: ${errType(e)}`);
    }
  }

  let code = '';
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = generateCode();
    try {
      if ((await openPeer(peerIdForCode(candidate), peers)) === 'ok') code = candidate;
    } catch (e) {
      logError(`code: ${errType(e)}`);
      break;
    }
  }

  statusEl.textContent = `Hôte — ${slotLabel} — code ${code || 'indisponible'}`;
  log(`hébergement prêt (${slotLabel}, code ${code})`);
  for (const p of peers) p.on('connection', onHostConnection);
});

/** Ouvre un Peer sous `id` ; 'taken' si l'id est déjà utilisé. Les Peer ouverts sont gardés dans `keep`. */
function openPeer(id: string, keep: Peer[]): Promise<'ok' | 'taken'> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, PEER_OPTIONS);
    peer.once('open', () => {
      keep.push(peer);
      resolve('ok');
    });
    peer.once('error', (e) => {
      if (errType(e) === 'unavailable-id') {
        peer.destroy();
        resolve('taken');
      } else if (!keep.includes(peer)) {
        peer.destroy();
        reject(e);
      } else {
        logError(`peer ${id}: ${errType(e)}`);
      }
    });
  });
}

const guests = new Set<DataConnection>();
let headsTimer: number | undefined;

function onHostConnection(conn: DataConnection) {
  const meta = (conn.metadata ?? {}) as { probe?: boolean; channel?: ChannelKind; name?: string };
  conn.on('open', () => {
    send(conn, { t: 'hello', name: myName(), role: 'host' });
    if (meta.probe) {
      setTimeout(() => conn.close(), 500);
      return;
    }
    log(`invité ${meta.name ?? '?'} connecté (${meta.channel})`);
    if (meta.channel === 'fast') {
      guests.add(conn);
      headsTimer ??= window.setInterval(sendHeads, 1000 / HEADS_HZ);
    }
  });
  conn.on('data', (raw) => {
    const msg = raw as Msg;
    if (msg.t === 'ping') send(conn, { t: 'pong', seq: msg.seq, ts: msg.ts });
  });
  conn.on('close', () => {
    guests.delete(conn);
    log(`invité ${meta.name ?? '?'} parti (${meta.channel ?? 'sonde'})`);
  });
  conn.on('error', (e) => logError(`conn hôte: ${errType(e)}`));
}

let headsSeq = 0;
function sendHeads() {
  const t = performance.now() / 1000;
  const data: number[] = [];
  for (let i = 0; i < 8; i++) {
    data.push(800 + 600 * Math.cos(t * 0.5 + i), 500 + 400 * Math.sin(t * 0.7 + i), (t + i) % (2 * Math.PI), i % 2);
  }
  const msg: Msg = { t: 'heads', seq: headsSeq++, ts: performance.now(), data };
  for (const g of guests) send(g, msg);
}

function send(conn: DataConnection, msg: Msg) {
  if (conn.open) void conn.send(msg);
}

// ---------- découverte ----------

searchBtn.addEventListener('click', () => {
  if (!roomId) return;
  const room = roomId;
  searchBtn.disabled = true;
  gamesEl.textContent = 'Recherche…';
  const peer = new Peer(PEER_OPTIONS);
  const started = performance.now();
  peer.on('error', (e) => {
    if (errType(e) !== 'peer-unavailable') logError(`recherche: ${errType(e)}`);
  });
  peer.once('open', () => {
    const found: { slot: number; name: string }[] = [];
    const probes = SLOTS.map(
      (slot) =>
        new Promise<void>((resolve) => {
          const conn = peer.connect(peerIdForSlot(room, slot), { metadata: { probe: true }, serialization: 'json' });
          const timer = setTimeout(() => {
            conn.close();
            resolve();
          }, PROBE_TIMEOUT_MS);
          conn.on('data', (raw) => {
            const msg = raw as Msg;
            if (msg.t !== 'hello') return;
            found.push({ slot, name: msg.name });
            log(`partie trouvée slot ${slot} en ${Math.round(performance.now() - started)} ms`);
            clearTimeout(timer);
            conn.close();
            resolve();
          });
        }),
    );
    void Promise.all(probes).then(() => {
      peer.destroy();
      searchBtn.disabled = false;
      gamesEl.innerHTML = '';
      if (found.length === 0) gamesEl.textContent = 'Aucune partie trouvée sur ce Wi-Fi.';
      for (const g of found.sort((a, b) => a.slot - b.slot)) {
        const b = document.createElement('button');
        b.textContent = `Partie de ${g.name} (slot ${g.slot}) — Rejoindre`;
        b.addEventListener('click', () => {
          mode = 'slot';
          join(peerIdForSlot(room, g.slot));
        });
        gamesEl.appendChild(b);
      }
    });
  });
});

joinCodeBtn.addEventListener('click', () => {
  const code = normalizeCode(codeInput.value);
  if (!code) {
    log('Code invalide');
    codeInput.focus();
    return;
  }
  mode = 'code';
  join(peerIdForCode(code));
});

// ---------- invité + mesures ----------

function join(hostPeerId: string) {
  hostBtn.disabled = searchBtn.disabled = joinCodeBtn.disabled = true;
  gamesEl.innerHTML = '';
  const clickedAt = performance.now();
  const peer = new Peer(PEER_OPTIONS);
  peer.on('error', (e) => logError(`invité: ${errType(e)}`));
  peer.once('open', () => {
    const open = (channel: ChannelKind) =>
      new Promise<DataConnection>((resolve) => {
        const conn = peer.connect(hostPeerId, {
          reliable: channel === 'reliable',
          serialization: 'json',
          metadata: { channel, name: myName() },
        });
        conn.on('open', () => resolve(conn));
        conn.on('error', (e) => logError(`${channel}: ${errType(e)}`));
        conn.on('close', () => log(`connexion ${channel} fermée`));
      });
    void Promise.all([open('reliable'), open('fast')]).then(([reliable, fast]) =>
      runMeasurements(reliable, fast, performance.now() - clickedAt),
    );
  });
}

type PingResult = { rtt: Summary; lossPct: number };

async function runMeasurements(reliable: DataConnection, fast: DataConnection, connectMs: number) {
  log(`connecté en ${Math.round(connectMs)} ms — mesures pendant ${(2 * PHASE_MS) / 1000} s…`);
  let candidate: CandidateType = 'unknown';
  try {
    candidate = await readCandidateType(fast.peerConnection);
  } catch (e) {
    logError(`getStats: ${String(e)}`);
  }
  log(`type de connexion : ${candidate}`);

  const headGaps: number[] = [];
  let lastHeadAt = 0;
  fast.on('data', (raw) => {
    if ((raw as Msg).t !== 'heads') return;
    const now = performance.now();
    if (lastHeadAt) headGaps.push(now - lastHeadAt);
    lastHeadAt = now;
  });

  const partial = { connectMs, candidate } as Parameters<typeof renderResults>[0];
  renderResults(partial);
  partial.reliable = await pingPhase(reliable);
  renderResults(partial);
  partial.fast = await pingPhase(fast);
  partial.jitter = summarize(headGaps);
  renderResults(partial);
  log('mesures terminées');
}

function pingPhase(conn: DataConnection): Promise<PingResult> {
  return new Promise((resolve) => {
    const sentAt = new Map<number, number>();
    const rtts: number[] = [];
    let seq = 0;
    const onData = (raw: unknown) => {
      const msg = raw as Msg;
      if (msg.t !== 'pong' || !sentAt.has(msg.seq)) return;
      const rtt = performance.now() - msg.ts;
      sentAt.delete(msg.seq);
      if (rtt <= LOST_AFTER_MS) rtts.push(rtt);
    };
    conn.on('data', onData);
    const timer = window.setInterval(() => {
      const ts = performance.now();
      sentAt.set(seq, ts);
      send(conn, { t: 'ping', seq: seq++, ts });
    }, 1000 / PING_HZ);
    setTimeout(() => {
      clearInterval(timer);
      setTimeout(() => {
        conn.off('data', onData);
        const lossPct = seq === 0 ? 100 : ((seq - rtts.length) / seq) * 100;
        resolve({ rtt: summarize(rtts), lossPct });
      }, LOST_AFTER_MS);
    }, PHASE_MS);
  });
}

function fmt(s: Summary): string {
  const r = (v: number) => v.toFixed(1);
  return `n=${s.count} min=${r(s.min)} moy=${r(s.avg)} p50=${r(s.p50)} p95=${r(s.p95)} max=${r(s.max)} ms`;
}

function renderResults(r: {
  connectMs: number;
  candidate: CandidateType;
  reliable?: PingResult;
  fast?: PingResult;
  jitter?: Summary;
}) {
  const lines = [
    `Date : ${new Date().toISOString()}`,
    `Appareil : ${navigator.userAgent}`,
    `IP publique : ${publicIp ? maskIp(publicIp) : 'indisponible'} — salon : ${roomId ?? '-'}`,
    `Mode : ${mode}`,
    `Temps de connexion : ${Math.round(r.connectMs)} ms`,
    `Type de connexion : ${r.candidate}`,
    `RTT reliable : ${r.reliable ? fmt(r.reliable.rtt) : 'en cours…'}`,
    `Perte reliable : ${r.reliable ? r.reliable.lossPct.toFixed(1) + ' %' : '-'}`,
    `RTT fast : ${r.fast ? fmt(r.fast.rtt) : 'en attente…'}`,
    `Perte fast : ${r.fast ? r.fast.lossPct.toFixed(1) + ' %' : '-'}`,
    `Gigue heads : ${r.jitter ? fmt(r.jitter) : 'en attente…'}`,
    `Erreurs : ${errors.length ? errors.join(' | ') : 'aucune'}`,
  ];
  resultsEl.textContent = lines.join('\n');
}

// ---------- copie ----------

$('copy').addEventListener('click', async () => {
  const text = resultsEl.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    log('résultats copiés');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    log('résultats copiés (repli)');
  }
});
