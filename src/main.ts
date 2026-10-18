// Routeur : accueil → entraînement solo, ou partie réseau (héberger / rejoindre → salon → partie).
import { GAMEPLAY, withConfig } from './config/gameplay';
import { RENDER } from './config/render';
import { enableFullscreenOnTap } from './app/fullscreen';
import { GameShell } from './app/shell';
import { runOnline } from './app/online';
import { startSolo } from './app/solo';
import { keepAwake, releaseAwake } from './app/wakeLock';
import { ClientSession } from './net/clientSession';
import { HostSession } from './net/hostSession';
import { connectToHost, findGames, getRoomId, openHost } from './net/peerNet';
import type { Channel } from './net/channel';
import type { RejectReason } from './net/protocol';
import { hideScreen, showHome } from './ui/home';
import { showLobby } from './ui/lobby';
import { loadPrefs, savePrefs, type Prefs } from './ui/prefs';
import { bindPortraitOverlay, showEndScreen } from './ui/screens';

const params = new URLSearchParams(location.search);
const homeRoot = document.getElementById('home')!;
const lobbyRoot = document.getElementById('lobby')!;
bindPortraitOverlay(document.getElementById('portrait')!);
const shell = new GameShell();

enableFullscreenOnTap();

const durationParam = Number(params.get('duration'));
const onlineCfg =
  params.has('duration') && Number.isFinite(durationParam) && durationParam > 0
    ? withConfig(GAMEPLAY, { match: { durationS: durationParam } })
    : GAMEPLAY;

const roomIdReady = getRoomId();

const REJECT_TEXT: Record<RejectReason, string> = {
  full: 'La partie est complète (8 joueurs).',
  playing: 'La partie a déjà commencé.',
  version: 'Version différente : rechargez la page.',
};
const CANNOT_HOST = "Impossible de créer la partie (pas d'internet ?).";

// ---------- accueil ----------

function goHome(message?: string): void {
  releaseAwake();
  shell.showGame(false);
  hideScreen(lobbyRoot);
  showHome(homeRoot, {
    prefs: loadPrefs(),
    message,
    onHost: (p) => void host(p),
    onJoin: (peerId, p) => void join(peerId, p),
    onSolo: (p) => {
      savePrefs(p);
      hideScreen(homeRoot);
      startSolo(shell, params, p.name, () => goHome());
    },
    findGames: async () => {
      const room = await roomIdReady;
      return room ? findGames(room, GAMEPLAY.net.probeTimeoutMs) : null;
    },
  });
}

// ---------- partie réseau ----------

type Online = {
  session: ClientSession;
  host: HostSession | null;
  destroyNet: () => void;
  beatTimer: number;
  stopLoop: (() => void) | null;
  inGame: boolean;
};
let current: Online | null = null;

async function host(p: Prefs): Promise<void> {
  savePrefs(p);
  const h = new HostSession(onlineCfg, { seed: Date.now() >>> 0, now: () => performance.now(), colorCount: RENDER.playerColors.length });
  try {
    const net = await openHost(await roomIdReady, () => h.probeInfo(), (ch) => h.addGuest(ch));
    if (net.slot === null && !net.code) {
      net.destroy();
      goHome(CANNOT_HOST);
      return;
    }
    h.code = net.code;
    enterOnline(h.connectLocal(), p, h, net.destroy);
  } catch {
    goHome(CANNOT_HOST);
  }
}

async function join(peerId: string, p: Prefs): Promise<void> {
  savePrefs(p);
  try {
    const ch = await connectToHost(peerId, GAMEPLAY.net.connectTimeoutMs);
    enterOnline(ch, p, null, () => ch.close());
  } catch {
    goHome('Connexion impossible');
  }
}

function enterOnline(ch: Channel, p: Prefs, h: HostSession | null, destroyNet: () => void): void {
  hideScreen(homeRoot);
  keepAwake();
  const o: Online = {
    session: null as unknown as ClientSession,
    host: h,
    destroyNet,
    beatTimer: 0,
    stopLoop: null,
    inGame: false,
  };
  current = o;
  const session = new ClientSession(ch, p.name, p.color, onlineCfg, {
    now: () => performance.now(),
    palette: RENDER.playerColors,
    foodPalette: RENDER.foodColors,
  });
  o.session = session;
  // Le salon de l'hôte arrive pendant le constructeur (canal mémoire synchrone) : on l'affiche ici.
  if (session.phase === 'lobby') renderLobby(o);
  o.beatTimer = window.setInterval(() => {
    h?.beat();
    session.beat();
  }, GAMEPLAY.net.beatIntervalS * 1000);
  session.onChange = (what) => {
    if (current !== o) return;
    // Après une première partie, l'écran de fin reste affiché : le salon ne se redessine plus.
    if (what === 'lobby') {
      if (!o.inGame) renderLobby(o);
    } else if (what === 'start') {
      o.inGame = true;
      hideScreen(lobbyRoot);
      shell.hideEnd();
      o.stopLoop ??= runOnline(shell, session, h);
    } else if (what === 'end') showOnlineEnd(o);
    else if (what === 'closed') onClosed(o);
  };
}

function renderLobby(o: Online): void {
  showLobby(lobbyRoot, o.session, {
    isHost: o.host !== null,
    onStart: () => o.host?.start(),
    onLeave: () => leaveOnline(),
  });
}

function showOnlineEnd(o: Online): void {
  const buttons = o.host
    ? [
        { label: 'Rejouer', onClick: () => o.host?.start() },
        { label: 'Menu', onClick: () => leaveOnline() },
      ]
    : [{ label: 'Menu', onClick: () => leaveOnline() }];
  showEndScreen(shell.endRoot, o.session.endRanking ?? o.session.ranking(), {
    title: 'Fin de partie',
    buttons,
    note: o.host ? undefined : "En attente de l'hôte…",
  });
}

function teardown(o: Online): void {
  window.clearInterval(o.beatTimer);
  o.stopLoop?.();
  o.host?.close();
  o.destroyNet();
  if (current === o) current = null;
}

function onClosed(o: Online): void {
  const reason = o.session.closeReason;
  const wasInGame = o.inGame;
  teardown(o);
  if (reason && reason !== 'host-left') {
    goHome(REJECT_TEXT[reason]);
    return;
  }
  if (wasInGame) {
    releaseAwake();
    showEndScreen(shell.endRoot, o.session.ranking(), {
      title: "L'hôte a quitté la partie",
      buttons: [{ label: 'Menu', onClick: () => goHome() }],
    });
  } else {
    goHome("L'hôte a quitté la partie.");
  }
}

function leaveOnline(): void {
  const o = current;
  if (!o) return goHome();
  o.session.leave();
  teardown(o);
  goHome();
}

// Page fermée ou rechargée : on prévient tout de suite au lieu d'attendre le délai de 10 s.
window.addEventListener('pagehide', () => {
  const o = current;
  if (!o) return;
  o.session.leave();
  o.host?.close();
});

// ---------- démarrage ----------

if (params.get('solo') === '1') {
  hideScreen(homeRoot);
  startSolo(shell, params, loadPrefs().name, () => goHome());
} else {
  goHome();
}
