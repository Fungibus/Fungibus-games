import { DurableObject } from "cloudflare:workers";
import { json, readJson } from "../../shared/http.js";
import { cleanRoomCode } from "../../shared/rooms.js";
import {
  MAX_PLAYERS,
  applyAction,
  createWaitingRoom,
  normalizePlayer,
  upsertPlayer,
  viewFor,
} from "./game.js";

const ROOM_ROW_ID = "room";
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export class MagicalAthleteRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.schemaReady = false;
    this.cachedRoom = null;
  }

  async fetch(request) {
    this.ensureSchema();

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/create")) return this.createRoom(request);
    if (request.method === "POST" && url.pathname.endsWith("/join")) return this.joinRoom(request);
    if (request.method === "GET" && url.pathname.endsWith("/socket")) return this.openSocket(request);

    return json({ error: "Not found." }, 404);
  }

  async alarm() {
    this.ensureSchema();
    const room = this.loadRoom();
    if (!room) return;

    const expiresAt = room.updatedAt + ROOM_TTL_MS;
    if (Date.now() < expiresAt) {
      await this.ctx.storage.setAlarm(expiresAt);
      return;
    }

    await this.ctx.storage.deleteAll();
    this.schemaReady = false;
    this.cachedRoom = null;
    for (const socket of this.ctx.getWebSockets()) socket.close(1001, "room expired");
  }

  async createRoom(request) {
    const payload = await readJson(request);
    const roomCode = cleanRoomCode(payload.roomCode);
    if (!roomCode) return json({ error: "Invalid room code." }, 400);
    if (this.loadRoom()) return json({ error: "Room already exists." }, 409);

    const player = normalizePlayer(payload);
    if (!player) return json({ error: "Player token is required." }, 400);

    const room = createWaitingRoom(roomCode, player);
    await this.saveRoom(room, { scheduleAlarm: true });
    return json({ roomCode, playerToken: player.token });
  }

  async joinRoom(request) {
    const payload = await readJson(request);
    const room = this.loadRoom();
    if (!room) return json({ error: "Room not found." }, 404);

    const player = normalizePlayer(payload);
    if (!player) return json({ error: "Player token is required." }, 400);

    try {
      upsertPlayer(room, player);
    } catch (error) {
      return json({ error: error.message }, 409);
    }

    await this.saveRoom(room);
    this.broadcast(room);
    return json({ roomCode: room.roomCode, playerToken: player.token });
  }

  async openSocket(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "Expected a WebSocket upgrade request." }, 426);
    }

    const room = this.loadRoom();
    if (!room) return json({ error: "Room not found." }, 404);

    const url = new URL(request.url);
    const playerToken = String(url.searchParams.get("playerToken") || "");
    if (!playerToken) return json({ error: "Player token is required." }, 400);

    if (!room.players.some((player) => player.token === playerToken)) {
      if (room.status !== "waiting") return json({ error: "This game has already started." }, 409);
      if (room.players.length >= MAX_PLAYERS) return json({ error: "Room is full." }, 409);
      room.players.push({
        token: playerToken,
        name: `Player ${playerToken.slice(0, 4)}`,
        team: [],
        usedRacers: [],
        selectedRacers: [],
        score: 0,
        chips: [],
      });
      await this.saveRoom(room);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ playerToken });
    this.ctx.acceptWebSocket(server);

    server.send(JSON.stringify({ type: "state", room: this.viewFor(room, playerToken) }));
    this.broadcast(room);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    this.ensureSchema();
    const attachment = socket.deserializeAttachment();
    const playerToken = attachment?.playerToken;
    if (!playerToken) {
      socket.close(1008, "missing player");
      return;
    }

    const room = this.loadRoom();
    if (!room) {
      socket.send(JSON.stringify({ type: "error", error: "Room not found." }));
      socket.close(1001, "room not found");
      return;
    }

    const player = room.players.find((item) => item.token === playerToken);
    if (!player) {
      socket.send(JSON.stringify({ type: "error", error: "Player not found." }));
      return;
    }

    let action;
    try {
      action = JSON.parse(message);
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "Invalid message." }));
      return;
    }

    try {
      const changed = applyAction(room, player, action);
      if (changed) await this.saveRoom(room);
      this.broadcast(room);
    } catch (error) {
      socket.send(JSON.stringify({ type: "error", error: error.message }));
    }
  }

  webSocketClose() {
    this.ensureSchema();
    const room = this.loadRoom();
    if (room) this.broadcast(room);
  }

  broadcast(room = this.loadRoom()) {
    if (!room) return;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      const playerToken = attachment?.playerToken;
      if (!playerToken) continue;
      socket.send(JSON.stringify({ type: "state", room: this.viewFor(room, playerToken) }));
    }
  }

  viewFor(room, playerToken) {
    const activeTokens = new Set(
      this.ctx
        .getWebSockets()
        .map((socket) => socket.deserializeAttachment()?.playerToken)
        .filter(Boolean),
    );
    return viewFor(room, playerToken, activeTokens);
  }

  ensureSchema() {
    if (this.schemaReady) return;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    );
    this.schemaReady = true;
  }

  loadRoom() {
    if (this.cachedRoom) return this.cachedRoom;
    const rows = [...this.ctx.storage.sql.exec("SELECT data FROM rooms WHERE id = ?", ROOM_ROW_ID)];
    if (!rows.length) return null;
    this.cachedRoom = JSON.parse(rows[0].data);
    return this.cachedRoom;
  }

  async saveRoom(room, options = {}) {
    room.updatedAt = Date.now();
    const data = JSON.stringify(room);
    this.ctx.storage.sql.exec(
      "INSERT INTO rooms (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
      ROOM_ROW_ID,
      data,
      room.updatedAt,
    );
    this.cachedRoom = room;

    if (options.scheduleAlarm) await this.ctx.storage.setAlarm(room.updatedAt + ROOM_TTL_MS);
  }
}
