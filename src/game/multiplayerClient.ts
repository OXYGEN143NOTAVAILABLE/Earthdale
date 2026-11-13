import type {
  ClientWsMsg,
  GameMode,
  IslandId,
  RoomPlayerPresence,
  ServerWsMsg,
  WorldCommand,
  WorldState,
} from './types';

export interface MultiplayerCallbacks {
  onJoined: (roomCode: string, playerId: string, players: RoomPlayerPresence[], world: WorldState) => void;
  onWorldState: (world: WorldState, players: RoomPlayerPresence[]) => void;
  onPlayers: (players: RoomPlayerPresence[]) => void;
  onToast: (message: string, ok: boolean) => void;
  onError: (message: string) => void;
  onDisconnect: () => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private cb: MultiplayerCallbacks;

  constructor(callbacks: MultiplayerCallbacks) {
    this.cb = callbacks;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private openSocket(onReady: () => void) {
    this.disconnect();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      onReady();
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as ServerWsMsg;
        if (msg.type === 'room_joined') {
          this.cb.onJoined(msg.roomCode, msg.playerId, msg.players, msg.world);
        } else if (msg.type === 'world_state') {
          this.cb.onWorldState(msg.world, msg.players);
        } else if (msg.type === 'players') {
          this.cb.onPlayers(msg.players);
        } else if (msg.type === 'toast') {
          this.cb.onToast(msg.message, msg.ok);
        } else if (msg.type === 'error') {
          this.cb.onError(msg.message);
        }
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onerror = () => {
      this.cb.onError('Could not connect to multiplayer room server.');
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        this.cb.onDisconnect();
      }
    };
  }

  public createRoom(playerName: string, playerColor: string, gameMode: GameMode) {
    this.openSocket(() => {
      this.send({ type: 'create_room', playerName, playerColor, gameMode });
    });
  }

  public joinRoom(roomCode: string, playerName: string, playerColor: string) {
    this.openSocket(() => {
      this.send({ type: 'join_room', roomCode, playerName, playerColor });
    });
  }

  public sendCommand(cmd: WorldCommand) {
    this.send({ type: 'command', cmd });
  }

  public sendPresence(focusIslandId: IslandId | 'all', cursorSimX: number, cursorSimY: number) {
    this.send({ type: 'presence', focusIslandId, cursorSimX, cursorSimY });
  }

  private send(msg: ClientWsMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public disconnect() {
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.close();
    }
  }
}
