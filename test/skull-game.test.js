import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PLAYERS,
  applyAction,
  createWaitingRoom,
  normalizePlayer,
  upsertPlayer,
  viewFor,
} from "../src/games/skull/game.js";

test("validates player counts for start and join", () => {
  const room = roomWithPlayers(["A", "B"]);
  assert.throws(() => act(room, "A", { type: "start_game" }), /at least 3/);

  upsertPlayer(room, makePlayer("C"));
  upsertPlayer(room, makePlayer("D"));
  upsertPlayer(room, makePlayer("E"));
  upsertPlayer(room, makePlayer("F"));
  assert.equal(room.players.length, MAX_PLAYERS);
  assert.throws(() => upsertPlayer(room, makePlayer("G")), /full/);

  act(room, "A", { type: "start_game" });
  assert.equal(room.phase, "setup");
});

test("setup has the first player place last, then first player starts placing", () => {
  const room = startedRoom();

  assert.equal(room.firstPlayerToken, "A");
  assert.equal(room.turnToken, "B");
  act(room, "B", place("flower"));
  assert.equal(room.turnToken, "C");
  act(room, "C", place("flower"));
  assert.equal(room.turnToken, "A");
  act(room, "A", place("flower"));

  assert.equal(room.phase, "placing");
  assert.equal(room.turnToken, "A");
});

test("placing allows bidding and rejects unavailable discs", () => {
  const room = readyToBidRoom();
  const playerA = find(room, "A");
  playerA.hand = [];

  const view = viewFor(room, "A");
  assert.deepEqual(view.you.allowedActions.sort(), ["open_bid", "reset_game"].sort());
  assert.throws(() => act(room, "A", place("flower")), /not available/);

  act(room, "A", { type: "open_bid", amount: 2 });
  assert.equal(room.phase, "bidding");
  assert.equal(room.currentBid, 2);
});

test("outbid and pass resolve to one challenger", () => {
  const room = readyToBidRoom();

  act(room, "A", { type: "open_bid", amount: 1 });
  assert.equal(room.turnToken, "B");
  act(room, "B", { type: "outbid", amount: 2 });
  assert.equal(room.challengerToken, "B");
  assert.equal(room.turnToken, "C");
  act(room, "C", { type: "pass" });
  assert.equal(room.turnToken, "A");
  act(room, "A", { type: "pass" });

  assert.equal(room.phase, "challenge");
  assert.equal(room.challengerToken, "B");
});

test("challenger must flip their own stack first", () => {
  const room = readyToBidRoom();

  act(room, "A", { type: "open_bid", amount: 2 });
  act(room, "B", { type: "pass" });
  act(room, "C", { type: "pass" });

  assert.equal(room.phase, "challenge");
  assert.throws(() => act(room, "A", { type: "flip_disc", playerToken: "B" }), /own stack/);
  act(room, "A", { type: "flip_disc", playerToken: "A" });
  assert.equal(room.flippedCount, 1);
});

test("two successful challenges win the game", () => {
  const room = readyToBidRoom();

  winOnePoint(room, "A");
  assert.equal(find(room, "A").score, 1);
  assert.equal(room.phase, "setup");

  finishSetupWithFlowers(room);
  winOnePoint(room, "A");

  assert.equal(room.status, "finished");
  assert.equal(room.winnerToken, "A");
});

test("self skull failure lets challenger choose a known disc to lose", () => {
  const room = startedRoom();
  act(room, "B", place("flower"));
  act(room, "C", place("flower"));
  act(room, "A", place("skull"));
  act(room, "A", { type: "open_bid", amount: 1 });
  act(room, "B", { type: "pass" });
  act(room, "C", { type: "pass" });
  act(room, "A", { type: "flip_disc", playerToken: "A" });

  assert.equal(room.phase, "loss_selection");
  assert.equal(room.turnToken, "A");
  const privateView = viewFor(room, "A");
  assert.ok(privateView.you.lossChoices.some((choice) => choice.kind === "skull"));

  act(room, "A", { type: "choose_lost_disc", slot: 0 });
  assert.equal(countBase(find(room, "A")), 3);
});

test("opponent skull failure gives blind choice to skull owner", () => {
  const room = startedRoom();
  act(room, "B", place("skull"));
  act(room, "C", place("flower"));
  act(room, "A", place("flower"));
  act(room, "A", { type: "open_bid", amount: 2 });
  act(room, "B", { type: "pass" });
  act(room, "C", { type: "pass" });
  act(room, "A", { type: "flip_disc", playerToken: "A" });
  act(room, "A", { type: "flip_disc", playerToken: "B" });

  assert.equal(room.phase, "loss_selection");
  assert.equal(room.turnToken, "B");
  const ownerView = viewFor(room, "B");
  assert.ok(ownerView.you.lossChoices.length > 0);
  assert.ok(ownerView.you.lossChoices.every((choice) => choice.kind === null));
});

test("self-elimination asks eliminated challenger to pick next first player", () => {
  const room = startedRoom();
  const challenger = find(room, "A");
  challenger.hand = challenger.hand.filter((disc) => disc.kind === "skull").slice(0, 1);
  challenger.hasUsedLastChance = true;

  act(room, "B", place("flower"));
  act(room, "C", place("flower"));
  act(room, "A", place("skull"));
  act(room, "A", { type: "open_bid", amount: 1 });
  act(room, "B", { type: "pass" });
  act(room, "C", { type: "pass" });
  act(room, "A", { type: "flip_disc", playerToken: "A" });
  act(room, "A", { type: "choose_lost_disc", slot: 0 });

  assert.equal(challenger.eliminated, true);
  assert.equal(room.phase, "choose_next_first");
  assert.equal(room.turnToken, "A");

  act(room, "A", { type: "choose_next_first", playerToken: "B" });
  assert.equal(room.phase, "setup");
  assert.equal(room.firstPlayerToken, "B");
});

test("last chance flower is granted for the next round and expires afterward", () => {
  const room = startedRoom();
  const challenger = find(room, "A");
  challenger.hand = challenger.hand.filter((disc) => disc.kind !== "flower").slice(0, 1);
  challenger.hand.push(makeDisc("flower", "base"));

  act(room, "B", place("flower"));
  act(room, "C", place("flower"));
  act(room, "A", place("skull"));
  act(room, "A", { type: "open_bid", amount: 1 });
  act(room, "B", { type: "pass" });
  act(room, "C", { type: "pass" });
  act(room, "A", { type: "flip_disc", playerToken: "A" });
  act(room, "A", { type: "choose_lost_disc", slot: 0 });

  assert.equal(find(room, "A").lastChanceActive, true);
  assert.equal(viewFor(room, "A").you.handCounts.lastChance, 1);
  assert.equal(room.phase, "setup");

  finishSetupWithFlowers(room);
  winOnePoint(room, "A");

  assert.equal(find(room, "A").lastChanceActive, false);
  assert.equal(viewFor(room, "A").you.handCounts.lastChance, 0);
});

test("failing while using last chance eliminates the challenger", () => {
  const room = startedRoom();
  const challenger = find(room, "A");
  challenger.hand = [makeDisc("skull", "base"), makeDisc("flower", "lastChance")];
  challenger.hasUsedLastChance = true;
  challenger.lastChanceActive = true;
  challenger.lastChanceRound = 1;

  act(room, "B", place("flower"));
  act(room, "C", place("flower"));
  act(room, "A", place("skull"));
  act(room, "A", { type: "open_bid", amount: 1 });
  act(room, "B", { type: "pass" });
  act(room, "C", { type: "pass" });
  act(room, "A", { type: "flip_disc", playerToken: "A" });

  assert.equal(challenger.eliminated, true);
  assert.equal(countBase(challenger), 0);
});

function roomWithPlayers(tokens) {
  const room = createWaitingRoom("ROOM1", makePlayer(tokens[0]));
  tokens.slice(1).forEach((token) => upsertPlayer(room, makePlayer(token)));
  return room;
}

function startedRoom() {
  const room = roomWithPlayers(["A", "B", "C"]);
  act(room, "A", { type: "start_game" });
  return room;
}

function readyToBidRoom() {
  const room = startedRoom();
  finishSetupWithFlowers(room);
  return room;
}

function finishSetupWithFlowers(room) {
  while (room.phase === "setup") {
    const view = viewFor(room, room.turnToken);
    const source = view.you.handCounts.flower > 0 ? "base" : "lastChance";
    act(room, room.turnToken, place("flower", source));
  }
}

function winOnePoint(room, token) {
  act(room, token, { type: "open_bid", amount: 1 });
  for (const player of room.players) {
    if (room.phase === "bidding" && room.turnToken === player.token) {
      act(room, player.token, { type: "pass" });
    }
  }
  while (room.phase === "bidding") {
    act(room, room.turnToken, { type: "pass" });
  }
  act(room, token, { type: "flip_disc", playerToken: token });
}

function act(room, token, action) {
  return applyAction(room, find(room, token), action);
}

function find(room, token) {
  return room.players.find((player) => player.token === token);
}

function makePlayer(token) {
  return normalizePlayer({ playerToken: token, name: token });
}

function place(kind, source = "base") {
  return { type: "place_disc", kind, source };
}

function countBase(player) {
  return [...player.hand, ...player.stack].filter((disc) => disc.source === "base").length;
}

function makeDisc(kind, source) {
  return {
    id: `${kind}-${source}-${Math.random()}`,
    kind,
    source,
    revealed: false,
  };
}
