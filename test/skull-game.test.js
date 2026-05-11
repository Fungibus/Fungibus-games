import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyAction, createWaitingRoom, upsertPlayer, viewFor } from "../src/games/skull/game.js";

const ACTIVE = new Set(["p1", "p2", "p3"]);

describe("Skull rules", () => {
  it("requires the official 3-6 player range to start", () => {
    const { room, p1 } = makeRoom(["p1", "p2"]);

    assert.throws(() => applyAction(room, p1, { type: "start_game" }), /3-6 players/);
  });

  it("moves from opening placement into add-or-bid turns", () => {
    const setup = makeStartedRoom();
    const { room, p1, p2, p3 } = setup;

    playKind(room, p1, "flower");
    playKind(room, p2, "flower");
    assert.equal(room.phase, "placement");

    playKind(room, p3, "flower");
    assert.equal(room.phase, "adding");
    assert.equal(room.currentTurnToken, "p1");
  });

  it("resolves an auction after all other players pass", () => {
    const { room, p1, p2, p3 } = makePlacedRoom();

    applyAction(room, p1, { type: "start_bid", count: 2 });
    assert.equal(room.phase, "bidding");
    assert.equal(room.currentTurnToken, "p2");

    applyAction(room, p2, { type: "pass_bid" });
    applyAction(room, p3, { type: "pass_bid" });

    assert.equal(room.phase, "revealing");
    assert.equal(room.currentTurnToken, "p1");
    assert.equal(room.attempt.challengerToken, "p1");
  });

  it("forces the challenger to reveal their own stack before opponent stacks", () => {
    const { room, p1, p2, p3 } = makePlacedRoom();
    playKind(room, p1, "flower");

    applyAction(room, p2, { type: "start_bid", count: 2 });
    applyAction(room, p3, { type: "pass_bid" });
    applyAction(room, p1, { type: "pass_bid" });

    assert.equal(room.phase, "revealing");
    assert.throws(
      () => applyAction(room, p2, { type: "reveal_disc", ownerToken: "p1" }),
      /own stack first/,
    );

    applyAction(room, p2, { type: "reveal_disc", ownerToken: "p2" });
    applyAction(room, p2, { type: "reveal_disc", ownerToken: "p1" });

    assert.equal(room.phase, "placement");
    assert.equal(p2.wins, 1);
  });

  it("makes the skull owner choose a lost challenger disc after a failed challenge", () => {
    const { room, p1, p2, p3 } = makePlacedRoom({ p2: "skull" });

    applyAction(room, p1, { type: "start_bid", count: 2 });
    applyAction(room, p2, { type: "pass_bid" });
    applyAction(room, p3, { type: "pass_bid" });
    applyAction(room, p1, { type: "reveal_disc", ownerToken: "p1" });
    applyAction(room, p1, { type: "reveal_disc", ownerToken: "p2" });

    assert.equal(room.phase, "choosing_loss");
    assert.equal(room.currentTurnToken, "p2");
    assert.equal(room.loss.challengerToken, "p1");

    const p2View = viewFor(room, "p2", ACTIVE);
    assert.equal(p2View.loss.options.length, 4);
    assert.equal(p2View.loss.options.some((option) => option.kind), false);

    applyAction(room, p2, { type: "choose_loss", optionId: room.loss.options[0].id });

    assert.equal(allCards(p1), 3);
    assert.equal(room.phase, "placement");
    assert.equal(room.firstPlayerToken, "p1");
  });

  it("finishes when a player completes two successful challenges", () => {
    const { room, p1, p2, p3 } = makePlacedRoom();

    p1.wins = 1;
    applyAction(room, p1, { type: "start_bid", count: 1 });
    applyAction(room, p2, { type: "pass_bid" });
    applyAction(room, p3, { type: "pass_bid" });
    applyAction(room, p1, { type: "reveal_disc", ownerToken: "p1" });

    assert.equal(room.status, "finished");
    assert.equal(room.winner.token, "p1");
  });
});

function makeStartedRoom(tokens = ["p1", "p2", "p3"]) {
  const setup = makeRoom(tokens);
  applyAction(setup.room, setup[tokens[0]], { type: "start_game" });
  return setup;
}

function makePlacedRoom(kinds = {}) {
  const setup = makeStartedRoom();
  const { room, p1, p2, p3 } = setup;
  playKind(room, p1, kinds.p1 || "flower");
  playKind(room, p2, kinds.p2 || "flower");
  playKind(room, p3, kinds.p3 || "flower");
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

function playKind(room, player, kind) {
  const card = player.hand.find((item) => item.kind === kind);
  assert.ok(card, `${player.token} has ${kind}`);
  applyAction(room, player, { type: "play_disc", cardId: card.id });
}

function allCards(player) {
  return player.hand.length + player.stack.length;
}
