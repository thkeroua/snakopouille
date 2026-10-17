// Logique de l'hôte : salon, puis partie (nourriture, points, têtes à tête, chrono, scores).
// Ne connaît que des `Channel` : le joueur de l'hôte passe par un canal mémoire comme les autres.
import type { GameplayConfig } from '../config/gameplay';
import type { Food } from '../game/food';
import { HostRules, createHost, type HostState } from '../game/hostRules';
import { buildRanking } from '../game/ranking';
import { applyHead } from '../game/remote';
import { Rng } from '../game/rng';
import { createSnake, type SnakeState } from '../game/snakeMotion';
import { findSpawnPoint } from '../game/spawn';
import type { MatchEvent, SnakeId } from '../game/types';
import { memoryChannelPair, type Channel } from './channel';
import {
  PROTOCOL_VERSION,
  type ColorIndex,
  type FoodWire,
  type HeadWire,
  type LobbyPlayer,
  type Msg,
  type RejectReason,
  type SpawnWire,
  type StatsWire,
} from './protocol';

export type HostPhase = 'lobby' | 'playing' | 'ended';

const MAX_NAME = 16;
const HOST_FOOD_PALETTE = ['#fff']; // la couleur ne sert qu'à l'affichage, côté clients

type Guest = {
  ch: Channel;
  lastSeen: number;
  host: boolean;
  /** null tant que le 'join' n'est pas accepté. */
  player: LobbyPlayer | null;
};

type MeMsg = Extract<Msg, { t: 'me' }>;

/** Une partie en cours, vue de l'hôte. */
type World = {
  snakes: SnakeState[];
  byId: Map<SnakeId, SnakeState>;
  host: HostState;
  rules: HostRules;
  life: Map<SnakeId, number>;
  /** ts du dernier 'me' de la vie courante (null : rien reçu depuis l'apparition). */
  lastTs: Map<SnakeId, number | null>;
  boost: Map<SnakeId, boolean>;
  pendingMe: Map<SnakeId, MeMsg[]>;
  reported: { victim: SnakeId; killer: SnakeId }[];
  sendAcc: number;
};

const toFoodWire = (f: Food): FoodWire => [f.id, f.x, f.y, f.value];

export class HostSession {
  code = '';
  private phaseValue: HostPhase = 'lobby';
  private readonly guests: Guest[] = [];
  private nextPlayer = 1;
  private seed: number;
  private world: World | null = null;

  constructor(
    private readonly cfg: GameplayConfig,
    private readonly opts: { seed: number; now: () => number; colorCount: number },
  ) {
    this.seed = opts.seed >>> 0;
  }

  get phase(): HostPhase {
    return this.phaseValue;
  }

  connectLocal(): Channel {
    const [client, hostEnd] = memoryChannelPair();
    this.register(hostEnd, true);
    return client;
  }

  addGuest(ch: Channel): void {
    this.register(ch, false);
  }

  lobbyPlayers(): LobbyPlayer[] {
    return this.players().map((p) => ({ ...p }));
  }

  probeInfo(): Extract<Msg, { t: 'hello' }> {
    const players = this.players();
    const hostPlayer = players.find((p) => p.host);
    return {
      t: 'hello',
      name: hostPlayer?.name ?? 'Hôte',
      players: players.length,
      max: this.cfg.maxPlayers,
      playing: this.phaseValue === 'playing',
    };
  }

  /** Nouvelle partie avec les joueurs présents (depuis le salon ou après une fin). */
  start(): void {
    const players = this.players();
    if (this.phaseValue === 'playing' || players.length === 0) return;
    const cfg = this.cfg;
    const rng = new Rng(this.seed);
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    const sim = players.map((p) => ({ id: p.id, name: p.name, color: String(p.color) }));
    const host = createHost(sim, cfg, rng, HOST_FOOD_PALETTE);
    const w: World = {
      snakes: [],
      byId: new Map(),
      host,
      rules: new HostRules(host, cfg, rng),
      life: new Map(),
      lastTs: new Map(),
      boost: new Map(),
      pendingMe: new Map(),
      reported: [],
      sendAcc: 0,
    };
    const spawns: SpawnWire[] = [];
    for (const p of sim) {
      const { pos, angle } = findSpawnPoint(w.snakes, cfg, rng);
      const s = createSnake(p, pos, angle, cfg);
      w.snakes.push(s);
      w.byId.set(s.id, s);
      w.life.set(s.id, 1);
      w.lastTs.set(s.id, null);
      w.boost.set(s.id, false);
      w.pendingMe.set(s.id, []);
      spawns.push([s.id, 1, pos.x, pos.y, angle]);
    }
    for (let i = 0; i < cfg.food.initialNatural; i++) host.food.spawnNatural(1);
    host.food.trackChanges = true;
    host.food.drainChanges();
    this.world = w;
    this.phaseValue = 'playing';
    this.broadcast({
      t: 'start',
      durationS: cfg.match.durationS,
      players: this.lobbyPlayers(),
      spawns,
      food: [...host.food.items.values()].map(toFoodWire),
    });
  }

  tick(dt: number): void {
    this.checkTimeouts();
    const w = this.world;
    if (this.phaseValue !== 'playing' || !w) return;
    const { rules, host } = w;

    const events: MatchEvent[] = [];
    rules.clock(dt, events);
    rules.respawns(w.snakes, events);
    for (const e of events) if (e.type === 'respawn') this.onRespawn(w, e.snake);

    for (const s of w.snakes) {
      const queue = w.pendingMe.get(s.id)!;
      if (!s.alive) {
        queue.length = 0;
        continue;
      }
      // Les têtes à tête se balayent sur tout le chemin reçu depuis le pas précédent.
      const px = s.path.x(0);
      const py = s.path.y(0);
      for (const m of queue) {
        applyHead(s, m.x, m.y, m.a, m.b === 1, s.points, this.cfg);
        w.boost.set(s.id, m.b === 1);
      }
      s.prevX = px;
      s.prevY = py;
      queue.length = 0;
      rules.boost(s, { target: null, boost: w.boost.get(s.id)! }, dt);
    }

    const deathEvents: MatchEvent[] = [];
    rules.deaths(w.snakes, deathEvents, w.reported, false);
    w.reported = [];
    for (const e of deathEvents) {
      if (e.type !== 'death') continue;
      const s = w.byId.get(e.victim)!;
      this.broadcast({ t: 'death', victim: e.victim, killer: e.killer, cause: e.cause, respawnAt: s.respawnAt });
    }
    if (deathEvents.length > 0) {
      this.flushFood();
      this.broadcastStats();
    }

    rules.spawnFood(dt);
    this.flushFood();

    w.sendAcc += dt;
    const interval = 1 / this.cfg.net.sendHz;
    if (w.sendAcc >= interval - 1e-9) {
      w.sendAcc = Math.max(0, w.sendAcc - interval);
      this.broadcastHeads(w);
    }

    rules.finish(w.snakes, []);
    if (host.ended) {
      this.flushFood();
      this.broadcastStats();
      this.broadcast({ t: 'end', ranking: buildRanking(w.snakes, host.stats) });
      this.phaseValue = 'ended';
    }
  }

  beat(): void {
    for (const g of this.guests) g.ch.sendReliable({ t: 'beat' });
    this.checkTimeouts();
  }

  close(): void {
    for (const g of [...this.guests]) {
      g.ch.sendReliable({ t: 'bye' });
      g.ch.close();
    }
    this.guests.length = 0;
  }

  // ---------- connexions ----------

  private register(ch: Channel, host: boolean): void {
    const g: Guest = { ch, lastSeen: this.opts.now(), host, player: null };
    this.guests.push(g);
    ch.onMessage((m) => {
      g.lastSeen = this.opts.now();
      this.onMessage(g, m);
    });
    ch.onClose(() => this.drop(g));
  }

  private onMessage(g: Guest, m: Msg): void {
    switch (m.t) {
      case 'join':
        this.onJoin(g, m);
        break;
      case 'color':
        if (g.player && this.isFree(m.color)) {
          g.player.color = m.color;
          this.broadcastLobby();
        }
        break;
      case 'bye':
        g.ch.close();
        break;
      case 'me':
      case 'eat':
      case 'died':
        if (g.player) this.onPlay(g.player.id, m);
        break;
      default:
        break;
    }
  }

  private onJoin(g: Guest, m: Extract<Msg, { t: 'join' }>): void {
    if (g.player) return;
    let reason: RejectReason | null = null;
    if (m.v !== PROTOCOL_VERSION) reason = 'version';
    else if (this.phaseValue === 'playing') reason = 'playing';
    else if (this.players().length >= this.cfg.maxPlayers) reason = 'full';
    if (reason) {
      g.ch.sendReliable({ t: 'reject', reason });
      g.ch.close();
      return;
    }
    const n = this.nextPlayer++;
    const name = String(m.name ?? '').trim().slice(0, MAX_NAME) || `Joueur ${n}`;
    g.player = { id: `p${n}`, name, color: this.isFree(m.color) ? m.color : this.firstFreeColor(), host: g.host };
    g.ch.sendReliable({ t: 'welcome', you: g.player.id });
    this.broadcastLobby();
  }

  /** Messages de jeu : seulement en partie, pour la vie courante d'un serpent vivant. */
  private onPlay(id: SnakeId, m: Extract<Msg, { t: 'me' | 'eat' | 'died' }>): void {
    const w = this.world;
    if (this.phaseValue !== 'playing' || !w) return;
    const s = w.byId.get(id);
    if (!s || !s.alive || m.life !== w.life.get(id)) return;
    if (m.t === 'me') {
      const last = w.lastTs.get(id);
      if (last !== null && last !== undefined && m.ts <= last) return;
      w.lastTs.set(id, m.ts);
      w.pendingMe.get(id)!.push(m);
    } else if (m.t === 'eat') {
      w.rules.eatRequest(s, m.ids, []);
    } else {
      w.reported.push({ victim: id, killer: m.killer });
    }
  }

  private onRespawn(w: World, id: SnakeId): void {
    const s = w.byId.get(id)!;
    const life = w.life.get(id)! + 1;
    w.life.set(id, life);
    w.lastTs.set(id, null);
    w.boost.set(id, false);
    w.pendingMe.set(id, []);
    this.broadcast({ t: 'respawn', spawn: [id, life, s.path.x(0), s.path.y(0), s.angle] });
  }

  private drop(g: Guest): void {
    const i = this.guests.indexOf(g);
    if (i < 0) return;
    this.guests.splice(i, 1);
    if (g.player) this.onPlayerLeft(g.player.id);
  }

  private onPlayerLeft(id: SnakeId): void {
    const w = this.world;
    const s = w?.byId.get(id);
    if (w && s && this.phaseValue === 'playing') {
      // Il reste au classement final, mais ne réapparaît plus.
      if (s.alive) {
        const st = w.host.stats.get(id)!;
        st.maxPoints = Math.max(st.maxPoints, s.points);
        w.host.food.dropTrail(s.path, s.points);
        s.alive = false;
        s.boosting = false;
      }
      s.respawnAt = Infinity;
      this.broadcast({ t: 'left', id });
      this.flushFood();
    }
    this.broadcastLobby();
  }

  private checkTimeouts(): void {
    const limit = this.cfg.net.peerTimeoutS * 1000;
    const now = this.opts.now();
    for (const g of [...this.guests]) if (now - g.lastSeen > limit) g.ch.close();
  }

  // ---------- salon ----------

  private players(): LobbyPlayer[] {
    const out: LobbyPlayer[] = [];
    for (const g of this.guests) if (g.player) out.push(g.player);
    return out;
  }

  private isFree(color: ColorIndex): boolean {
    return (
      Number.isInteger(color) && color >= 0 && color < this.opts.colorCount && !this.players().some((p) => p.color === color)
    );
  }

  private firstFreeColor(): ColorIndex {
    for (let c = 0; c < this.opts.colorCount; c++) if (this.isFree(c)) return c;
    return 0;
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', players: this.lobbyPlayers(), code: this.code });
  }

  // ---------- diffusion ----------

  private broadcast(msg: Msg): void {
    for (const g of this.guests) if (g.player) g.ch.sendReliable(msg);
  }

  private broadcastFast(msg: Msg): void {
    for (const g of this.guests) if (g.player) g.ch.sendFast(msg);
  }

  private flushFood(): void {
    const ch = this.world!.host.food.drainChanges();
    if (ch.add.length === 0 && ch.del.length === 0) return;
    this.broadcast({ t: 'food', add: ch.add.map(toFoodWire), del: ch.del });
  }

  private broadcastStats(): void {
    const w = this.world!;
    const rows: StatsWire[] = w.snakes.map((s) => {
      const st = w.host.stats.get(s.id)!;
      return [s.id, st.score, st.deaths, Math.floor(st.maxPoints)];
    });
    this.broadcast({ t: 'stats', rows });
  }

  private broadcastHeads(w: World): void {
    const s: HeadWire[] = [];
    for (const sn of w.snakes) {
      const ts = w.lastTs.get(sn.id);
      if (!sn.alive || ts === null || ts === undefined) continue;
      s.push([sn.id, w.life.get(sn.id)!, ts, sn.path.x(0), sn.path.y(0), sn.angle, sn.boosting ? 1 : 0, Math.floor(sn.points)]);
    }
    this.broadcastFast({ t: 'heads', time: w.host.time, s });
  }
}
