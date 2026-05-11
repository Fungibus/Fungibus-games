import { WORDS } from "./words.js";

export const MAX_PLAYERS = 12;
export const TEAMS = ["white", "black"];

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    round: 0,
    activeTeam: "white",
    winner: null,
    teams: createEmptyTeams(),
    turns: createEmptyTurns(),
    history: [],
    players: [player],
  };
}

export function applyAction(room, player, action) {
  if (action.type === "set_player") {
    const updated = normalizePlayer({
      playerToken: player.token,
      name: action.name,
      team: action.team,
    });
    Object.assign(player, updated);
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "start_game" || action.type === "reset_game") {
    ensureHost(room, player);
    startGame(room);
    return true;
  }

  if (action.type === "submit_clues") {
    ensurePlaying(room);
    ensureTeam(player.team);
    if (player.team !== room.activeTeam) {
      throw new Error("Only the active team can send clues.");
    }

    const turn = activeTurn(room);
    if (turn.revealed) throw new Error("This code has already been revealed.");
    if (turn.cluesSubmitted) throw new Error("Clues are already locked.");

    turn.clues = normalizeClues(action.clues);
    turn.cluesSubmitted = true;
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "submit_guess") {
    ensurePlaying(room);
    ensureTeam(player.team);

    const targetTeam = normalizeTeam(action.targetTeam);
    if (targetTeam !== room.activeTeam) {
      throw new Error("Guesses are only open for the active code.");
    }

    const turn = room.turns[targetTeam];
    if (!turn?.cluesSubmitted) throw new Error("Clues must be sent before guessing.");
    if (turn.revealed) throw new Error("This code has already been revealed.");

    const guess = normalizeCode(action.guess);
    if (player.team === targetTeam) {
      turn.homeGuess = guess;
    } else {
      if (room.round < 2) throw new Error("Interceptions start in round 2.");
      turn.interceptGuess = guess;
    }

    if (shouldAutoReveal(room, targetTeam)) {
      revealTurn(room, targetTeam);
    } else {
      room.updatedAt = Date.now();
    }
    return true;
  }

  if (action.type === "reveal_turn") {
    ensurePlaying(room);
    const targetTeam = normalizeTeam(action.targetTeam || room.activeTeam);
    if (targetTeam !== room.activeTeam) {
      throw new Error("Only the active code can be revealed.");
    }
    if (player.team !== targetTeam && player.token !== getHostToken(room)) {
      throw new Error("Only the active team or host can reveal the code.");
    }
    const turn = room.turns[targetTeam];
    if (!turn?.cluesSubmitted || !turn.homeGuess) {
      throw new Error("The active team must decode first.");
    }

    revealTurn(room, targetTeam);
    return true;
  }

  throw new Error("Unknown action.");
}

export function startGame(room) {
  const words = shuffle(WORDS).slice(0, 8);

  room.status = "playing";
  room.round = 1;
  room.activeTeam = "white";
  room.winner = null;
  room.teams = {
    white: { words: words.slice(0, 4), intercepts: 0, miscues: 0 },
    black: { words: words.slice(4, 8), intercepts: 0, miscues: 0 },
  };
  room.turns = createTurns();
  room.history = [];
  room.updatedAt = Date.now();
}

export function upsertPlayer(room, player) {
  const existing = room.players.find((item) => item.token === player.token);
  if (existing) {
    const updated = player.team === null ? { ...existing, name: player.name } : player;
    Object.assign(existing, updated);
    return;
  }

  if (room.players.length >= MAX_PLAYERS) {
    throw new Error("Room is full.");
  }

  room.players.push(player);
}

export function normalizePlayer(payload) {
  const token = String(payload.playerToken || payload.token || "").slice(0, 80);
  if (!token) return null;
  return {
    token,
    name: String(payload.name || "Player").trim().slice(0, 24) || "Player",
    team: normalizeTeam(payload.team, { allowNull: true }),
  };
}

export function publicPlayer(player, activeTokens) {
  return {
    name: player.name,
    team: player.team,
    connected: activeTokens.has(player.token),
  };
}

export function getHostToken(room) {
  return room.hostToken || room.players[0]?.token || null;
}

export function viewFor(room, playerToken, activeTokens) {
  const you = room.players.find((player) => player.token === playerToken);
  const hostToken = getHostToken(room);

  return {
    roomCode: room.roomCode,
    status: room.status,
    round: room.round,
    activeTeam: room.activeTeam,
    winner: room.winner,
    isHost: Boolean(you && you.token === hostToken),
    teams: Object.fromEntries(
      TEAMS.map((team) => [
        team,
        {
          words:
            room.status !== "waiting" && you?.team === team
              ? room.teams[team].words
              : Array.from({ length: 4 }, () => null),
          intercepts: room.teams[team].intercepts,
          miscues: room.teams[team].miscues,
        },
      ]),
    ),
    turns: Object.fromEntries(
      TEAMS.map((team) => [team, publicTurn(room.turns[team], you?.team, team)]),
    ),
    history: room.history,
    you: you ? publicPlayer(you, activeTokens) : null,
    players: room.players.map((player) => publicPlayer(player, activeTokens)),
  };
}

function publicTurn(turn, viewerTeam, targetTeam) {
  if (!turn) return null;
  const isHomeTeam = viewerTeam === targetTeam;
  const canSeeIntercept = viewerTeam && viewerTeam !== targetTeam;

  return {
    team: targetTeam,
    code: turn.revealed || isHomeTeam ? turn.code : [null, null, null],
    clues: turn.cluesSubmitted ? turn.clues : ["", "", ""],
    cluesSubmitted: turn.cluesSubmitted,
    homeGuess: turn.revealed || isHomeTeam ? turn.homeGuess : null,
    interceptGuess: turn.revealed || canSeeIntercept ? turn.interceptGuess : null,
    revealed: turn.revealed,
    results: turn.revealed ? turn.results : null,
  };
}

function revealTurn(room, targetTeam) {
  const turn = room.turns[targetTeam];
  if (!turn || turn.revealed) return;

  const opponent = otherTeam(targetTeam);
  const homeCorrect = codesEqual(turn.homeGuess, turn.code);
  const interceptCorrect =
    room.round > 1 && turn.interceptGuess ? codesEqual(turn.interceptGuess, turn.code) : false;

  if (!homeCorrect) room.teams[targetTeam].miscues += 1;
  if (interceptCorrect) room.teams[opponent].intercepts += 1;

  turn.revealed = true;
  turn.results = { homeCorrect, interceptCorrect };
  room.history.unshift({
    round: room.round,
    team: targetTeam,
    code: turn.code,
    clues: turn.clues,
    homeGuess: turn.homeGuess,
    interceptGuess: turn.interceptGuess,
    results: turn.results,
  });
  room.history = room.history.slice(0, 24);

  if (room.teams[targetTeam].miscues >= 2) {
    finishGame(room, opponent);
    return;
  }
  if (room.teams[opponent].intercepts >= 2) {
    finishGame(room, opponent);
    return;
  }

  if (!room.turns[opponent].revealed) {
    room.activeTeam = opponent;
  } else {
    advanceRound(room);
  }

  room.updatedAt = Date.now();
}

function advanceRound(room) {
  room.round += 1;
  room.activeTeam = room.round % 2 === 0 ? "black" : "white";
  room.turns = createTurns();
}

function finishGame(room, winner) {
  room.status = "finished";
  room.winner = winner;
  room.updatedAt = Date.now();
}

function shouldAutoReveal(room, targetTeam) {
  const turn = room.turns[targetTeam];
  return Boolean(turn.homeGuess && (room.round === 1 || turn.interceptGuess));
}

function activeTurn(room) {
  return room.turns[room.activeTeam];
}

function createEmptyTeams() {
  return {
    white: { words: [], intercepts: 0, miscues: 0 },
    black: { words: [], intercepts: 0, miscues: 0 },
  };
}

function createEmptyTurns() {
  return {
    white: null,
    black: null,
  };
}

function createTurns() {
  return {
    white: createTurn("white"),
    black: createTurn("black"),
  };
}

function createTurn(team) {
  return {
    team,
    code: createCode(),
    clues: ["", "", ""],
    cluesSubmitted: false,
    homeGuess: null,
    interceptGuess: null,
    revealed: false,
    results: null,
  };
}

function createCode() {
  return shuffle([1, 2, 3, 4]).slice(0, 3);
}

function normalizeClues(value) {
  if (!Array.isArray(value)) throw new Error("Three clues are required.");
  const clues = value.slice(0, 3).map((item) => String(item || "").trim().slice(0, 36));
  if (clues.length !== 3 || clues.some((item) => !item)) {
    throw new Error("Three clues are required.");
  }
  return clues;
}

function normalizeCode(value) {
  const digits = Array.isArray(value)
    ? value.map((item) => Number.parseInt(item, 10))
    : String(value || "")
        .replace(/[^1-4]/g, "")
        .split("")
        .map((item) => Number.parseInt(item, 10));

  if (digits.length !== 3 || digits.some((digit) => ![1, 2, 3, 4].includes(digit))) {
    throw new Error("Enter a three-number code using 1 through 4.");
  }
  if (new Set(digits).size !== 3) {
    throw new Error("Code numbers cannot repeat.");
  }
  return digits;
}

function normalizeTeam(team, options = {}) {
  if (team === "white" || team === "black") return team;
  if (options.allowNull) return null;
  throw new Error("Choose a team.");
}

function ensurePlaying(room) {
  if (room.status !== "playing" || room.winner) {
    throw new Error("Game is not active.");
  }
}

function ensureHost(room, player) {
  if (player.token !== getHostToken(room)) {
    throw new Error("Only the host can start a new game.");
  }
}

function ensureTeam(team) {
  if (!TEAMS.includes(team)) throw new Error("Choose a team first.");
}

function otherTeam(team) {
  return team === "white" ? "black" : "white";
}

function codesEqual(left, right) {
  return Boolean(
    left &&
      right &&
      left.length === right.length &&
      left.every((digit, index) => digit === right[index]),
  );
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
