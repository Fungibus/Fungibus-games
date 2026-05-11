import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyAction, createWaitingRoom, upsertPlayer, viewFor } from "../src/games/decrypto/game.js";

const ACTIVE = new Set(["w1", "w2", "b1", "b2"]);

describe("Decrypto rules", () => {
  it("does not enforce team-size limits before starting", () => {
    const { room, w1 } = makeRoom([
      ["w1", "white"],
      ["b1", "black"],
      ["b2", "black"],
      ["b3", "black"],
      ["b4", "black"],
      ["b5", "black"],
    ]);

    applyAction(room, w1, { type: "start_game" });

    assert.equal(room.status, "playing");
    assert.equal(room.encryptors.white, "w1");
    assert.equal(room.encryptors.black, "b1");
  });

  it("resets an active game to the team lobby before the next start", () => {
    const { room, w1, b1 } = makeRoom([
      ["w1", "white"],
      ["b1", "black"],
    ]);

    applyAction(room, w1, { type: "start_game" });
    applyAction(room, w1, { type: "reset_game" });

    assert.equal(room.status, "waiting");
    assert.equal(room.phase, "waiting");
    assert.equal(room.round, 0);
    assert.equal(room.encryptors.white, null);
    assert.equal(room.encryptors.black, null);
    assert.deepEqual(room.teams.white.words, []);
    assert.deepEqual(room.turns.white, null);

    applyAction(room, w1, { type: "set_player", name: "W1", team: "black" });
    applyAction(room, b1, { type: "set_player", name: "B1", team: "white" });
    applyAction(room, w1, { type: "start_game" });

    assert.equal(room.status, "playing");
    assert.equal(room.players.find((player) => player.token === "w1").team, "black");
    assert.equal(room.players.find((player) => player.token === "b1").team, "white");
    assert.equal(room.encryptors.black, "w1");
    assert.equal(room.encryptors.white, "b1");
  });

  it("auto-rotates one Encryptor per team each round", () => {
    const { room, w1, w2, b1, b2 } = makeRoom();

    applyAction(room, w1, { type: "start_game" });
    assert.equal(room.encryptors.white, "w1");
    assert.equal(room.encryptors.black, "b1");

    submitRoundOneClues(room, w1, b1);
    room.turns.white.code = [1, 2, 3];
    room.turns.black.code = [1, 2, 3];

    applyAction(room, w2, { type: "submit_guess", targetTeam: "white", guess: [1, 2, 3] });
    applyAction(room, b2, { type: "submit_guess", targetTeam: "black", guess: [1, 2, 3] });

    assert.equal(room.round, 2);
    assert.equal(room.phase, "clues");
    assert.equal(room.encryptors.white, "w2");
    assert.equal(room.encryptors.black, "b2");
  });

  it("only lets assigned Encryptors see codes and submit clues", () => {
    const { room, w1, w2, b1 } = makeStartedRoom();
    room.turns.white.code = [4, 2, 1];

    const encryptorView = viewFor(room, "w1", ACTIVE);
    const teammateView = viewFor(room, "w2", ACTIVE);

    assert.deepEqual(encryptorView.turns.white.code, [4, 2, 1]);
    assert.deepEqual(teammateView.turns.white.code, [null, null, null]);
    assert.equal(encryptorView.you.isEncryptor, true);
    assert.equal(teammateView.you.isEncryptor, false);

    assert.throws(
      () => applyAction(room, w2, { type: "submit_clues", clues: ["a", "b", "c"] }),
      /Only your team's Encryptor/,
    );

    applyAction(room, w1, { type: "submit_clues", clues: ["alpha", "bravo", "charlie"] });
    assert.equal(room.phase, "clues");
    assert.deepEqual(viewFor(room, "w2", ACTIVE).turns.white.clues, ["", "", ""]);

    applyAction(room, b1, { type: "submit_clues", clues: ["delta", "echo", "foxtrot"] });
    assert.equal(room.phase, "white_guess");
    assert.deepEqual(viewFor(room, "w2", ACTIVE).turns.white.clues, [
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("blocks the Encryptor from decoding their own clues", () => {
    const { room, w1, b1 } = makeStartedRoom();
    submitRoundOneClues(room, w1, b1);

    assert.throws(
      () => applyAction(room, w1, { type: "submit_guess", targetTeam: "white", guess: [1, 2, 3] }),
      /Encryptor cannot decode/,
    );
  });

  it("does not allow first-round interceptions", () => {
    const { room, w1, b1 } = makeStartedRoom();
    submitRoundOneClues(room, w1, b1);

    assert.throws(
      () => applyAction(room, b1, { type: "submit_guess", targetTeam: "white", guess: [1, 2, 3] }),
      /Interceptions start in round 2/,
    );
  });

  it("resolves White before Black and scores revealed codes", () => {
    const { room, w1, w2, b1, b2 } = makeStartedRoom();
    submitRoundOneClues(room, w1, b1);
    room.turns.white.code = [1, 2, 3];
    room.turns.black.code = [2, 3, 4];

    applyAction(room, w2, { type: "submit_guess", targetTeam: "white", guess: [1, 3, 2] });

    assert.equal(room.phase, "black_guess");
    assert.equal(room.activeTeam, "black");
    assert.equal(room.teams.white.miscues, 1);
    assert.equal(room.status, "playing");

    applyAction(room, b2, { type: "submit_guess", targetTeam: "black", guess: [2, 3, 4] });

    assert.equal(room.round, 2);
    assert.equal(room.phase, "clues");
    assert.equal(room.teams.black.miscues, 0);
  });

  it("delays game end until both teams reveal and supports tied end states", () => {
    const { room, w1, w2, b1, b2 } = makeStartedRoom();
    room.round = 2;
    room.teams.white.miscues = 1;
    room.teams.black.miscues = 1;
    room.turns.white.code = [1, 2, 3];
    room.turns.black.code = [2, 3, 4];

    submitRoundOneClues(room, w1, b1);

    applyAction(room, b1, { type: "submit_guess", targetTeam: "white", guess: [2, 1, 3] });
    applyAction(room, w2, { type: "submit_guess", targetTeam: "white", guess: [1, 3, 2] });

    assert.equal(room.status, "playing");
    assert.equal(room.teams.white.miscues, 2);
    assert.equal(room.phase, "black_guess");

    applyAction(room, w1, { type: "submit_guess", targetTeam: "black", guess: [3, 2, 4] });
    applyAction(room, b2, { type: "submit_guess", targetTeam: "black", guess: [2, 4, 3] });

    assert.equal(room.status, "finished");
    assert.equal(room.winner, "tie");
  });
});

function makeStartedRoom() {
  const setup = makeRoom();
  applyAction(setup.room, setup.w1, { type: "start_game" });
  return setup;
}

function makeRoom(players = [
  ["w1", "white"],
  ["w2", "white"],
  ["b1", "black"],
  ["b2", "black"],
]) {
  const first = makePlayer(...players[0]);
  const room = createWaitingRoom("ROOM", first);
  for (const item of players.slice(1)) {
    upsertPlayer(room, makePlayer(...item));
  }

  const byToken = Object.fromEntries(room.players.map((player) => [player.token, player]));
  return { room, ...byToken };
}

function makePlayer(token, team) {
  return { token, name: token.toUpperCase(), team };
}

function submitRoundOneClues(room, whiteEncryptor, blackEncryptor) {
  applyAction(room, whiteEncryptor, {
    type: "submit_clues",
    clues: ["white one", "white two", "white three"],
  });
  applyAction(room, blackEncryptor, {
    type: "submit_clues",
    clues: ["black one", "black two", "black three"],
  });
}
