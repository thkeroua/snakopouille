// Logique de l'hôte : salon, puis partie (nourriture, points, têtes à tête, chrono, scores).
// Ne connaît que des `Channel` : le joueur de l'hôte passe par un canal mémoire comme les autres.
import type { GameplayConfig } from '../config/gameplay';
import type { SnakeId } from '../game/types';
import { memoryChannelPair, type Channel } from './channel';
import { PROTOCOL_VERSION, type ColorIndex, type LobbyPlayer, type Msg, type RejectReason } from './protocol';

export type HostPhase = 'lobby' | 'playing' | 'ended';

const MAX_NAME = 16;

type Guest = {
  ch: Channel;
  lastSeen: number;
  host: boolean;
  /** null tant que le 'join' n'est pas accepté. */
  player: LobbyPlayer | null;
};

export class HostSession {
  code = '';
  private phaseValue: HostPhase = 'lobby';
  private readonly guests: Guest[] = [];
  private nextPlayer = 1;

  constructor(
    private readonly cfg: GameplayConfig,
    private readonly opts: { seed: number; now: () => number; colorCount: number },
  ) {}

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

  start(): void {
    // Task 5
  }

  tick(_dt: number): void {
    this.checkTimeouts();
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

  private drop(g: Guest): void {
    const i = this.guests.indexOf(g);
    if (i < 0) return;
    this.guests.splice(i, 1);
    if (g.player) this.onPlayerLeft(g.player.id);
  }

  protected onPlayerLeft(_id: SnakeId): void {
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
    const msg: Msg = { t: 'lobby', players: this.lobbyPlayers(), code: this.code };
    for (const g of this.guests) if (g.player) g.ch.sendReliable(msg);
  }
}
