export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

const INITIAL_KINDS = ["flower", "flower", "flower", "skull"];

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    phase: "waiting",
    winnerToken: null,
    order: [],
    roundNumber: 0,
    firstPlayerToken: null,
    turnToken: null,
    setupOrder: [],
    currentBid: null,
    challengerToken: null,
    flippedCount: 0,
    pendingLoss: null,
    pendingFirstChoice: null,
    log: ["Create a room and invite 3 to 6 players."],
    players: [createGamePlayer(player)],
  };
}

export function applyAction(room, player, action) {
  const gamePlayer = room.players.find((item) => item.token === player.token);
  if (!gamePlayer) throw new Error("Player not found.");

  if (action.type === "set_player") {
    const updated = normalizePlayer({
      playerToken: gamePlayer.token,
      name: action.name,
    });
    if (!updated) throw new Error("Player token is required.");
    gamePlayer.name = updated.name;
    touch(room);
    return true;
  }

  if (action.type === "start_game" || action.type === "reset_game") {
    ensureHost(room, gamePlayer);
    startGame(room);
    return true;
  }

  if (action.type === "place_disc") {
    placeDisc(room, gamePlayer, action.kind, action.source);
    return true;
  }

  if (action.type === "open_bid") {
    openBid(room, gamePlayer, action.amount);
    return true;
  }

  if (action.type === "outbid") {
    outbid(room, gamePlayer, action.amount);
    return true;
  }

  if (action.type === "pass") {
    passBid(room, gamePlayer);
    return true;
  }

  if (action.type === "flip_disc") {
    flipDisc(room, gamePlayer, action.playerToken);
    return true;
  }

  if (action.type === "choose_lost_disc") {
    chooseLostDisc(room, gamePlayer, action.slot);
    return true;
  }

  if (action.type === "choose_next_first") {
    chooseNextFirst(room, gamePlayer, action.playerToken);
    return true;
  }

  throw new Error("Unknown action.");
}

export function startGame(room) {
  const activePlayers = room.players.filter((player) => !player.eliminated);
  if (activePlayers.length < MIN_PLAYERS) {
    throw new Error("Skull needs at least 3 players.");
  }
  if (activePlayers.length > MAX_PLAYERS) {
    throw new Error("Skull supports up to 6 players.");
  }

  room.players.forEach((player) => {
    resetPlayerForGame(player);
  });
  room.order = room.players.map((player) => player.token);
  room.winnerToken = null;
  room.roundNumber = 0;
  room.firstPlayerToken = room.hostToken || room.order[0];
  room.log = ["Game started."];
  startRound(room, room.firstPlayerToken);
}

export function normalizePlayer(payload) {
  const token = String(payload.playerToken || payload.token || "").slice(0, 80);
  if (!token) return null;
  return {
    token,
    name: String(payload.name || "Player").trim().slice(0, 24) || "Player",
  };
}

export function upsertPlayer(room, player) {
  const existing = room.players.find((item) => item.token === player.token);
  if (existing) {
    existing.name = player.name;
    return;
  }

  if (room.players.length >= MAX_PLAYERS) {
    throw new Error("Room is full.");
  }
  if (room.status !== "waiting") {
    throw new Error("Game already started.");
  }

  room.players.push(createGamePlayer(player));
}

export function publicPlayer(player, activeTokens, options = {}) {
  const isSelf = options.viewerToken === player.token;
  return {
    token: player.token,
    name: player.name,
    connected: activeTokens.has(player.token),
    eliminated: player.eliminated,
    score: player.score,
    remainingCount: countBaseDiscs(player),
    handCount: player.hand.length,
    stackCount: player.stack.length,
    unrevealedStackCount: player.stack.filter((disc) => !disc.revealed).length,
    passed: player.passed,
    currentBid: player.currentBid,
    hasLastChance: player.lastChanceActive,
    usedLastChance: player.hasUsedLastChance,
    stack: player.stack.map((disc) => ({
      revealed: disc.revealed,
      kind: disc.revealed || isSelf ? disc.kind : null,
      source: disc.revealed || isSelf ? disc.source : null,
    })),
  };
}

export function getHostToken(room) {
  return room.hostToken || room.players[0]?.token || null;
}

export function viewFor(room, playerToken, activeTokens = new Set()) {
  const you = room.players.find((player) => player.token === playerToken);
  return {
    roomCode: room.roomCode,
    status: room.status,
    phase: room.phase,
    roundNumber: room.roundNumber,
    firstPlayerToken: room.firstPlayerToken,
    turnToken: room.turnToken,
    currentBid: room.currentBid,
    challengerToken: room.challengerToken,
    flippedCount: room.flippedCount,
    winnerToken: room.winnerToken,
    isHost: Boolean(you && you.token === getHostToken(room)),
    log: room.log.slice(-80),
    players: room.players.map((player) =>
      publicPlayer(player, activeTokens, { viewerToken: playerToken }),
    ),
    you: you ? privatePlayerView(room, you) : null,
  };
}

export function activePlayers(room) {
  return room.order
    .map((token) => room.players.find((player) => player.token === token))
    .filter((player) => player && !player.eliminated && countBaseDiscs(player) > 0);
}

function createGamePlayer(player) {
  const gamePlayer = {
    token: player.token,
    name: player.name,
    hand: [],
    stack: [],
    score: 0,
    eliminated: false,
    passed: false,
    currentBid: null,
    hasUsedLastChance: false,
    lastChanceActive: false,
    lastChanceRound: null,
  };
  resetPlayerForGame(gamePlayer);
  return gamePlayer;
}

function resetPlayerForGame(player) {
  player.hand = INITIAL_KINDS.map((kind) => createDisc(kind, "base"));
  player.stack = [];
  player.score = 0;
  player.eliminated = false;
  player.passed = false;
  player.currentBid = null;
  player.hasUsedLastChance = false;
  player.lastChanceActive = false;
  player.lastChanceRound = null;
}

function startRound(room, requestedFirstToken) {
  clearRoundDiscs(room);
  const players = activePlayers(room);
  if (players.length <= 1) {
    finishWithWinner(room, players[0]?.token || null);
    return;
  }

  const first = players.some((player) => player.token === requestedFirstToken)
    ? requestedFirstToken
    : players[0].token;
  room.roundNumber += 1;
  room.status = "playing";
  room.phase = "setup";
  room.firstPlayerToken = first;
  room.turnToken = null;
  room.currentBid = null;
  room.challengerToken = null;
  room.flippedCount = 0;
  room.pendingLoss = null;
  room.pendingFirstChoice = null;
  room.players.forEach((player) => {
    player.passed = false;
    player.currentBid = null;
  });

  const order = rotateTokens(
    players.map((player) => player.token),
    first,
  );
  room.setupOrder = [...order.slice(1), first];
  room.turnToken = room.setupOrder[0] || first;
  addLog(room, `Round ${room.roundNumber}. ${playerName(room, first)} chooses last.`);
  touch(room);
}

function clearRoundDiscs(room) {
  room.players.forEach((player) => {
    const returning = player.stack
      .filter((disc) => disc.source === "base")
      .map((disc) => ({ ...disc, revealed: false }));
    player.hand.push(...returning);
    player.stack = [];
    if (player.lastChanceActive && player.lastChanceRound <= room.roundNumber) {
      player.hand = player.hand.filter((disc) => disc.source !== "lastChance");
      player.lastChanceActive = false;
      player.lastChanceRound = null;
    }
  });
}

function placeDisc(room, player, kind, source) {
  ensurePlaying(room);
  ensurePhase(room, ["setup", "placing"]);
  ensureTurn(room, player);
  if (player.eliminated) throw new Error("Eliminated players cannot place discs.");

  const normalizedKind = kind === "skull" ? "skull" : "flower";
  const normalizedSource = source === "lastChance" ? "lastChance" : "base";
  const discIndex = player.hand.findIndex(
    (disc) => disc.kind === normalizedKind && disc.source === normalizedSource,
  );
  if (discIndex < 0) throw new Error("That disc is not available.");

  const [disc] = player.hand.splice(discIndex, 1);
  disc.revealed = false;
  player.stack.push(disc);
  addLog(room, `${player.name} placed a disc.`);

  if (room.phase === "setup") {
    room.setupOrder = room.setupOrder.filter((token) => token !== player.token);
    if (room.setupOrder.length) {
      room.turnToken = room.setupOrder[0];
    } else {
      room.phase = "placing";
      room.turnToken = room.firstPlayerToken;
      addLog(room, `${playerName(room, room.firstPlayerToken)} starts the turn.`);
    }
  } else {
    room.turnToken = nextActiveToken(room, player.token);
  }
  touch(room);
}

function openBid(room, player, amount) {
  ensurePlaying(room);
  ensurePhase(room, ["placing"]);
  ensureTurn(room, player);

  const bidAmount = normalizeBid(amount);
  const total = totalStackCount(room);
  if (bidAmount < 1 || bidAmount > total) {
    throw new Error(`Bid must be between 1 and ${total}.`);
  }

  room.phase = "bidding";
  room.currentBid = bidAmount;
  room.challengerToken = player.token;
  room.flippedCount = 0;
  room.players.forEach((item) => {
    item.passed = item.eliminated;
    item.currentBid = item.token === player.token ? bidAmount : null;
  });
  addLog(room, `${player.name} bids ${bidAmount}.`);
  if (bidAmount === total) {
    beginChallenge(room);
  } else {
    room.turnToken = nextBidderToken(room, player.token);
  }
  touch(room);
}

function outbid(room, player, amount) {
  ensurePlaying(room);
  ensurePhase(room, ["bidding"]);
  ensureTurn(room, player);
  if (player.passed) throw new Error("Passed players cannot bid.");

  const bidAmount = normalizeBid(amount);
  const total = totalStackCount(room);
  if (bidAmount <= room.currentBid || bidAmount > total) {
    throw new Error(`Bid must be greater than ${room.currentBid} and at most ${total}.`);
  }

  room.currentBid = bidAmount;
  room.challengerToken = player.token;
  room.players.forEach((item) => {
    item.currentBid = item.token === player.token ? bidAmount : null;
  });
  addLog(room, `${player.name} bids ${bidAmount}.`);
  if (bidAmount === total) {
    beginChallenge(room);
  } else {
    room.turnToken = nextBidderToken(room, player.token);
  }
  touch(room);
}

function passBid(room, player) {
  ensurePlaying(room);
  ensurePhase(room, ["bidding"]);
  ensureTurn(room, player);
  if (player.token === room.challengerToken) {
    throw new Error("The current high bidder cannot pass.");
  }

  player.passed = true;
  addLog(room, `${player.name} passes.`);
  const contenders = activePlayers(room).filter((item) => !item.passed);
  if (contenders.length === 1) {
    room.challengerToken = contenders[0].token;
    beginChallenge(room);
  } else {
    room.turnToken = nextBidderToken(room, player.token);
  }
  touch(room);
}

function beginChallenge(room) {
  room.phase = "challenge";
  room.turnToken = room.challengerToken;
  room.flippedCount = 0;
  addLog(room, `${playerName(room, room.challengerToken)} must flip ${room.currentBid}.`);
}

function flipDisc(room, player, targetToken) {
  ensurePlaying(room);
  ensurePhase(room, ["challenge"]);
  if (player.token !== room.challengerToken) {
    throw new Error("Only the challenger can flip discs.");
  }

  const target = room.players.find((item) => item.token === targetToken);
  if (!target || target.eliminated) throw new Error("Target player is not active.");
  const ownUnrevealed = player.stack.filter((disc) => !disc.revealed).length;
  if (ownUnrevealed > 0 && target.token !== player.token) {
    throw new Error("Flip your own stack before choosing other players.");
  }

  const disc = topUnrevealedDisc(target);
  if (!disc) throw new Error("That player has no hidden discs to flip.");

  disc.revealed = true;
  room.flippedCount += 1;
  addLog(room, `${player.name} flipped ${target.name}'s ${disc.kind}.`);

  if (disc.kind === "skull") {
    failChallenge(room, player, target);
    touch(room);
    return;
  }

  if (room.flippedCount >= room.currentBid) {
    succeedChallenge(room, player);
    touch(room);
    return;
  }

  touch(room);
}

function succeedChallenge(room, challenger) {
  challenger.score += 1;
  addLog(room, `${challenger.name} succeeds.`);
  if (challenger.score >= 2) {
    finishWithWinner(room, challenger.token);
    return;
  }
  startRound(room, challenger.token);
}

function failChallenge(room, challenger, skullOwner) {
  addLog(room, `${challenger.name} hit a skull.`);

  if (challenger.lastChanceActive) {
    removeAllDiscs(challenger, "lastChance");
    removeAllDiscs(challenger, "base");
    challenger.eliminated = true;
    addLog(room, `${challenger.name} is eliminated.`);
    advanceAfterFailure(room, challenger, skullOwner);
    return;
  }

  const pool = shuffledLossPool(challenger);
  if (!pool.length) {
    challenger.eliminated = true;
    addLog(room, `${challenger.name} is eliminated.`);
    advanceAfterFailure(room, challenger, skullOwner);
    return;
  }

  room.phase = "loss_selection";
  room.turnToken = skullOwner.token === challenger.token ? challenger.token : skullOwner.token;
  room.pendingLoss = {
    challengerToken: challenger.token,
    skullOwnerToken: skullOwner.token,
    chooserToken: room.turnToken,
    pool,
  };
  addLog(
    room,
    skullOwner.token === challenger.token
      ? `${challenger.name} chooses a disc to lose.`
      : `${skullOwner.name} chooses one of ${challenger.name}'s discs.`,
  );
}

function chooseLostDisc(room, player, slot) {
  ensurePlaying(room);
  ensurePhase(room, ["loss_selection"]);
  if (room.pendingLoss?.chooserToken !== player.token) {
    throw new Error("It is not your loss selection.");
  }

  const index = Number.parseInt(slot, 10);
  const discId = room.pendingLoss.pool[index];
  if (!discId) throw new Error("Invalid disc choice.");

  const challenger = room.players.find((item) => item.token === room.pendingLoss.challengerToken);
  const skullOwner = room.players.find((item) => item.token === room.pendingLoss.skullOwnerToken);
  const removed = removeDiscById(challenger, discId);
  addLog(room, `${challenger.name} lost a ${removed?.kind || "disc"}.`);

  if (countBaseDiscs(challenger) === 1 && !challenger.hasUsedLastChance) {
    challenger.hand.push(createDisc("flower", "lastChance"));
    challenger.lastChanceActive = true;
    challenger.lastChanceRound = room.roundNumber + 1;
    challenger.hasUsedLastChance = true;
    addLog(room, `${challenger.name} gets a Last Chance flower for next round.`);
  }

  if (countBaseDiscs(challenger) === 0) {
    challenger.eliminated = true;
    addLog(room, `${challenger.name} is eliminated.`);
  }

  room.pendingLoss = null;
  advanceAfterFailure(room, challenger, skullOwner);
  touch(room);
}

function advanceAfterFailure(room, challenger, skullOwner) {
  const players = activePlayers(room);
  if (players.length <= 1) {
    finishWithWinner(room, players[0]?.token || null);
    return;
  }

  if (!challenger.eliminated) {
    startRound(room, challenger.token);
    return;
  }

  if (skullOwner.token !== challenger.token && !skullOwner.eliminated) {
    startRound(room, skullOwner.token);
    return;
  }

  room.phase = "choose_next_first";
  room.pendingFirstChoice = { chooserToken: challenger.token };
  room.turnToken = challenger.token;
  addLog(room, `${challenger.name} chooses the next first player.`);
  touch(room);
}

function chooseNextFirst(room, player, targetToken) {
  ensurePlaying(room);
  ensurePhase(room, ["choose_next_first"]);
  if (room.pendingFirstChoice?.chooserToken !== player.token) {
    throw new Error("It is not your choice.");
  }
  const target = room.players.find((item) => item.token === targetToken);
  if (!target || target.eliminated || countBaseDiscs(target) === 0) {
    throw new Error("Choose an active player.");
  }
  room.pendingFirstChoice = null;
  startRound(room, target.token);
}

function privatePlayerView(room, player) {
  const hand = player.hand.map((disc) => ({
    id: disc.id,
    kind: disc.kind,
    source: disc.source,
  }));
  const pendingLoss = room.pendingLoss;
  const lossChoices =
    pendingLoss?.chooserToken === player.token
      ? pendingLoss.pool.map((discId, index) => {
          const challenger = room.players.find(
            (item) => item.token === pendingLoss.challengerToken,
          );
          const disc =
            pendingLoss.challengerToken === player.token ? findDiscById(challenger, discId) : null;
          return {
            slot: index,
            kind: disc?.kind || null,
            source: disc?.source || null,
          };
        })
      : [];

  return {
    token: player.token,
    name: player.name,
    eliminated: player.eliminated,
    score: player.score,
    hand,
    handCounts: countHand(player),
    stack: player.stack.map((disc) => ({
      kind: disc.kind,
      source: disc.source,
      revealed: disc.revealed,
    })),
    allowedActions: allowedActions(room, player),
    lossChoices,
  };
}

function allowedActions(room, player) {
  const actions = [];
  if (room.status === "waiting") {
    if (player.token === getHostToken(room)) actions.push("start_game");
    return actions;
  }
  if (room.winnerToken) return actions;

  if ((room.phase === "setup" || room.phase === "placing") && room.turnToken === player.token) {
    if (player.hand.length) actions.push("place_disc");
    if (room.phase === "placing" && totalStackCount(room) > 0) actions.push("open_bid");
  }
  if (room.phase === "bidding" && room.turnToken === player.token) {
    actions.push("outbid", "pass");
  }
  if (room.phase === "challenge" && room.challengerToken === player.token) {
    actions.push("flip_disc");
  }
  if (room.phase === "loss_selection" && room.pendingLoss?.chooserToken === player.token) {
    actions.push("choose_lost_disc");
  }
  if (room.phase === "choose_next_first" && room.pendingFirstChoice?.chooserToken === player.token) {
    actions.push("choose_next_first");
  }
  if (player.token === getHostToken(room)) actions.push("reset_game");
  return actions;
}

function normalizeBid(amount) {
  const value = Number.parseInt(amount, 10);
  return Number.isFinite(value) ? value : 0;
}

function totalStackCount(room) {
  return activePlayers(room).reduce((total, player) => total + player.stack.length, 0);
}

function countBaseDiscs(player) {
  return [...player.hand, ...player.stack].filter((disc) => disc.source === "base").length;
}

function countHand(player) {
  return player.hand.reduce(
    (counts, disc) => {
      const key = disc.source === "lastChance" ? "lastChance" : disc.kind;
      counts[key] += 1;
      return counts;
    },
    { flower: 0, skull: 0, lastChance: 0 },
  );
}

function createDisc(kind, source) {
  return {
    id:
      crypto.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    kind,
    source,
    revealed: false,
  };
}

function topUnrevealedDisc(player) {
  for (let index = player.stack.length - 1; index >= 0; index -= 1) {
    if (!player.stack[index].revealed) return player.stack[index];
  }
  return null;
}

function shuffledLossPool(player) {
  return shuffle([...player.hand, ...player.stack].filter((disc) => disc.source === "base").map((disc) => disc.id));
}

function removeDiscById(player, discId) {
  for (const collection of [player.hand, player.stack]) {
    const index = collection.findIndex((disc) => disc.id === discId);
    if (index >= 0) {
      const [disc] = collection.splice(index, 1);
      return disc;
    }
  }
  return null;
}

function removeAllDiscs(player, source) {
  player.hand = player.hand.filter((disc) => disc.source !== source);
  player.stack = player.stack.filter((disc) => disc.source !== source);
}

function findDiscById(player, discId) {
  return [...player.hand, ...player.stack].find((disc) => disc.id === discId) || null;
}

function rotateTokens(tokens, firstToken) {
  const index = tokens.indexOf(firstToken);
  if (index < 0) return tokens;
  return [...tokens.slice(index), ...tokens.slice(0, index)];
}

function nextActiveToken(room, fromToken) {
  const tokens = activePlayers(room).map((player) => player.token);
  const index = tokens.indexOf(fromToken);
  return tokens[(index + 1) % tokens.length];
}

function nextBidderToken(room, fromToken) {
  const tokens = activePlayers(room).filter((player) => !player.passed).map((player) => player.token);
  let token = fromToken;
  for (let attempts = 0; attempts < room.players.length + 1; attempts += 1) {
    token = nextActiveToken(room, token);
    const candidate = room.players.find((player) => player.token === token);
    if (candidate && tokens.includes(token) && token !== room.challengerToken) {
      return token;
    }
  }
  return room.challengerToken;
}

function finishWithWinner(room, winnerToken) {
  room.status = "finished";
  room.phase = "finished";
  room.winnerToken = winnerToken;
  room.turnToken = null;
  room.currentBid = null;
  room.challengerToken = null;
  if (winnerToken) addLog(room, `${playerName(room, winnerToken)} wins.`);
  touch(room);
}

function playerName(room, token) {
  return room.players.find((player) => player.token === token)?.name || "Player";
}

function ensurePlaying(room) {
  if (room.status !== "playing" || room.winnerToken) {
    throw new Error("Game is not active.");
  }
}

function ensurePhase(room, phases) {
  if (!phases.includes(room.phase)) {
    throw new Error("That action is not available now.");
  }
}

function ensureTurn(room, player) {
  if (room.turnToken !== player.token) {
    throw new Error("It is not your turn.");
  }
}

function ensureHost(room, player) {
  if (player.token !== getHostToken(room)) {
    throw new Error("Only the host can start a new game.");
  }
}

function addLog(room, message) {
  if (!message || room.log.at(-1) === message) return;
  room.log.push(message);
  if (room.log.length > 120) {
    room.log.splice(0, room.log.length - 120);
  }
}

function touch(room) {
  room.updatedAt = Date.now();
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
