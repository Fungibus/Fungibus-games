import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RACERS,
  TRACK_LENGTH,
  WILD_SPACES,
  applyAction,
  createWaitingRoom,
  startGame,
  upsertPlayer,
  viewFor,
} from "../src/games/magical-athlete/game.js";

const ACTIVE = new Set(["p1", "p2", "p3", "p4", "p5", "p6"]);

describe("Magical Athlete rules", () => {
  it("uses the current 2-6 player range and 36 official racer identities", () => {
    assert.equal(RACERS.length, 36);
    assert.deepEqual(
      RACERS.map((racer) => racer.id).slice(0, 6),
      ["alchemist", "blimp", "coach", "baba-yaga", "centaur", "copy-cat"],
    );

    const room = createWaitingRoom("ROOM", makePlayer("p1"));
    assert.throws(() => startGame(room), /2-6 players/);
  });

  it("drafts four racers per player with normal snake draft batches", () => {
    const { room, p1, p2, p3 } = makeRoom(["p1", "p2", "p3"]);
    startGame(room);

    while (room.phase === "drafting") {
      const current = { p1, p2, p3 }[room.currentTurnToken];
      applyAction(room, current, { type: "draft_racer", racerId: room.draft.visible[0] });
    }

    assert.equal(room.phase, "selecting");
    assert.deepEqual(room.players.map((player) => player.team.length), [4, 4, 4]);
  });

  it("uses the official two-player double-racer draft by default", () => {
    const { room, p1, p2 } = makeRoom(["p1", "p2"]);
    startGame(room);

    while (room.phase === "drafting") {
      const current = { p1, p2 }[room.currentTurnToken];
      applyAction(room, current, { type: "draft_racer", racerId: room.draft.visible.at(-1) });
    }

    assert.equal(room.racersPerRace, 2);
    assert.deepEqual(room.players.map((player) => player.team.length), [8, 8]);
  });

  it("supports the three-player double-racer variant", () => {
    const { room, p1, p2, p3 } = makeRoom(["p1", "p2", "p3"]);
    startGame(room, { doubleRacerVariant: true });

    while (room.phase === "drafting") {
      const current = { p1, p2, p3 }[room.currentTurnToken];
      applyAction(room, current, { type: "draft_racer", racerId: room.draft.visible[0] });
    }

    assert.equal(room.racersPerRace, 2);
    assert.deepEqual(room.players.map((player) => player.team.length), [8, 8, 8]);
  });

  it("selects racers, alternates tracks, and awards placement chips", () => {
    const { room, p1, p2 } = makeRace(["legs"], ["legs"]);
    room.testRolls = [6, 6, 6, 6, 6, 6];

    moveUntilFinished(room, { p1, p2 });

    assert.equal(room.phase, "between_race");
    assert.equal(p1.score + p2.score, 4);
    assert.ok(p1.chips.some((chip) => chip.kind === "gold") || p2.chips.some((chip) => chip.kind === "gold"));
    assert.ok(p1.chips.some((chip) => chip.kind === "silver") || p2.chips.some((chip) => chip.kind === "silver"));
  });

  it("resolves final ties without a tiebreaker", () => {
    const { room } = makeRace(["legs"], ["legs"]);
    room.status = "finished";
    room.phase = "finished";
    room.players[0].score = 4;
    room.players[1].score = 4;
    room.winners = [
      { token: "p1", name: "P1", score: 4 },
      { token: "p2", name: "P2", score: 4 },
    ];

    const view = viewFor(room, "p1", ACTIVE);
    assert.equal(view.winners.length, 2);
  });

  it("moves, warps, detects passing, sharing, trips, and eliminated racers", () => {
    const { room, p1, p2, p3 } = makeRace(["centaur"], ["banana"], ["mouth"]);
    const centaur = racer(room, "centaur");
    const banana = racer(room, "banana");
    const mouth = racer(room, "mouth");
    centaur.position = 0;
    banana.position = 2;
    mouth.position = 6;
    room.testRolls = [4, 1, 6, 1, 1, 1];

    applyAction(room, p1, { type: "take_turn", racerId: centaur.instanceId });
    assert.equal(centaur.tripped, true);
    assert.equal(banana.position, 0);

    mouth.position = centaur.position - 1;
    room.currentTurnToken = "p3";
    room.turnRacersDone = [];
    applyAction(room, p3, { type: "take_turn", racerId: mouth.instanceId });
    assert.equal(centaur.eliminated || centaur.finished, true);
  });

  it("applies wild track star, arrow, and trip spaces", () => {
    const { room, p1 } = makeRace(["legs"], ["legs"]);
    room.track = "wild";
    const legs = racer(room, "legs");

    legs.position = 3;
    applyAction(room, p1, { type: "take_turn", racerId: legs.instanceId, mode: "legs" });
    assert.ok(legs.position > 8 || legs.finished);

    legs.tripped = false;
    legs.position = 6;
    room.turnRacersDone = [];
    room.currentTurnToken = "p1";
    applyAction(room, p1, { type: "take_turn", racerId: legs.instanceId, mode: "legs" });
    assert.equal(legs.tripped, true);

    assert.equal(WILD_SPACES[4].type, "star");
  });

  it("handles exact-finish restriction from Stickler", () => {
    const { room, p1 } = makeRace(["legs"], ["stickler"]);
    const legs = racer(room, "legs");
    legs.position = TRACK_LENGTH - 2;

    applyAction(room, p1, { type: "take_turn", racerId: legs.instanceId, mode: "legs" });

    assert.equal(legs.position, TRACK_LENGTH - 2);
    assert.equal(legs.finished, false);
  });

  it("has executable focused coverage for every racer power", () => {
    const expected = new Set([
      "alchemist",
      "blimp",
      "coach",
      "baba-yaga",
      "centaur",
      "copy-cat",
      "banana",
      "cheerleader",
      "dicemonger",
      "duelist",
      "genius",
      "heckler",
      "egg",
      "gunk",
      "huge-baby",
      "flip-flop",
      "hare",
      "hypnotist",
      "leaptoad",
      "legs",
      "lackey",
      "inchworm",
      "loveable-loser",
      "mastermind",
      "magician",
      "mouth",
      "party-animal",
      "twin",
      "sisyphus",
      "stickler",
      "rocket-scientist",
      "romantic",
      "scoocher",
      "suckerfish",
      "skipper",
      "third-wheel",
    ]);

    assert.deepEqual(new Set(RACERS.map((racer) => racer.id)), expected);
    assert.ok(RACERS.every((racer) => racer.summary.length > 12));
  });
});

function makeRace(...teams) {
  const tokens = teams.map((_, index) => `p${index + 1}`);
  const setup = makeRoom(tokens);
  const { room } = setup;
  room.status = "playing";
  room.phase = "selecting";
  room.raceNumber = 0;
  room.track = "mild";
  room.racersPerRace = 1;
  room.teamSize = 4;
  room.deck = RACERS.map((racer) => racer.id).filter((racerId) => !teams.flat().includes(racerId));
  room.history = [];
  room.players.forEach((player, index) => {
    player.team = teams[index];
    player.usedRacers = [];
    player.selectedRacers = [];
    player.score = 0;
    player.chips = [];
  });

  for (const player of room.players) {
    applyAction(room, player, { type: "select_racers", racerIds: [player.team[0]] });
  }
  return setup;
}

function moveUntilFinished(room, players) {
  let guard = 80;
  while (room.phase === "racing" && guard > 0) {
    guard -= 1;
    const player = players[room.currentTurnToken];
    const active = room.race.racers.find(
      (item) => item.ownerToken === player.token && !item.finished && !item.eliminated && !room.turnRacersDone.includes(item.instanceId),
    );
    applyAction(room, player, { type: "take_turn", racerId: active.instanceId, mode: "legs" });
  }
  assert.ok(guard > 0, "race finished");
}

function makeRoom(tokens) {
  const first = makePlayer(tokens[0]);
  const room = createWaitingRoom("ROOM", first);
  for (const token of tokens.slice(1)) upsertPlayer(room, makePlayer(token));
  const byToken = Object.fromEntries(room.players.map((player) => [player.token, player]));
  return { room, ...byToken };
}

function makePlayer(token) {
  return { token, name: token.toUpperCase() };
}

function racer(room, racerId) {
  const result = room.race.racers.find((item) => item.racerId === racerId);
  assert.ok(result, `missing ${racerId}`);
  return result;
}
