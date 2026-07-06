"use strict";

const canvas = document.querySelector("#worldCanvas");
const ctx = canvas.getContext("2d");

const refs = {
  startButton: document.querySelector("#startButton"),
  continueButton: document.querySelector("#continueButton"),
  restartButton: document.querySelector("#restartButton"),
  pauseButton: document.querySelector("#pauseButton"),
  newRunButton: document.querySelector("#newRunButton"),
  soundButton: document.querySelector("#soundButton"),
  titleOverlay: document.querySelector("#titleOverlay"),
  endOverlay: document.querySelector("#endOverlay"),
  relicOverlay: document.querySelector("#relicOverlay"),
  relicChoices: document.querySelector("#relicChoices"),
  relicText: document.querySelector("#relicText"),
  endKicker: document.querySelector("#endKicker"),
  endHeading: document.querySelector("#endHeading"),
  endText: document.querySelector("#endText"),
  endStats: document.querySelector("#endStats"),
  toast: document.querySelector("#statusToast"),
  chargeMeter: document.querySelector("#chargeMeter"),
  tensionMeter: document.querySelector("#tensionMeter"),
  beamStatus: document.querySelector("#beamStatus"),
  beamMeter: document.querySelector("#beamMeter"),
  beamButton: document.querySelector("#beamButton"),
  catchCard: document.querySelector("#catchCard"),
  catchGrade: document.querySelector("#catchGrade"),
  catchName: document.querySelector("#catchName"),
  catchStats: document.querySelector("#catchStats"),
  catchLore: document.querySelector("#catchLore"),
  stormValue: document.querySelector("#stormValue"),
  lightValue: document.querySelector("#lightValue"),
  salvageValue: document.querySelector("#salvageValue"),
  hopeValue: document.querySelector("#hopeValue"),
  phaseTag: document.querySelector("#phaseTag"),
  depthTag: document.querySelector("#depthTag"),
  writTitle: document.querySelector("#writTitle"),
  writText: document.querySelector("#writText"),
  writReward: document.querySelector("#writReward"),
  writProgressText: document.querySelector("#writProgressText"),
  writProgressMeter: document.querySelector("#writProgressMeter"),
  seaStateName: document.querySelector("#seaStateName"),
  seaStateTag: document.querySelector("#seaStateTag"),
  seaStateText: document.querySelector("#seaStateText"),
  seaStateEffects: document.querySelector("#seaStateEffects"),
  baitName: document.querySelector("#baitName"),
  baitTag: document.querySelector("#baitTag"),
  baitText: document.querySelector("#baitText"),
  baitOptions: document.querySelector("#baitOptions"),
  echoList: document.querySelector("#echoList"),
  storyLine: document.querySelector("#storyLine"),
  upgradeList: document.querySelector("#upgradeList"),
  journalList: document.querySelector("#journalList"),
  logbook: document.querySelector("#logbook"),
  catchCount: document.querySelector("#catchCount"),
};

const saveKey = "fishing-at-the-end-of-the-world-save-v1";
const finalStormDays = 7;
const dayLength = 150;
const maxFish = 18;
const waterHue = {
  surface: "#315e6b",
  middle: "#1f4354",
  deep: "#142b39",
};

const echoes = [
  { id: "bell", name: "Bell Echo", hint: "Caught from ringing scales near dusk." },
  { id: "lantern", name: "Lantern Echo", hint: "Seen only when the lighthouse beam is charged." },
  { id: "crown", name: "Crown Echo", hint: "Waits below the cold tide line." },
  { id: "heart", name: "Heart Echo", hint: "Answers a hopeful pier." },
];

const species = [
  {
    id: "ash-minnow",
    name: "Ash Minnow",
    tone: "#c4c9b8",
    depth: [0.08, 0.35],
    size: 10,
    value: 4,
    hope: 1,
    rarity: 1,
    speed: 34,
    bite: 0.78,
    stamina: 0.46,
    habitat: "Surface",
    lore: "Ash Minnows gather around warm pilings after each failed sunrise.",
    hint: "Common near the pier lights.",
  },
  {
    id: "glass-eel",
    name: "Glass Eel",
    tone: "#a7e2e5",
    depth: [0.2, 0.52],
    size: 13,
    value: 7,
    hope: 2,
    rarity: 0.8,
    speed: 52,
    bite: 0.62,
    stamina: 0.58,
    habitat: "Surface / Middle",
    lore: "Glass Eels flash like cracked windows when the line passes overhead.",
    hint: "Look for fast pale shapes in shallow water.",
  },
  {
    id: "rust-flounder",
    name: "Rust Flounder",
    tone: "#b8865d",
    depth: [0.5, 0.9],
    size: 18,
    value: 10,
    hope: 2,
    rarity: 0.62,
    speed: 22,
    bite: 0.5,
    stamina: 0.7,
    habitat: "Deep",
    lore: "Rust Flounders sleep under anchor chains and wake for heavy lures.",
    hint: "Let the lure sink close to the seabed.",
  },
  {
    id: "choir-cod",
    name: "Choir Cod",
    tone: "#d9ca8b",
    depth: [0.3, 0.68],
    size: 20,
    value: 14,
    hope: 3,
    rarity: 0.44,
    speed: 30,
    bite: 0.48,
    stamina: 0.82,
    habitat: "Middle",
    lore: "Choir Cod hum through their ribs, keeping time for the drowned bells.",
    hint: "Steady casts through the middle tide draw them out.",
  },
  {
    id: "cinder-ray",
    name: "Cinder Ray",
    tone: "#ef826c",
    depth: [0.62, 0.95],
    size: 27,
    value: 20,
    hope: 4,
    rarity: 0.28,
    speed: 26,
    bite: 0.38,
    stamina: 1,
    habitat: "Deep",
    lore: "Cinder Rays carry embers from the last dry hearth under their wings.",
    hint: "Deep water and stronger line reveal their glow.",
  },
  {
    id: "mourning-bell",
    name: "Mourning Bell",
    tone: "#f0c66a",
    depth: [0.38, 0.74],
    size: 24,
    value: 34,
    hope: 8,
    rarity: 0.12,
    speed: 25,
    bite: 0.34,
    stamina: 1.18,
    echo: "bell",
    habitat: "Middle / Deep",
    lore: "The Mourning Bell rings once inside the hook before the lighthouse answers.",
    hint: "Omen fish answer dusk, lantern fog, and patient reeling.",
  },
  {
    id: "lantern-whale",
    name: "Lantern Whale",
    tone: "#aaf4dd",
    depth: [0.68, 0.98],
    size: 34,
    value: 48,
    hope: 10,
    rarity: 0.08,
    speed: 18,
    bite: 0.28,
    stamina: 1.48,
    echo: "lantern",
    habitat: "Deep",
    lore: "The Lantern Whale is smaller than its name and brighter than the moon it ate.",
    hint: "Upgrade pier lanterns and search the deepest tide.",
  },
  {
    id: "black-crown",
    name: "Black Crown",
    tone: "#d7c2ff",
    depth: [0.72, 0.99],
    size: 31,
    value: 54,
    hope: 12,
    rarity: 0.065,
    speed: 32,
    bite: 0.24,
    stamina: 1.6,
    echo: "crown",
    habitat: "Deep",
    lore: "The Black Crown swims upside down beneath storms that have learned names.",
    hint: "Upgrade line strength before challenging the cold tide line.",
  },
  {
    id: "world-heart",
    name: "World Heart",
    tone: "#ff9fa2",
    depth: [0.46, 0.86],
    size: 30,
    value: 60,
    hope: 16,
    rarity: 0.05,
    speed: 24,
    bite: 0.2,
    stamina: 1.72,
    echo: "heart",
    habitat: "Middle / Deep",
    lore: "The World Heart beats only when enough hope remains to hear it.",
    hint: "Restore earlier echoes and keep hope alive.",
  },
  {
    id: "last-dawn",
    name: "Last Dawn",
    tone: "#fff0a8",
    depth: [0.18, 0.98],
    size: 46,
    value: 120,
    hope: 30,
    rarity: 1,
    speed: 20,
    bite: 0.18,
    stamina: 2.25,
    finale: true,
    habitat: "All depths",
    lore: "The Last Dawn is not a fish, but the shape daylight takes when it is afraid to return.",
    hint: "Restore all four living echoes, then focus the lighthouse and cast into the beam.",
  },
];

const upgrades = [
  {
    id: "line",
    name: "Braided Starline",
    description: "Raises break tension and lets you fight heavier omen fish.",
    baseCost: 18,
    max: 4,
  },
  {
    id: "reel",
    name: "Clockwork Reel",
    description: "Pulls fish in faster while adding less tension.",
    baseCost: 16,
    max: 4,
  },
  {
    id: "lantern",
    name: "Pier Lanterns",
    description: "Improves bite chance and reveals rarer shapes in deep water.",
    baseCost: 14,
    max: 4,
  },
  {
    id: "anchor",
    name: "Tide Anchor",
    description: "Reduces current drift and slows the final storm.",
    baseCost: 20,
    max: 3,
  },
];

const writTemplates = [
  {
    id: "feed-the-lamp",
    title: "Feed the lamp",
    text: "Land {target} fish before the next black tide.",
    type: "catches",
    target: (s) => 3 + Math.min(2, completedEchoCountFor(s)),
    reward: (s) => 8 + s.day * 2,
  },
  {
    id: "scrap-for-glass",
    title: "Scrap for glass",
    text: "Earn {target} salvage from the water.",
    type: "salvage",
    target: (s) => 24 + s.day * 6 + completedEchoCountFor(s) * 6,
    reward: (s) => 10 + s.day * 2,
  },
  {
    id: "deep-test",
    title: "Sound the deep",
    text: "Catch {target} fish from the middle or deep tide.",
    type: "deep",
    target: (s) => 2 + Math.min(2, s.upgrades.line),
    reward: (s) => 12 + s.upgrades.line * 4,
  },
  {
    id: "heavy-offering",
    title: "Heavy offering",
    text: "Land one fish weighing at least {target} kg.",
    type: "heavy",
    target: (s) => Math.round((2.8 + s.day * 0.28 + completedEchoCountFor(s) * 0.5) * 10) / 10,
    reward: (s) => 14 + completedEchoCountFor(s) * 6,
  },
];

const seaStates = [
  {
    id: "quiet",
    name: "Quiet Water",
    tag: "Stable",
    text: "The sea almost behaves like water. Small shapes gather near the pier lights.",
    effects: ["Normal bite", "Low strain"],
    bite: 1,
    tension: 0.94,
    value: 1,
    hope: 1,
    current: 0.8,
    storm: 0,
    visual: "quiet",
  },
  {
    id: "lantern-fog",
    name: "Lantern Fog",
    tag: "Rare fish",
    text: "Gold fog rolls from the lighthouse lens and makes omen scales easier to see.",
    effects: ["Better rare bites", "Dim sight"],
    bite: 1.18,
    tension: 1,
    value: 1.04,
    hope: 1.1,
    current: 0.86,
    storm: 0.02,
    visual: "fog",
  },
  {
    id: "glass-current",
    name: "Glass Current",
    tag: "Fast drift",
    text: "The tide turns clear and fast. Fish travel farther, and the line skates sideways.",
    effects: ["Strong current", "More salvage"],
    bite: 0.92,
    tension: 1.08,
    value: 1.18,
    hope: 1,
    current: 1.42,
    storm: 0.06,
    visual: "glass",
  },
  {
    id: "hungry-black",
    name: "Hungry Black",
    tag: "Danger",
    text: "The dark below the pier opens its mouth. Larger fish bite, but the line suffers.",
    effects: ["Hard fights", "High rewards"],
    bite: 1.28,
    tension: 1.22,
    value: 1.28,
    hope: 0.9,
    current: 1.16,
    storm: 0.1,
    visual: "black",
  },
  {
    id: "ash-rain",
    name: "Ash Rain",
    tag: "Bleak",
    text: "Grey rain falls upward from the water. Hope leaks away unless the catch is good.",
    effects: ["Hope penalty", "Soft bites"],
    bite: 0.84,
    tension: 1.04,
    value: 1.08,
    hope: 0.82,
    current: 1,
    storm: 0.14,
    visual: "rain",
  },
];

const baits = [
  {
    id: "quiet-fly",
    name: "Quiet Fly",
    tag: "Safe",
    text: "A feather hook that barely troubles the water. Easier fights, modest rewards.",
    short: "Low strain",
    color: "#dceee8",
    bite: 0.94,
    tension: 0.82,
    value: 0.94,
    rare: 0.82,
    heavy: 0.92,
    sink: 0.86,
  },
  {
    id: "glowworm",
    name: "Grave Glowworm",
    tag: "Omen",
    text: "A small green lamp that calls to impossible fish and makes the line hum.",
    short: "Rare bites",
    color: "#91d68d",
    bite: 1.14,
    tension: 1.05,
    value: 1,
    rare: 1.55,
    heavy: 1,
    sink: 0.96,
  },
  {
    id: "iron-spoon",
    name: "Iron Moon Spoon",
    tag: "Heavy",
    text: "A cold metal lure for deep, valuable fish. It sinks fast and fights hard.",
    short: "High value",
    color: "#f0c66a",
    bite: 0.9,
    tension: 1.18,
    value: 1.24,
    rare: 1.04,
    heavy: 1.28,
    sink: 1.32,
  },
];

const relics = [
  {
    id: "kindled-lens",
    name: "Kindled Lens",
    text: "Beam charge gains are 35% stronger, and focused beam lasts 3 seconds longer.",
  },
  {
    id: "soft-knots",
    name: "Soft Knots",
    text: "Line tension from fish power is reduced by 12%.",
  },
  {
    id: "salt-ledger",
    name: "Salt Ledger",
    text: "Harbor writ rewards are worth 35% more salvage.",
  },
  {
    id: "dawn-hook",
    name: "Dawn Hook",
    text: "Omen and Last Dawn bite pressure is increased.",
  },
  {
    id: "keeper-coal",
    name: "Keeper Coal",
    text: "Every catch restores 1 extra hope and yields 10% more salvage.",
  },
  {
    id: "storm-nail",
    name: "Storm Nail",
    text: "The final storm loses 8% of its pressure on line tension and currents.",
  },
];

let W = 1;
let H = 1;
let dpr = 1;
let waterTop = 1;
let pierY = 1;
let seabed = 1;
let lastNow = performance.now();
let toastTimer = 0;
let savedSnapshot = null;
let audio = null;

const pointer = {
  x: 0,
  y: 0,
  down: false,
  id: null,
};

const keys = new Set();
const particles = [];
const ripples = [];
const stars = Array.from({ length: 90 }, () => ({
  x: Math.random(),
  y: Math.random() * 0.38,
  size: random(0.4, 1.8),
  phase: Math.random() * Math.PI * 2,
}));

let state = createInitialState();

refs.startButton.addEventListener("click", () => {
  resetRun();
  hideTitle();
  showToast("The lighthouse keeper lowers the last hook into the dark.");
  playTone(220, 0.12, "sine", 0.03);
});

refs.continueButton.addEventListener("click", () => {
  if (!savedSnapshot) return;
  state = hydrateState(savedSnapshot);
  hideTitle();
  showToast("The tide remembers your watch.");
});

refs.restartButton.addEventListener("click", () => {
  resetRun();
  refs.endOverlay.hidden = true;
  showToast("A new watch begins.");
});

refs.pauseButton.addEventListener("click", () => {
  if (state.mode === "title" || state.mode === "ended") return;
  state.paused = !state.paused;
  refs.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  showToast(state.paused ? "Paused." : "Back to the pier.");
});

refs.newRunButton.addEventListener("click", () => {
  resetRun();
  hideTitle();
  showToast("The old watch is abandoned. The storm starts counting again.");
});

refs.soundButton.addEventListener("click", async () => {
  await ensureAudio();
  state.sound = !state.sound;
  refs.soundButton.setAttribute("aria-pressed", String(state.sound));
  refs.soundButton.textContent = state.sound ? "Sound On" : "Sound";
  playTone(330, 0.08, "triangle", 0.04);
  saveState();
});

refs.beamButton.addEventListener("click", activateBeam);

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    beginHold();
  }
  if (event.code === "KeyP") {
    refs.pauseButton.click();
  }
  if (event.code === "KeyF") {
    activateBeam();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    endHold();
  }
});

canvas.addEventListener("pointermove", (event) => {
  setPointer(event);
});

canvas.addEventListener("pointerdown", (event) => {
  setPointer(event);
  pointer.down = true;
  pointer.id = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  beginHold();
});

canvas.addEventListener("pointerup", (event) => {
  setPointer(event);
  pointer.down = false;
  pointer.id = null;
  endHold();
});

canvas.addEventListener("pointercancel", () => {
  pointer.down = false;
  pointer.id = null;
  endHold(true);
});

window.addEventListener("beforeunload", saveState);

new ResizeObserver(resizeCanvas).observe(canvas);
savedSnapshot = readSave();
refs.continueButton.disabled = !savedSnapshot;
resizeCanvas();
renderStaticUi();
requestAnimationFrame(tick);

function createInitialState() {
  return {
    mode: "title",
    paused: false,
    sound: false,
    time: 0,
    day: 1,
    storm: finalStormDays,
    hope: 100,
    salvage: 0,
    catches: [],
    seen: {},
    bestiary: {},
    echoes: {},
    upgrades: {
      line: 0,
      reel: 0,
      lantern: 0,
      anchor: 0,
    },
    player: {
      x: 0.42,
      sway: 0,
    },
    lure: createLure(),
    fish: [],
    current: 0,
    wind: 0,
    seaState: "quiet",
    bait: "quiet-fly",
    beamCharge: 0,
    beamTimer: 0,
    finaleActive: false,
    finalCatch: false,
    weatherPulse: 0,
    story: "Cast past the pier lights. Ordinary fish bring salvage; omen fish restore the beam.",
    writ: null,
    journal: [],
    milestones: {},
    relics: [],
    pendingRelics: [],
    stats: {
      bestWeight: 0,
      lost: 0,
      casts: 0,
    },
  };
}

function createLure() {
  return {
    phase: "idle",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    charge: 0,
    chargeDir: 1,
    depth: 0,
    reeling: false,
    hooked: null,
    tension: 0,
    fishDistance: 0,
    fishStamina: 0,
    fightRisk: 0,
    biteCooldown: 0,
    castAge: 0,
  };
}

function resetRun() {
  const sound = state.sound;
  state = createInitialState();
  state.mode = "playing";
  state.sound = sound;
  state.player.x = 0.42;
  state.fish = Array.from({ length: maxFish }, spawnFish);
  state.current = random(-0.18, 0.18);
  state.wind = random(-0.15, 0.15);
  state.seaState = chooseSeaState(state).id;
  state.writ = createWrit(state);
  addJournal("The harbor seals a writ in salt wax. Complete it for extra salvage.", "reward");
  addJournal(`Sea state: ${currentSeaState().name}.`);
  refs.pauseButton.textContent = "Pause";
  saveState();
  renderStaticUi();
}

function hydrateState(saved) {
  const next = createInitialState();
  Object.assign(next, saved);
  next.mode = "playing";
  next.paused = false;
  next.lure = createLure();
  next.fish = Array.from({ length: maxFish }, spawnFish);
  next.player = { ...createInitialState().player, ...saved.player };
  next.upgrades = { ...createInitialState().upgrades, ...saved.upgrades };
  next.stats = { ...createInitialState().stats, ...saved.stats };
  next.bestiary = normalizeBestiary(saved);
  next.seaState = saved.seaState ?? "quiet";
  next.bait = saved.bait ?? "quiet-fly";
  next.beamCharge = saved.beamCharge ?? 0;
  next.beamTimer = 0;
  next.finaleActive = Boolean(saved.finaleActive);
  next.finalCatch = Boolean(saved.finalCatch);
  next.writ = saved.writ ?? createWrit(next);
  next.journal = Array.isArray(saved.journal) ? saved.journal.slice(0, 8) : [];
  next.milestones = saved.milestones ?? {};
  next.relics = Array.isArray(saved.relics) ? saved.relics : [];
  next.pendingRelics = [];
  refs.pauseButton.textContent = "Pause";
  renderStaticUi();
  return next;
}

function hideTitle() {
  state.mode = "playing";
  refs.titleOverlay.hidden = true;
  refs.endOverlay.hidden = true;
  refs.relicOverlay.hidden = true;
  canvas.focus?.();
}

function tick(now) {
  const dt = Math.min((now - lastNow) / 1000, 0.04);
  lastNow = now;

  if (state.mode === "playing" && !state.paused && refs.relicOverlay.hidden) {
    update(dt);
  }

  draw(now / 1000);
  updateHud();
  requestAnimationFrame(tick);
}

function update(dt) {
  state.time += dt;
  state.weatherPulse += dt;
  state.player.sway += dt;
  updateBeam(dt);

  if (state.time >= dayLength) {
    advanceDay();
  }

  updateWeather(dt);
  updatePlayer(dt);
  updateLure(dt);
  updateFish(dt);
  updateParticles(dt);
  maybeSpawnFish();
  checkEnding();

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) refs.toast.classList.remove("is-visible");
  }
}

function advanceDay() {
  state.time -= dayLength;
  state.day += 1;
  const anchorDelay = state.upgrades.anchor >= 3 && state.day % 3 === 0;
  if (!anchorDelay) state.storm -= 1;
  state.hope = clamp(state.hope - 9 + state.upgrades.lantern * 2, 0, 140);
  state.current = random(-0.2, 0.2) + state.storm * 0.015 * Math.sign(random(-1, 1));
  state.wind = random(-0.18, 0.18);
  state.seaState = chooseSeaState(state).id;
  const sea = currentSeaState();
  const seaHopeLoss = Math.round(sea.storm * 20);
  if (seaHopeLoss > 0) {
    state.hope = clamp(state.hope - seaHopeLoss, 0, 140);
  }
  if (state.writ && !state.writ.completed) {
    state.hope = clamp(state.hope - 4, 0, 140);
    addJournal(`Unfinished writ "${state.writ.title}" sinks below the pier. -4 hope.`);
  }
  state.writ = createWrit(state);
  addJournal(`New writ sealed: ${state.writ.title}.`);
  addJournal(`Sea state: ${currentSeaState().name}.`);
  showToast(anchorDelay ? "The Tide Anchor holds the storm offshore for one more night." : "Morning fails to arrive. The storm moves closer.");
  saveState();
  renderStaticUi();
}

function updateWeather(dt) {
  const stormPressure = 1 - state.storm / finalStormDays;
  state.current += Math.sin(state.weatherPulse * 0.18 + state.day) * dt * 0.012;
  const sea = currentSeaState();
  state.current = clamp(
    state.current,
    (-0.36 - stormPressure * 0.18) * sea.current,
    (0.36 + stormPressure * 0.18) * sea.current,
  );
}

function updatePlayer(dt) {
  let dir = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dir -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dir += 1;
  if (dir) {
    state.player.x = clamp(state.player.x + dir * dt * 0.34, 0.08, 0.92);
  }
}

function updateLure(dt) {
  const lure = state.lure;
  const player = playerPoint();

  if (lure.phase === "idle" || lure.phase === "charging") {
    lure.x = player.x;
    lure.y = player.y - 8;
  }

  if (lure.phase === "charging") {
    lure.charge += dt * 0.82 * lure.chargeDir;
    if (lure.charge >= 1) {
      lure.charge = 1;
      lure.chargeDir = -1;
    } else if (lure.charge <= 0.12) {
      lure.charge = 0.12;
      lure.chargeDir = 1;
    }
  }

  if (lure.phase === "flying") {
    lure.castAge += dt;
    lure.vy += 610 * dt;
    lure.vx += state.wind * 12 * dt;
    lure.x += lure.vx * dt;
    lure.y += lure.vy * dt;

    if (lure.y >= waterTop + 10 || lure.castAge > 1.5) {
      splash(lure.x, Math.max(lure.y, waterTop + 10), 18 + lure.charge * 20);
      lure.phase = "water";
      lure.y = clamp(lure.y, waterTop + 12, seabed - 20);
      lure.vx *= 0.18;
      lure.vy = 42;
      lure.biteCooldown = 0.6;
      playTone(130, 0.08, "sine", 0.02);
    }
  }

  if (lure.phase === "water") {
    lure.castAge += dt;
    lure.biteCooldown = Math.max(0, lure.biteCooldown - dt);
    const reeling = lure.reeling;
    const reelPower = 95 + state.upgrades.reel * 24;
    const dx = player.x - lure.x;
    const dy = player.y - lure.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const bait = currentBait();
    const sink = reeling ? -reelPower : (34 + lure.charge * 12) * bait.sink;
    lure.vx += state.current * (22 - state.upgrades.anchor * 4) * dt;
    lure.vy += sink * dt;
    if (reeling) {
      lure.vx += (dx / dist) * reelPower * dt * 4;
      lure.vy += (dy / dist) * reelPower * dt * 3;
    }
    lure.vx *= 0.985;
    lure.vy *= 0.985;
    lure.x += lure.vx * dt;
    lure.y += lure.vy * dt;
    constrainLure();
    tryBite(dt);

    if (dist < 24 && reeling) {
      resetLure();
      showToast("Line recovered. Cast again before the storm finds you.");
    }
  }

  if (lure.phase === "hooked") {
    updateFight(dt);
  }
}

function constrainLure() {
  const lure = state.lure;
  lure.x = clamp(lure.x, 12, W - 12);
  lure.y = clamp(lure.y, waterTop + 14, seabed - 12);
  lure.depth = (lure.y - waterTop) / (seabed - waterTop);
  if (lure.y >= seabed - 13) {
    lure.vy = Math.min(lure.vy, 0);
  }
}

function tryBite(dt) {
  const lure = state.lure;
  if (lure.biteCooldown > 0 || lure.reeling && Math.hypot(lure.vx, lure.vy) > 190) return;
  const sea = currentSeaState();
  const bait = currentBait();
  const beam = beamMultiplier();

  let best = null;
  let bestScore = 0;
  for (const fish of state.fish) {
    if (fish.cooldown > 0) continue;
    const d = Math.hypot(fish.x - lure.x, fish.y - lure.y);
    const attraction = 58 + state.upgrades.lantern * 10 + lure.charge * 14 + (isBeamActive() ? 22 : 0);
    if (d > attraction) continue;
    const depthMatch = 1 - Math.abs(fish.depth - lure.depth);
    const dawnHook = hasRelic("dawn-hook") ? 1.3 : 1;
    const finalBonus = fish.species.finale ? (isBeamActive() ? 3.2 * dawnHook : 0.18) : 1;
    const rareBonus = (fish.species.echo && sea.id === "lantern-fog" ? 1.45 : 1) * (fish.species.echo ? bait.rare * beam.rare * dawnHook : 1);
    const heavyBonus = fish.species.size >= 24 ? bait.heavy : 1;
    const score = (attraction - d) * depthMatch * fish.species.bite * sea.bite * bait.bite * beam.bite * rareBonus * heavyBonus * finalBonus * random(0.7, 1.25);
    if (score > bestScore) {
      bestScore = score;
      best = fish;
    }
  }

  const biteChance = (0.34 + state.upgrades.lantern * 0.055) * sea.bite * bait.bite * beam.bite * (state.finaleActive ? 1.35 : 1) * dt;
  if (best && bestScore > 6 && Math.random() < biteChance) {
    hookFish(best);
  }
}

function hookFish(fish) {
  const lure = state.lure;
  lure.phase = "hooked";
  lure.hooked = fish;
  lure.tension = 0.22 + fish.species.stamina * 0.08;
  lure.fishDistance = Math.hypot(fish.x - playerPoint().x, fish.y - playerPoint().y);
  lure.fishStamina = 0.75 + fish.species.stamina + random(0, 0.28);
  lure.fightRisk = 0;
  lure.vx = 0;
  lure.vy = 0;
  fish.hooked = true;
  fish.cooldown = 2;
  showToast(`${fish.species.name} is on the line.`);
  playTone(196 + fish.species.size * 4, 0.16, "triangle", 0.035);
}

function updateFight(dt) {
  const lure = state.lure;
  const fish = lure.hooked;
  if (!fish) {
    resetLure();
    return;
  }

  const player = playerPoint();
  const sea = currentSeaState();
  const bait = currentBait();
  const beam = beamMultiplier();
  const lineLimit = 1.02 + state.upgrades.line * 0.16;
  const reelSkill = 1 + state.upgrades.reel * 0.16;
  const relicTension = (hasRelic("soft-knots") ? 0.88 : 1) * (hasRelic("storm-nail") ? 0.92 : 1);
  const fishPower = fish.species.stamina * sea.tension * bait.tension * beam.tension * relicTension * (fish.species.finale ? 1.22 : 1) * (0.76 + (finalStormDays - state.storm) * 0.045);
  const struggle = (0.42 + Math.sin(state.time * 3.4 + fish.seed) * 0.22 + Math.random() * 0.14) * fishPower;

  if (lure.reeling) {
    lure.fishDistance -= (42 + 23 * reelSkill) * dt;
    lure.fishStamina -= (0.12 + 0.045 * reelSkill) * dt;
    lure.tension += (0.42 + fishPower * 0.22 - state.upgrades.reel * 0.035) * dt;
  } else {
    lure.fishDistance += struggle * 18 * dt;
    lure.tension -= (0.34 + state.upgrades.line * 0.04) * dt;
    lure.fishStamina -= lure.tension > 0.46 && lure.tension < 0.82 ? 0.06 * dt : 0;
  }

  lure.tension += struggle * dt * 0.18;
  lure.tension = clamp(lure.tension, 0, lineLimit + 0.35);
  if (lure.tension > lineLimit * 0.72) {
    lure.fightRisk += dt * (lure.tension / lineLimit);
  }
  lure.fishDistance = clamp(lure.fishDistance, 6, Math.max(W, H) * 1.2);

  const dx = fish.x - player.x;
  const dy = fish.y - player.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const targetDist = lure.fishDistance;
  fish.x = player.x + (dx / dist) * targetDist;
  fish.y = player.y + (dy / dist) * targetDist;
  fish.x = clamp(fish.x, 14, W - 14);
  fish.y = clamp(fish.y, waterTop + 16, seabed - 18);
  lure.x = fish.x;
  lure.y = fish.y;
  lure.depth = (lure.y - waterTop) / (seabed - waterTop);

  if (lure.tension > lineLimit) {
    loseFish("The line snaps.");
  } else if (lure.fishDistance <= 28 || lure.fishStamina <= 0) {
    catchFish(fish);
  }
}

function catchFish(fish) {
  const spec = fish.species;
  const sea = currentSeaState();
  const bait = currentBait();
  const grade = fightGrade(state.lure.fightRisk);
  const weight = Math.max(0.2, (spec.size * random(0.08, 0.18) + spec.stamina * random(0.6, 1.4)) * bait.heavy);
  const value = Math.round((spec.value * random(0.85, 1.35) + weight * 1.5) * sea.value * bait.value * grade.value * (hasRelic("keeper-coal") ? 1.1 : 1));
  const hope = Math.max(1, Math.round(spec.hope * sea.hope * grade.hope + (hasRelic("keeper-coal") ? 1 : 0)));
  const catchRecord = {
    id: spec.id,
    name: spec.name,
    value,
    hope,
    weight: Number(weight.toFixed(1)),
    echo: spec.echo ?? null,
  };

  state.catches.unshift(catchRecord);
  state.catches = state.catches.slice(0, 18);
  state.seen[spec.id] = (state.seen[spec.id] ?? 0) + 1;
  recordBestiaryCatch(spec, catchRecord.weight);
  state.salvage += value;
  state.hope = clamp(state.hope + hope, 0, 140);
  state.stats.bestWeight = Math.max(state.stats.bestWeight, catchRecord.weight);
  state.beamCharge = clamp(state.beamCharge + (grade.beam + 0.14 + (spec.echo ? 0.34 : 0) + Math.min(0.12, weight * 0.012)) * relicBeamChargeMultiplier(), 0, 1);
  addJournal(`${grade.label} ${spec.name}: ${catchRecord.weight.toFixed(1)} kg, +${value} salvage.`);
  updateWritForCatch(spec, value, catchRecord.weight);

  if (spec.finale) {
    state.finalCatch = true;
    state.story = "The Last Dawn folds into the lighthouse lens. The horizon remembers gold.";
    addJournal("The Last Dawn is landed. The world has a morning again.", "reward");
    showToast("The Last Dawn is caught. Morning returns.");
    showCatchCard(spec, catchRecord, grade);
    removeFish(fish);
    resetLure();
    saveState();
    renderStaticUi();
    endRun(true);
    return;
  }

  if (spec.echo && !state.echoes[spec.echo]) {
    state.echoes[spec.echo] = true;
    state.hope = clamp(state.hope + 18, 0, 150);
    state.story = `${spec.name} leaves a living echo in the lighthouse glass.`;
    addJournal(`${echoName(spec.echo)} restored. The lighthouse brightens.`, "reward");
    queueRelicDraft(`${spec.name} leaves a relic in the lighthouse glass.`);
    showToast(`${spec.name} caught. ${echoName(spec.echo)} restored.`);
    playTone(440, 0.18, "sine", 0.04);
    setTimeout(() => playTone(660, 0.22, "triangle", 0.04), 90);
  } else {
    showToast(`${spec.name} landed. +${value} salvage, +${hope} hope.`);
    playTone(260 + spec.size * 3, 0.1, "triangle", 0.03);
  }

  checkMilestones();
  showCatchCard(spec, catchRecord, grade);
  removeFish(fish);
  resetLure();
  saveState();
  renderStaticUi();
}

function loseFish(reason) {
  const fish = state.lure.hooked;
  if (fish) {
    fish.hooked = false;
    fish.cooldown = 6;
    fish.vx = random(-80, 80);
    fish.vy = random(20, 80);
  }
  state.stats.lost += 1;
  state.hope = clamp(state.hope - 5, 0, 140);
  addJournal(`${reason} The lost shape leaves a cold wake.`);
  showToast(`${reason} Hope falls.`);
  playTone(90, 0.18, "sawtooth", 0.025);
  resetLure();
  saveState();
}

function resetLure() {
  state.lure = createLure();
  renderBait();
}

function updateFish(dt) {
  for (const fish of state.fish) {
    fish.cooldown = Math.max(0, fish.cooldown - dt);
    if (fish.hooked) continue;
    const spec = fish.species;
    fish.wander += dt * random(0.7, 1.3);
    const turn = Math.sin(fish.wander + fish.seed) * 0.8 + Math.sin(state.time * 0.13 + fish.seed) * 0.3;
    fish.vx += Math.cos(turn) * spec.speed * 0.22 * dt + state.current * 16 * dt;
    fish.vy += Math.sin(turn * 1.4) * spec.speed * 0.16 * dt;
    fish.vx = clamp(fish.vx, -spec.speed * 1.5, spec.speed * 1.5);
    fish.vy = clamp(fish.vy, -spec.speed, spec.speed);
    fish.x += fish.vx * dt;
    fish.y += fish.vy * dt;

    const minY = waterTop + spec.depth[0] * (seabed - waterTop);
    const maxY = waterTop + spec.depth[1] * (seabed - waterTop);
    if (fish.y < minY || fish.y > maxY) {
      fish.vy *= -0.75;
      fish.y = clamp(fish.y, minY, maxY);
    }
    if (fish.x < -80) fish.x = W + 60;
    if (fish.x > W + 80) fish.x = -60;
    fish.depth = (fish.y - waterTop) / (seabed - waterTop);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    if (p.age >= p.life) particles.splice(i, 1);
  }

  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const r = ripples[i];
    r.age += dt;
    if (r.age >= r.life) ripples.splice(i, 1);
  }
}

function maybeSpawnFish() {
  if (state.finaleActive && !state.finalCatch) {
    if (!state.fish.some((fish) => fish.species.finale)) {
      state.fish.push(spawnFinalFish());
    }
    return;
  }
  while (state.fish.length < maxFish) {
    state.fish.push(spawnFish());
  }
}

function spawnFish() {
  const available = species.filter((spec) => isSpeciesAvailable(spec));
  const total = available.reduce((sum, spec) => sum + spec.rarity, 0);
  let roll = Math.random() * total;
  let spec = available[0];
  for (const candidate of available) {
    roll -= candidate.rarity;
    if (roll <= 0) {
      spec = candidate;
      break;
    }
  }
  const side = Math.random() < 0.5 ? -1 : 1;
  const yBand = random(spec.depth[0], spec.depth[1]);
  return {
    id: `${Date.now()}-${Math.random()}`,
    species: spec,
    x: side < 0 ? random(-80, -20) : random(W + 20, W + 80),
    y: waterTop + yBand * (seabed - waterTop),
    vx: -side * spec.speed * random(0.5, 1.2),
    vy: random(-12, 12),
    depth: yBand,
    seed: Math.random() * Math.PI * 2,
    wander: Math.random() * Math.PI * 2,
    cooldown: random(0, 2),
    hooked: false,
  };
}

function spawnFinalFish() {
  const spec = species.find((item) => item.finale);
  const side = Math.random() < 0.5 ? -1 : 1;
  const yBand = random(0.32, 0.82);
  return {
    id: `final-${Date.now()}-${Math.random()}`,
    species: spec,
    x: side < 0 ? -120 : W + 120,
    y: waterTop + yBand * (seabed - waterTop),
    vx: -side * spec.speed * random(0.7, 1.1),
    vy: random(-8, 8),
    depth: yBand,
    seed: Math.random() * Math.PI * 2,
    wander: Math.random() * Math.PI * 2,
    cooldown: 0,
    hooked: false,
  };
}

function isSpeciesAvailable(spec) {
  if (spec.finale) {
    return state.finaleActive && !state.finalCatch;
  }
  if (state.finaleActive) return false;
  const light = completedEchoCount();
  const sea = currentSeaState();
  const depthAccess = 0.52 + state.upgrades.line * 0.1 + state.upgrades.lantern * 0.04;
  if (spec.depth[0] > depthAccess && !spec.echo) return false;
  if (spec.echo === "lantern" && state.upgrades.lantern < 2) return false;
  if (spec.echo === "crown" && state.upgrades.line < 2) return false;
  if (spec.echo === "heart" && (state.hope < 78 || light < 2)) return false;
  if (spec.echo && state.echoes[spec.echo]) return false;
  if (spec.echo && sea.id === "quiet" && Math.random() < 0.42) return false;
  return true;
}

function removeFish(fish) {
  const index = state.fish.indexOf(fish);
  if (index >= 0) {
    state.fish.splice(index, 1);
  }
}

function beginHold() {
  if (state.mode !== "playing" || state.paused) return;
  const lure = state.lure;
  if (lure.phase === "idle") {
    lure.phase = "charging";
    lure.charge = 0.12;
    lure.chargeDir = 1;
    renderBait();
  } else if (lure.phase === "water" || lure.phase === "hooked") {
    lure.reeling = true;
  }
}

function endHold(cancel = false) {
  if (state.mode !== "playing" || state.paused) return;
  const lure = state.lure;
  if (lure.phase === "charging") {
    if (cancel) {
      resetLure();
      return;
    }
    castLure();
  } else {
    lure.reeling = false;
  }
}

function castLure() {
  const lure = state.lure;
  const player = playerPoint();
  const aim = {
    x: pointer.x || player.x + 120,
    y: pointer.y || waterTop + 80,
  };
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const power = 360 + lure.charge * (360 + state.upgrades.reel * 34);
  lure.phase = "flying";
  lure.castAge = 0;
  lure.x = player.x;
  lure.y = player.y - 10;
  lure.vx = (dx / len) * power;
  lure.vy = Math.min(-120, (dy / len) * power - 170);
  state.stats.casts += 1;
  renderBait();
  showToast("Cast away. Let it sink, then tempt the dark with careful reeling.");
  playTone(180 + lure.charge * 110, 0.09, "triangle", 0.025);
}

function buyUpgrade(id) {
  const upgrade = upgrades.find((item) => item.id === id);
  if (!upgrade) return;
  const level = state.upgrades[id] ?? 0;
  if (level >= upgrade.max) return;
  const cost = upgradeCost(upgrade, level);
  if (state.salvage < cost) {
    showToast("Not enough salvage.");
    return;
  }
  state.salvage -= cost;
  state.upgrades[id] = level + 1;
  state.story = `${upgrade.name} fitted. The pier feels less doomed.`;
  addJournal(`${upgrade.name} upgraded to ${state.upgrades[id]}/${upgrade.max}.`, "reward");
  showToast(`${upgrade.name} upgraded.`);
  playTone(310 + level * 40, 0.1, "square", 0.025);
  checkMilestones();
  saveState();
  renderStaticUi();
}

function checkEnding() {
  if (state.finalCatch) {
    endRun(true);
  } else if (completedEchoCount() >= echoes.length && !state.finaleActive) {
    beginFinale();
  } else if (state.storm <= 0 || state.hope <= 0) {
    endRun(false);
  }
}

function beginFinale() {
  state.finaleActive = true;
  state.storm = Math.max(state.storm, 1);
  state.beamCharge = 1;
  state.fish = [spawnFinalFish()];
  state.story = "The four echoes open the lens. Cast into the focused beam and land the Last Dawn.";
  addJournal("Final Watch: the Last Dawn has risen under the lighthouse beam.", "reward");
  showToast("Final Watch. Focus the beam and catch the Last Dawn.");
  saveState();
  renderStaticUi();
}

function endRun(won) {
  state.mode = "ended";
  state.paused = false;
  refs.endOverlay.hidden = false;
  refs.endKicker.textContent = won ? "Light restored" : "Run ended";
  refs.endHeading.textContent = won ? "The lighthouse burns again" : "The sea goes quiet";
  refs.endText.textContent = won
    ? "The Last Dawn breaks the black water and climbs into the sky. The pier is ruined, the keeper is exhausted, and morning finally has a path home."
    : state.hope <= 0
      ? "Hope runs out before the lens can wake. The pier remains, but no one remembers why it mattered."
      : "The final storm arrives. It takes the pier, the bell, and every unfinished echo below the black water.";
  refs.endStats.replaceChildren(
    statBlock("Echoes", `${completedEchoCount()} / ${echoes.length}`),
    statBlock("Catches", String(totalCatchCount())),
    statBlock("Best", `${state.stats.bestWeight.toFixed(1)} kg`),
  );
  saveState();
}

function renderStaticUi() {
  refs.echoList.replaceChildren(...echoes.map(renderEcho));
  renderWrit();
  renderSeaState();
  renderBait();
  refs.upgradeList.replaceChildren(...upgrades.map(renderUpgrade));
  renderJournal();
  renderLogbook();
  refs.storyLine.textContent = state.story;
  refs.soundButton.setAttribute("aria-pressed", String(state.sound));
  refs.soundButton.textContent = state.sound ? "Sound On" : "Sound";
}

function renderBait() {
  const bait = currentBait();
  refs.baitName.textContent = bait.name;
  refs.baitTag.textContent = bait.tag;
  refs.baitText.textContent = bait.text;
  refs.baitOptions.replaceChildren(
    ...baits.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bait-card${option.id === state.bait ? " is-active" : ""}`;
      button.disabled = state.lure.phase !== "idle";
      button.setAttribute("aria-pressed", String(option.id === state.bait));

      const swatch = document.createElement("span");
      swatch.className = "bait-swatch";
      swatch.style.color = option.color;
      swatch.style.backgroundColor = option.color;

      const text = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = option.name;
      const short = document.createElement("span");
      short.textContent = option.short;
      text.append(name, short);

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = option.tag;

      button.append(swatch, text, tag);
      button.addEventListener("click", () => selectBait(option.id));
      return button;
    }),
  );
}

function selectBait(id) {
  if (state.lure.phase !== "idle") {
    showToast("Change bait after recovering the line.");
    return;
  }
  if (!baits.some((bait) => bait.id === id)) return;
  state.bait = id;
  const bait = currentBait();
  addJournal(`Tackle changed: ${bait.name}.`);
  showToast(`${bait.name} tied on.`);
  saveState();
  renderStaticUi();
}

function renderSeaState() {
  const sea = currentSeaState();
  refs.seaStateName.textContent = sea.name;
  refs.seaStateTag.textContent = sea.tag;
  refs.seaStateText.textContent = sea.text;
  refs.seaStateEffects.replaceChildren(
    ...sea.effects.map((effect) => {
      const pill = document.createElement("span");
      pill.className = "effect-pill";
      pill.textContent = effect;
      return pill;
    }),
  );
}

function createWrit(runState) {
  const pool = writTemplates.filter((template) => {
    if (template.type === "deep") return runState.upgrades.line > 0 || runState.day > 1;
    if (template.type === "heavy") return totalCatchCountFor(runState) > 2 || runState.day > 2;
    return true;
  });
  const template = pool[(runState.day + completedEchoCountFor(runState) + totalCatchCountFor(runState)) % pool.length];
  const target = template.target(runState);
  return {
    id: template.id,
    title: template.title,
    text: template.text.replace("{target}", formatProgress(target)),
    type: template.type,
    target,
    progress: 0,
    reward: template.reward(runState),
    completed: false,
    day: runState.day,
  };
}

function updateWritForCatch(spec, salvageValue, weight) {
  const writ = state.writ;
  if (!writ || writ.completed) return;

  if (writ.type === "catches") {
    writ.progress += 1;
  } else if (writ.type === "salvage") {
    writ.progress += salvageValue;
  } else if (writ.type === "deep" && spec.depth[0] >= 0.3) {
    writ.progress += 1;
  } else if (writ.type === "heavy") {
    writ.progress = Math.max(writ.progress, weight);
  }

  if (writ.progress >= writ.target) {
    completeWrit();
  }
}

function completeWrit() {
  if (!state.writ || state.writ.completed) return;
  const reward = Math.round(state.writ.reward * (hasRelic("salt-ledger") ? 1.35 : 1));
  const title = state.writ.title;
  state.writ.completed = true;
  state.salvage += reward;
  state.hope = clamp(state.hope + Math.ceil(reward / 3), 0, 150);
  addJournal(`Writ complete: ${title}. +${reward} salvage.`, "reward");
  showToast(`Writ complete: ${title}. +${reward} salvage.`);
  playTone(520, 0.12, "triangle", 0.035);
  state.writ = createWrit(state);
  addJournal(`New writ sealed: ${state.writ.title}.`);
}

function checkMilestones() {
  awardMilestone(
    "first-catch",
    totalCatchCount() >= 1,
    "First catch logged. The keeper stops shaking.",
    4,
  );
  awardMilestone(
    "five-catches",
    totalCatchCount() >= 5,
    "Five catches prove the sea can still feed a light.",
    8,
  );
  awardMilestone(
    "ten-catches",
    totalCatchCount() >= 10,
    "Ten catches turn the pier into a working harbor again.",
    14,
  );
  awardMilestone(
    "heavy-catch",
    state.stats.bestWeight >= 5,
    "A heavy catch leaves black scales hammered into the planks.",
    12,
  );
  awardMilestone(
    "first-echo",
    completedEchoCount() >= 1,
    "The first living echo teaches the lens to breathe.",
    18,
  );
  awardMilestone(
    "half-light",
    completedEchoCount() >= 2,
    "Half the lighthouse glass is awake.",
    22,
  );
  awardMilestone(
    "workshop",
    Object.values(state.upgrades).reduce((sum, level) => sum + level, 0) >= 4,
    "The workshop has more tools than prayers now.",
    16,
  );
}

function awardMilestone(id, condition, text, salvageReward) {
  if (!condition || state.milestones[id]) return;
  state.milestones[id] = true;
  state.salvage += salvageReward;
  state.hope = clamp(state.hope + Math.ceil(salvageReward / 4), 0, 150);
  addJournal(`${text} +${salvageReward} salvage.`, "reward");
  showToast(text);
}

function addJournal(text, type = "note") {
  state.journal.unshift({
    day: state.day,
    text,
    type,
  });
  state.journal = state.journal.slice(0, 8);
}

function renderWrit() {
  if (!state.writ) {
    refs.writTitle.textContent = "No writ sealed";
    refs.writText.textContent = "The harbor is silent.";
    refs.writReward.textContent = "0";
    refs.writProgressText.textContent = "0 / 0";
    refs.writProgressMeter.style.width = "0%";
    return;
  }

  const progress = Math.min(state.writ.progress, state.writ.target);
  refs.writTitle.textContent = state.writ.completed ? `${state.writ.title} complete` : state.writ.title;
  refs.writText.textContent = state.writ.text;
  refs.writReward.textContent = `+${state.writ.reward}`;
  refs.writProgressText.textContent = `${formatProgress(progress)} / ${formatProgress(state.writ.target)}`;
  refs.writProgressMeter.style.width = `${Math.round((progress / state.writ.target) * 100)}%`;
}

function renderEcho(echo) {
  const row = document.createElement("div");
  row.className = `echo-item${state.echoes[echo.id] ? " is-complete" : ""}`;

  const mark = document.createElement("span");
  mark.className = "echo-mark";
  mark.textContent = state.echoes[echo.id] ? "OK" : "";

  const text = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = echo.name;
  const hint = document.createElement("span");
  hint.textContent = state.echoes[echo.id] ? "Restored to the lens." : echo.hint;
  text.append(name, hint);

  const stateTag = document.createElement("span");
  stateTag.className = "tag";
  stateTag.textContent = state.echoes[echo.id] ? "Lit" : "Lost";

  row.append(mark, text, stateTag);
  return row;
}

function renderUpgrade(upgrade) {
  const level = state.upgrades[upgrade.id] ?? 0;
  const card = document.createElement("div");
  card.className = "upgrade-card";

  const text = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = `${upgrade.name} ${level}/${upgrade.max}`;
  const description = document.createElement("span");
  description.textContent = level >= upgrade.max ? "Fully upgraded." : upgrade.description;
  text.append(name, description);

  const button = document.createElement("button");
  button.type = "button";
  button.disabled = level >= upgrade.max;
  button.textContent = level >= upgrade.max ? "Max" : `${upgradeCost(upgrade, level)}`;
  button.addEventListener("click", () => buyUpgrade(upgrade.id));

  card.append(text, button);
  return card;
}

function renderJournal() {
  if (!state.journal.length) {
    const empty = document.createElement("p");
    empty.className = "story-line";
    empty.textContent = "No omens written yet.";
    refs.journalList.replaceChildren(empty);
    return;
  }

  refs.journalList.replaceChildren(
    ...state.journal.map((entry) => {
      const row = document.createElement("div");
      row.className = `journal-row${entry.type === "reward" ? " reward" : ""}`;
      row.textContent = `Day ${entry.day}: ${entry.text}`;
      return row;
    }),
  );
}

function fightGrade(risk) {
  if (risk < 0.55) {
    return { label: "Calm Haul", value: 1.16, hope: 1.15, beam: 0.08 };
  }
  if (risk < 1.35) {
    return { label: "Hard-Won", value: 1, hope: 1, beam: 0.04 };
  }
  return { label: "Frayed Line", value: 0.88, hope: 0.9, beam: 0.02 };
}

function showCatchCard(spec, catchRecord, grade) {
  refs.catchGrade.textContent = spec.echo ? `${grade.label} Omen` : grade.label;
  refs.catchName.textContent = spec.name;
  refs.catchStats.textContent = `${catchRecord.weight.toFixed(1)} kg | +${catchRecord.value} salvage | +${catchRecord.hope} hope`;
  refs.catchLore.textContent = spec.lore;
  refs.catchCard.hidden = false;
  requestAnimationFrame(() => refs.catchCard.classList.add("is-visible"));
  if (typeof clearTimeout === "function") {
    clearTimeout(showCatchCard.timer);
  }
  showCatchCard.timer = setTimeout(() => {
    refs.catchCard.classList.remove("is-visible");
    setTimeout(() => {
      refs.catchCard.hidden = true;
    }, 220);
  }, 4200);
}

function renderLogbook() {
  refs.logbook.replaceChildren(
    ...species.map((spec) => {
      const entry = state.bestiary[spec.id];
      const discovered = Boolean(entry?.count);
      const row = document.createElement("div");
      row.className = `log-row${discovered ? "" : " is-locked"}${spec.echo ? " is-omen" : ""}`;

      const swatch = document.createElement("span");
      swatch.className = "log-swatch";
      swatch.style.backgroundColor = discovered ? spec.tone : "rgba(239, 245, 237, 0.14)";
      swatch.style.color = discovered ? spec.tone : "rgba(239, 245, 237, 0.18)";

      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = discovered ? spec.name : "Undiscovered";
      const lore = document.createElement("span");
      lore.textContent = discovered ? spec.lore : spec.hint;
      text.append(name, lore);

      const meta = document.createElement("div");
      meta.className = "log-meta";
      const habitat = document.createElement("span");
      habitat.textContent = spec.habitat;
      const count = document.createElement("span");
      count.textContent = discovered ? `${entry.count} caught` : "0 caught";
      const best = document.createElement("span");
      best.textContent = discovered ? `Best ${entry.best.toFixed(1)} kg` : "Best --";
      meta.append(habitat, count, best);

      row.append(swatch, text, meta);
      return row;
    }),
  );
}

function recordBestiaryCatch(spec, weight) {
  const current = state.bestiary[spec.id] ?? { count: 0, best: 0 };
  state.bestiary[spec.id] = {
    count: current.count + 1,
    best: Math.max(current.best, weight),
  };
}

function normalizeBestiary(saved) {
  const normalized = {};
  for (const spec of species) {
    const existing = saved.bestiary?.[spec.id];
    const seenCount = saved.seen?.[spec.id] ?? 0;
    if (existing || seenCount) {
      normalized[spec.id] = {
        count: Math.max(existing?.count ?? 0, seenCount),
        best: Number(existing?.best ?? 0),
      };
    }
  }
  return normalized;
}

function updateBeam(dt) {
  if (state.beamTimer > 0) {
    state.beamTimer = Math.max(0, state.beamTimer - dt);
    if (state.beamTimer === 0) {
      addJournal("The focused beam fades back into the lens.");
    }
    return;
  }
  state.beamCharge = clamp(state.beamCharge + dt * 0.008 * (1 + completedEchoCount() * 0.18) * relicBeamChargeMultiplier(), 0, 1);
}

function activateBeam() {
  if (state.mode !== "playing" || state.paused) return;
  if (state.beamTimer > 0) {
    showToast("The beam is already focused.");
    return;
  }
  if (state.beamCharge < 1) {
    showToast("The lighthouse lens is still charging.");
    return;
  }
  state.beamCharge = 0;
  state.beamTimer = 12 + completedEchoCount() * 1.5 + (hasRelic("kindled-lens") ? 3 : 0);
  addJournal("The lighthouse beam focuses across the black water.", "reward");
  showToast("Beam focused. Omen shapes rise toward the hook.");
  playTone(540, 0.16, "sine", 0.035);
  setTimeout(() => playTone(720, 0.18, "triangle", 0.035), 80);
  saveState();
}

function isBeamActive() {
  return state.beamTimer > 0;
}

function beamMultiplier() {
  if (!isBeamActive()) {
    return { bite: 1, rare: 1, tension: 1 };
  }
  return {
    bite: 1.28 + completedEchoCount() * 0.05,
    rare: 1.45 + completedEchoCount() * 0.08,
    tension: 0.82,
  };
}

function hasRelic(id) {
  return state.relics.includes(id);
}

function relicBeamChargeMultiplier() {
  return hasRelic("kindled-lens") ? 1.35 : 1;
}

function queueRelicDraft(message) {
  const choices = relics.filter((relic) => !state.relics.includes(relic.id));
  if (!choices.length) return;
  state.pendingRelics = choices.sort(() => Math.random() - 0.5).slice(0, 3).map((relic) => relic.id);
  refs.relicText.textContent = message;
  renderRelicChoices();
  refs.relicOverlay.hidden = false;
}

function renderRelicChoices() {
  refs.relicChoices.replaceChildren(
    ...state.pendingRelics.map((id) => {
      const relic = relics.find((item) => item.id === id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "relic-choice";
      const name = document.createElement("strong");
      name.textContent = relic.name;
      const text = document.createElement("span");
      text.textContent = relic.text;
      button.append(name, text);
      button.addEventListener("click", () => chooseRelic(id));
      return button;
    }),
  );
}

function chooseRelic(id) {
  if (!state.pendingRelics.includes(id) || hasRelic(id)) return;
  const relic = relics.find((item) => item.id === id);
  state.relics.push(id);
  state.pendingRelics = [];
  refs.relicOverlay.hidden = true;
  addJournal(`Relic claimed: ${relic.name}.`, "reward");
  showToast(`${relic.name} claimed.`);
  saveState();
  renderStaticUi();
}

function updateHud() {
  refs.chargeMeter.style.width = `${Math.round(state.lure.charge * 100)}%`;
  refs.tensionMeter.style.width = `${Math.round(clamp(state.lure.tension / (1.02 + state.upgrades.line * 0.16), 0, 1) * 100)}%`;
  refs.beamMeter.style.width = `${Math.round((isBeamActive() ? state.beamTimer / (12 + completedEchoCount() * 1.5) : state.beamCharge) * 100)}%`;
  refs.beamStatus.textContent = isBeamActive() ? `${Math.ceil(state.beamTimer)}s focused` : state.beamCharge >= 1 ? "Ready" : "Charging";
  refs.beamButton.disabled = state.mode !== "playing" || state.paused || isBeamActive() || state.beamCharge < 1;
  refs.stormValue.textContent = `${Math.max(0, state.storm)} day${state.storm === 1 ? "" : "s"}`;
  refs.lightValue.textContent = state.finalCatch ? "Dawn" : state.finaleActive ? "Final" : `${completedEchoCount()} / ${echoes.length}`;
  refs.salvageValue.textContent = String(state.salvage);
  refs.hopeValue.textContent = String(Math.round(state.hope));
  refs.phaseTag.textContent = phaseName();
  refs.depthTag.textContent = depthName(state.lure.depth);
  refs.catchCount.textContent = String(totalCatchCount());
}

function draw(t) {
  ctx.clearRect(0, 0, W, H);
  drawSky(t);
  drawSea(t);
  drawWeatherOverlay(t);
  drawLighthouse(t);
  drawFish(t);
  drawLureAndLine(t);
  drawPier(t);
  drawParticles();
  if (state.paused) drawPause();
}

function drawWeatherOverlay(t) {
  const sea = currentSeaState();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  if (sea.visual === "fog") {
    for (let i = 0; i < 7; i += 1) {
      const y = waterTop * 0.78 + i * 28 + Math.sin(t * 0.25 + i) * 8;
      const x = ((t * 12 + i * 180) % (W + 260)) - 130;
      ctx.fillStyle = `rgba(240, 222, 160, ${0.055 + i * 0.006})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 190, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (sea.visual === "rain") {
    ctx.strokeStyle = "rgba(215, 222, 214, 0.26)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 72; i += 1) {
      const x = (i * 47 + t * 120) % (W + 90) - 45;
      const y = (i * 83 + t * 180) % H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10, y - 28);
      ctx.stroke();
    }
  }

  if (sea.visual === "glass") {
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#d9f5f3";
    for (let i = 0; i < 12; i += 1) {
      const y = waterTop + 20 + i * 32;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(t + i) * 5);
      ctx.lineTo(W, y + Math.cos(t * 0.8 + i) * 5);
      ctx.stroke();
    }
  }

  if (sea.visual === "black") {
    const pulse = 0.18 + Math.sin(t * 1.7) * 0.04;
    ctx.fillStyle = `rgba(0, 0, 0, ${pulse})`;
    ctx.fillRect(0, waterTop, W, H - waterTop);
  }

  ctx.restore();
}

function drawSky(t) {
  const phase = state.time / dayLength;
  const stormPressure = 1 - state.storm / finalStormDays;
  const sky = ctx.createLinearGradient(0, 0, 0, waterTop);
  sky.addColorStop(0, mixColor("#182635", "#090b12", stormPressure));
  sky.addColorStop(0.58, mixColor("#5d6f75", "#242b36", stormPressure));
  sky.addColorStop(1, mixColor("#c08f64", "#48364c", stormPressure));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, waterTop);

  ctx.save();
  ctx.globalAlpha = 0.16 + stormPressure * 0.42;
  for (const star of stars) {
    const twinkle = 0.4 + Math.sin(t * 1.8 + star.phase) * 0.25;
    ctx.fillStyle = `rgba(240, 245, 230, ${twinkle})`;
    ctx.fillRect(star.x * W, star.y * waterTop, star.size, star.size);
  }
  ctx.restore();

  const sunX = W * (0.15 + phase * 0.55);
  const sunY = waterTop * (0.72 + Math.sin(phase * Math.PI) * -0.26);
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.18);
  sunGlow.addColorStop(0, "rgba(240, 198, 106, 0.46)");
  sunGlow.addColorStop(1, "rgba(240, 198, 106, 0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, W, waterTop);

  ctx.fillStyle = `rgba(8, 9, 13, ${0.24 + stormPressure * 0.36})`;
  for (let i = 0; i < 4; i += 1) {
    const y = waterTop * (0.18 + i * 0.12) + Math.sin(t * 0.2 + i) * 6;
    drawCloud(W * (0.1 + i * 0.24 + Math.sin(t * 0.05 + i) * 0.04), y, 90 + i * 25);
  }
}

function drawCloud(x, y, size) {
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.16, 0, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.36, y + 4, size * 0.62, size * 0.13, 0, 0, Math.PI * 2);
  ctx.ellipse(x - size * 0.36, y + 2, size * 0.5, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSea(t) {
  const stormPressure = 1 - state.storm / finalStormDays;
  const grad = ctx.createLinearGradient(0, waterTop, 0, H);
  grad.addColorStop(0, mixColor(waterHue.surface, "#24313d", stormPressure));
  grad.addColorStop(0.48, mixColor(waterHue.middle, "#152230", stormPressure));
  grad.addColorStop(1, mixColor(waterHue.deep, "#070b12", stormPressure));
  ctx.fillStyle = grad;
  ctx.fillRect(0, waterTop, W, H - waterTop);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterTop, W, H - waterTop);
  ctx.clip();
  for (let i = 0; i < 26; i += 1) {
    const y = waterTop + i * ((H - waterTop) / 25);
    const alpha = 0.1 - i * 0.002;
    ctx.strokeStyle = `rgba(220, 242, 234, ${Math.max(0.02, alpha)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 18) {
      const wave = Math.sin(x * 0.018 + t * (0.9 + i * 0.02) + i) * (3 + stormPressure * 6);
      if (x === -20) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  for (const ripple of ripples) {
    const p = ripple.age / ripple.life;
    ctx.strokeStyle = `rgba(240, 245, 237, ${0.35 * (1 - p)})`;
    ctx.lineWidth = 2 * (1 - p);
    ctx.beginPath();
    ctx.ellipse(ripple.x, ripple.y, ripple.radius * (1 + p * 1.7), ripple.radius * 0.28 * (1 + p), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLighthouse(t) {
  const lit = completedEchoCount();
  const baseX = W * 0.08;
  const baseY = waterTop + 12;
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.fillStyle = "rgba(4, 7, 9, 0.78)";
  ctx.fillRect(-18, -88, 36, 98);
  ctx.fillStyle = "rgba(239, 245, 237, 0.18)";
  ctx.fillRect(-10, -72, 20, 12);
  ctx.fillRect(-8, -46, 16, 10);
  ctx.fillStyle = lit ? "rgba(240, 198, 106, 0.96)" : "rgba(116, 184, 201, 0.28)";
  ctx.fillRect(-13, -104, 26, 18);
  if (lit || isBeamActive()) {
    const activeBoost = isBeamActive() ? 0.24 + Math.sin(t * 5) * 0.04 : 0;
    ctx.globalAlpha = 0.14 + lit * 0.055 + activeBoost + Math.sin(t * 2) * 0.025;
    ctx.fillStyle = "#f0c66a";
    ctx.beginPath();
    ctx.moveTo(0, -95);
    ctx.lineTo(W * 0.75, -135 + Math.sin(t * 0.8) * (isBeamActive() ? 22 : 12));
    ctx.lineTo(W * 0.75, -42 + Math.sin(t * 0.8) * (isBeamActive() ? 22 : 12));
    ctx.closePath();
    ctx.fill();
    if (isBeamActive()) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#f7f1da";
      ctx.beginPath();
      ctx.moveTo(0, -95);
      ctx.lineTo(W * 0.95, -115 + Math.sin(t * 1.2) * 18);
      ctx.lineTo(W * 0.95, -65 + Math.sin(t * 1.2) * 18);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPier(t) {
  const player = playerPoint();
  ctx.save();
  ctx.fillStyle = "#171311";
  ctx.fillRect(0, pierY, W, H - pierY);
  ctx.fillStyle = "#2b211d";
  for (let x = -20; x < W + 20; x += 78) {
    ctx.fillRect(x, pierY - 8 + Math.sin(x * 0.04) * 2, 58, 14);
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  for (let x = 20; x < W; x += 96) {
    ctx.fillRect(x, pierY + 2, 10, H - pierY);
  }

  ctx.translate(player.x, player.y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 16, 19, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(-5, -24, 10, 34);
  ctx.beginPath();
  ctx.arc(0, -34, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c6a360";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(5, -20);
  ctx.quadraticCurveTo(36, -52 + Math.sin(t * 2) * 4, 72, -28);
  ctx.stroke();
  ctx.restore();
}

function drawFish(t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterTop, W, H - waterTop);
  ctx.clip();
  for (const fish of state.fish) {
    const spec = fish.species;
    const visible = state.upgrades.lantern > 0 || fish.depth < 0.62 || spec.echo;
    const alpha = visible ? clamp(0.24 + state.upgrades.lantern * 0.11 + (spec.echo ? 0.24 : 0), 0.18, 0.86) : 0.11;
    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.scale(fish.vx < 0 ? -1 : 1, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = spec.tone;
    ctx.beginPath();
    ctx.ellipse(0, 0, spec.size, spec.size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-spec.size * 0.82, 0);
    ctx.lineTo(-spec.size * 1.35, -spec.size * 0.44);
    ctx.lineTo(-spec.size * 1.22, spec.size * 0.44);
    ctx.closePath();
    ctx.fill();
    if (spec.echo) {
      ctx.globalAlpha = alpha * (0.42 + Math.sin(t * 3 + fish.seed) * 0.2);
      ctx.strokeStyle = spec.tone;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, spec.size * 1.45, spec.size * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawLureAndLine(t) {
  const lure = state.lure;
  const player = playerPoint();
  if (lure.phase === "idle") return;
  const bait = currentBait();

  ctx.save();
  ctx.strokeStyle = `rgba(239, 245, 237, ${lure.phase === "hooked" ? 0.7 : 0.45})`;
  ctx.lineWidth = lure.phase === "hooked" ? 1.8 : 1.2;
  ctx.beginPath();
  ctx.moveTo(player.x + 48, player.y - 28);
  const sag = lure.phase === "flying" ? -40 : 30;
  ctx.quadraticCurveTo((player.x + lure.x) / 2, Math.min(player.y, lure.y) + sag, lure.x, lure.y);
  ctx.stroke();

  ctx.shadowColor = bait.color;
  ctx.shadowBlur = lure.phase === "hooked" ? 18 : 10;
  ctx.fillStyle = lure.phase === "hooked" ? "#f0c66a" : bait.color;
  ctx.beginPath();
  ctx.arc(lure.x, lure.y + Math.sin(t * 8) * 1.5, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (lure.phase === "hooked") {
    ctx.strokeStyle = `rgba(238, 116, 106, ${0.28 + lure.tension * 0.26})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(lure.x, lure.y, 12 + Math.sin(t * 11) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of particles) {
    const fade = 1 - p.age / p.life;
    ctx.globalAlpha = fade * p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPause() {
  ctx.save();
  ctx.fillStyle = "rgba(5, 9, 12, 0.46)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f7f1da";
  ctx.font = "900 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Paused", W / 2, H / 2);
  ctx.restore();
}

function splash(x, y, radius) {
  ripples.push({ x, y, radius, age: 0, life: 1.4 });
  for (let i = 0; i < 18; i += 1) {
    particles.push({
      x,
      y,
      vx: random(-80, 80),
      vy: random(-120, -20),
      gravity: 180,
      size: random(1.5, 4),
      age: 0,
      life: random(0.45, 0.9),
      alpha: random(0.32, 0.7),
      color: "#dceee8",
    });
  }
}

function playerPoint() {
  return {
    x: state.player.x * W,
    y: pierY - 4 + Math.sin(state.player.sway * 1.8) * 1.5,
  };
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left) * (W / rect.width);
  pointer.y = (event.clientY - rect.top) * (H / rect.height);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dpr = window.devicePixelRatio || 1;
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  waterTop = H * 0.34;
  pierY = H * 0.78;
  seabed = H * 0.97;
  pointer.x ||= W * 0.56;
  pointer.y ||= waterTop + 100;
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  toastTimer = 3.2;
}

function completedEchoCount() {
  return echoes.filter((echo) => state.echoes[echo.id]).length;
}

function completedEchoCountFor(runState) {
  return echoes.filter((echo) => runState.echoes?.[echo.id]).length;
}

function totalCatchCount() {
  return Object.values(state.seen).reduce((sum, count) => sum + count, 0);
}

function totalCatchCountFor(runState) {
  return Object.values(runState.seen ?? {}).reduce((sum, count) => sum + count, 0);
}

function echoName(id) {
  return echoes.find((echo) => echo.id === id)?.name ?? "Echo";
}

function currentSeaState() {
  return seaStates.find((sea) => sea.id === state.seaState) ?? seaStates[0];
}

function currentBait() {
  return baits.find((bait) => bait.id === state.bait) ?? baits[0];
}

function chooseSeaState(runState) {
  const stormPressure = 1 - runState.storm / finalStormDays;
  const weighted = seaStates.map((sea) => {
    let weight = 1;
    if (sea.id === "quiet") weight = 1.6 - stormPressure;
    if (sea.id === "lantern-fog") weight = 0.8 + completedEchoCountFor(runState) * 0.28;
    if (sea.id === "glass-current") weight = 0.9 + runState.day * 0.04;
    if (sea.id === "hungry-black") weight = 0.55 + stormPressure * 1.2;
    if (sea.id === "ash-rain") weight = 0.55 + stormPressure * 0.9;
    return { sea, weight: Math.max(0.15, weight) };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.sea;
  }
  return seaStates[0];
}

function phaseName() {
  const p = state.time / dayLength;
  if (p < 0.24) return "Ash Dawn";
  if (p < 0.52) return "Grey Day";
  if (p < 0.78) return "Dusk";
  return "Black Tide";
}

function depthName(depth) {
  if (state.lure.phase === "idle" || state.lure.phase === "charging" || state.lure.phase === "flying") return "Pier";
  if (depth < 0.34) return "Surface";
  if (depth < 0.68) return "Middle";
  return "Deep";
}

function upgradeCost(upgrade, level) {
  return Math.round(upgrade.baseCost * (1 + level * 0.72) + level * level * 3);
}

function formatProgress(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function statBlock(label, value) {
  const div = document.createElement("div");
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  div.append(span, strong);
  return div;
}

function saveState() {
  if (state.mode === "title") return;
  const snapshot = {
    day: state.day,
    storm: state.storm,
    hope: state.hope,
    salvage: state.salvage,
    catches: state.catches,
    seen: state.seen,
    bestiary: state.bestiary,
    echoes: state.echoes,
    upgrades: state.upgrades,
    player: state.player,
    current: state.current,
    wind: state.wind,
    seaState: state.seaState,
    bait: state.bait,
    beamCharge: state.beamCharge,
    finaleActive: state.finaleActive,
    finalCatch: state.finalCatch,
    story: state.story,
    writ: state.writ,
    journal: state.journal,
    milestones: state.milestones,
    relics: state.relics,
    stats: state.stats,
    sound: state.sound,
  };
  try {
    localStorage.setItem(saveKey, JSON.stringify(snapshot));
    savedSnapshot = snapshot;
    refs.continueButton.disabled = false;
  } catch {
    savedSnapshot = snapshot;
  }
}

function readSave() {
  try {
    const raw = localStorage.getItem(saveKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function ensureAudio() {
  if (!audio) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      showToast("Audio is not available in this browser.");
      return;
    }
    audio = new AudioCtor();
  }
  if (audio.state === "suspended") {
    await audio.resume();
  }
}

function playTone(freq, duration, type = "sine", gain = 0.02) {
  if (!state.sound || !audio) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, audio.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const blue = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${blue})`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = Number.parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}
