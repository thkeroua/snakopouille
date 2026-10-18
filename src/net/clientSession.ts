// Logique d'un joueur : son serpent bouge ici (réactivité), le reste vient de l'hôte.
import { withConfig, type GameplayConfig } from '../config/gameplay';
import { clearBonus, isBonusKind, PickupStore, tickBonus, type Pickup } from '../game/bonus';
import { buildBodyGrid, headHitsBody, neckExtra, type BodyRef } from '../game/collision';
import { FoodStore, type Food } from '../game/food';
import type { PlayerStats } from '../game/hostRules';
import { buildRanking, type RankingRow } from '../game/ranking';
import { applyHead } from '../game/remote';
import { Rng } from '../game/rng';
import { createSnake, eatRadius, stepMotion, type SnakeState } from '../game/snakeMotion';
import { SpatialGrid } from '../game/spatialGrid';
import type { SnakeId, SnakeInput } from '../game/types';
import type { GameView } from '../game/view';
import type { Channel } from './channel';
import { HeadBuffer } from './interp';
import { MAX_EAT_IDS, PROTOCOL_VERSION, type ColorIndex, type LobbyPlayer, type Msg, type RejectReason } from './protocol';

export type ClientPhase = 'connecting' | 'lobby' | 'playing' | 'ended' | 'closed';
export type CloseReason = 'host-left' | RejectReason;
export type ClientChange = 'lobby' | 'start' | 'end' | 'closed';

const BODY_CELL = 64;

export class ClientSession implements GameView {
  phase: ClientPhase = 'connecting';
  you: SnakeId | null = null;
  lobby: LobbyPlayer[] = [];
  code = '';
  closeReason: CloseReason | null = null;
  endRanking: RankingRow[] | null = null;
  onChange: (what: ClientChange) => void = () => undefined;

  cfg: GameplayConfig;
  snakes: SnakeState[] = [];
  private foodStore: FoodStore;
  private pickupStore = new PickupStore();
  private readonly hidden = new Set<number>();
  private stats = new Map<SnakeId, PlayerStats>();
  private life = new Map<SnakeId, number>();
  private buffers = new Map<SnakeId, HeadBuffer>();
  private own: SnakeState | null = null;
  private diedSent = false;
  private sendAcc = 0;
  private lastHeard: number;
  // Chrono : dernier temps de l'hôte reçu, l'instant de réception, et la valeur exposée.
  private hostTime = 0;
  private hostTimeAt = 0;
  private timeValue = 0;
  private bodyGrid: SpatialGrid<BodyRef>;
  private readonly bodyPool: BodyRef[] = [];

  constructor(
    private readonly ch: Channel,
    name: string,
    color: ColorIndex,
    private readonly baseCfg: GameplayConfig,
    private readonly opts: { now: () => number; palette: readonly string[]; foodPalette: readonly string[] },
  ) {
    this.cfg = baseCfg;
    this.foodStore = new FoodStore(baseCfg, new Rng(1), opts.foodPalette);
    this.bodyGrid = new SpatialGrid<BodyRef>(baseCfg.world.width, baseCfg.world.height, BODY_CELL);
    this.lastHeard = opts.now();
    ch.onMessage((m) => this.onMessage(m));
    ch.onClose(() => this.closeWith('host-left'));
    ch.sendReliable({ t: 'join', v: PROTOCOL_VERSION, name, color });
  }

  // ---------- GameView ----------

  get food(): ReadonlyMap<number, Food> {
    return this.foodStore.items;
  }
  get hiddenFood(): ReadonlySet<number> {
    return this.hidden;
  }
  get pickups(): ReadonlyMap<number, Pickup> {
    return this.pickupStore.items;
  }
  get time(): number {
    return this.timeValue;
  }
  get fever(): boolean {
    return this.timeValue >= this.cfg.match.durationS - this.cfg.match.feverLastS - 1e-9;
  }
  get ended(): boolean {
    return this.phase === 'ended';
  }
  ranking(): RankingRow[] {
    return buildRanking(this.snakes, this.stats);
  }

  // ---------- actions ----------

  setColor(c: ColorIndex): void {
    this.ch.sendReliable({ t: 'color', color: c });
  }

  leave(): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.closeReason = null;
    this.ch.sendReliable({ t: 'bye' });
    this.ch.close();
  }

  beat(): void {
    if (this.phase === 'closed') return;
    this.ch.sendReliable({ t: 'beat' });
    this.checkTimeout();
  }

  tick(dt: number, input: SnakeInput): void {
    this.checkTimeout();
    if (this.phase !== 'playing') return;
    const now = this.opts.now();
    const cfg = this.cfg;
    this.timeValue = Math.min(cfg.match.durationS, Math.max(this.timeValue, this.hostTime + (now - this.hostTimeAt) / 1000));

    for (const s of this.snakes) if (s.alive) tickBonus(s, dt);

    const own = this.own;
    if (own && own.alive) {
      stepMotion(own, input, dt, cfg);
      this.requestFood(own);
    }

    for (const s of this.snakes) {
      if (s === own || !s.alive) continue;
      const h = this.buffers.get(s.id)!.sample(now);
      if (h) applyHead(s, h.x, h.y, h.angle, h.boost, s.points, cfg);
    }

    if (own && own.alive) {
      const maxHalf = buildBodyGrid(this.snakes, this.bodyGrid, cfg, this.bodyPool);
      const killer = headHitsBody(own, this.bodyGrid, maxHalf, cfg, neckExtra(cfg));
      if (killer !== null && !this.diedSent) {
        own.alive = false;
        own.boosting = false;
        this.diedSent = true;
        this.ch.sendReliable({ t: 'died', life: this.life.get(own.id)!, killer });
      }
    }

    this.sendAcc += dt;
    const interval = 1 / cfg.net.sendHz;
    if (this.sendAcc >= interval - 1e-9) {
      this.sendAcc = Math.max(0, this.sendAcc - interval);
      if (own && own.alive) {
        this.ch.sendFast({
          t: 'me',
          life: this.life.get(own.id)!,
          ts: now,
          x: own.path.x(0),
          y: own.path.y(0),
          a: own.angle,
          b: own.boosting ? 1 : 0,
        });
      }
    }
  }

  // ---------- réception ----------

  private onMessage(m: Msg): void {
    if (this.phase === 'closed') return;
    this.lastHeard = this.opts.now();
    switch (m.t) {
      case 'welcome':
        this.you = m.you;
        break;
      case 'reject':
        this.closeWith(m.reason);
        this.ch.close();
        break;
      case 'lobby':
        this.lobby = m.players;
        this.code = m.code;
        if (this.phase === 'connecting') this.phase = 'lobby';
        this.onChange('lobby');
        break;
      case 'start':
        this.onStart(m);
        break;
      case 'heads':
        this.onHeads(m);
        break;
      case 'food':
        for (const [id, x, y, value, sup] of m.add) this.foodStore.insert(id, x, y, value, sup === 1);
        for (const id of m.del) {
          this.foodStore.remove(id);
          this.hidden.delete(id);
        }
        break;
      case 'pickup': {
        const [id, x, y, kind] = m.p;
        if (isBonusKind(kind)) this.pickupStore.insert(id, x, y, kind);
        break;
      }
      case 'bonus': {
        this.pickupStore.remove(m.pickup);
        const s = this.byId(m.snake);
        if (s && isBonusKind(m.kind)) s.bonus[m.kind] = m.left;
        break;
      }
      case 'death': {
        const s = this.byId(m.victim);
        if (s) {
          s.alive = false;
          s.boosting = false;
          clearBonus(s);
          s.respawnAt = m.respawnAt;
        }
        break;
      }
      case 'respawn': {
        const [id, life, x, y, angle] = m.spawn;
        const s = this.byId(id);
        if (!s) break;
        this.life.set(id, life);
        s.path.reset({ x, y });
        s.prevX = x;
        s.prevY = y;
        s.angle = angle;
        s.points = this.cfg.snake.startPoints;
        s.alive = true;
        s.boosting = false;
        clearBonus(s);
        s.respawnAt = 0;
        this.buffers.get(id)?.clear();
        if (s === this.own) {
          this.diedSent = false;
          // Un 'eat' envoyé juste avant une mort décidée par l'hôte a été ignoré : sans ça la
          // nourriture resterait cachée chez nous. Les 'del' en attente sont arrivés avant (voie ordonnée).
          this.hidden.clear();
        }
        break;
      }
      case 'left': {
        const s = this.byId(m.id);
        if (s) {
          s.alive = false;
          s.respawnAt = Infinity;
        }
        break;
      }
      case 'stats':
        for (const [id, score, deaths, maxPoints] of m.rows) this.stats.set(id, { score, deaths, maxPoints });
        break;
      case 'end': {
        // Les couleurs de l'hôte sont des indices : on remet celles de la palette.
        const colors = new Map(this.snakes.map((s) => [s.id, s.color]));
        this.endRanking = m.ranking.map((r) => ({ ...r, color: colors.get(r.id) ?? r.color }));
        this.phase = 'ended';
        this.onChange('end');
        break;
      }
      case 'bye':
        this.closeWith('host-left');
        this.ch.close();
        break;
      default:
        break;
    }
  }

  private onStart(m: Extract<Msg, { t: 'start' }>): void {
    const cfg = withConfig(this.baseCfg, { match: { durationS: m.durationS } });
    this.cfg = cfg;
    this.foodStore = new FoodStore(cfg, new Rng(1), this.opts.foodPalette);
    for (const [id, x, y, value, sup] of m.food) this.foodStore.insert(id, x, y, value, sup === 1);
    this.hidden.clear();
    this.pickupStore = new PickupStore();
    this.stats = new Map();
    this.life = new Map();
    this.buffers = new Map();
    this.snakes = [];
    const players = new Map(m.players.map((p) => [p.id, p]));
    for (const [id, life, x, y, angle] of m.spawns) {
      const p = players.get(id);
      const color = this.opts.palette[(p?.color ?? 0) % this.opts.palette.length];
      const s = createSnake({ id, name: p?.name ?? id, color }, { x, y }, angle, cfg);
      this.snakes.push(s);
      this.life.set(id, life);
      this.buffers.set(id, new HeadBuffer(cfg.net.interpDelayMs));
      this.stats.set(id, { score: 0, deaths: 0, maxPoints: cfg.snake.startPoints });
    }
    this.own = this.snakes.find((s) => s.id === this.you) ?? null;
    this.diedSent = false;
    this.sendAcc = 0;
    this.hostTime = 0;
    this.hostTimeAt = this.opts.now();
    this.timeValue = 0;
    this.endRanking = null;
    this.phase = 'playing';
    this.onChange('start');
  }

  private onHeads(m: Extract<Msg, { t: 'heads' }>): void {
    if (this.phase !== 'playing') return;
    const now = this.opts.now();
    this.hostTime = m.time;
    this.hostTimeAt = now;
    for (const [id, life, ts, x, y, angle, boost, points] of m.s) {
      const s = this.byId(id);
      if (!s || life !== this.life.get(id)) continue;
      s.points = points;
      if (s !== this.own) this.buffers.get(id)!.push(ts, now, x, y, angle, boost === 1);
    }
  }

  private requestFood(own: SnakeState): void {
    const ids = this.foodStore
      .touching(own.path.x(0), own.path.y(0), eatRadius(own, this.cfg))
      .filter((id) => !this.hidden.has(id))
      .slice(0, MAX_EAT_IDS); // l'hôte ignore le reste : on ne cache que ce qui est demandé
    if (ids.length === 0) return;
    for (const id of ids) this.hidden.add(id);
    this.ch.sendReliable({ t: 'eat', life: this.life.get(own.id)!, ids });
  }

  // ---------- fermeture ----------

  private checkTimeout(): void {
    if (this.phase === 'closed') return;
    if (this.opts.now() - this.lastHeard > this.cfg.net.peerTimeoutS * 1000) {
      this.closeWith('host-left');
      this.ch.close();
    }
  }

  private closeWith(reason: CloseReason): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.closeReason = reason;
    this.onChange('closed');
  }

  private byId(id: SnakeId): SnakeState | undefined {
    return this.snakes.find((s) => s.id === id);
  }
}
