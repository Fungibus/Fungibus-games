export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const TRACK_LENGTH = 30;
export const RACE_COUNT = 4;
export const GOLD_POINTS = [3, 4, 5, 6];
export const SILVER_POINTS = [1, 2, 3, 4];

export const RACERS = [
  ["alchemist", "Alchemist", "On a 1 or 2, may move 4 instead."],
  ["blimp", "Blimp", "Fast before the second corner, slower after it."],
  ["coach", "Coach", "Racers sharing Coach's space get +1 to main moves."],
  ["baba-yaga", "Baba Yaga", "Trips racers who stop on her space or when she stops on theirs."],
  ["centaur", "Centaur", "Kicks every racer it passes 2 spaces backward."],
  ["copy-cat", "Copy Cat", "Copies the current lead racer's active power."],
  ["banana", "Banana", "Trips racers that pass Banana."],
  ["cheerleader", "Cheerleader", "May move the last-place racer(s), then move herself."],
  ["dicemonger", "Dicemonger", "Lets racers reroll once; moves when someone else rerolls."],
  ["duelist", "Duelist", "Duels a racer on the same space; winner moves 2."],
  ["genius", "Genius", "May predict a main-move roll to take another turn."],
  ["heckler", "Heckler", "Moves when a racer barely gets anywhere on their turn."],
  ["egg", "Egg", "Before racing, draws 3 racers and copies one power."],
  ["gunk", "Gunk", "Other racers get -1 to main move distance."],
  ["huge-baby", "Huge Baby", "No one else may stay on Huge Baby's space except Start."],
  ["flip-flop", "Flip Flop", "May swap spaces with another racer instead of rolling."],
  ["hare", "Hare", "Gets +2, but skips and scores when alone in the lead."],
  ["hypnotist", "Hypnotist", "May warp another racer onto Hypnotist's space."],
  ["leaptoad", "Leaptoad", "Skips occupied spaces while moving."],
  ["legs", "Legs", "May skip rolling and move 5."],
  ["lackey", "Lackey", "Moves 2 before another racer's main-move 6 resolves."],
  ["inchworm", "Inchworm", "Cancels another racer's main-move 1 and moves 1."],
  ["loveable-loser", "Loveable Loser", "Scores 1 point before moving if alone in last place."],
  ["mastermind", "Mastermind", "Predicts the winner; if correct, ends the race in 2nd."],
  ["magician", "Magician", "May reroll a main move up to two times."],
  ["mouth", "M.O.U.T.H.", "Eliminates the only other racer on its space."],
  ["party-animal", "Party Animal", "Pulls everyone 1 space toward it and gets a move bonus."],
  ["twin", "Twin", "May copy a previous race winner's power."],
  ["sisyphus", "Sisyphus", "Starts with 4 points; a 6 sends Sisyphus back to Start."],
  ["stickler", "Stickler", "Other racers must cross the finish by exact count."],
  ["rocket-scientist", "Rocket Scientist", "May double the roll, then trips."],
  ["romantic", "Romantic", "Moves when exactly two racers share a space."],
  ["scoocher", "Scoocher", "Moves 1 whenever another racer's power happens."],
  ["suckerfish", "Suckerfish", "May follow a racer who leaves its space."],
  ["skipper", "Skipper", "Takes the next turn after anyone rolls a 1."],
  ["third-wheel", "Third Wheel", "May warp to a space with exactly two racers."],
].map(([id, name, summary]) => ({ id, name, summary }));

export const RACER_BY_ID = Object.fromEntries(RACERS.map((racer) => [racer.id, racer]));

export const WILD_SPACES = {
  4: { type: "star", points: 1 },
  8: { type: "arrow", amount: 3 },
  11: { type: "trip" },
  14: { type: "arrow", amount: -4 },
  18: { type: "star", points: 1 },
  22: { type: "arrow", amount: 2 },
  25: { type: "trip" },
  27: { type: "arrow", amount: -3 },
};

export function createWaitingRoom(roomCode, player) {
  return {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostToken: player.token,
    status: "waiting",
    phase: "waiting",
    raceNumber: 0,
    track: "mild",
    doubleRacerVariant: false,
    racersPerRace: 1,
    teamSize: 4,
    deck: [],
    discardedRacers: [],
    draft: null,
    currentTurnToken: null,
    currentTurnRacerId: null,
    turnRacersDone: [],
    nextTurnTokenOverride: null,
    nextRaceFirstToken: null,
    race: null,
    winners: [],
    history: [],
    players: [normalizeGamePlayer(player)],
  };
}

export function applyAction(room, player, action) {
  ensureRoomShape(room);

  if (action.type === "set_player") {
    const updated = normalizePlayer({ playerToken: player.token, name: action.name });
    if (!updated) throw new Error("Player token is required.");
    player.name = updated.name;
    room.updatedAt = Date.now();
    return true;
  }

  if (action.type === "start_game") {
    ensureHost(room, player);
    if (room.status !== "waiting") throw new Error("Reset the table before starting again.");
    startGame(room, { doubleRacerVariant: Boolean(action.doubleRacerVariant) });
    return true;
  }

  if (action.type === "reset_game") {
    ensureHost(room, player);
    resetGame(room);
    return true;
  }

  if (action.type === "draft_racer") {
    ensurePhase(room, "drafting");
    ensureCurrentTurn(room, player);
    draftRacer(room, player, String(action.racerId || ""));
    return true;
  }

  if (action.type === "select_racers") {
    ensurePhase(room, "selecting");
    selectRacers(room, player, Array.isArray(action.racerIds) ? action.racerIds : []);
    return true;
  }

  if (action.type === "choose_egg_power") {
    ensurePhase(room, "before_race");
    chooseEggPower(room, player, action.racerId, action.copyRacerId);
    return true;
  }

  if (action.type === "choose_twin_power") {
    ensurePhase(room, "before_race");
    chooseTwinPower(room, player, action.racerId, action.copyRacerId);
    return true;
  }

  if (action.type === "take_turn") {
    ensurePhase(room, "racing");
    takeTurn(room, player, action);
    return true;
  }

  if (action.type === "continue") {
    if (room.phase === "between_race") {
      ensureHost(room, player);
      beginSelection(room);
      return true;
    }
    throw new Error("Nothing is ready to continue.");
  }

  throw new Error("Unknown action.");
}

export function startGame(room, options = {}) {
  ensureRoomShape(room);
  const players = room.players;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Magical Athlete needs ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  }

  const doubleRacerVariant = players.length === 2 || (players.length === 3 && options.doubleRacerVariant);
  room.doubleRacerVariant = doubleRacerVariant;
  room.racersPerRace = doubleRacerVariant ? 2 : 1;
  room.teamSize = doubleRacerVariant ? 8 : 4;
  room.status = "playing";
  room.phase = "drafting";
  room.raceNumber = 0;
  room.track = "mild";
  room.currentTurnToken = null;
  room.currentTurnRacerId = null;
  room.turnRacersDone = [];
  room.nextTurnTokenOverride = null;
  room.nextRaceFirstToken = null;
  room.race = null;
  room.winners = [];
  room.history = [];
  room.discardedRacers = [];
  room.deck = shuffle(RACERS.map((racer) => racer.id));

  players.forEach((item) => {
    Object.assign(item, normalizeGamePlayer(item), {
      team: [],
      usedRacers: [],
      selectedRacers: [],
      score: 0,
      chips: [],
    });
  });

  const rollOff = rollOffOrder(room, players.map((item) => item.token));
  addHistory(room, `Draft order starts with ${playerByToken(room, rollOff[0]).name}.`);
  setupDraftBatch(room, rollOff, 0);
}

export function resetGame(room) {
  ensureRoomShape(room);
  room.status = "waiting";
  room.phase = "waiting";
  room.raceNumber = 0;
  room.track = "mild";
  room.doubleRacerVariant = false;
  room.racersPerRace = 1;
  room.teamSize = 4;
  room.deck = [];
  room.discardedRacers = [];
  room.draft = null;
  room.currentTurnToken = null;
  room.currentTurnRacerId = null;
  room.turnRacersDone = [];
  room.nextTurnTokenOverride = null;
  room.nextRaceFirstToken = null;
  room.race = null;
  room.winners = [];
  room.history = [];
  room.players = room.players.map((item) => normalizeGamePlayer(item));
  room.updatedAt = Date.now();
}

export function upsertPlayer(room, player) {
  ensureRoomShape(room);
  const existing = room.players.find((item) => item.token === player.token);
  if (existing) {
    existing.name = player.name;
    return;
  }
  if (room.status !== "waiting") throw new Error("This game has already started.");
  if (room.players.length >= MAX_PLAYERS) throw new Error("Room is full.");
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
    raceNumber: room.raceNumber,
    track: room.track,
    currentTurnToken: room.currentTurnToken,
    currentTurnRacerId: room.currentTurnRacerId,
    doubleRacerVariant: room.doubleRacerVariant,
    racersPerRace: room.racersPerRace,
    teamSize: room.teamSize,
    isHost: Boolean(you && you.token === hostToken),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    racers: RACERS,
    wildSpaces: WILD_SPACES,
    draft: publicDraft(room),
    race: publicRace(room),
    winners: [...room.winners],
    you: you ? publicPlayer(you, activeTokens, true) : null,
    players: room.players.map((player) => publicPlayer(player, activeTokens, player.token === playerToken)),
    history: [...room.history],
  };
}

export function publicPlayer(player, activeTokens, includePrivate = false) {
  return {
    token: player.token,
    name: player.name,
    connected: activeTokens.has(player.token),
    score: player.score || 0,
    chips: player.chips || [],
    team: includePrivate ? player.team || [] : (player.team || []).map((racerId) => ({ racerId, hidden: false })),
    usedRacers: player.usedRacers || [],
    selectedRacers: includePrivate ? player.selectedRacers || [] : [],
  };
}

export function publicDraft(room) {
  if (!room.draft) return null;
  return {
    batch: room.draft.batch,
    currentTurnToken: room.currentTurnToken,
    visible: room.draft.visible.map((racerId) => RACER_BY_ID[racerId]),
    remainingPicks: room.draft.queue.length,
  };
}

export function publicRace(room) {
  if (!room.race) return null;
  return {
    finish: TRACK_LENGTH,
    placements: room.race.placements,
    turnOrder: room.race.turnOrder,
    racers: room.race.racers.map((racer) => ({
      instanceId: racer.instanceId,
      ownerToken: racer.ownerToken,
      racerId: racer.racerId,
      effectiveRacerId: effectiveRacerId(room, racer),
      name: RACER_BY_ID[racer.racerId]?.name || racer.racerId,
      position: racer.position,
      points: racer.points || 0,
      lastRoll: racer.lastRoll || null,
      turnsTaken: racer.turnsTaken || 0,
      tripped: Boolean(racer.tripped),
      eliminated: Boolean(racer.eliminated),
      finished: Boolean(racer.finished),
      actedThisPlayerTurn: room.turnRacersDone.includes(racer.instanceId),
      copiedRacerId: racer.copiedRacerId || null,
      eggOptions: racer.eggOptions || [],
      predictedWinnerId: racer.predictedWinnerId || null,
    })),
  };
}

export function scorePlayers(room) {
  return room.players
    .map((player) => ({ token: player.token, name: player.name, score: player.score || 0 }))
    .sort((a, b) => b.score - a.score);
}

function setupDraftBatch(room, baseOrder, batch) {
  const playerCount = room.players.length;
  const visibleCount = room.doubleRacerVariant ? (playerCount === 2 ? 8 : 6) : playerCount * 2;
  const visible = room.deck.splice(0, visibleCount);
  let queue;

  if (room.doubleRacerVariant && playerCount === 2) {
    const first = batch === 0 ? baseOrder : [...baseOrder].reverse();
    queue = snake(first).concat(snake(first));
  } else if (room.doubleRacerVariant && playerCount === 3) {
    const start = batch % playerCount;
    queue = snake(rotate(baseOrder, start));
  } else {
    const start = batch % playerCount;
    queue = snake(rotate(baseOrder, start));
  }

  room.draft = { batch, baseOrder, visible, queue };
  room.currentTurnToken = queue[0] || null;
}

function draftRacer(room, player, racerId) {
  if (!room.draft.visible.includes(racerId)) throw new Error("Choose a visible racer.");
  player.team.push(racerId);
  room.draft.visible = room.draft.visible.filter((item) => item !== racerId);
  room.draft.queue.shift();
  addHistory(room, `${player.name} drafted ${RACER_BY_ID[racerId].name}.`);

  if (room.players.every((item) => item.team.length >= room.teamSize)) {
    room.draft = null;
    beginSelection(room);
    return;
  }

  if (!room.draft.queue.length) {
    setupDraftBatch(room, room.draft.baseOrder, room.draft.batch + 1);
    return;
  }

  room.currentTurnToken = room.draft.queue[0];
  room.updatedAt = Date.now();
}

function beginSelection(room) {
  room.phase = "selecting";
  room.raceNumber += 1;
  room.track = room.raceNumber % 2 === 1 ? "mild" : "wild";
  room.currentTurnToken = null;
  room.currentTurnRacerId = null;
  room.turnRacersDone = [];
  room.nextTurnTokenOverride = null;
  room.race = null;
  room.players.forEach((player) => {
    player.selectedRacers = [];
  });
  addHistory(room, `Race ${room.raceNumber}: ${room.track === "mild" ? "Mild Mile" : "Wild Wilds"}.`);
}

function selectRacers(room, player, racerIds) {
  const unique = [...new Set(racerIds.map(String))];
  if (unique.length !== room.racersPerRace) {
    throw new Error(`Choose ${room.racersPerRace} racer${room.racersPerRace === 1 ? "" : "s"}.`);
  }
  for (const racerId of unique) {
    if (!player.team.includes(racerId)) throw new Error("Choose a racer from your team.");
    if (player.usedRacers.includes(racerId)) throw new Error("Each racer can only race once.");
  }
  player.selectedRacers = unique;
  addHistory(room, `${player.name} locked in ${unique.length} racer${unique.length === 1 ? "" : "s"}.`);
  if (room.players.every((item) => item.selectedRacers.length === room.racersPerRace)) {
    beginRace(room);
  }
}

function beginRace(room) {
  const firstToken = room.raceNumber === 1 ? rollOffOrder(room, room.players.map((player) => player.token))[0] : firstStarterAfterLastRace(room);
  const racers = [];
  for (const player of room.players) {
    for (const racerId of player.selectedRacers) {
      racers.push(createRacerInstance(player.token, racerId));
    }
  }

  room.phase = "before_race";
  room.race = {
    racers,
    placements: [],
    turnOrder: orderFrom(room.players.map((player) => player.token), firstToken),
    lastRaceBackMarker: null,
  };
  if (room.raceNumber === 1) addHistory(room, `${playerByToken(room, firstToken).name} won the first-race roll-off.`);

  for (const racer of racers) {
    if (racer.racerId === "sisyphus") {
      racer.points += 4;
      ownerOf(room, racer).score += 4;
      ownerOf(room, racer).chips.push({ kind: "bronze", points: 4, race: room.raceNumber, source: "Sisyphus" });
      addHistory(room, `${racerName(racer)} started with 4 points.`);
    }
    if (racer.racerId === "egg") {
      racer.eggOptions = room.deck.splice(0, 3);
    }
  }

  continueBeforeRace(room);
}

function continueBeforeRace(room) {
  const unresolvedEgg = room.race.racers.find((racer) => racer.racerId === "egg" && racer.eggOptions?.length && !racer.copiedRacerId);
  if (unresolvedEgg) {
    room.currentTurnToken = unresolvedEgg.ownerToken;
    room.currentTurnRacerId = unresolvedEgg.instanceId;
    return;
  }

  const unresolvedTwin = room.race.racers.find(
    (racer) => racer.racerId === "twin" && previousWinnerRacerIds(room).length && !racer.twinResolved,
  );
  if (unresolvedTwin) {
    room.currentTurnToken = unresolvedTwin.ownerToken;
    room.currentTurnRacerId = unresolvedTwin.instanceId;
    return;
  }

  room.phase = "racing";
  room.currentTurnToken = room.race.turnOrder[0];
  room.currentTurnRacerId = null;
  room.turnRacersDone = [];
  addHistory(room, "The race is on.");
}

function chooseEggPower(room, player, instanceId, copyRacerId) {
  const racer = racerByInstance(room, instanceId);
  if (!racer || racer.ownerToken !== player.token || racer.racerId !== "egg") {
    throw new Error("Choose for your Egg.");
  }
  if (!racer.eggOptions?.includes(copyRacerId)) throw new Error("Choose one of Egg's drawn powers.");
  racer.copiedRacerId = copyRacerId;
  room.discardedRacers.push(...racer.eggOptions.filter((item) => item !== copyRacerId));
  racer.eggOptions = [];
  addHistory(room, `${player.name}'s Egg copied ${RACER_BY_ID[copyRacerId].name}.`);
  continueBeforeRace(room);
}

function chooseTwinPower(room, player, instanceId, copyRacerId) {
  const racer = racerByInstance(room, instanceId);
  if (!racer || racer.ownerToken !== player.token || racer.racerId !== "twin") {
    throw new Error("Choose for your Twin.");
  }
  if (copyRacerId && !previousWinnerRacerIds(room).includes(copyRacerId)) {
    throw new Error("Twin can only copy a previous race winner.");
  }
  racer.copiedRacerId = copyRacerId || null;
  racer.twinResolved = true;
  addHistory(room, `${player.name}'s Twin ${copyRacerId ? `copied ${RACER_BY_ID[copyRacerId].name}` : "kept its own stride"}.`);
  continueBeforeRace(room);
}

function takeTurn(room, player, action) {
  ensureCurrentTurn(room, player);
  const racers = activeRacersForPlayer(room, player.token).filter(
    (racer) => !room.turnRacersDone.includes(racer.instanceId),
  );
  if (!racers.length) throw new Error("You have no racer left to move this turn.");

  const racer = racers.find((item) => item.instanceId === action.racerId) || (racers.length === 1 ? racers[0] : null);
  if (!racer) throw new Error("Choose one of your racers for this turn.");
  room.currentTurnRacerId = racer.instanceId;
  const startPosition = racer.position;
  racer.turnsTaken += 1;

  if (effectiveHasPower(room, racer, "mastermind") && racer.turnsTaken === 1) {
    const mastermindId = String(action.predictedWinnerId || "");
    if (!activeRaceRacers(room).some((item) => item.instanceId === mastermindId)) {
      throw new Error("Mastermind must predict a racer on their first turn.");
    }
    racer.predictedWinnerId = mastermindId;
    addHistory(room, `${racerName(racer)} predicted a winner.`);
    notePower(room, racer, "Mastermind prediction");
  }

  if (effectiveHasPower(room, racer, "hare") && isAloneLead(room, racer)) {
    addPoints(room, racer, 1, "Hare");
    addHistory(room, `${racerName(racer)} coasted in front and skipped.`);
    finishRacerTurn(room, racer, startPosition);
    return;
  }

  if (racer.tripped) {
    racer.tripped = false;
    addHistory(room, `${racerName(racer)} recovered from a trip.`);
    finishRacerTurn(room, racer, startPosition);
    return;
  }

  if (effectiveHasPower(room, racer, "loveable-loser") && isAloneLast(room, racer)) {
    addPoints(room, racer, 1, "Loveable Loser");
    notePower(room, racer, "Loveable Loser");
  }

  if (action.mode === "cheerleader" && effectiveHasPower(room, racer, "cheerleader")) {
    for (const last of lastPlaceRacers(room)) moveRacer(room, last, 2, { source: racer, reason: "Cheerleader" });
    moveRacer(room, racer, 1, { source: racer, reason: "Cheerleader" });
    notePower(room, racer, "Cheerleader");
  }

  if (action.mode === "hypnotist" && effectiveHasPower(room, racer, "hypnotist")) {
    const target = racerByInstance(room, action.targetRacerId);
    if (!target || target.instanceId === racer.instanceId || !isActiveRacer(target)) throw new Error("Choose a racer to hypnotize.");
    warpRacer(room, target, racer.position, racer);
    notePower(room, racer, "Hypnotist");
  }

  if (action.mode === "third-wheel" && effectiveHasPower(room, racer, "third-wheel")) {
    const position = Number(action.targetPosition);
    if (racersAt(room, position).length !== 2) throw new Error("Choose a space with exactly two racers.");
    warpRacer(room, racer, position, racer);
    notePower(room, racer, "Third Wheel");
  }

  if (action.mode === "flip-flop" && effectiveHasPower(room, racer, "flip-flop")) {
    const target = racerByInstance(room, action.targetRacerId);
    if (!target || target.instanceId === racer.instanceId || !isActiveRacer(target)) throw new Error("Choose another racer.");
    const position = racer.position;
    warpRacer(room, racer, target.position, racer, { quiet: true });
    warpRacer(room, target, position, racer, { quiet: true });
    addHistory(room, `${racerName(racer)} swapped spaces.`);
    notePower(room, racer, "Flip Flop");
    finishRacerTurn(room, racer, startPosition);
    return;
  }

  if (action.mode === "legs" && effectiveHasPower(room, racer, "legs")) {
    notePower(room, racer, "Legs");
    moveRacer(room, racer, modifiedMainMove(room, racer, 5), { main: true, source: racer, roll: null, reason: "Legs" });
    finishRacerTurn(room, racer, startPosition);
    return;
  }

  let roll = rollDie(room);
  const rerollLimit = rerollLimitFor(room, racer);
  const rerolls = Math.max(0, Math.min(rerollLimit, Number(action.rerolls || 0)));
  for (let index = 0; index < rerolls; index += 1) {
    if (effectiveHasPower(room, racer, "magician")) {
      notePower(room, racer, "Magician");
    } else {
      triggerDicemongerReroll(room, racer);
    }
    roll = rollDie(room);
  }

  racer.lastRoll = roll;
  addHistory(room, `${racerName(racer)} rolled ${roll}.`);
  handleRollTriggers(room, racer, roll);
  if (racer.skipMainMove) {
    racer.skipMainMove = false;
    finishRacerTurn(room, racer, startPosition);
    return;
  }

  if (effectiveHasPower(room, racer, "sisyphus") && roll === 6) {
    warpRacer(room, racer, 0, racer);
    if (racer.points > 0) {
      racer.points -= 1;
      ownerOf(room, racer).score -= 1;
    }
    notePower(room, racer, "Sisyphus");
    finishRacerTurn(room, racer, startPosition);
    return;
  }

  let amount = roll;
  if (effectiveHasPower(room, racer, "alchemist") && (roll === 1 || roll === 2) && action.useAlchemist !== false) {
    amount = 4;
    notePower(room, racer, "Alchemist");
  }
  if (effectiveHasPower(room, racer, "rocket-scientist") && action.useDouble) {
    amount *= 2;
    racer.tripAfterMove = true;
    notePower(room, racer, "Rocket Scientist");
  }

  amount = modifiedMainMove(room, racer, amount);
  moveRacer(room, racer, amount, { main: true, source: racer, roll, reason: "Main move" });
  if (racer.tripAfterMove) {
    racer.tripAfterMove = false;
    tripRacer(room, racer);
  }

  if (effectiveHasPower(room, racer, "genius") && Number(action.predictedRoll) === roll) {
    racer.extraTurn = true;
    notePower(room, racer, "Genius");
  }

  finishRacerTurn(room, racer, startPosition);
}

function handleRollTriggers(room, racer, roll) {
  if (roll === 1) {
    for (const inchworm of activeRaceRacers(room).filter((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "inchworm"))) {
      racer.skipMainMove = true;
      moveRacer(room, inchworm, 1, { source: inchworm, reason: "Inchworm" });
      notePower(room, inchworm, "Inchworm");
    }
    const skipper = activeRaceRacers(room).find((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "skipper"));
    if (skipper) {
      room.nextTurnTokenOverride = skipper.ownerToken;
      notePower(room, skipper, "Skipper");
    }
  }

  if (roll === 6) {
    for (const lackey of activeRaceRacers(room).filter((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "lackey"))) {
      moveRacer(room, lackey, 2, { source: lackey, reason: "Lackey" });
      notePower(room, lackey, "Lackey");
    }
  }
}

function rerollLimitFor(room, racer) {
  if (effectiveHasPower(room, racer, "magician")) return 2;
  return activeRaceRacers(room).some((item) => effectiveHasPower(room, item, "dicemonger")) ? 1 : 0;
}

function triggerDicemongerReroll(room, racer) {
  for (const dicemonger of activeRaceRacers(room).filter((item) => effectiveHasPower(room, item, "dicemonger"))) {
    if (dicemonger.instanceId !== racer.instanceId) {
      moveRacer(room, dicemonger, 1, { source: dicemonger, reason: "Dicemonger" });
    }
    notePower(room, dicemonger, "Dicemonger");
  }
}

function modifiedMainMove(room, racer, amount) {
  let result = amount;
  if (effectiveHasPower(room, racer, "blimp")) result += racer.position < 15 ? 3 : -1;
  if (effectiveHasPower(room, racer, "hare")) result += 2;
  for (const other of activeRaceRacers(room)) {
    if (other.instanceId === racer.instanceId) continue;
    if (effectiveHasPower(room, other, "gunk")) result -= 1;
  }
  if (activeRaceRacers(room).some((other) => other.position === racer.position && effectiveHasPower(room, other, "coach"))) {
    result += 1;
  }
  if (effectiveHasPower(room, racer, "party-animal")) {
    for (const other of activeRaceRacers(room).filter((item) => item.instanceId !== racer.instanceId)) {
      moveRacer(room, other, other.position < racer.position ? 1 : other.position > racer.position ? -1 : 0, {
        source: racer,
        reason: "Party Animal",
      });
    }
    result += racersAt(room, racer.position).filter((item) => item.instanceId !== racer.instanceId).length;
    notePower(room, racer, "Party Animal");
  }
  return Math.max(0, result);
}

function moveRacer(room, racer, amount, options = {}) {
  if (!isActiveRacer(racer) || amount === 0) return;
  const source = options.source || racer;
  const from = racer.position;

  if (
    options.main &&
    racer.instanceId !== source.instanceId &&
    activeRaceRacers(room).some((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "stickler")) &&
    from + amount > TRACK_LENGTH
  ) {
    addHistory(room, `${racerName(racer)} needed the exact count.`);
    return;
  }

  const followers = activeRaceRacers(room).filter(
    (item) => item.instanceId !== racer.instanceId && item.position === from && effectiveHasPower(room, item, "suckerfish"),
  );
  let to = from;

  if (effectiveHasPower(room, racer, "leaptoad") && amount > 0) {
    for (let step = 0; step < amount; step += 1) {
      to += 1;
      while (to < TRACK_LENGTH && racersAt(room, to).length) to += 1;
    }
  } else {
    to += amount;
  }

  if (
    options.main &&
    activeRaceRacers(room).some((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "stickler")) &&
    to > TRACK_LENGTH
  ) {
    addHistory(room, `${racerName(racer)} overshot under Stickler's rule.`);
    return;
  }

  to = Math.max(0, to);
  const passed = activeRaceRacers(room).filter((other) => {
    if (other.instanceId === racer.instanceId) return false;
    return amount > 0 ? from < other.position && to > other.position : from > other.position && to < other.position;
  });

  if (to >= TRACK_LENGTH) {
    racer.position = TRACK_LENGTH;
    for (const other of passed) onPassed(room, racer, other);
    finishRacer(room, racer);
  } else {
    racer.position = to;
    for (const other of passed) onPassed(room, racer, other);
    enforceHugeBaby(room, racer);
    applyStopTriggers(room, racer, source);
    applyTrackSpace(room, racer);
  }

  for (const follower of followers) {
    if (isActiveRacer(follower) && follower.position === from) {
      follower.position = racer.position;
      applyStopTriggers(room, follower, follower);
      notePower(room, follower, "Suckerfish");
    }
  }

  if (effectiveHasPower(room, source, "scoocher") && source.instanceId !== racer.instanceId) {
    moveRacer(room, source, 1, { source, reason: "Scoocher" });
  }
}

function warpRacer(room, racer, position, source, options = {}) {
  if (!isActiveRacer(racer)) return;
  racer.position = Math.max(0, Math.min(TRACK_LENGTH, Number(position)));
  if (!options.quiet) addHistory(room, `${racerName(racer)} warped.`);
  enforceHugeBaby(room, racer);
  applyStopTriggers(room, racer, source || racer);
}

function onPassed(room, racer, other) {
  if (effectiveHasPower(room, other, "banana")) {
    tripRacer(room, racer);
    notePower(room, other, "Banana");
  }
  if (effectiveHasPower(room, racer, "centaur")) {
    moveRacer(room, other, -2, { source: racer, reason: "Centaur" });
    notePower(room, racer, "Centaur");
  }
}

function applyStopTriggers(room, racer, source) {
  if (!isActiveRacer(racer)) return;

  const hugeBaby = racersAt(room, racer.position).find((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "huge-baby"));
  if (hugeBaby && racer.position !== 0) {
    racer.position = Math.max(0, hugeBaby.position - 1);
    notePower(room, hugeBaby, "Huge Baby");
  }

  for (const other of racersAt(room, racer.position).filter((item) => item.instanceId !== racer.instanceId)) {
    if (effectiveHasPower(room, other, "baba-yaga") || effectiveHasPower(room, racer, "baba-yaga")) {
      tripRacer(room, effectiveHasPower(room, racer, "baba-yaga") ? other : racer);
      notePower(room, effectiveHasPower(room, racer, "baba-yaga") ? racer : other, "Baba Yaga");
    }
  }

  if (effectiveHasPower(room, racer, "mouth")) {
    const others = racersAt(room, racer.position).filter((item) => item.instanceId !== racer.instanceId);
    if (others.length === 1) {
      others[0].eliminated = true;
      addHistory(room, `${racerName(racer)} eliminated ${racerName(others[0])}.`);
      notePower(room, racer, "M.O.U.T.H.");
      if (activeRaceRacers(room).length === 1) finishRacer(room, activeRaceRacers(room)[0]);
    }
  }

  const sharingPairs = new Set();
  for (const active of activeRaceRacers(room)) {
    const count = racersAt(room, active.position).length;
    if (count === 2) sharingPairs.add(active.position);
  }
  if (sharingPairs.size) {
    for (const romantic of activeRaceRacers(room).filter((item) => effectiveHasPower(room, item, "romantic"))) {
      if (romantic.instanceId !== source?.instanceId) {
        moveRacer(room, romantic, 2, { source: romantic, reason: "Romantic" });
        notePower(room, romantic, "Romantic");
      }
    }
  }

  const duelists = racersAt(room, racer.position).filter((item) => effectiveHasPower(room, item, "duelist"));
  for (const duelist of duelists) {
    const opponent = racersAt(room, duelist.position).find((item) => item.instanceId !== duelist.instanceId);
    if (opponent) resolveDuel(room, duelist, opponent);
  }
}

function resolveDuel(room, duelist, opponent) {
  const duelRoll = rollDie(room);
  const opponentRoll = rollDie(room);
  const winner = duelRoll >= opponentRoll ? duelist : opponent;
  addHistory(room, `${racerName(duelist)} dueled ${racerName(opponent)}.`);
  moveRacer(room, winner, 2, { source: duelist, reason: "Duelist" });
  notePower(room, duelist, "Duelist");
}

function applyTrackSpace(room, racer) {
  if (room.track !== "wild" || !isActiveRacer(racer)) return;
  const space = WILD_SPACES[racer.position];
  if (!space) return;
  if (space.type === "star") {
    addPoints(room, racer, space.points, "Wild star");
    return;
  }
  if (space.type === "trip") {
    tripRacer(room, racer);
    return;
  }
  if (space.type === "arrow") {
    moveRacer(room, racer, space.amount, { source: racer, reason: "Wild arrow" });
  }
}

function finishRacerTurn(room, racer, startPosition) {
  if (activeRaceRacers(room).some((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "heckler"))) {
    if (Math.abs(racer.position - startPosition) <= 1) {
      for (const heckler of activeRaceRacers(room).filter((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "heckler"))) {
        moveRacer(room, heckler, 2, { source: heckler, reason: "Heckler" });
        notePower(room, heckler, "Heckler");
      }
    }
  }

  if (racer.extraTurn && isActiveRacer(racer)) {
    racer.extraTurn = false;
    addHistory(room, `${racerName(racer)} takes another turn.`);
    return;
  }

  if (!room.turnRacersDone.includes(racer.instanceId)) room.turnRacersDone.push(racer.instanceId);
  if (room.race.placements.length >= 2 || room.phase !== "racing") return;

  const remainingForPlayer = activeRacersForPlayer(room, room.currentTurnToken).filter(
    (item) => !room.turnRacersDone.includes(item.instanceId),
  );
  if (remainingForPlayer.length) {
    room.currentTurnRacerId = null;
    return;
  }

  const nextToken = room.nextTurnTokenOverride || nextRacePlayerToken(room, room.currentTurnToken);
  room.nextTurnTokenOverride = null;
  room.currentTurnToken = nextToken;
  room.currentTurnRacerId = null;
  room.turnRacersDone = [];
}

function finishRacer(room, racer) {
  if (!isActiveRacer(racer)) return;
  racer.finished = true;
  racer.position = TRACK_LENGTH;
  const place = room.race.placements.length + 1;
  room.race.placements.push({ place, ownerToken: racer.ownerToken, racerId: racer.racerId, instanceId: racer.instanceId });
  addHistory(room, `${racerName(racer)} finished ${place === 1 ? "1st" : "2nd"}.`);

  const masterminds = activeRaceRacers(room).filter((item) => item.predictedWinnerId === racer.instanceId);
  if (place === 1 && masterminds.length) {
    const mastermind = masterminds[0];
    room.race.placements.push({
      place: 2,
      ownerToken: mastermind.ownerToken,
      racerId: mastermind.racerId,
      instanceId: mastermind.instanceId,
    });
    mastermind.finished = true;
    addHistory(room, `${racerName(mastermind)} called the winner.`);
  }

  if (room.race.placements.length >= 2 || activeRaceRacers(room).length <= 1) {
    if (room.race.placements.length < 2 && activeRaceRacers(room).length === 1) {
      const last = activeRaceRacers(room)[0];
      last.finished = true;
      room.race.placements.push({
        place: room.race.placements.length + 1,
        ownerToken: last.ownerToken,
        racerId: last.racerId,
        instanceId: last.instanceId,
      });
    }
    finishRace(room);
  }
}

function finishRace(room) {
  const first = room.race.placements.find((item) => item.place === 1);
  const second = room.race.placements.find((item) => item.place === 2);
  if (first) awardPlacement(room, first, "gold", GOLD_POINTS[room.raceNumber - 1] || 3);
  if (second) awardPlacement(room, second, "silver", SILVER_POINTS[room.raceNumber - 1] || 1);

  const backMarker = [...room.race.racers]
    .filter((item) => !item.finished)
    .sort((a, b) => a.position - b.position)[0];
  room.race.lastRaceBackMarker = backMarker?.ownerToken || second?.ownerToken || first?.ownerToken || room.players[0].token;
  room.nextRaceFirstToken = room.race.lastRaceBackMarker;

  for (const player of room.players) {
    player.usedRacers.push(...player.selectedRacers);
    player.selectedRacers = [];
  }

  if (room.raceNumber >= RACE_COUNT) {
    room.status = "finished";
    room.phase = "finished";
    room.currentTurnToken = null;
    room.currentTurnRacerId = null;
    room.winners = scorePlayers(room).filter((item, _, all) => item.score === all[0].score);
    addHistory(room, "The festival is complete.");
  } else {
    room.phase = "between_race";
    room.currentTurnToken = null;
    room.currentTurnRacerId = null;
    addHistory(room, "Race complete. Set up the next race.");
  }
}

function awardPlacement(room, placement, kind, points) {
  const player = playerByToken(room, placement.ownerToken);
  player.score += points;
  player.chips.push({ kind, points, race: room.raceNumber, racerId: placement.racerId });
}

function addPoints(room, racer, points, source) {
  racer.points = (racer.points || 0) + points;
  const player = ownerOf(room, racer);
  player.score += points;
  player.chips.push({ kind: "bronze", points, race: room.raceNumber, source, racerId: racer.racerId });
}

function tripRacer(room, racer) {
  if (!isActiveRacer(racer)) return;
  racer.tripped = true;
  addHistory(room, `${racerName(racer)} tripped.`);
}

function notePower(room, source, label) {
  room.race.powerCount = (room.race.powerCount || 0) + 1;
  if (room.race.powerCount > 160) {
    finishRace(room);
    return;
  }
  for (const scoocher of activeRaceRacers(room).filter(
    (item) => item.instanceId !== source.instanceId && effectiveHasPower(room, item, "scoocher"),
  )) {
    moveRacer(room, scoocher, 1, { source: scoocher, reason: "Scoocher" });
  }
  addHistory(room, `${racerName(source)} used ${label}.`);
}

function enforceHugeBaby(room, racer) {
  if (racer.position === 0) return;
  const baby = racersAt(room, racer.position).find((item) => item.instanceId !== racer.instanceId && effectiveHasPower(room, item, "huge-baby"));
  if (baby) racer.position = Math.max(0, baby.position - 1);
}

function effectiveHasPower(room, racer, powerId) {
  return effectiveRacerId(room, racer) === powerId;
}

function effectiveRacerId(room, racer) {
  if (!racer) return null;
  if (racer.copiedRacerId) return racer.copiedRacerId;
  if (racer.racerId === "copy-cat") {
    const leaders = leadRacers(room).filter((item) => item.instanceId !== racer.instanceId);
    if (leaders.length === 1) return effectiveRacerId(room, leaders[0]);
  }
  return racer.racerId;
}

function rollOffOrder(room, tokens) {
  const rolls = tokens.map((token) => ({ token, roll: rollDie(room) }));
  rolls.sort((a, b) => b.roll - a.roll || tokens.indexOf(a.token) - tokens.indexOf(b.token));
  return rolls.map((item) => item.token);
}

function rollDie(room) {
  if (room.testRolls?.length) return room.testRolls.shift();
  return Math.floor(Math.random() * 6) + 1;
}

function createRacerInstance(ownerToken, racerId) {
  return {
    instanceId: `${ownerToken}:${racerId}`,
    ownerToken,
    racerId,
    position: 0,
    points: 0,
    tripped: false,
    eliminated: false,
    finished: false,
    turnsTaken: 0,
    lastRoll: null,
  };
}

function normalizeGamePlayer(player) {
  return {
    token: player.token,
    name: player.name,
    team: [],
    usedRacers: [],
    selectedRacers: [],
    score: 0,
    chips: [],
  };
}

function ensureRoomShape(room) {
  room.players ||= [];
  room.history ||= [];
  room.winners ||= [];
  room.discardedRacers ||= [];
  room.turnRacersDone ||= [];
}

function ensureHost(room, player) {
  if (player.token !== getHostToken(room)) throw new Error("Only the host can do that.");
}

function ensurePhase(room, phase) {
  if (room.phase !== phase) throw new Error(`This action is only available during ${phase}.`);
}

function ensureCurrentTurn(room, player) {
  if (room.currentTurnToken !== player.token) throw new Error("It is not your turn.");
}

function addHistory(room, message) {
  room.history.unshift(message);
  room.history = room.history.slice(0, 80);
  room.updatedAt = Date.now();
}

function playerByToken(room, token) {
  return room.players.find((player) => player.token === token);
}

function ownerOf(room, racer) {
  return playerByToken(room, racer.ownerToken);
}

function racerByInstance(room, instanceId) {
  return room.race?.racers.find((racer) => racer.instanceId === instanceId);
}

function activeRaceRacers(room) {
  return (room.race?.racers || []).filter(isActiveRacer);
}

function activeRacersForPlayer(room, token) {
  return activeRaceRacers(room).filter((racer) => racer.ownerToken === token);
}

function isActiveRacer(racer) {
  return racer && !racer.finished && !racer.eliminated;
}

function racersAt(room, position) {
  return activeRaceRacers(room).filter((racer) => racer.position === position);
}

function leadRacers(room) {
  const active = activeRaceRacers(room);
  const lead = Math.max(...active.map((racer) => racer.position), -1);
  return active.filter((racer) => racer.position === lead);
}

function lastPlaceRacers(room) {
  const active = activeRaceRacers(room);
  const last = Math.min(...active.map((racer) => racer.position), TRACK_LENGTH);
  return active.filter((racer) => racer.position === last);
}

function isAloneLead(room, racer) {
  const leaders = leadRacers(room);
  return leaders.length === 1 && leaders[0].instanceId === racer.instanceId;
}

function isAloneLast(room, racer) {
  const last = lastPlaceRacers(room);
  return last.length === 1 && last[0].instanceId === racer.instanceId;
}

function racerName(racer) {
  return RACER_BY_ID[racer.racerId]?.name || racer.racerId;
}

function previousWinnerRacerIds(room) {
  return room.players.flatMap((player) => player.chips || []).filter((chip) => chip.kind === "gold").map((chip) => chip.racerId);
}

function firstStarterAfterLastRace(room) {
  return room.nextRaceFirstToken || room.players[0].token;
}

function nextRacePlayerToken(room, token) {
  const order = room.race.turnOrder;
  const start = order.indexOf(token);
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(start + offset) % order.length];
    if (activeRacersForPlayer(room, candidate).length) return candidate;
  }
  return token;
}

function orderFrom(tokens, firstToken) {
  const index = Math.max(0, tokens.indexOf(firstToken));
  return rotate(tokens, index);
}

function snake(tokens) {
  return [...tokens, ...tokens.slice().reverse()];
}

function rotate(items, start) {
  return [...items.slice(start), ...items.slice(0, start)];
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
