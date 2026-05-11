import { DurableObject } from "cloudflare:workers";

const MAX_ROOM_CREATE_ATTEMPTS = 6;
const ROOM_ROW_ID = "room";
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PLAYERS = 12;

const WORDS = [
  "Anchor",
  "Archive",
  "Atlas",
  "Badge",
  "Beacon",
  "Bridge",
  "Cabin",
  "Canvas",
  "Circuit",
  "Clover",
  "Copper",
  "Crane",
  "Drift",
  "Echo",
  "Ember",
  "Falcon",
  "Fiddle",
  "Forest",
  "Garden",
  "Harbor",
  "Hazel",
  "Island",
  "Jacket",
  "Jigsaw",
  "Lantern",
  "Ledger",
  "Marble",
  "Meadow",
  "Meteor",
  "Mirror",
  "Needle",
  "Nimbus",
  "Orbit",
  "Parcel",
  "Pebble",
  "Pepper",
  "Quartz",
  "Ribbon",
  "Rocket",
  "Saffron",
  "Signal",
  "Silver",
  "Summit",
  "Thread",
  "Timber",
  "Velvet",
  "Voyage",
  "Willow",
  "Window",
  "Zephyr",
  "Baker",
  "Button",
  "Camera",
  "Castle",
  "Compass",
  "Diamond",
  "Engine",
  "Feather",
  "Galaxy",
  "Hammer",
  "Icicle",
  "Journal",
  "Kitchen",
  "Library",
  "Magnet",
  "Network",
  "Ocean",
  "Pencil",
  "Quiver",
  "River",
  "Station",
  "Temple",
  "Umbrella",
  "Village",
  "Workshop",
];

export class CodenameRoom extends DurableObject {
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
    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      return this.createRoom(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/join")) {
      return this.joinRoom(request);
    }
    if (request.method === "GET" && url.pathname.endsWith("/socket")) {
      return this.openSocket(request);
    }

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
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(1001, "room expired");
    }
  }

  async createRoom(request) {
    const payload = await readJson(request);
    const roomCode = cleanRoomCode(payload.roomCode);
    if (!roomCode) return json({ error: "Invalid room code." }, 400);
    if (this.loadRoom()) return json({ error: "Room already exists." }, 409);

    const room = {
      roomCode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "waiting",
      board: [],
      startingTeam: null,
      turn: "red",
      clue: null,
      guessesThisTurn: 0,
      winner: null,
      players: [],
    };

    const player = normalizePlayer(payload);
    if (!player) return json({ error: "Player token is required." }, 400);
    room.players.push(player);

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
      if (room.players.length >= MAX_PLAYERS) {
        return json({ error: "Room is full." }, 409);
      }
      room.players.push({
        token: playerToken,
        name: `Player ${playerToken.slice(0, 4)}`,
        team: null,
        role: "operative",
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
      const changed = this.applyAction(room, player, action);
      if (changed) {
        await this.saveRoom(room);
      }
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

  applyAction(room, player, action) {
    if (action.type === "set_player") {
      const updated = normalizePlayer({
        playerToken: player.token,
        name: action.name,
        team: action.team,
        role: action.role,
      });
      ensureSpymasterAvailable(room, updated);
      Object.assign(player, updated);
      room.updatedAt = Date.now();
      return true;
    }

    if (action.type === "start_game" || action.type === "reset_game") {
      startGame(room);
      return true;
    }

    if (action.type === "submit_clue") {
      ensurePlaying(room);
      if (player.role !== "spymaster" || player.team !== room.turn) {
        throw new Error("Only the current spymaster can send a clue.");
      }
      const word = String(action.word || "").trim().slice(0, 24);
      const count = Number.parseInt(action.count, 10);
      if (!word) throw new Error("Clue is required.");
      if (!Number.isFinite(count) || count < 0 || count > 9) {
        throw new Error("Clue count must be between 0 and 9.");
      }
      room.clue = { word, count, team: player.team };
      room.guessesThisTurn = 0;
      room.updatedAt = Date.now();
      return true;
    }

    if (action.type === "reveal_card") {
      ensurePlaying(room);
      if (!room.clue) throw new Error("A clue is required before guessing.");
      if (player.role !== "operative" || player.team !== room.turn) {
        throw new Error("Only current team operatives can guess.");
      }
      const index = Number.parseInt(action.index, 10);
      const card = room.board[index];
      if (!card || card.revealed) throw new Error("Card cannot be revealed.");
      revealCard(room, card);
      return true;
    }

    if (action.type === "end_turn") {
      ensurePlaying(room);
      if (player.team !== room.turn) throw new Error("Only the current team can end turn.");
      switchTurn(room);
      return true;
    }

    throw new Error("Unknown action.");
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
    const you = room.players.find((player) => player.token === playerToken);
    const canSeeAnswers = you?.role === "spymaster";

    return {
      roomCode: room.roomCode,
      status: room.status,
      startingTeam: room.startingTeam,
      turn: room.turn,
      clue: room.clue,
      guessesThisTurn: room.guessesThisTurn,
      winner: room.winner,
      remaining: remaining(room),
      you: you ? publicPlayer(you, activeTokens) : null,
      players: room.players.map((player) => publicPlayer(player, activeTokens)),
      board: room.board.map((card) => ({
        word: card.word,
        revealed: card.revealed,
        kind: card.revealed || canSeeAnswers ? card.kind : null,
      })),
    };
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

    if (options.scheduleAlarm) {
      await this.ctx.storage.setAlarm(room.updatedAt + ROOM_TTL_MS);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleApiRequest(request, env, url) {
  if (url.pathname === "/api/codenames/rooms" || url.pathname === "/api/codenames/rooms/") {
    if (request.method !== "POST") return methodNotAllowed();
    return createApiRoom(request, env);
  }

  const joinMatch = url.pathname.match(/^\/api\/codenames\/rooms\/([^/]+)\/join\/?$/);
  if (joinMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    return joinApiRoom(request, env, joinMatch[1]);
  }

  const socketMatch = url.pathname.match(/^\/api\/codenames\/rooms\/([^/]+)\/socket\/?$/);
  if (socketMatch) {
    if (request.method !== "GET") return methodNotAllowed();
    return openApiRoomSocket(request, env, socketMatch[1]);
  }

  return json({ error: "Not found." }, 404);
}

async function createApiRoom(request, env) {
  const player = await readJson(request);

  for (let attempt = 0; attempt < MAX_ROOM_CREATE_ATTEMPTS; attempt += 1) {
    const roomCode = createRoomCode();
    const response = await fetchRoom(env, roomCode, request.url, "create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...player, roomCode }),
    });

    if (response.status !== 409) {
      if (!response.ok) return response;

      const payload = await readJson(response);
      return json({
        ...payload,
        shareUrl: roomShareUrl(request.url, payload.roomCode || roomCode),
      });
    }
  }

  return json({ error: "No room code is available." }, 503);
}

async function joinApiRoom(request, env, value) {
  const roomCode = cleanRoomCode(value);
  if (!roomCode) {
    return json({ error: "Invalid room code." }, 400);
  }

  const player = await readJson(request);
  const response = await fetchRoom(env, roomCode, request.url, "join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...player, roomCode }),
  });
  if (!response.ok) return response;

  const payload = await readJson(response);
  return json({
    ...payload,
    shareUrl: roomShareUrl(request.url, payload.roomCode || roomCode),
  });
}

function openApiRoomSocket(request, env, value) {
  const roomCode = cleanRoomCode(value);
  if (!roomCode) {
    return json({ error: "Invalid room code." }, 400);
  }

  const url = new URL(request.url);
  url.pathname = `/rooms/${roomCode}/socket`;
  const stub = getRoomStub(env, roomCode);
  return stub.fetch(new Request(url, request));
}

function fetchRoom(env, roomCode, baseUrl, action, init) {
  const stub = getRoomStub(env, roomCode);
  return stub.fetch(new Request(new URL(`/rooms/${roomCode}/${action}`, baseUrl), init));
}

function getRoomStub(env, roomCode) {
  const id = env.CODENAME_ROOMS.idFromName(roomCode);
  return env.CODENAME_ROOMS.get(id);
}

function roomShareUrl(baseUrl, roomCode) {
  const url = new URL("/codenames/", baseUrl);
  url.searchParams.set("room", roomCode);
  return url.toString();
}

function methodNotAllowed() {
  return json({ error: "Method not allowed." }, 405);
}

function startGame(room) {
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  const otherTeam = startingTeam === "red" ? "blue" : "red";
  const kinds = [
    ...Array.from({ length: 9 }, () => startingTeam),
    ...Array.from({ length: 8 }, () => otherTeam),
    ...Array.from({ length: 7 }, () => "neutral"),
    "assassin",
  ];

  room.board = shuffle(WORDS).slice(0, 25).map((word, index) => ({
    word,
    kind: kinds[index],
    revealed: false,
  }));
  room.board = shuffle(room.board);
  room.status = "playing";
  room.startingTeam = startingTeam;
  room.turn = startingTeam;
  room.clue = null;
  room.guessesThisTurn = 0;
  room.winner = null;
  room.updatedAt = Date.now();
}

function revealCard(room, card) {
  card.revealed = true;
  room.guessesThisTurn += 1;

  if (card.kind === "assassin") {
    room.winner = otherTeam(room.turn);
    room.status = "finished";
    room.updatedAt = Date.now();
    return;
  }

  const counts = remaining(room);
  if (counts.red === 0 || counts.blue === 0) {
    room.winner = counts.red === 0 ? "red" : "blue";
    room.status = "finished";
    room.updatedAt = Date.now();
    return;
  }

  if (card.kind !== room.turn) {
    switchTurn(room);
    return;
  }

  const maxGuesses = room.clue?.count === 0 ? Number.POSITIVE_INFINITY : room.clue.count + 1;
  if (room.guessesThisTurn >= maxGuesses) {
    switchTurn(room);
    return;
  }

  room.updatedAt = Date.now();
}

function switchTurn(room) {
  room.turn = otherTeam(room.turn);
  room.clue = null;
  room.guessesThisTurn = 0;
  room.updatedAt = Date.now();
}

function ensurePlaying(room) {
  if (room.status !== "playing" || !room.board.length || room.winner) {
    throw new Error("Game is not active.");
  }
}

function remaining(room) {
  return room.board.reduce(
    (counts, card) => {
      if (!card.revealed && (card.kind === "red" || card.kind === "blue")) {
        counts[card.kind] += 1;
      }
      return counts;
    },
    { red: 0, blue: 0 },
  );
}

function upsertPlayer(room, player) {
  const existing = room.players.find((item) => item.token === player.token);
  if (existing) {
    const updated =
      player.team === null && player.role === "operative"
        ? { ...existing, name: player.name }
        : player;
    ensureSpymasterAvailable(room, updated);
    Object.assign(existing, updated);
    return;
  }

  if (room.players.length >= MAX_PLAYERS) {
    throw new Error("Room is full.");
  }

  ensureSpymasterAvailable(room, player);
  room.players.push(player);
}

function normalizePlayer(payload) {
  const token = String(payload.playerToken || payload.token || "").slice(0, 80);
  if (!token) return null;
  const team = payload.team === "red" || payload.team === "blue" ? payload.team : null;
  const role = team && payload.role === "spymaster" ? "spymaster" : "operative";

  return {
    token,
    name: String(payload.name || "Player").trim().slice(0, 24) || "Player",
    team,
    role,
  };
}

function publicPlayer(player, activeTokens) {
  return {
    name: player.name,
    team: player.team,
    role: player.role,
    connected: activeTokens.has(player.token),
  };
}

function ensureSpymasterAvailable(room, player) {
  if (player.role !== "spymaster" || !player.team) return;

  const existing = room.players.find(
    (item) =>
      item.token !== player.token &&
      item.team === player.team &&
      item.role === "spymaster",
  );
  if (existing) {
    throw new Error(`${capitalize(player.team)} already has a spymaster.`);
  }
}

function otherTeam(team) {
  return team === "red" ? "blue" : "red";
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function cleanRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(body, status = 200) {
  return Response.json(body, { status });
}
