import { WORDS } from "./words.js";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;
export const ROUND_COUNT = 13;

const GUESS_RESULTS = new Set(["correct", "wrong"]);

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    phase: "waiting",
    round: 0,
    roundIndex: 0,
    roundTotal: ROUND_COUNT,
    score: 0,
    activePlayerToken: null,
    activePlayerIndex: 0,
    selectedNumber: null,
    card: null,
    word: null,
    deck: [],
    lastGuess: null,
    history: [],
    players: [normalizeGamePlayer(player)],
  };
}

export function applyAction(room, player, action) {
  ensureRoomShape(room);

  if (action.type === "set_player") {
    const updated = normalizePlayer({
      playerToken: player.token,
      name: action.name,
    });
    if (!updated) throw new Error("Player token is required.");
    player.name = updated.name;
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "start_game") {
    ensureHost(room, player);
    if (room.status !== "waiting") {
      throw new Error("Reset the game before starting again.");
    }
    startGame(room);
    return true;
  }

  if (action.type === "reset_game") {
    ensureHost(room, player);
    resetGame(room);
    return true;
  }

  if (action.type === "submit_clue") {
    ensurePlaying(room);
    ensurePhase(room, "writing_clues");
    if (player.token === room.activePlayerToken) {
      throw new Error("The active player does not write a clue.");
    }
    if (player.clues.length >= cluesPerPlayer(room)) {
      throw new Error("Your clues are already locked.");
    }

    const clue = normalizeClue(action.clue);
    if (!clue) throw new Error("Write a clue before locking it.");

    player.clues.push(clue);
    addHistory(room, `${player.name} locked clue ${player.clues.length}.`);

    if (clueGivers(room).every((item) => item.clues.length >= cluesPerPlayer(room))) {
      compareClues(room);
    }

    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "choose_number") {
    ensurePlaying(room);
    ensurePhase(room, "selecting_word");
    if (player.token !== room.activePlayerToken) {
      throw new Error("Only the active player can choose the number.");
    }

    const number = Number.parseInt(action.number, 10);
    if (!Number.isInteger(number) || number < 1 || number > 5) {
      throw new Error("Choose a number from 1 to 5.");
    }

    room.selectedNumber = number;
    room.word = room.card[number - 1];
    room.phase = "writing_clues";
    addHistory(room, `${player.name} chose word ${number}.`);
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "submit_guess") {
    ensurePlaying(room);
    ensurePhase(room, "guessing");
    if (player.token !== room.activePlayerToken) {
      throw new Error("Only the active player can guess.");
    }

    if (action.pass) {
      resolveGuess(room, player, {
        result: "pass",
        guess: "",
      });
      return true;
    }

    const guess = normalizeGuess(action.guess);
    if (!guess) throw new Error("Enter a guess or pass.");

    room.phase = "checking_guess";
    room.lastGuess = {
      result: "pending",
      guess,
      word: room.word,
      playerName: player.name,
    };
    addHistory(room, `${player.name} guessed "${guess}".`);
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "resolve_guess") {
    ensurePlaying(room);
    ensurePhase(room, "checking_guess");
    if (player.token === room.activePlayerToken) {
      throw new Error("A teammate checks the guess.");
    }

    const result = String(action.result || "").toLowerCase();
    if (!GUESS_RESULTS.has(result)) throw new Error("Choose correct or wrong.");
    resolveGuess(room, player, {
      result,
      guess: room.lastGuess?.guess || "",
    });
    return true;
  }

  throw new Error("Unknown action.");
}

export function startGame(room) {
  ensureRoomShape(room);
  if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
    throw new Error(`Just One needs ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  }

  room.players.forEach((player) => {
    Object.assign(player, normalizeGamePlayer(player));
  });
  room.status = "playing";
  room.phase = "selecting_word";
  room.round = 0;
  room.roundIndex = 0;
  room.roundTotal = ROUND_COUNT;
  room.score = 0;
  room.activePlayerIndex = Math.floor(Math.random() * room.players.length);
  room.selectedNumber = null;
  room.card = null;
  room.word = null;
  room.deck = createDeck();
  room.lastGuess = null;
  room.history = [];
  startRound(room);
}

export function resetGame(room) {
  ensureRoomShape(room);
  room.status = "waiting";
  room.phase = "waiting";
  room.round = 0;
  room.roundIndex = 0;
  room.roundTotal = ROUND_COUNT;
  room.score = 0;
  room.activePlayerToken = null;
  room.activePlayerIndex = 0;
  room.selectedNumber = null;
  room.card = null;
  room.word = null;
  room.deck = [];
  room.lastGuess = null;
  room.history = [];
  room.players.forEach((player) => {
    Object.assign(player, normalizeGamePlayer(player));
  });
  room.updatedAt = Date.now();
}

export function upsertPlayer(room, player) {
  ensureRoomShape(room);
  const existing = room.players.find((item) => item.token === player.token);
  if (existing) {
    existing.name = player.name;
    return;
  }

  if (room.status !== "waiting") {
    throw new Error("This game has already started.");
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new Error("Room is full.");
  }

  room.players.push(normalizeGamePlayer(player));
}

export function normalizePlayer(payload) {
  const token = String(payload.playerToken || payload.token || "").slice(0, 80);
  if (!token) return null;
  return {
    token,
    name: String(payload.name || "Player").trim().slice(0, 24) || "Player",
  };
}

export function publicPlayer(player, activeTokens, room) {
  return {
    token: player.token,
    name: player.name,
    connected: activeTokens.has(player.token),
    isActivePlayer: room.activePlayerToken === player.token,
    clueCount: player.clues.length,
    hasClue: player.clues.length >= cluesPerPlayer(room),
  };
}

export function getHostToken(room) {
  return room.hostToken || room.players[0]?.token || null;
}

export function viewFor(room, playerToken, activeTokens) {
  ensureRoomShape(room);
  const you = room.players.find((player) => player.token === playerToken);
  const isActivePlayer = Boolean(you && you.token === room.activePlayerToken);
  const hostToken = getHostToken(room);

  return {
    roomCode: room.roomCode,
    status: room.status,
    phase: room.phase,
    round: room.round,
    roundTotal: room.roundTotal,
    score: room.score,
    cardsRemaining: room.deck.length + (room.card ? 1 : 0),
    activePlayerToken: room.activePlayerToken,
    activePlayerName: playerByToken(room, room.activePlayerToken)?.name || null,
    selectedNumber: room.selectedNumber,
    card: room.status === "playing" && !isActivePlayer ? room.card : null,
    word:
      room.status === "playing" && room.word && (!isActivePlayer || room.phase === "checking_guess")
        ? room.word
        : null,
    isHost: Boolean(you && you.token === hostToken),
    isActivePlayer,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    cluesPerPlayer: cluesPerPlayer(room),
    clueCount: clueGivers(room).reduce((total, player) => total + player.clues.length, 0),
    clueTarget: Math.max(0, room.players.length - 1) * cluesPerPlayer(room),
    clues: visibleCluesFor(room, you),
    lastGuess: room.lastGuess,
    players: room.players.map((player) => publicPlayer(player, activeTokens, room)),
    history: room.history.slice(-28).reverse(),
  };
}

function startRound(room) {
  if (!room.deck.length) {
    finishGame(room);
    return;
  }

  room.players.forEach((player) => {
    player.clues = [];
  });
  room.round += 1;
  room.roundIndex = room.round - 1;
  room.phase = "selecting_word";
  room.selectedNumber = null;
  room.card = room.deck.shift();
  room.word = null;
  room.activePlayerIndex %= room.players.length;
  room.activePlayerToken = room.players[room.activePlayerIndex].token;
  addHistory(room, `Turn ${room.round}: ${playerByToken(room, room.activePlayerToken).name} chooses a number.`);
  room.updatedAt = Date.now();
}

function resolveGuess(room, player, result) {
  const word = room.word;
  if (result.result === "correct") {
    room.score += 1;
    addHistory(room, `"${result.guess}" was correct.`);
  } else if (result.result === "wrong") {
    addHistory(room, `"${result.guess}" missed "${word}".`);
    if (room.deck.length) {
      room.deck.shift();
      addHistory(room, "One extra card was lost.");
    } else if (room.score > 0) {
      room.score -= 1;
      addHistory(room, "No deck card remained, so one won card was lost.");
    }
  } else {
    addHistory(room, `${player.name} passed on "${word}".`);
  }

  room.lastGuess = {
    result: result.result,
    guess: result.guess,
    word,
    playerName: playerByToken(room, room.activePlayerToken)?.name || "Player",
  };
  room.activePlayerIndex += 1;
  room.card = null;
  startRound(room);
}

function finishGame(room) {
  room.status = "finished";
  room.phase = "finished";
  room.activePlayerToken = null;
  room.selectedNumber = null;
  room.card = null;
  room.word = null;
  room.players.forEach((player) => {
    player.clues = [];
  });
  addHistory(room, `Final score: ${room.score}/${room.roundTotal}.`);
  room.updatedAt = Date.now();
}

function visibleCluesFor(room, you) {
  if (room.status !== "playing" || !you) return [];
  if (room.phase !== "guessing" && room.phase !== "checking_guess") return [];

  const clues = evaluatedClues(room);
  return you.token === room.activePlayerToken ? clues.filter((clue) => !clue.eliminated) : clues;
}

function evaluatedClues(room) {
  const clues = clueGivers(room)
    .flatMap((player) =>
      player.clues.map((clue, index) => ({
        id: `${player.token}-${index}`,
        playerToken: player.token,
        playerName: player.name,
        text: clue.text,
        normalized: clue.normalized,
      })),
    );
  const counts = new Map();
  for (const clue of clues) {
    counts.set(clue.normalized, (counts.get(clue.normalized) || 0) + 1);
  }
  return clues.map((clue) => ({
    id: clue.id,
    playerToken: clue.playerToken,
    playerName: clue.playerName,
    text: clue.text,
    eliminated: counts.get(clue.normalized) > 1,
  }));
}

function compareClues(room) {
  const clues = evaluatedClues(room);
  const remaining = clues.filter((clue) => !clue.eliminated).length;
  const canceled = clues.length - remaining;

  if (canceled) {
    addHistory(room, `${canceled} duplicate clue${canceled === 1 ? "" : "s"} canceled.`);
  }

  if (!remaining) {
    addHistory(room, `All clues were canceled. "${room.word}" was lost.`);
    room.lastGuess = {
      result: "canceled",
      guess: "",
      word: room.word,
      playerName: playerByToken(room, room.activePlayerToken)?.name || "Player",
    };
    room.activePlayerIndex += 1;
    room.card = null;
    startRound(room);
    return;
  }

  room.phase = "guessing";
  addHistory(room, `${remaining} clue${remaining === 1 ? "" : "s"} reached the guesser.`);
}

function clueGivers(room) {
  return room.players.filter((player) => player.token !== room.activePlayerToken);
}

function cluesPerPlayer(room) {
  return room.players.length <= 4 ? 2 : 1;
}

function normalizeClue(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
  const normalized = normalizeClueText(text);
  if (!normalized) return null;
  return {
    text,
    normalized,
  };
}

function normalizeGuess(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 48);
}

function normalizeClueText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeGamePlayer(player) {
  return {
    token: player.token,
    name: String(player.name || "Player").trim().slice(0, 24) || "Player",
    clues: [],
  };
}

function playerByToken(room, token) {
  return room.players.find((player) => player.token === token) || null;
}

function ensureRoomShape(room) {
  room.players ||= [];
  room.hostToken ||= room.players[0]?.token || null;
  room.status ||= "waiting";
  room.phase ||= room.status === "waiting" ? "waiting" : "writing_clues";
  room.round ||= 0;
  room.roundIndex ||= Math.max(0, room.round - 1);
  room.roundTotal ||= ROUND_COUNT;
  room.score ||= 0;
  room.activePlayerToken ||= null;
  room.activePlayerIndex ||= Math.max(
    0,
    room.players.findIndex((player) => player.token === room.activePlayerToken),
  );
  room.selectedNumber ||= null;
  room.card ||= null;
  room.word ||= null;
  room.deck ||= room.words ? room.words.map((word) => [word, word, word, word, word]) : [];
  room.lastGuess ||= null;
  room.history ||= [];
  room.players.forEach((player) => {
    const normalized = normalizeGamePlayer(player);
    player.token = normalized.token;
    player.name = normalized.name;
    if (player.clue && !player.clues) {
      player.clues = [player.clue];
    }
    player.clues = Array.isArray(player.clues) ? player.clues : [];
  });
}

function ensureHost(room, player) {
  if (player.token !== getHostToken(room)) {
    throw new Error("Only the host can do that.");
  }
}

function ensurePlaying(room) {
  if (room.status !== "playing") {
    throw new Error("The game is not active.");
  }
}

function ensurePhase(room, phase) {
  if (room.phase !== phase) {
    throw new Error(`This action is not available during ${room.phase}.`);
  }
}

function addHistory(room, entry) {
  room.history.push(entry);
  room.history = room.history.slice(0, 80);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createDeck() {
  const words = shuffle(WORDS);
  const deck = [];
  for (let index = 0; deck.length < ROUND_COUNT; index += 5) {
    deck.push(words.slice(index, index + 5));
  }
  return deck;
}
