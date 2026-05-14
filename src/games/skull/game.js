export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

const DISC_KINDS = ["flower", "flower", "flower", "skull"];

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    phase: "waiting",
    round: 0,
    firstPlayerToken: null,
    currentTurnToken: null,
    bid: null,
    passed: [],
    attempt: null,
    loss: null,
    winner: null,
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

  if (action.type === "play_disc") {
    ensurePlaying(room);
    ensureActivePlayer(player);
    const card = takeCard(player, action.cardId);

    if (room.phase === "placement") {
      if (player.stack.length) throw new Error("You have already placed a disc.");
      player.stack.push({ ...card, revealed: false });
      addHistory(room, `${player.name} placed a disc.`);

      if (activePlayers(room).every((item) => item.stack.length > 0)) {
        room.phase = "adding";
        room.currentTurnToken = room.firstPlayerToken;
        addHistory(room, "All opening discs are down.");
      }

      room.updatedAt = Date.now();
      return true;
    }

    ensurePhase(room, "adding");
    ensureCurrentTurn(room, player);
    player.stack.push({ ...card, revealed: false });
    addHistory(room, `${player.name} added a disc.`);
    room.currentTurnToken = nextActiveToken(room, player.token);
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "start_bid") {
    ensurePlaying(room);
    ensurePhase(room, "adding");
    ensureActivePlayer(player);
    ensureCurrentTurn(room, player);
    setBid(room, player, action.count);
    return true;
  }

  if (action.type === "raise_bid") {
    ensurePlaying(room);
    ensurePhase(room, "bidding");
    ensureActivePlayer(player);
    ensureCurrentTurn(room, player);
    setBid(room, player, action.count);
    return true;
  }

  if (action.type === "pass_bid") {
    ensurePlaying(room);
    ensurePhase(room, "bidding");
    ensureActivePlayer(player);
    ensureCurrentTurn(room, player);
    if (room.bid?.playerToken === player.token) {
      throw new Error("The high bidder cannot pass.");
    }
    if (!room.passed.includes(player.token)) room.passed.push(player.token);
    addHistory(room, `${player.name} passed.`);

    const nextToken = nextBidTurnToken(room, player.token);
    if (!nextToken) {
      beginAttempt(room);
    } else {
      room.currentTurnToken = nextToken;
      room.updatedAt = Date.now();
    }
    return true;
  }

  if (action.type === "reveal_disc") {
    ensurePlaying(room);
    ensurePhase(room, "revealing");
    ensureCurrentTurn(room, player);
    revealDisc(room, player, action.ownerToken);
    return true;
  }

  if (action.type === "choose_loss") {
    ensurePlaying(room);
    ensurePhase(room, "choosing_loss");
    ensureCurrentTurn(room, player);
    chooseLoss(room, player, action.optionId);
    return true;
  }

  if (action.type === "choose_starter") {
    ensurePlaying(room);
    ensurePhase(room, "choosing_starter");
    ensureCurrentTurn(room, player);

    const starter = playerByToken(room, action.playerToken);
    if (!starter || starter.eliminated) {
      throw new Error("Choose a player who is still in the game.");
    }
    addHistory(room, `${player.name} chose ${starter.name} to start the next round.`);
    startRound(room, starter.token);
    return true;
  }

  throw new Error("Unknown action.");
}

export function startGame(room) {
  ensureRoomShape(room);
  const players = room.players;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Skull needs ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  }

  players.forEach((player) => {
    Object.assign(player, normalizeGamePlayer(player), {
      wins: 0,
      eliminated: false,
      hand: createHand(player.token),
      stack: [],
    });
  });

  room.status = "playing";
  room.round = 0;
  room.winner = null;
  room.history = [];
  startRound(room, players[0].token);
}

export function resetGame(room) {
  ensureRoomShape(room);
  room.status = "waiting";
  room.phase = "waiting";
  room.round = 0;
  room.firstPlayerToken = null;
  room.currentTurnToken = null;
  room.bid = null;
  room.passed = [];
  room.attempt = null;
  room.loss = null;
  room.winner = null;
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

export function publicPlayer(player, activeTokens) {
  return {
    token: player.token,
    name: player.name,
    connected: activeTokens.has(player.token),
    wins: player.wins || 0,
    eliminated: Boolean(player.eliminated),
    handCount: player.hand?.length || 0,
    stackCount: player.stack?.length || 0,
  };
}

export function getHostToken(room) {
  return room.hostToken || room.players[0]?.token || null;
}

export function viewFor(room, playerToken, activeTokens) {
  ensureRoomShape(room);
  const you = room.players.find((player) => player.token === playerToken);
  const hostToken = getHostToken(room);
  const totalDiscs = totalStackedDiscs(room);
  const active = activePlayers(room);

  return {
    roomCode: room.roomCode,
    status: room.status,
    phase: room.phase,
    round: room.round,
    firstPlayerToken: room.firstPlayerToken,
    currentTurnToken: room.currentTurnToken,
    winner: room.winner ? publicWinner(room, room.winner) : null,
    isHost: Boolean(you && you.token === hostToken),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    totalDiscs,
    maxBid: totalDiscs,
    bid: room.bid
      ? {
          count: room.bid.count,
          playerToken: room.bid.playerToken,
          playerName: playerByToken(room, room.bid.playerToken)?.name || "Player",
        }
      : null,
    passed: [...room.passed],
    attempt: room.attempt
      ? {
          challengerToken: room.attempt.challengerToken,
          challengerName: playerByToken(room, room.attempt.challengerToken)?.name || "Player",
          bidCount: room.attempt.bidCount,
          revealedCount: room.attempt.revealedCount,
          remaining: Math.max(0, room.attempt.bidCount - room.attempt.revealedCount),
          failed: room.attempt.failed,
          skullOwnerToken: room.attempt.skullOwnerToken,
          skullOwnerName: room.attempt.skullOwnerToken
            ? playerByToken(room, room.attempt.skullOwnerToken)?.name || "Player"
            : null,
        }
      : null,
    loss: publicLoss(room, you),
    you: you ? publicPlayer(you, activeTokens) : null,
    hand: you?.hand?.map((card) => ({ id: card.id, kind: card.kind })) || [],
    players: room.players.map((player) => ({
      ...publicPlayer(player, activeTokens),
      isFirstPlayer: player.token === room.firstPlayerToken,
      isCurrentTurn: player.token === room.currentTurnToken,
      isBidder: player.token === room.bid?.playerToken,
      hasPassed: room.passed.includes(player.token),
      canStartRound: active.length > 0 && player.token === active[0].token,
      stack: (player.stack || []).map((card, index) => ({
        index,
        revealed: Boolean(card.revealed),
        kind: card.revealed ? card.kind : null,
      })),
    })),
    history: [...room.history],
  };
}

function setBid(room, player, value) {
  const count = Number.parseInt(value, 10);
  const totalDiscs = totalStackedDiscs(room);
  const previous = room.bid?.count || 0;
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Bid at least one disc.");
  }
  if (count <= previous) {
    throw new Error("Raise the current bid.");
  }
  if (count > totalDiscs) {
    throw new Error("Bid cannot exceed the discs on the table.");
  }

  room.phase = "bidding";
  room.bid = { playerToken: player.token, count };
  addHistory(room, `${player.name} bid ${count}.`);

  const nextToken = nextBidTurnToken(room, player.token);
  if (!nextToken) {
    beginAttempt(room);
  } else {
    room.currentTurnToken = nextToken;
    room.updatedAt = Date.now();
  }
}

function beginAttempt(room) {
  const challenger = playerByToken(room, room.bid?.playerToken);
  if (!challenger) throw new Error("Challenger is missing.");
  room.phase = "revealing";
  room.currentTurnToken = challenger.token;
  room.attempt = {
    challengerToken: challenger.token,
    bidCount: room.bid.count,
    revealedCount: 0,
    failed: false,
    skullOwnerToken: null,
  };
  addHistory(room, `${challenger.name} is the challenger.`);
  room.updatedAt = Date.now();
}

function revealDisc(room, challenger, ownerToken) {
  const attempt = room.attempt;
  const owner = playerByToken(room, ownerToken);
  if (!owner || owner.eliminated) throw new Error("That stack is not active.");
  if (attempt.challengerToken !== challenger.token) {
    throw new Error("Only the challenger reveals discs.");
  }
  if (attempt.revealedCount >= attempt.bidCount) {
    throw new Error("The challenge is complete.");
  }

  const ownUnrevealed = unrevealedCount(challenger);
  if (owner.token !== challenger.token && ownUnrevealed > 0) {
    throw new Error("The challenger must reveal their own stack first.");
  }

  const card = topUnrevealedCard(owner);
  if (!card) throw new Error("That stack has no hidden discs.");

  card.revealed = true;
  attempt.revealedCount += 1;
  addHistory(room, `${challenger.name} revealed ${owner.name}'s disc.`);

  if (card.kind === "skull") {
    failAttempt(room, challenger, owner);
    return;
  }

  if (attempt.revealedCount >= attempt.bidCount) {
    completeAttempt(room, challenger);
    return;
  }

  room.updatedAt = Date.now();
}

function failAttempt(room, challenger, skullOwner) {
  room.attempt.failed = true;
  room.attempt.skullOwnerToken = skullOwner.token;
  room.phase = "choosing_loss";
  room.currentTurnToken = skullOwner.token === challenger.token ? challenger.token : skullOwner.token;
  room.loss = {
    challengerToken: challenger.token,
    chooserToken: room.currentTurnToken,
    skullOwnerToken: skullOwner.token,
    options: shuffledCards(allCards(challenger)).map((card) => ({
      id: createLossOptionId(),
      cardId: card.id,
      kind: card.kind,
    })),
  };
  addHistory(room, `${challenger.name} revealed a skull.`);
  room.updatedAt = Date.now();
}

function completeAttempt(room, challenger) {
  challenger.wins += 1;
  addHistory(room, `${challenger.name} completed the challenge.`);
  if (challenger.wins >= 2) {
    finishGame(room, challenger);
    return;
  }
  startRound(room, challenger.token);
}

function chooseLoss(room, chooser, optionId) {
  const loss = room.loss;
  const challenger = playerByToken(room, loss?.challengerToken);
  if (!challenger) throw new Error("Challenger is missing.");

  const option = loss.options.find((item) => item.id === optionId);
  if (!option) throw new Error("Choose one of the available discs.");

  removeCard(challenger, option.cardId);
  returnStacksToHands(room);
  const remainingCards = allCards(challenger).length;
  addHistory(room, `${challenger.name} lost a disc.`);

  if (remainingCards === 0) {
    challenger.eliminated = true;
    addHistory(room, `${challenger.name} was eliminated.`);
  }

  room.loss = null;
  room.attempt = null;
  room.bid = null;
  room.passed = [];

  const remainingPlayers = activePlayers(room);
  if (remainingPlayers.length === 1) {
    finishGame(room, remainingPlayers[0]);
    return;
  }

  if (!challenger.eliminated) {
    startRound(room, challenger.token);
    return;
  }

  if (loss.skullOwnerToken === challenger.token) {
    room.phase = "choosing_starter";
    room.currentTurnToken = chooser.token;
    room.firstPlayerToken = null;
    addHistory(room, `${chooser.name} must choose the next first player.`);
    room.updatedAt = Date.now();
    return;
  }

  startRound(room, loss.skullOwnerToken);
}

function startRound(room, firstPlayerToken) {
  const first = playerByToken(room, firstPlayerToken);
  const fallback = activePlayers(room)[0];
  const starter = first && !first.eliminated ? first : fallback;
  if (!starter) return;

  returnStacksToHands(room);
  room.status = "playing";
  room.phase = "placement";
  room.round += 1;
  room.firstPlayerToken = starter.token;
  room.currentTurnToken = starter.token;
  room.bid = null;
  room.passed = [];
  room.attempt = null;
  room.loss = null;
  addHistory(room, `Round ${room.round} begins with ${starter.name}.`);
  room.updatedAt = Date.now();
}

function finishGame(room, winner) {
  returnStacksToHands(room);
  room.status = "finished";
  room.phase = "finished";
  room.winner = { token: winner.token, name: winner.name };
  room.currentTurnToken = null;
  room.bid = null;
  room.passed = [];
  room.attempt = null;
  room.loss = null;
  addHistory(room, `${winner.name} won the game.`);
  room.updatedAt = Date.now();
}

function returnStacksToHands(room) {
  room.players.forEach((player) => {
    if (player.eliminated) {
      player.stack = [];
      player.hand = [];
      return;
    }

    const returned = (player.stack || []).map((card) => ({
      id: card.id,
      kind: card.kind,
    }));
    player.hand = [...(player.hand || []), ...returned];
    player.stack = [];
  });
}

function takeCard(player, cardId) {
  const index = (player.hand || []).findIndex((card) => card.id === cardId);
  if (index < 0) throw new Error("That disc is not in your hand.");
  return player.hand.splice(index, 1)[0];
}

function removeCard(player, cardId) {
  const handIndex = (player.hand || []).findIndex((card) => card.id === cardId);
  if (handIndex >= 0) {
    player.hand.splice(handIndex, 1);
    return;
  }

  const stackIndex = (player.stack || []).findIndex((card) => card.id === cardId);
  if (stackIndex >= 0) {
    player.stack.splice(stackIndex, 1);
    return;
  }

  throw new Error("Disc could not be removed.");
}

function createHand(playerToken) {
  return DISC_KINDS.map((kind, index) => ({
    id: `${playerToken}-${kind}-${index}`,
    kind,
  }));
}

function normalizeGamePlayer(player) {
  return {
    token: player.token,
    name: player.name,
    wins: player.wins || 0,
    eliminated: Boolean(player.eliminated),
    hand: player.hand || [],
    stack: player.stack || [],
  };
}

function ensureRoomShape(room) {
  room.players ||= [];
  room.players.forEach((player) => {
    player.wins ||= 0;
    player.eliminated = Boolean(player.eliminated);
    player.hand ||= [];
    player.stack ||= [];
  });
  room.phase ||= room.status === "waiting" ? "waiting" : "placement";
  room.passed ||= [];
  room.history ||= [];
}

function ensurePlaying(room) {
  if (room.status !== "playing" || room.winner) {
    throw new Error("Game is not active.");
  }
}

function ensurePhase(room, phase) {
  if (room.phase !== phase) {
    throw new Error("That action is not available now.");
  }
}

function ensureHost(room, player) {
  if (player.token !== getHostToken(room)) {
    throw new Error("Only the host can control the game.");
  }
}

function ensureActivePlayer(player) {
  if (!player || player.eliminated) {
    throw new Error("You are not active in this game.");
  }
}

function ensureCurrentTurn(room, player) {
  if (room.currentTurnToken !== player.token) {
    throw new Error("It is not your turn.");
  }
}

function playerByToken(room, token) {
  return room.players.find((player) => player.token === token) || null;
}

function activePlayers(room) {
  return room.players.filter((player) => !player.eliminated);
}

function nextActiveToken(room, token) {
  return nextTokenFrom(activePlayers(room), token, () => true);
}

function nextBidTurnToken(room, token) {
  return nextTokenFrom(
    activePlayers(room),
    token,
    (player) => player.token !== room.bid?.playerToken && !room.passed.includes(player.token),
  );
}

function nextTokenFrom(players, token, predicate) {
  if (!players.length) return null;
  const startIndex = Math.max(0, players.findIndex((player) => player.token === token));
  for (let offset = 1; offset <= players.length; offset += 1) {
    const player = players[(startIndex + offset) % players.length];
    if (predicate(player)) return player.token;
  }
  return null;
}

function totalStackedDiscs(room) {
  return activePlayers(room).reduce((total, player) => total + (player.stack?.length || 0), 0);
}

function unrevealedCount(player) {
  return (player.stack || []).filter((card) => !card.revealed).length;
}

function topUnrevealedCard(player) {
  for (let index = player.stack.length - 1; index >= 0; index -= 1) {
    if (!player.stack[index].revealed) return player.stack[index];
  }
  return null;
}

function allCards(player) {
  return [
    ...(player.hand || []).map((card) => ({ id: card.id, kind: card.kind })),
    ...(player.stack || []).map((card) => ({ id: card.id, kind: card.kind })),
  ];
}

function shuffledCards(cards) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createLossOptionId() {
  return `loss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function addHistory(room, message) {
  room.history = [message, ...(room.history || [])].slice(0, 24);
}

function publicWinner(room, winner) {
  const player = playerByToken(room, winner.token);
  return {
    token: winner.token,
    name: player?.name || winner.name || "Player",
  };
}

function publicLoss(room, you) {
  if (!room.loss) return null;
  const challenger = playerByToken(room, room.loss.challengerToken);
  const chooser = playerByToken(room, room.loss.chooserToken);
  const canChoose = you?.token === room.loss.chooserToken;
  const canSeeKinds = canChoose && room.loss.chooserToken === room.loss.challengerToken;

  return {
    challengerToken: room.loss.challengerToken,
    challengerName: challenger?.name || "Player",
    chooserToken: room.loss.chooserToken,
    chooserName: chooser?.name || "Player",
    options: canChoose
      ? room.loss.options.map((option) => ({
          id: option.id,
          kind: canSeeKinds ? option.kind : null,
        }))
      : room.loss.options.map(() => ({ id: null, kind: null })),
  };
}
