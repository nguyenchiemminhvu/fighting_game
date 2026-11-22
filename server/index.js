import 'dotenv/config';
import { createServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { FightRoom } from './FightRoom.js';
import { ROOMS } from '../src/game/rules.js';
import { SPECTATOR_LIMIT } from '../src/game/spectatorCameras.js';
import { LobbyPresence } from './LobbyPresence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
app.disable('x-powered-by');
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const localDev = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin && (localDev || allowedOrigins.has(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(express.json({ limit: '32kb' }));

const lobbyPresence = new LobbyPresence();
app.post('/api/lobby/presence', (req, res) => {
  const { id, sequence, active } = req.body ?? {};
  if (typeof active !== 'boolean' || !lobbyPresence.update(id, sequence, active)) {
    return res.status(400).json({ ok: false, error: 'Invalid lobby presence heartbeat.' });
  }
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'giang-ho-ti-thi', timestamp: Date.now() }));
app.get('/api/rooms', (_req, res) => {
  const live = new Map(FightRoom.roomList().map((room) => [room.key, room]));
  res.set('Cache-Control', 'no-store');
  res.json({
    onlineCount: lobbyPresence.getOnlineCount(),
    rooms: ROOMS.map((room) => {
      const current = live.get(room.key);
      return {
        ...room,
        roomId: current?.roomId ?? null,
        players: current?.players ?? 0,
        capacity: 2,
        phase: current?.phase ?? 'waiting',
        names: current?.names ?? [],
        viewerCount: current?.viewerCount ?? 0,
        viewerCapacity: SPECTATOR_LIMIT,
        canWatch: current?.canWatch ?? false,
      };
    }),
  });
});

const distDir = path.join(rootDir, 'dist');
if (existsSync(distDir) && process.env.SERVE_STATIC !== 'false') {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  greet: false,
});
gameServer.define('fight', FightRoom);

// Only pre-created rooms can be joined. The browser cannot create new rooms
// or join a room other than one of these six public arena slots.
matchMaker.controller.exposedMethods = ['joinById'];

const port = Number(process.env.PORT || 2567);
await gameServer.listen(port, '0.0.0.0');

for (const room of ROOMS) {
  await matchMaker.createRoom('fight', { roomKey: room.key, label: room.name, map: room.map });
}

console.log(`Giang Hồ Tỉ Thí server listening on :${port}`);

