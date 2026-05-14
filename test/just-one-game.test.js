import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAction,
  createWaitingRoom,
  upsertPlayer,
  viewFor,
} from "../src/games/just-one/game.js";

const ACTIVE = new Set(["p1", "p2", "p3"]);

describe("Just One rules", () => {
  it("requires the official 3-7 player range to start", () => {
    const { room, p1 } = makeRoom(["p1", "p2"]);

    assert.throws(() => applyAction(room, p1, { type: "start_game" }), /3-7 players/);
  });

  it("hides the mystery word from the active player", () => {
    const { room, p1 } = makeStartedRoom();

    assert.equal(room.phase, "selecting_word");
    assert.equal(viewFor(room, "p1", ACTIVE).card, null);
    assert.deepEqual(viewFor(room, "p2", ACTIVE).card, room.card);
    applyAction(room, p1, { type: "choose_number", number: 1 });
    assert.equal(viewFor(room, "p1", ACTIVE).word, null);
    assert.equal(viewFor(room, "p2", ACTIVE).word, room.word);
  });

  it("moves directly to guessing after canceling duplicate clues", () => {
    const { room, p1, p2, p3, p4, p5 } = makeStartedRoom(["p1", "p2", "p3", "p4", "p5"]);

    applyAction(room, p1, { type: "choose_number", number: 2 });
    applyAction(room, p2, { type: "submit_clue", clue: "cold" });
    applyAction(room, p3, { type: "submit_clue", clue: " Cold! " });
    applyAction(room, p4, { type: "submit_clue", clue: "snow" });
    applyAction(room, p5, { type: "submit_clue", clue: "winter" });

    const activeView = viewFor(room, "p1", ACTIVE);
    const teammateView = viewFor(room, "p2", ACTIVE);
    assert.equal(room.phase, "guessing");
    assert.deepEqual(
      activeView.clues.map((clue) => clue.text),
      ["snow", "winter"],
    );
    assert.equal(teammateView.clues.length, 4);
    assert.equal(teammateView.clues.filter((clue) => clue.eliminated).length, 2);
  });

  it("uses the official two-clue variant with 3-4 players", () => {
    const { room, p1, p2, p3 } = makeStartedRoom();

    applyAction(room, p1, { type: "choose_number", number: 3 });
    assert.equal(viewFor(room, "p2", ACTIVE).cluesPerPlayer, 2);

    applyAction(room, p2, { type: "submit_clue", clue: "blue" });
    applyAction(room, p3, { type: "submit_clue", clue: "sky" });
    assert.equal(room.phase, "writing_clues");

    applyAction(room, p2, { type: "submit_clue", clue: "bird" });
    applyAction(room, p3, { type: "submit_clue", clue: "cloud" });
    assert.equal(room.phase, "guessing");
    assert.equal(viewFor(room, "p1", ACTIVE).clues.length, 4);
  });

  it("scores correct guesses and advances to the next active player", () => {
    const { room, p1, p2, p3 } = makeStartedRoom();

    applyAction(room, p1, { type: "choose_number", number: 1 });
    submitUniqueClues(room, p2, p3);
    applyAction(room, p1, { type: "submit_guess", guess: room.word });
    assert.equal(room.phase, "checking_guess");
    assert.equal(viewFor(room, "p1", ACTIVE).word, room.word);
    assert.throws(
      () => applyAction(room, p1, { type: "resolve_guess", result: "correct" }),
      /teammate checks/,
    );

    applyAction(room, p2, { type: "resolve_guess", result: "correct" });

    assert.equal(room.score, 1);
    assert.equal(room.round, 2);
    assert.equal(room.activePlayerToken, "p2");
    assert.equal(room.phase, "selecting_word");
  });

  it("passes for no points and wrong guesses lose one extra deck card", () => {
    const { room, p1, p2, p3 } = makeStartedRoom();
    room.score = 2;

    applyAction(room, p1, { type: "choose_number", number: 1 });
    submitUniqueClues(room, p2, p3);
    applyAction(room, p1, { type: "submit_guess", pass: true });
    assert.equal(room.score, 2);

    const remainingBeforeWrongTurn = room.deck.length + 1;
    applyAction(room, p2, { type: "choose_number", number: 1 });
    applyAction(room, p1, { type: "submit_clue", clue: "orange" });
    applyAction(room, p1, { type: "submit_clue", clue: "round" });
    applyAction(room, p3, { type: "submit_clue", clue: "fruit" });
    applyAction(room, p3, { type: "submit_clue", clue: "peel" });
    applyAction(room, p2, { type: "submit_guess", guess: "miss" });
    applyAction(room, p1, { type: "resolve_guess", result: "wrong" });
    assert.equal(room.score, 2);
    assert.equal(room.deck.length + (room.card ? 1 : 0), remainingBeforeWrongTurn - 2);
  });
});

function makeStartedRoom(tokens = ["p1", "p2", "p3"]) {
  const setup = makeRoom(tokens);
  applyAction(setup.room, setup[tokens[0]], { type: "start_game" });
  setup.room.activePlayerIndex = 0;
  setup.room.activePlayerToken = tokens[0];
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

function submitUniqueClues(room, p2, p3) {
  applyAction(room, p2, { type: "submit_clue", clue: "blue" });
  applyAction(room, p2, { type: "submit_clue", clue: "bird" });
  applyAction(room, p3, { type: "submit_clue", clue: "sky" });
  applyAction(room, p3, { type: "submit_clue", clue: "cloud" });
}
