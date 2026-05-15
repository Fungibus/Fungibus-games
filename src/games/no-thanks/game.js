export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;
export const LOW_CARD = 3;
export const HIGH_CARD = 35;
export const REMOVED_CARD_COUNT = 9;

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    currentTurnToken: null,
    currentCard: null,
    cardCounters: 0,
    deck: [],
    removedCount: 0,
    winners: [],
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
      throw new Error("Reset the table before starting again.");
    }
    startGame(room);
    return true;
  }

  if (action.type === "reset_game") {
    ensureHost(room, player);
    resetGame(room);
    return true;
  }

  if (action.type === "pass_card") {
    ensurePlaying(room);
    ensureCurrentTurn(room, player);
    if (player.counters <= 0) {
      throw new Error("You have no counters and must take the card.");
    }

    player.counters -= 1;
    room.cardCounters += 1;
    addHistory(room, `${player.name} said no thanks.`);
    room.currentTurnToken = nextPlayerToken(room, player.token);
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "take_card") {
    ensurePlaying(room);
    ensureCurrentTurn(room, player);
    takeCurrentCard(room, player);
    return true;
  }

  throw new Error("Unknown action.");
}

export function startGame(room) {
  ensureRoomShape(room);
  const players = room.players;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`No Thanks! needs ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  }

  const counters = startingCounters(players.length);
  players.forEach((player) => {
    Object.assign(player, normalizeGamePlayer(player), {
      counters,
      cards: [],
    });
  });

  const shuffled = shuffle(numberRange(LOW_CARD, HIGH_CARD));
  room.deck = shuffled.slice(REMOVED_CARD_COUNT);
  room.removedCount = REMOVED_CARD_COUNT;
  room.status = "playing";
  room.currentTurnToken = getHostToken(room);
  room.currentCard = null;
  room.cardCounters = 0;
  room.winners = [];
  room.history = [];
  revealNextCard(room);
}

export function resetGame(room) {
  ensureRoomShape(room);
  room.status = "waiting";
  room.currentTurnToken = null;
  room.currentCard = null;
  room.cardCounters = 0;
  room.deck = [];
  room.removedCount = 0;
  room.winners = [];
  room.history = [];
  room.players = room.players.map((player) => normalizeGamePlayer(player));
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

export function publicPlayer(player, activeTokens, options = {}) {
  const finished = options.finished || false;
  const score = scorePlayer(player);

  return {
    token: player.token,
    name: player.name,
    connected: activeTokens.has(player.token),
    cards: [...player.cards].sort((a, b) => a - b),
    runs: cardRuns(player.cards),
    cardScore: score.cardScore,
    finalScore: finished ? score.finalScore : null,
    counters: player.counters,
    counterCountHidden: false,
  };
}

export function getHostToken(room) {
  return room.hostToken || room.players[0]?.token || null;
}

export function viewFor(room, playerToken, activeTokens) {
  ensureRoomShape(room);
  const you = room.players.find((player) => player.token === playerToken);
  const hostToken = getHostToken(room);
  const finished = room.status === "finished";

  return {
    roomCode: room.roomCode,
    status: room.status,
    currentTurnToken: room.currentTurnToken,
    currentCard: room.currentCard,
    cardCounters: room.cardCounters,
    deckCount: room.deck.length,
    removedCount: room.removedCount,
    isHost: Boolean(you && you.token === hostToken),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    winners: room.winners.map((winner) => ({
      token: winner.token,
      name: winner.name,
      finalScore: winner.finalScore,
    })),
    you: you ? publicPlayer(you, activeTokens, { viewerToken: playerToken, finished }) : null,
    players: room.players.map((player) => ({
      ...publicPlayer(player, activeTokens, { viewerToken: playerToken, finished }),
      isCurrentTurn: player.token === room.currentTurnToken,
      isWinner: room.winners.some((winner) => winner.token === player.token),
    })),
    history: [...room.history],
  };
}

export function startingCounters(playerCount) {
  if (playerCount >= 3 && playerCount <= 5) return 11;
  if (playerCount === 6) return 9;
  if (playerCount === 7) return 7;
  throw new Error(`No Thanks! needs ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
}

export function scorePlayer(player) {
  const cardScore = cardRuns(player.cards).reduce((total, run) => total + run[0], 0);
  return {
    cardScore,
    finalScore: cardScore - player.counters,
  };
}

export function cardRuns(cards) {
  const sorted = [...new Set(cards)].sort((a, b) => a - b);
  const runs = [];

  for (const card of sorted) {
    const lastRun = runs.at(-1);
    if (lastRun && lastRun.at(-1) === card - 1) {
      lastRun.push(card);
    } else {
      runs.push([card]);
    }
  }

  return runs;
}

function takeCurrentCard(room, player) {
  const card = room.currentCard;
  if (!Number.isInteger(card)) {
    throw new Error("There is no card to take.");
  }

  player.cards.push(card);
  player.cards.sort((a, b) => a - b);
  player.counters += room.cardCounters;
  addHistory(
    room,
    `${player.name} took ${card}${room.cardCounters ? ` with ${room.cardCounters} counters` : ""}.`,
  );

  room.currentCard = null;
  room.cardCounters = 0;

  if (!room.deck.length) {
    finishGame(room);
    return;
  }

  revealNextCard(room);
  room.currentTurnToken = player.token;
  room.updatedAt = Date.now();
}

function revealNextCard(room) {
  room.currentCard = room.deck.shift();
  room.cardCounters = 0;
  addHistory(room, `${room.currentCard} was revealed.`);
  room.updatedAt = Date.now();
}

function finishGame(room) {
  const scored = room.players
    .map((player) => ({
      token: player.token,
      name: player.name,
      ...scorePlayer(player),
    }))
    .sort((a, b) => a.finalScore - b.finalScore || a.name.localeCompare(b.name));
  const bestScore = scored[0]?.finalScore;

  room.status = "finished";
  room.currentTurnToken = null;
  room.currentCard = null;
  room.cardCounters = 0;
  room.winners = scored.filter((player) => player.finalScore === bestScore);
  addHistory(
    room,
    room.winners.length === 1
      ? `${room.winners[0].name} won with ${bestScore}.`
      : `${room.winners.map((winner) => winner.name).join(", ")} tied with ${bestScore}.`,
  );
  room.updatedAt = Date.now();
}

function normalizeGamePlayer(player) {
  return {
    token: player.token,
    name: player.name,
    counters: Number.isInteger(player.counters) ? player.counters : 0,
    cards: Array.isArray(player.cards) ? [...player.cards] : [],
  };
}

function ensureRoomShape(room) {
  room.players ||= [];
  room.players.forEach((player) => {
    player.counters = Number.isInteger(player.counters) ? player.counters : 0;
    player.cards = Array.isArray(player.cards) ? player.cards : [];
  });
  room.currentTurnToken ||= null;
  room.currentCard = Number.isInteger(room.currentCard) ? room.currentCard : null;
  room.cardCounters = Number.isInteger(room.cardCounters) ? room.cardCounters : 0;
  room.deck = Array.isArray(room.deck) ? room.deck : [];
  room.removedCount = Number.isInteger(room.removedCount) ? room.removedCount : 0;
  room.winners = Array.isArray(room.winners) ? room.winners : [];
  room.history ||= [];
}

function ensurePlaying(room) {
  if (room.status !== "playing" || room.winners.length) {
    throw new Error("Game is not active.");
  }
}

function ensureHost(room, player) {
  if (player.token !== getHostToken(room)) {
    throw new Error("Only the host can control the game.");
  }
}

function ensureCurrentTurn(room, player) {
  if (room.currentTurnToken !== player.token) {
    throw new Error("It is not your turn.");
  }
}

function nextPlayerToken(room, token) {
  const players = room.players;
  if (!players.length) return null;
  const startIndex = Math.max(0, players.findIndex((player) => player.token === token));
  return players[(startIndex + 1) % players.length].token;
}

function addHistory(room, entry) {
  room.history.unshift(entry);
  room.history = room.history.slice(0, 40);
}

function numberRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}
