import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAction,
  createWaitingRoom,
  scorePlayer,
  upsertPlayer,
  viewFor,
} from "../src/games/no-thanks/game.js";

const ACTIVE = new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);

describe("No Thanks! rules", () => {
  it("requires the official 3-7 player range to start", () => {
    const { room, p1 } = makeRoom(["p1", "p2"]);

    assert.throws(() => applyAction(room, p1, { type: "start_game" }), /3-7 players/);
  });

  it("allocates counters by player count", () => {
    assertCounters(["p1", "p2", "p3"], 11);
    assertCounters(["p1", "p2", "p3", "p4", "p5"], 11);
    assertCounters(["p1", "p2", "p3", "p4", "p5", "p6"], 9);
    assertCounters(["p1", "p2", "p3", "p4", "p5", "p6", "p7"], 7);
  });

  it("uses cards 3-35 with exactly nine cards removed unseen", () => {
    const { room, p1 } = makeRoom(["p1", "p2", "p3"]);

    applyAction(room, p1, { type: "start_game" });

    const activeCards = [room.currentCard, ...room.deck].sort((a, b) => a - b);
    assert.equal(room.removedCount, 9);
    assert.equal(activeCards.length, 24);
    assert.equal(new Set(activeCards).size, 24);
    assert.ok(activeCards.every((card) => card >= 3 && card <= 35));
    assert.equal(33 - activeCards.length, 9);
  });

  it("spends one counter to pass and advances turn", () => {
    const { room, p1, p2 } = makeStartedRoom();

    applyAction(room, p1, { type: "pass_card" });

    assert.equal(p1.counters, 10);
    assert.equal(room.cardCounters, 1);
    assert.equal(room.currentTurnToken, p2.token);
  });

  it("forces a zero-counter player to take", () => {
    const { room, p1 } = makeStartedRoom();
    p1.counters = 0;

    assert.throws(() => applyAction(room, p1, { type: "pass_card" }), /must take/);
    applyAction(room, p1, { type: "take_card" });

    assert.equal(p1.cards.length, 1);
  });

  it("takes the current card and pile counters, then reveals with the same player active", () => {
    const { room, p1, p2, p3 } = makeStartedRoom();
    const firstCard = room.currentCard;

    applyAction(room, p1, { type: "pass_card" });
    applyAction(room, p2, { type: "pass_card" });
    applyAction(room, p3, { type: "take_card" });

    assert.deepEqual(p3.cards, [firstCard]);
    assert.equal(p3.counters, 13);
    assert.notEqual(room.currentCard, firstCard);
    assert.equal(room.cardCounters, 0);
    assert.equal(room.currentTurnToken, p3.token);
  });

  it("ends after the last card is taken", () => {
    const { room, p1 } = makeStartedRoom();
    room.currentCard = 35;
    room.deck = [];

    applyAction(room, p1, { type: "take_card" });

    assert.equal(room.status, "finished");
    assert.equal(room.currentCard, null);
    assert.equal(room.currentTurnToken, null);
    assert.ok(room.winners.length >= 1);
  });

  it("scores only the lowest card in each run and subtracts counters", () => {
    const player = {
      token: "p1",
      name: "P1",
      counters: 4,
      cards: [13, 15, 16, 14, 22, 24, 25],
    };

    assert.deepEqual(scorePlayer(player), {
      cardScore: 59,
      finalScore: 55,
    });
  });

  it("shows all counter counts during play and final scoring", () => {
    const { room, p1, p2 } = makeStartedRoom();

    const p1View = viewFor(room, p1.token, ACTIVE);
    const p2InP1View = p1View.players.find((player) => player.token === p2.token);
    assert.equal(p1View.you.counters, 11);
    assert.equal(p2InP1View.counters, 11);
    assert.equal(p2InP1View.counterCountHidden, false);

    room.currentCard = 35;
    room.deck = [];
    applyAction(room, p1, { type: "take_card" });

    const finalView = viewFor(room, p1.token, ACTIVE);
    const finalP2 = finalView.players.find((player) => player.token === p2.token);
    assert.equal(typeof finalP2.counters, "number");
    assert.equal(finalP2.counterCountHidden, false);
    assert.equal(typeof finalP2.finalScore, "number");
  });
});

function assertCounters(tokens, expected) {
  const setup = makeRoom(tokens);
  applyAction(setup.room, setup[tokens[0]], { type: "start_game" });

  assert.deepEqual(
    setup.room.players.map((player) => player.counters),
    Array.from({ length: tokens.length }, () => expected),
  );
}

function makeStartedRoom(tokens = ["p1", "p2", "p3"]) {
  const setup = makeRoom(tokens);
  applyAction(setup.room, setup[tokens[0]], { type: "start_game" });
  return setup;
}

function makeRoom(tokens) {
  const first = makePlayer(tokens[0]);
  const room = createWaitingRoom("ROOM", first);
  for (const token of tokens.slice(1)) {
    upsertPlayer(room, makePlayer(token));
  }

  const byToken = Object.fromEntries(room.players.map((player) => [player.token, player]));
  return { room, ...byToken };
}

function makePlayer(token) {
  return { token, name: token.toUpperCase() };
}
