import { DurableObject } from "cloudflare:workers";

const ROOM_PATTERN = /^[A-Z0-9]{6,12}$/;
const VALID_ROLES = new Set([
  "spectator",
  "red-operative",
  "blue-operative",
  "red-spymaster",
  "blue-spymaster"
]);

const WORDS = [
  "Anchor", "Apple", "Artist", "Atlas", "Bank", "Battery", "Beach",
  "Bridge", "Cabin", "Camera", "Castle", "Cell", "Circle", "Cloud",
  "Copper", "Crane", "Crown", "Cycle", "Desert", "Diamond", "Dragon",
  "Drift", "Echo", "Engine", "Falcon", "Field", "Film", "Forest",
  "Frame", "Galaxy", "Garden", "Ghost", "Glass", "Glove", "Harbor",
  "Hawk", "Honey", "Hotel", "Island", "Ivory", "Jacket", "Jupiter",
  "Key", "King", "Ladder", "Lake", "Laser", "Lemon", "Library",
  "Light", "Marble", "Market", "Mercury", "Mirror", "Moon", "Mountain",
  "Needle", "Night", "Ocean", "Olive", "Orange", "Orbit", "Paper",
  "Park", "Piano", "Pilot", "Pipe", "Planet", "Plate", "Pocket",
  "Port", "Press", "Queen", "River", "Robot", "Rose", "Satellite",
  "Scale", "School", "Shadow", "Ship", "Snow", "Sound", "Spring",
  "Square", "Star", "Station", "Stone", "Stream", "Switch", "Temple",
  "Tiger", "Tower", "Train", "Triangle", "Violet", "Watch", "Wave",
  "Window", "Winter"
];

function randomIndex(limit) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % limit;
}

function shuffle(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function createRoles(firstTeam) {
  const secondTeam = firstTeam === "red" ? "blue" : "red";
  return shuffle([
    ...Array(9).fill(firstTeam),
    ...Array(8).fill(secondTeam),
    ...Array(7).fill("neutral"),
    "assassin"
  ]);
}

function createGameState() {
  const startingTeam = randomIndex(2) === 0 ? "red" : "blue";
  const words = shuffle(WORDS).slice(0, 25);
  const roles = createRoles(startingTeam);

  return {
    activeTeam: startingTeam,
    startingTeam,
    winner: null,
    cards: words.map((word, index) => ({
      word,
      role: roles[index],
      revealed: false
    }))
  };
}

function remainingFor(state, team) {
  return state.cards.filter((card) => card.role === team && !card.revealed).length;
}

function isSpymaster(role) {
  return role === "red-spymaster" || role === "blue-spymaster";
}

function canReveal(role) {
  return role === "red-operative" || role === "blue-operative";
}

function canControlTurn(role) {
  return role !== "spectator";
}

function cleanRole(role) {
  return VALID_ROLES.has(role) ? role : "spectator";
}

function visibleStateForRole(state, role) {
  const revealRoles = isSpymaster(role);

  return {
    activeTeam: state.activeTeam,
    startingTeam: state.startingTeam,
    winner: state.winner,
    remaining: {
      red: remainingFor(state, "red"),
      blue: remainingFor(state, "blue")
    },
    cards: state.cards.map((card) => ({
      word: card.word,
      revealed: card.revealed,
      ...(card.revealed || revealRoles ? { role: card.role } : {})
    }))
  };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers
    }
  });
}

export class CodenamesRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sessions = new Map();
    this.statePromise = null;
    this.writeChain = Promise.resolve();

    for (const websocket of this.ctx.getWebSockets()) {
      const attachment = websocket.deserializeAttachment() || {};
      this.sessions.set(websocket, {
        id: attachment.id || crypto.randomUUID(),
        roomId: attachment.roomId,
        role: cleanRole(attachment.role)
      });
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const roomId = this.roomIdFromPath(url.pathname);

    if (!roomId) {
      return new Response("Invalid room id", { status: 400 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      const state = await this.loadState();
      return jsonResponse({
        roomId,
        state: visibleStateForRole(state, "spectator")
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const session = {
      id: crypto.randomUUID(),
      roomId,
      role: "spectator"
    };

    this.sessions.set(server, session);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(session);

    await this.broadcastState(roomId);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(websocket, message) {
    const session = this.sessions.get(websocket);
    if (!session) {
      websocket.close(1011, "Missing session");
      return;
    }

    let event;
    try {
      event = JSON.parse(message);
    } catch {
      this.sendError(websocket, "Invalid message.");
      return;
    }

    const roomId = session.roomId;

    if (event.type === "join" || event.type === "setRole") {
      session.role = cleanRole(event.role);
      websocket.serializeAttachment(session);
      await this.broadcastState(roomId);
      return;
    }

    if (event.type === "newGame") {
      if (!canControlTurn(session.role)) {
        this.sendError(websocket, "Spectators cannot start games.");
        return;
      }

      await this.replaceState(createGameState());
      await this.broadcastState(roomId);
      return;
    }

    if (event.type === "endTurn") {
      const changed = await this.mutateState(async (state) => {
        if (!canControlTurn(session.role)) {
          this.sendError(websocket, "Spectators cannot end turns.");
          return false;
        }

        if (state.winner) {
          this.sendError(websocket, "The game is already over.");
          return false;
        }

        state.activeTeam = state.activeTeam === "red" ? "blue" : "red";
        return true;
      });

      if (!changed) {
        return;
      }

      await this.broadcastState(roomId);
      return;
    }

    if (event.type === "revealCard") {
      const changed = await this.mutateState(async (state) => {
        if (!canReveal(session.role)) {
          this.sendError(websocket, "Only operatives can reveal cards.");
          return false;
        }

        if (state.winner) {
          this.sendError(websocket, "The game is already over.");
          return false;
        }

        const index = Number(event.index);
        const card = state.cards[index];

        if (!Number.isInteger(index) || !card) {
          this.sendError(websocket, "Invalid card.");
          return false;
        }

        if (card.revealed) {
          this.sendError(websocket, "Card is already revealed.");
          return false;
        }

        card.revealed = true;

        if (card.role === "assassin") {
          state.winner = state.activeTeam === "red" ? "blue" : "red";
        } else if (remainingFor(state, "red") === 0) {
          state.winner = "red";
        } else if (remainingFor(state, "blue") === 0) {
          state.winner = "blue";
        }

        return true;
      });

      if (!changed) {
        return;
      }

      await this.broadcastState(roomId);
      return;
    }

    this.sendError(websocket, "Unknown action.");
  }

  async webSocketClose(websocket) {
    const session = this.sessions.get(websocket);
    this.sessions.delete(websocket);
    const roomId = session?.roomId;
    await this.broadcastState(roomId);
  }

  async webSocketError(websocket) {
    const session = this.sessions.get(websocket);
    this.sessions.delete(websocket);
    const roomId = session?.roomId;
    await this.broadcastState(roomId);
  }

  async loadState() {
    if (!this.statePromise) {
      this.statePromise = this.ctx.storage.get("game").then(async (stored) => {
        if (stored) {
          return stored;
        }

        const state = createGameState();
        await this.ctx.storage.put("game", state);
        return state;
      });
    }

    return structuredClone(await this.statePromise);
  }

  async saveState(state) {
    await this.ctx.storage.put("game", state);
    this.statePromise = Promise.resolve(structuredClone(state));
  }

  async mutateState(mutator) {
    const nextWrite = this.writeChain.then(async () => {
      const state = await this.loadState();
      const changed = await mutator(state);

      if (!changed) {
        return false;
      }

      await this.saveState(state);
      return true;
    });

    this.writeChain = nextWrite.catch(() => {});
    return nextWrite;
  }

  async replaceState(state) {
    const nextWrite = this.writeChain.then(async () => {
      await this.saveState(state);
      return true;
    });

    this.writeChain = nextWrite.catch(() => {});
    return nextWrite;
  }

  roomIdFromPath(pathname) {
    const match = pathname.match(/\/rooms\/([A-Z0-9]{6,12})\/websocket$/);
    return match ? match[1] : null;
  }

  connectedPlayers() {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      role: session.role
    }));
  }

  async sendState(websocket, roomId) {
    const session = this.sessions.get(websocket);
    if (!session || websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const state = await this.loadState();
    websocket.send(JSON.stringify({
      type: "state",
      roomId,
      role: session.role,
      players: this.connectedPlayers(),
      state: visibleStateForRole(state, session.role)
    }));
  }

  async broadcastState(roomId) {
    if (!roomId) {
      return;
    }

    await Promise.all(
      Array.from(this.sessions.keys(), (websocket) => this.sendState(websocket, roomId))
    );
  }

  sendError(websocket, message) {
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: "error", message }));
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/codenames\/([A-Z0-9]{6,12})\/websocket$/);

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const roomId = match[1];

    if (!ROOM_PATTERN.test(roomId)) {
      return new Response("Invalid room id", { status: 400 });
    }

    const id = env.CODENAMES_ROOMS.idFromName(roomId);
    const room = env.CODENAMES_ROOMS.get(id);
    url.pathname = `/rooms/${roomId}/websocket`;

    return room.fetch(new Request(url, request));
  }
};
