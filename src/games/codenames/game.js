import { WORDS } from "./words.js";

export const MAX_PLAYERS = 12;

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    board: [],
    startingTeam: null,
    turn: "red",
    clue: null,
    guessesThisTurn: 0,
    winner: null,
    players: [player],
  };
}

export function applyAction(room, player, action) {
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
    ensureHost(room, player);
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

export function startGame(room) {
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  const otherStartingTeam = startingTeam === "red" ? "blue" : "red";
  const kinds = [
    ...Array.from({ length: 9 }, () => startingTeam),
    ...Array.from({ length: 8 }, () => otherStartingTeam),
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

export function revealCard(room, card) {
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

export function switchTurn(room) {
  room.turn = otherTeam(room.turn);
  room.clue = null;
  room.guessesThisTurn = 0;
  room.updatedAt = Date.now();
}

export function remaining(room) {
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

export function upsertPlayer(room, player) {
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

export function normalizePlayer(payload) {
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

export function publicPlayer(player, activeTokens) {
  return {
    name: player.name,
    team: player.team,
    role: player.role,
    connected: activeTokens.has(player.token),
  };
}

export function getHostToken(room) {
  return room.hostToken || room.players[0]?.token || null;
}

function ensurePlaying(room) {
  if (room.status !== "playing" || !room.board.length || room.winner) {
    throw new Error("Game is not active.");
  }
}

function ensureHost(room, player) {
  if (player.token !== getHostToken(room)) {
    throw new Error("Only the host can start a new game.");
  }
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
