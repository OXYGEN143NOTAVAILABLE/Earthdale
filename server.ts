import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { ISLAND_DEFS } from './src/game/catalog';
import {
  applyWorldCommand,
  assignPlayerVillageInWorld,
  createInitialWorld,
  createParticlePool,
  stepSimulation,
} from './src/game/simulation';
import type {
  ClientWsMsg,
  IslandId,
  Particle,
  RoomPlayerPresence,
  ServerWsMsg,
  WorldState,
} from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomPlayer {
  id: string;
  ws: WebSocket;
  presence: RoomPlayerPresence;
}

interface GameRoom {
  code: string;
  world: WorldState;
  particles: Particle[];
  players: Map<string, RoomPlayer>;
  lastTickMs: number;
}

const rooms = new Map<string, GameRoom>();

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? makeRoomCode() : code;
}

function sendMsg(ws: WebSocket, msg: ServerWsMsg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room: GameRoom, msg: ServerWsMsg) {
  const raw = JSON.stringify(msg);
  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(raw);
    }
  }
}

function getPlayersList(room: GameRoom): RoomPlayerPresence[] {
  return Array.from(room.players.values()).map((p) => p.presence);
}

// Authoritative room simulation loop (10 Hz)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.players.size === 0) {
      rooms.delete(code);
      continue;
    }
    const dt = Math.min(0.18, Math.max(0.02, (now - room.lastTickMs) / 1000));
    room.lastTickMs = now;
    stepSimulation(room.world, dt, room.particles, false);
    broadcastRoom(room, {
      type: 'world_state',
      world: room.world,
      players: getPlayersList(room),
    });
  }
}, 120);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' });
      return;
    }
    res.json({
      ok: true,
      code,
      gameMode: room.world.gameMode,
      players: getPlayersList(room),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const playerId = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let activeRoom: GameRoom | null = null;

    ws.on('message', (data) => {
      let parsed: ClientWsMsg | null = null;
      try {
        parsed = JSON.parse(String(data)) as ClientWsMsg;
      } catch {
        sendMsg(ws, { type: 'error', message: 'Invalid command payload.' });
        return;
      }

      if (parsed.type === 'create_room') {
        const code = makeRoomCode();
        const world = createInitialWorld(parsed.gameMode || 'sovereign_sandbox');
        const homeIslandId = assignPlayerVillageInWorld(world, playerId, 'cradle');
        const homeDef = ISLAND_DEFS[homeIslandId];
        const room: GameRoom = {
          code,
          world,
          particles: createParticlePool(),
          players: new Map(),
          lastTickMs: Date.now(),
        };
        const presence: RoomPlayerPresence = {
          id: playerId,
          name: (parsed.playerName || 'Deity').slice(0, 20),
          color: parsed.playerColor || '#E5AF47',
          homeIslandId,
          focusIslandId: homeIslandId,
          cursorSimX: homeDef.centerX,
          cursorSimY: homeDef.centerY,
          isHost: true,
        };
        room.players.set(playerId, { id: playerId, ws, presence });
        rooms.set(code, room);
        activeRoom = room;
        sendMsg(ws, {
          type: 'room_joined',
          roomCode: code,
          playerId,
          players: getPlayersList(room),
          world: room.world,
        });
        return;
      }

      if (parsed.type === 'join_room') {
        const code = String(parsed.roomCode || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendMsg(ws, { type: 'error', message: `Room "${code}" not found.` });
          return;
        }
        const homeIslandId = assignPlayerVillageInWorld(room.world, playerId);
        const homeDef = ISLAND_DEFS[homeIslandId];
        const presence: RoomPlayerPresence = {
          id: playerId,
          name: (parsed.playerName || 'Co-Deity').slice(0, 20),
          color: parsed.playerColor || '#68B2D8',
          homeIslandId,
          focusIslandId: homeIslandId,
          cursorSimX: homeDef.centerX,
          cursorSimY: homeDef.centerY,
          isHost: false,
        };
        room.players.set(playerId, { id: playerId, ws, presence });
        activeRoom = room;
        sendMsg(ws, {
          type: 'room_joined',
          roomCode: code,
          playerId,
          players: getPlayersList(room),
          world: room.world,
        });
        broadcastRoom(room, { type: 'players', players: getPlayersList(room) });
        broadcastRoom(room, {
          type: 'toast',
          message: `${presence.name} claimed ${homeDef.name} in the sky-realm!`,
          ok: true,
        });
        return;
      }

      if (!activeRoom) {
        sendMsg(ws, { type: 'error', message: 'Not connected to an active multiplayer room.' });
        return;
      }

      if (parsed.type === 'presence') {
        const p = activeRoom.players.get(playerId);
        if (p) {
          p.presence.focusIslandId = parsed.focusIslandId as IslandId | 'all';
          p.presence.cursorSimX = Number(parsed.cursorSimX) || 2260;
          p.presence.cursorSimY = Number(parsed.cursorSimY) || 2560;
          broadcastRoom(activeRoom, { type: 'players', players: getPlayersList(activeRoom) });
        }
        return;
      }

      if (parsed.type === 'command') {
        const res = applyWorldCommand(activeRoom.world, parsed.cmd, activeRoom.particles, playerId);
        sendMsg(ws, { type: 'toast', message: res.message, ok: res.ok });
        broadcastRoom(activeRoom, {
          type: 'world_state',
          world: activeRoom.world,
          players: getPlayersList(activeRoom),
        });
      }
    });

    ws.on('close', () => {
      if (activeRoom) {
        const p = activeRoom.players.get(playerId);
        activeRoom.players.delete(playerId);
        if (activeRoom.players.size === 0) {
          rooms.delete(activeRoom.code);
        } else {
          broadcastRoom(activeRoom, { type: 'players', players: getPlayersList(activeRoom) });
          if (p) {
            broadcastRoom(activeRoom, {
              type: 'toast',
              message: `${p.presence.name} stepped back from the sky-realm.`,
              ok: true,
            });
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Hearthglen server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
