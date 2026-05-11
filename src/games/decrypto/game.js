import { WORDS } from "./words.js";

export const MAX_PLAYERS = 12;
export const TEAMS = ["white", "black"];

const ROUND_PHASES = ["clues", "white_guess", "black_guess"];

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    phase: "waiting",
    round: 0,
    activeTeam: "white",
    winner: null,
    encryptors: createEmptyEncryptors(),
    rotationCursors: createEmptyRotationCursors(),
    teams: createEmptyTeams(),
    turns: createEmptyTurns(),
    history: [],
    players: [player],
  };
}

export function applyAction(room, player, action) {
  ensureRoomShape(room);

  if (action.type === "set_player") {
    const updated = normalizePlayer({
      playerToken: player.token,
      name: action.name,
      team: action.team,
    });

    player.name = updated.name;
    if (room.status === "waiting") {
      player.team = updated.team;
    }

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
    ensurePhase(room, "clues");
    ensureTeam(player.team);

    const targetTeam = player.team;
    if (!isEncryptor(room, player.token, targetTeam)) {
      throw new Error("Only your team's Encryptor can send clues.");
    }

    const turn = room.turns[targetTeam];
    if (turn.revealed) throw new Error("This code has already been revealed.");
    if (turn.cluesSubmitted) throw new Error("Clues are already locked.");

    turn.clues = normalizeClues(action.clues);
    turn.cluesSubmitted = true;

    if (TEAMS.every((team) => room.turns[team]?.cluesSubmitted)) {
      room.phase = "white_guess";
      room.activeTeam = "white";
    }

    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "submit_guess") {
    ensurePlaying(room);
    ensureNotPhase(room, "clues");
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
      if (isEncryptor(room, player.token, targetTeam)) {
        throw new Error("The Encryptor cannot decode their own clues.");
      }
      if (turn.homeGuess) throw new Error("Your team's decode is already locked.");
      turn.homeGuess = guess;
    } else {
      if (room.round < 2) throw new Error("Interceptions start in round 2.");
      if (turn.interceptGuess) throw new Error("The intercept is already locked.");
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
    ensureNotPhase(room, "clues");

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
    if (room.round > 1 && !turn.interceptGuess) {
      throw new Error("The opposing team must intercept first.");
    }

    revealTurn(room, targetTeam);
    return true;
  }

  throw new Error("Unknown action.");
}

export function startGame(room) {
  ensureRoomShape(room);

  const words = shuffle(WORDS).slice(0, 8);

  room.status = "playing";
  room.phase = "clues";
  room.round = 1;
  room.activeTeam = "white";
  room.winner = null;
  room.rotationCursors = createEmptyRotationCursors();
  room.teams = {
    white: { words: words.slice(0, 4), intercepts: 0, miscues: 0 },
    black: { words: words.slice(4, 8), intercepts: 0, miscues: 0 },
  };
  room.turns = createTurns();
  room.history = [];
  assignEncryptors(room);
  room.updatedAt = Date.now();
}

export function upsertPlayer(room, player) {
  ensureRoomShape(room);
  const existing = room.players.find((item) => item.token === player.token);
  if (existing) {
    existing.name = player.name;
    if (room.status === "waiting" && player.team !== null) {
      existing.team = player.team;
    }
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

export function publicPlayer(player, activeTokens, room) {
  return {
    name: player.name,
    team: player.team,
    connected: activeTokens.has(player.token),
    isEncryptor: Boolean(room && player.team && isEncryptor(room, player.token, player.team)),
  };
}

export function getHostToken(room) {
  return room.hostToken || room.players[0]?.token || null;
}

export function viewFor(room, playerToken, activeTokens) {
  ensureRoomShape(room);
  const you = room.players.find((player) => player.token === playerToken);
  const hostToken = getHostToken(room);

  return {
    roomCode: room.roomCode,
    status: room.status,
    phase: room.phase,
    round: room.round,
    activeTeam: room.activeTeam,
    winner: room.winner,
    isHost: Boolean(you && you.token === hostToken),
    encryptors: Object.fromEntries(
      TEAMS.map((team) => [
        team,
        {
          name: encryptorFor(room, team)?.name || null,
        },
      ]),
    ),
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
      TEAMS.map((team) => [team, publicTurn(room, room.turns[team], you, team)]),
    ),
    history: room.history,
    you: you ? publicPlayer(you, activeTokens, room) : null,
    players: room.players.map((player) => publicPlayer(player, activeTokens, room)),
  };
}

function publicTurn(room, turn, viewer, targetTeam) {
  if (!turn) return null;

  const viewerTeam = viewer?.team;
  const viewerIsEncryptor = Boolean(viewer && isEncryptor(room, viewer.token, targetTeam));
  const cluesVisible = turn.revealed || (room.phase !== "clues" && room.activeTeam === targetTeam);
  const canSeeIntercept = viewerTeam && viewerTeam !== targetTeam;

  return {
    team: targetTeam,
    code: turn.revealed || viewerIsEncryptor ? turn.code : [null, null, null],
    clues: cluesVisible ? turn.clues : ["", "", ""],
    cluesSubmitted: turn.cluesSubmitted,
    homeGuess: turn.revealed || viewerTeam === targetTeam ? turn.homeGuess : null,
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

  if (targetTeam === "white") {
    room.phase = "black_guess";
    room.activeTeam = "black";
  } else {
    completeRound(room);
  }

  room.updatedAt = Date.now();
}

function completeRound(room) {
  const winner = endOfRoundWinner(room);
  if (winner) {
    finishGame(room, winner);
    return;
  }

  advanceRound(room);
}

function advanceRound(room) {
  room.round += 1;
  room.phase = "clues";
  room.activeTeam = "white";
  room.turns = createTurns();
  assignEncryptors(room);
}

function finishGame(room, winner) {
  room.status = "finished";
  room.phase = "finished";
  room.winner = winner;
  room.updatedAt = Date.now();
}

function endOfRoundWinner(room) {
  const hasEndCondition = TEAMS.some(
    (team) => room.teams[team].intercepts >= 2 || room.teams[team].miscues >= 2,
  );
  if (!hasEndCondition) return null;

  const whitePoints = scorePoints(room.teams.white);
  const blackPoints = scorePoints(room.teams.black);
  if (whitePoints > blackPoints) return "white";
  if (blackPoints > whitePoints) return "black";
  return "tie";
}

function scorePoints(score) {
  return score.intercepts - score.miscues;
}

function shouldAutoReveal(room, targetTeam) {
  const turn = room.turns[targetTeam];
  return Boolean(turn.homeGuess && (room.round === 1 || turn.interceptGuess));
}

function assignEncryptors(room) {
  room.encryptors = Object.fromEntries(
    TEAMS.map((team) => {
      const roster = playersForTeam(room, team);
      if (!roster.length) return [team, null];
      const cursor = room.rotationCursors[team] || 0;
      const encryptor = roster[cursor % roster.length];
      room.rotationCursors[team] = cursor + 1;
      return [team, encryptor.token];
    }),
  );
}

function playersForTeam(room, team) {
  return room.players.filter((player) => player.team === team);
}

function encryptorFor(room, team) {
  const token = room.encryptors?.[team];
  return token ? room.players.find((player) => player.token === token) || null : null;
}

function isEncryptor(room, token, team) {
  return Boolean(token && team && room.encryptors?.[team] === token);
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

function createEmptyEncryptors() {
  return {
    white: null,
    black: null,
  };
}

function createEmptyRotationCursors() {
  return {
    white: 0,
    black: 0,
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

function ensureRoomShape(room) {
  room.phase ||= room.status === "waiting" ? "waiting" : "clues";
  room.encryptors ||= createEmptyEncryptors();
  room.rotationCursors ||= createEmptyRotationCursors();
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

function ensurePhase(room, phase) {
  if (room.phase !== phase) {
    throw new Error(`This action is only available during ${phase.replace("_", " ")}.`);
  }
}

function ensureNotPhase(room, phase) {
  if (room.phase === phase) {
    throw new Error("Both Encryptors must send clues before guessing.");
  }
  if (!ROUND_PHASES.includes(room.phase)) {
    throw new Error("Game is not active.");
  }
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
