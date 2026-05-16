const SAVE_KEY = "polygonForgeSave";
const SAVE_VERSION = 2;
const CIRCLE_SIDES = 64;
const AUTOSAVE_MS = 5000;
const PASSIVE_TICK_MS = 250;

const shapeNames = new Map([
  [3, "triangle"],
  [4, "square"],
  [5, "pentagon"],
  [6, "hexagon"],
  [7, "heptagon"],
  [8, "octagon"],
  [9, "nonagon"],
  [10, "decagon"],
]);

const palette = [
  ["#f05d5e", "#2f8f83"],
  ["#d4a72c", "#3f82bc"],
  ["#7d65b8", "#f05d5e"],
  ["#2f8f83", "#d4a72c"],
  ["#3f82bc", "#7d65b8"],
  ["#e26c38", "#2f8f83"],
];

const upgrades = [
  {
    id: "side",
    name: "Add a side",
    description: () => "Evolve toward the circle.",
    unlock: () => true,
    baseCost: 18,
  },
  {
    id: "polish",
    name: "Polish",
    description: () => "+1 base click power.",
    unlock: () => true,
    baseCost: 12,
    scale: 1.55,
  },
  {
    id: "drafting",
    name: "Drafting Table",
    description: () => "+0.2 points per second.",
    unlock: () => true,
    baseCost: 40,
    scale: 1.7,
  },
  {
    id: "golden",
    name: "Golden Ratio",
    description: () => "Click multiplier x1.35.",
    unlock: (state) => state.sides >= 6,
    locked: "Unlocks at 6 sides.",
    baseCost: 180,
    scale: 2.1,
  },
  {
    id: "compass",
    name: "Compass",
    description: () => "Future side costs -3%.",
    unlock: (state) => state.sides >= 8,
    locked: "Unlocks at 8 sides.",
    baseCost: 260,
    scale: 1.82,
  },
  {
    id: "metronome",
    name: "Metronome",
    description: () => "Longer combo window and stronger rhythm.",
    unlock: (state) => state.sides >= 10,
    locked: "Unlocks at 10 sides.",
    baseCost: 420,
    scale: 1.9,
  },
  {
    id: "autoChisel",
    name: "Auto-Chisel",
    description: () => "Automatic strikes while the studio runs.",
    unlock: (state) => state.sides >= 12,
    locked: "Unlocks at 12 sides.",
    baseCost: 650,
    scale: 2,
  },
];

const artifacts = [
  {
    id: "sharpEdges",
    name: "Sharp Edges",
    text: "+15% click gain on odd-numbered sides.",
    tags: ["Click"],
    minSides: 4,
    maxStacks: 5,
  },
  {
    id: "evenPlane",
    name: "Even Plane",
    text: "+20% passive gain on even-numbered sides.",
    tags: ["Passive"],
    minSides: 4,
    maxStacks: 5,
  },
  {
    id: "echoTap",
    name: "Echo Tap",
    text: "Every 5th manual click repeats at 50% value.",
    tags: ["Click", "Combo"],
    minSides: 4,
    maxStacks: 4,
  },
  {
    id: "comboLens",
    name: "Combo Lens",
    text: "Combo count adds up to +40% click gain.",
    tags: ["Click", "Combo"],
    minSides: 4,
    maxStacks: 4,
  },
  {
    id: "patientCompass",
    name: "Patient Compass",
    text: "Side costs fall while you wait, capped at 20%.",
    tags: ["Cost"],
    minSides: 4,
    maxStacks: 3,
  },
  {
    id: "kineticDraft",
    name: "Kinetic Draft",
    text: "Rhythmic clicking charges passive income.",
    tags: ["Passive", "Combo"],
    minSides: 4,
    maxStacks: 4,
  },
  {
    id: "facetBank",
    name: "Facet Bank",
    text: "Side purchases refund 8% of their cost.",
    tags: ["Cost"],
    minSides: 8,
    maxStacks: 4,
  },
  {
    id: "gildedCorners",
    name: "Gilded Corners",
    text: "Golden Ratio also boosts passive income.",
    tags: ["Passive"],
    minSides: 8,
    maxStacks: 4,
  },
  {
    id: "polishingWheel",
    name: "Polishing Wheel",
    text: "Every 4 Polish levels grants extra click power.",
    tags: ["Click"],
    minSides: 8,
    maxStacks: 3,
  },
  {
    id: "silentStudio",
    name: "Silent Studio",
    text: "Passive income doubled, manual clicks reduced.",
    tags: ["Passive"],
    minSides: 8,
    maxStacks: 1,
  },
  {
    id: "hammerRhythm",
    name: "Hammer Rhythm",
    text: "Combo clicks can trigger Auto-Chisel.",
    tags: ["Click", "Combo"],
    minSides: 8,
    maxStacks: 4,
  },
  {
    id: "cheapSketches",
    name: "Cheap Sketches",
    text: "Side costs -18%, other upgrade costs +12%.",
    tags: ["Cost"],
    minSides: 8,
    maxStacks: 2,
  },
  {
    id: "heavyGeometry",
    name: "Heavy Geometry",
    text: "Click gain x2, but the combo window is shorter.",
    tags: ["Click"],
    minSides: 16,
    maxStacks: 1,
  },
  {
    id: "softCurve",
    name: "Soft Curve",
    text: "Sides above 24 grant +2% to all point gain.",
    tags: ["Click", "Passive"],
    minSides: 16,
    maxStacks: 5,
  },
  {
    id: "mirrorDraft",
    name: "Mirror Draft",
    text: "The next artifact picked is applied twice.",
    tags: ["Draft"],
    minSides: 16,
    maxStacks: 3,
    transient: true,
  },
  {
    id: "draftPrism",
    name: "Draft Prism",
    text: "Future drafts offer 4 choices.",
    tags: ["Draft"],
    minSides: 16,
    maxStacks: 1,
  },
  {
    id: "archiveRoom",
    name: "Archive Room",
    text: "Every 5 drafted artifacts grants +10% all gain.",
    tags: ["Click", "Passive"],
    minSides: 16,
    maxStacks: 4,
  },
  {
    id: "circleTheory",
    name: "Circle Theory",
    text: "After side 48, all gains +35% and side costs -10%.",
    tags: ["Cost", "Passive"],
    minSides: 16,
    maxStacks: 3,
  },
];

const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));

const initialState = {
  version: SAVE_VERSION,
  points: 0,
  totalPoints: 0,
  sides: 3,
  pointsPerClick: 1,
  pointsPerSecond: 0,
  upgradeLevels: {
    polish: 0,
    drafting: 0,
    golden: 0,
    compass: 0,
    metronome: 0,
    autoChisel: 0,
  },
  artifacts: {},
  artifactChoices: [],
  pendingDraft: false,
  draftHistory: [],
  mirrorCharges: 0,
  circleAchieved: false,
  manualClicks: 0,
  kineticCharge: 0,
};

let state = loadState();
let lastTickAt = performance.now();
let lastSaveAt = performance.now();
let lastManualClickAt = performance.now();
let autoChiselAt = 0;
let reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastClickAt = 0;
let clickCombo = 0;
let comboTimeoutId = null;
let audioContext = null;
let draftRenderKey = "";
let artifactsRenderKey = "";

const elements = {
  resetButton: document.querySelector("#resetButton"),
  pointsValue: document.querySelector("#pointsValue"),
  clickValue: document.querySelector("#clickValue"),
  secondValue: document.querySelector("#secondValue"),
  sidesValue: document.querySelector("#sidesValue"),
  artifactCountValue: document.querySelector("#artifactCountValue"),
  shapeHeading: document.querySelector("#shapeHeading"),
  milestoneLine: document.querySelector("#milestoneLine"),
  shapeButton: document.querySelector("#shapeButton"),
  shapePolygon: document.querySelector("#shapePolygon"),
  shapeStopA: document.querySelector("#shapeStopA"),
  shapeStopB: document.querySelector("#shapeStopB"),
  clickBurstLayer: document.querySelector("#clickBurstLayer"),
  comboBadge: document.querySelector("#comboBadge"),
  nextShapeLabel: document.querySelector("#nextShapeLabel"),
  nextSideCost: document.querySelector("#nextSideCost"),
  nextSideProgress: document.querySelector("#nextSideProgress"),
  circleProgress: document.querySelector("#circleProgress"),
  upgradeList: document.querySelector("#upgradeList"),
  draftPanel: document.querySelector("#draftPanel"),
  draftChoices: document.querySelector("#draftChoices"),
  draftChoiceCount: document.querySelector("#draftChoiceCount"),
  artifactList: document.querySelector("#artifactList"),
  winPanel: document.querySelector("#winPanel"),
  winSummary: document.querySelector("#winSummary"),
};

elements.shapeButton.addEventListener("click", handleShapeClick);
elements.resetButton.addEventListener("click", resetGame);

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
motionQuery.addEventListener("change", (event) => {
  reduceMotion = event.matches;
});

ensureDraftChoices();
render();
setInterval(tickPassiveIncome, PASSIVE_TICK_MS);

function handleShapeClick(event) {
  const rect = elements.shapeButton.getBoundingClientRect();
  const isPointerClick = event.clientX !== 0 || event.clientY !== 0;
  const x = isPointerClick ? event.clientX - rect.left : rect.width / 2;
  const y = isPointerClick ? event.clientY - rect.top : rect.height / 2;

  updateClickCombo();
  state.manualClicks += 1;
  lastManualClickAt = performance.now();

  const gain = getClickGain({ manual: true });
  addPoints(gain);

  if (getArtifactCount("echoTap") > 0 && state.manualClicks % 5 === 0) {
    addPoints(gain * 0.5 * getArtifactCount("echoTap"));
  }

  if (getArtifactCount("kineticDraft") > 0 && clickCombo >= 3) {
    state.kineticCharge = Math.min(
      2,
      state.kineticCharge + 0.06 * getArtifactCount("kineticDraft"),
    );
  }

  if (getArtifactCount("hammerRhythm") > 0 && clickCombo >= 4) {
    const chance = 0.08 * getArtifactCount("hammerRhythm");
    if (Math.random() < chance) {
      fireAutoChisel("combo");
    }
  }

  pulseElement(elements.shapeButton, "is-clicked");
  vibrateClick();
  playClickTone(clickCombo);

  if (!reduceMotion) {
    addClickImpact(gain, x, y);
  }

  render();
}

function buyUpgrade(id) {
  if (id === "side") {
    buySide();
    return;
  }

  const upgrade = upgrades.find((item) => item.id === id);
  if (!upgrade || !upgrade.unlock(state)) {
    return;
  }

  const cost = getUpgradeCost(id);
  if (state.points < cost) {
    return;
  }

  state.points -= cost;
  state.upgradeLevels[id] += 1;

  if (id === "polish") {
    state.pointsPerClick += 1;
  }

  if (id === "drafting") {
    state.pointsPerSecond = roundTo(state.pointsPerSecond + 0.2, 1);
  }

  saveState();
  render();
  pulseUpgrade(id);
}

function buySide() {
  if (state.pendingDraft || state.sides >= CIRCLE_SIDES) {
    return;
  }

  const cost = getUpgradeCost("side");
  if (state.points < cost) {
    return;
  }

  state.points -= cost;
  state.sides += 1;

  const refund = cost * 0.08 * getArtifactCount("facetBank");
  if (refund > 0) {
    addPoints(refund);
  }

  if (state.sides >= CIRCLE_SIDES) {
    state.sides = CIRCLE_SIDES;
    state.circleAchieved = true;
  }

  state.pendingDraft = true;
  state.artifactChoices = generateDraftChoices();
  pulseElement(elements.shapeButton, "is-evolved", 760);
  saveState();
  render();
}

function chooseArtifact(id) {
  if (!state.pendingDraft || !state.artifactChoices.includes(id)) {
    return;
  }

  const artifact = artifactById.get(id);
  if (!artifact) {
    return;
  }

  let copies = 1;
  if (id === "mirrorDraft") {
    state.mirrorCharges += 1;
  } else {
    copies += state.mirrorCharges > 0 ? 1 : 0;
    state.mirrorCharges = Math.max(0, state.mirrorCharges - 1);
    state.artifacts[id] = Math.min(
      artifact.maxStacks,
      getArtifactCount(id) + copies,
    );
  }

  state.draftHistory.push({
    id,
    side: state.sides,
    copies,
    at: Date.now(),
  });
  state.pendingDraft = false;
  state.artifactChoices = [];
  saveState();
  render();
}

function tickPassiveIncome() {
  const now = performance.now();
  const elapsedSeconds = (now - lastTickAt) / 1000;
  lastTickAt = now;
  let changed = false;

  if (state.kineticCharge > 0) {
    state.kineticCharge = Math.max(0, state.kineticCharge - elapsedSeconds * 0.08);
    changed = true;
  }

  if (getArtifactCount("patientCompass") > 0) {
    changed = true;
  }

  const passiveGain = getPassiveGain() * elapsedSeconds;
  if (passiveGain > 0) {
    addPoints(passiveGain);
    changed = true;
  }

  if (state.upgradeLevels.autoChisel > 0 && now >= autoChiselAt) {
    fireAutoChisel("timer");
    const interval = Math.max(900, 3300 - state.upgradeLevels.autoChisel * 260);
    autoChiselAt = now + interval;
    changed = true;
  }

  if (changed || now - lastSaveAt >= AUTOSAVE_MS) {
    render();
  }

  if (now - lastSaveAt >= AUTOSAVE_MS) {
    saveState();
  }
}

function fireAutoChisel(source) {
  const level = Math.max(1, state.upgradeLevels.autoChisel);
  const gain = getClickGain({ manual: false }) * (0.35 + level * 0.1);
  addPoints(gain);

  if (!reduceMotion && source !== "timer") {
    const rect = elements.shapeButton.getBoundingClientRect();
    addClickImpact(gain, rect.width / 2, rect.height / 2);
  }
}

function addPoints(amount) {
  state.points += amount;
  state.totalPoints += amount;
}

function render() {
  const sideCost = getUpgradeCost("side");
  const effects = getEffects();
  const currentName = getCurrentShapeName();
  const progressToNext = sideCost > 0 ? Math.max(0, Math.min(100, (state.points / sideCost) * 100)) : 100;
  const circleProgress = ((state.sides - 3) / (CIRCLE_SIDES - 3)) * 100;
  const [colorA, colorB] = palette[(state.sides - 3) % palette.length];

  elements.pointsValue.textContent = formatNumber(state.points);
  elements.clickValue.textContent = formatNumber(getClickGain({ manual: true }));
  elements.secondValue.textContent = formatNumber(getPassiveGain());
  elements.sidesValue.textContent = `${state.sides} / ${CIRCLE_SIDES}`;
  elements.artifactCountValue.textContent = String(getArtifactTotal());
  elements.shapeHeading.textContent = currentName;
  elements.milestoneLine.textContent = getMilestoneText(effects);

  elements.shapePolygon.setAttribute("points", getPolygonPoints(state.sides));
  elements.shapeStopA.setAttribute("stop-color", colorA);
  elements.shapeStopB.setAttribute("stop-color", colorB);
  elements.shapeButton.classList.toggle("is-circle", state.circleAchieved);

  elements.nextShapeLabel.textContent = getNextLabel();
  elements.nextSideCost.textContent = state.circleAchieved
    ? "Goal complete"
    : `${formatNumber(sideCost)} points`;
  elements.nextSideProgress.style.width = `${progressToNext}%`;
  elements.circleProgress.style.width = `${circleProgress}%`;

  renderUpgrades();
  renderDraft();
  renderArtifacts();
  renderWinPanel();
}

function renderUpgrades() {
  const buttons = upgrades.map((upgrade) => {
    const existing = elements.upgradeList.querySelector(`[data-upgrade="${upgrade.id}"]`);
    const button = existing ?? createUpgradeButton(upgrade);
    updateUpgradeButton(button, upgrade);
    return button;
  });

  const currentOrder = [...elements.upgradeList.children]
    .map((button) => button.dataset.upgrade)
    .join("|");
  const nextOrder = upgrades.map((upgrade) => upgrade.id).join("|");

  if (currentOrder !== nextOrder) {
    elements.upgradeList.replaceChildren(...buttons);
  }
}

function createUpgradeButton(upgrade) {
  const button = document.createElement("button");
  button.className = "upgrade-button";
  button.type = "button";
  button.dataset.upgrade = upgrade.id;
  button.addEventListener("click", () => buyUpgrade(upgrade.id));

  const content = document.createElement("span");
  const title = document.createElement("strong");
  title.className = "upgrade-title";
  const description = document.createElement("small");
  description.className = "upgrade-description";
  content.append(title, description);

  const price = document.createElement("b");
  price.className = "upgrade-cost";

  button.append(content, price);
  return button;
}

function updateUpgradeButton(button, upgrade) {
  const title = button.querySelector(".upgrade-title");
  const description = button.querySelector(".upgrade-description");
  const price = button.querySelector(".upgrade-cost");
  const cost = getUpgradeCost(upgrade.id);
  const locked = !upgrade.unlock(state);
  const blockedByDraft = upgrade.id === "side" && state.pendingDraft;
  const completed = upgrade.id === "side" && state.circleAchieved;

  title.textContent = upgrade.name;
  description.textContent = locked ? upgrade.locked : upgrade.description(state);
  price.textContent = completed
    ? "Done"
    : formatNumber(cost);

  button.disabled =
    locked ||
    blockedByDraft ||
    completed ||
    state.points < cost;

  if (blockedByDraft) {
    description.textContent = "Choose an artifact before adding another side.";
  }
}

function renderDraft() {
  ensureDraftChoices();

  elements.draftPanel.hidden = !state.pendingDraft;
  if (!state.pendingDraft) {
    if (draftRenderKey !== "") {
      elements.draftChoices.replaceChildren();
      draftRenderKey = "";
    }
    return;
  }

  const nextDraftRenderKey = state.artifactChoices.join("|");
  elements.draftChoiceCount.textContent = `${state.artifactChoices.length} choices`;

  if (draftRenderKey === nextDraftRenderKey) {
    return;
  }

  const choiceButtons = state.artifactChoices.map((id) => {
    const artifact = artifactById.get(id);
    const button = document.createElement("button");
    button.className = "draft-card";
    button.type = "button";
    button.addEventListener("click", () => chooseArtifact(id));

    const title = document.createElement("strong");
    title.textContent = artifact.name;
    const text = document.createElement("span");
    text.textContent = artifact.text;
    const tags = document.createElement("small");
    tags.textContent = artifact.tags.join(" / ");

    button.append(title, text, tags);
    return button;
  });

  elements.draftChoices.replaceChildren(...choiceButtons);
  draftRenderKey = nextDraftRenderKey;
}

function renderArtifacts() {
  const nextArtifactsRenderKey = JSON.stringify({
    artifacts: state.artifacts,
    mirrorCharges: state.mirrorCharges,
  });

  if (artifactsRenderKey === nextArtifactsRenderKey) {
    return;
  }

  const active = artifacts
    .filter((artifact) => getArtifactCount(artifact.id) > 0)
    .map((artifact) => renderArtifactPill(artifact, getArtifactCount(artifact.id)));

  if (state.mirrorCharges > 0) {
    const mirror = document.createElement("div");
    mirror.className = "artifact-pill";
    mirror.innerHTML = `<strong>Mirror Charge x${state.mirrorCharges}</strong><span>Next artifact applies twice.</span>`;
    active.unshift(mirror);
  }

  if (active.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-line";
    empty.textContent = "Add a side to draft your first artifact.";
    elements.artifactList.replaceChildren(empty);
    artifactsRenderKey = nextArtifactsRenderKey;
    return;
  }

  elements.artifactList.replaceChildren(...active);
  artifactsRenderKey = nextArtifactsRenderKey;
}

function renderArtifactPill(artifact, count) {
  const item = document.createElement("div");
  item.className = "artifact-pill";

  const title = document.createElement("strong");
  title.textContent = `${artifact.name} x${count}`;
  const text = document.createElement("span");
  text.textContent = artifact.text;

  item.append(title, text);
  return item;
}

function renderWinPanel() {
  elements.winPanel.hidden = !state.circleAchieved;
  if (!state.circleAchieved) {
    return;
  }

  elements.winSummary.textContent =
    `${getArtifactTotal()} artifacts drafted. ${formatNumber(state.totalPoints)} total points shaped.`;
}

function getUpgradeCost(id) {
  const effects = getEffects();

  if (id === "side") {
    if (state.circleAchieved) {
      return Infinity;
    }

    const raw = 18 * Math.pow(1.24, state.sides - 3) * effects.sideCostMultiplier;
    return Math.max(1, Math.floor(raw));
  }

  const upgrade = upgrades.find((item) => item.id === id);
  if (!upgrade || !upgrade.scale) {
    return Infinity;
  }

  const level = state.upgradeLevels[id] ?? 0;
  return Math.max(
    1,
    Math.floor(upgrade.baseCost * Math.pow(upgrade.scale, level) * effects.upgradeCostMultiplier),
  );
}

function getClickGain({ manual }) {
  const effects = getEffects();
  const polishingWheelBonus =
    Math.floor(state.upgradeLevels.polish / 4) * getArtifactCount("polishingWheel");
  const baseClick = state.pointsPerClick + polishingWheelBonus;
  const manualMultiplier = manual && getArtifactCount("silentStudio") > 0 ? 0.75 : 1;
  return roundTo(baseClick * effects.clickMultiplier * effects.allGainMultiplier * manualMultiplier, 2);
}

function getPassiveGain() {
  const effects = getEffects();
  return roundTo(state.pointsPerSecond * effects.passiveMultiplier * effects.allGainMultiplier, 2);
}

function getEffects() {
  const compassLevel = state.upgradeLevels.compass;
  const metronomeLevel = state.upgradeLevels.metronome;
  const secondsSinceClick = Math.max(0, (performance.now() - lastManualClickAt) / 1000);
  const oddSide = state.sides % 2 === 1;
  const evenSide = state.sides % 2 === 0;
  const sidesAbove24 = Math.max(0, state.sides - 24);
  const archiveSets = Math.floor(state.draftHistory.length / 5);
  const circleTheoryActive = state.sides >= 48 ? getArtifactCount("circleTheory") : 0;

  let clickMultiplier = Math.pow(1.35, state.upgradeLevels.golden);
  let passiveMultiplier = 1;
  let sideCostMultiplier = Math.pow(0.97, compassLevel);
  let upgradeCostMultiplier = 1;
  let allGainMultiplier = 1;
  let comboWindow = 850 + metronomeLevel * 90;

  if (oddSide) {
    clickMultiplier *= 1 + 0.15 * getArtifactCount("sharpEdges");
  }

  if (evenSide) {
    passiveMultiplier *= 1 + 0.2 * getArtifactCount("evenPlane");
  }

  if (getArtifactCount("comboLens") > 0) {
    clickMultiplier *= 1 + Math.min(0.4, clickCombo * 0.025 * getArtifactCount("comboLens"));
  }

  if (getArtifactCount("patientCompass") > 0) {
    const discount = Math.min(0.2, secondsSinceClick * 0.01 * getArtifactCount("patientCompass"));
    sideCostMultiplier *= 1 - discount;
  }

  if (getArtifactCount("kineticDraft") > 0) {
    passiveMultiplier *= 1 + state.kineticCharge;
  }

  if (getArtifactCount("gildedCorners") > 0) {
    passiveMultiplier *= 1 + state.upgradeLevels.golden * 0.1 * getArtifactCount("gildedCorners");
  }

  if (getArtifactCount("silentStudio") > 0) {
    passiveMultiplier *= 2;
  }

  if (getArtifactCount("cheapSketches") > 0) {
    sideCostMultiplier *= Math.pow(0.82, getArtifactCount("cheapSketches"));
    upgradeCostMultiplier *= Math.pow(1.12, getArtifactCount("cheapSketches"));
  }

  if (getArtifactCount("heavyGeometry") > 0) {
    clickMultiplier *= 2;
    comboWindow *= 0.58;
  }

  if (getArtifactCount("softCurve") > 0 && sidesAbove24 > 0) {
    allGainMultiplier *= 1 + sidesAbove24 * 0.02 * getArtifactCount("softCurve");
  }

  if (getArtifactCount("archiveRoom") > 0 && archiveSets > 0) {
    allGainMultiplier *= 1 + archiveSets * 0.1 * getArtifactCount("archiveRoom");
  }

  if (circleTheoryActive > 0) {
    allGainMultiplier *= 1 + 0.35 * circleTheoryActive;
    sideCostMultiplier *= Math.pow(0.9, circleTheoryActive);
  }

  return {
    allGainMultiplier,
    clickMultiplier,
    passiveMultiplier,
    sideCostMultiplier,
    upgradeCostMultiplier,
    comboWindow,
  };
}

function ensureDraftChoices() {
  if (state.pendingDraft && state.artifactChoices.length === 0) {
    state.artifactChoices = generateDraftChoices();
  }
}

function generateDraftChoices() {
  const choiceCount = getArtifactCount("draftPrism") > 0 ? 4 : 3;
  const eligible = artifacts.filter((artifact) => {
    if (artifact.minSides > state.sides) {
      return false;
    }

    if (artifact.id === "mirrorDraft") {
      return state.mirrorCharges < artifact.maxStacks;
    }

    return getArtifactCount(artifact.id) < artifact.maxStacks;
  });

  shuffle(eligible);
  return eligible.slice(0, choiceCount).map((artifact) => artifact.id);
}

function getArtifactCount(id) {
  return state.artifacts[id] ?? 0;
}

function getArtifactTotal() {
  return Object.values(state.artifacts).reduce((total, count) => total + count, 0);
}

function getCurrentShapeName() {
  if (state.circleAchieved) {
    return "Circle";
  }

  return capitalize(getShapeName(state.sides));
}

function getNextLabel() {
  if (state.circleAchieved) {
    return "Circle achieved";
  }

  return `Next: ${getShapeName(state.sides + 1)}`;
}

function getPolygonPoints(sides) {
  const center = 100;
  const radius = sides >= CIRCLE_SIDES ? 80 : 76;
  const startAngle = -Math.PI / 2;
  const points = [];

  for (let index = 0; index < sides; index += 1) {
    const angle = startAngle + (index / sides) * Math.PI * 2;
    const x = roundTo(center + Math.cos(angle) * radius, 2);
    const y = roundTo(center + Math.sin(angle) * radius, 2);
    points.push(`${x},${y}`);
  }

  return points.join(" ");
}

function getShapeName(sides) {
  return shapeNames.get(sides) ?? `${sides}-gon`;
}

function getMilestoneText(effects) {
  if (state.circleAchieved) {
    return "Circle achieved. The studio keeps humming.";
  }

  if (state.pendingDraft) {
    return "New side forged. Choose an artifact to bend this run.";
  }

  if (state.sides >= 48) {
    return "Circle theory is close enough to feel.";
  }

  if (state.sides >= 32) {
    return "The polygon is smoothing into motion.";
  }

  if (state.sides >= 16) {
    return `Shape-defining artifacts are live. Gain x${formatNumber(effects.allGainMultiplier)}.`;
  }

  if (state.sides >= 8) {
    return "Rare artifacts and stronger tools are entering the studio.";
  }

  return "Add sides, draft artifacts, and forge toward 64.";
}

function updateClickCombo() {
  const now = performance.now();
  const comboWindow = getEffects().comboWindow;
  clickCombo = now - lastClickAt <= comboWindow ? clickCombo + 1 : 1;
  lastClickAt = now;

  window.clearTimeout(comboTimeoutId);
  if (clickCombo >= 3) {
    elements.comboBadge.textContent = `${clickCombo} hit rhythm`;
    elements.comboBadge.classList.add("is-visible");
  }

  comboTimeoutId = window.setTimeout(() => {
    clickCombo = 0;
    elements.comboBadge.classList.remove("is-visible");
    render();
  }, comboWindow + 180);
}

function addClickImpact(amount, x, y) {
  addClickRipple(x, y);
  addClickBurst(amount, x, y);
  addClickSparks(x, y);
}

function addClickRipple(x, y) {
  const ripple = document.createElement("span");
  ripple.className = "click-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  elements.clickBurstLayer.append(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
}

function addClickBurst(amount, x, y) {
  const burst = document.createElement("span");
  burst.className = "click-burst";
  burst.textContent = `+${formatNumber(amount)}`;
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  elements.clickBurstLayer.append(burst);
  burst.addEventListener("animationend", () => burst.remove(), { once: true });
}

function addClickSparks(x, y) {
  const colors = ["#f05d5e", "#d4a72c", "#2f8f83", "#3f82bc", "#7d65b8"];
  const sparkCount = Math.min(12, 5 + Math.floor(clickCombo / 2));

  for (let index = 0; index < sparkCount; index += 1) {
    const spark = document.createElement("span");
    const angle = (index / sparkCount) * Math.PI * 2 + Math.random() * 0.45;
    const distance = 44 + Math.random() * 54 + Math.min(clickCombo, 8) * 4;
    const sparkX = Math.cos(angle) * distance;
    const sparkY = Math.sin(angle) * distance;

    spark.className = "click-spark";
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.setProperty("--spark-x", `${sparkX}px`);
    spark.style.setProperty("--spark-y", `${sparkY}px`);
    spark.style.setProperty("--spark-rotate", `${Math.round(angle * 57.3)}deg`);
    spark.style.setProperty("--spark-color", colors[index % colors.length]);
    elements.clickBurstLayer.append(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

function vibrateClick() {
  if ("vibrate" in navigator) {
    navigator.vibrate(clickCombo >= 5 ? [8, 20, 8] : 10);
  }
}

function playClickTone(combo) {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const baseFrequency = 190 + Math.min(combo, 12) * 18;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(baseFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(baseFrequency * 1.7, now + 0.035);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.09);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.09);
  } catch {
    audioContext = null;
  }
}

function pulseElement(element, className, duration = 380) {
  element.classList.remove(className);
  window.requestAnimationFrame(() => {
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
  });
}

function pulseUpgrade(id) {
  const button = elements.upgradeList.querySelector(`[data-upgrade="${id}"]`);
  if (button) {
    pulseElement(button, "is-purchased", 420);
  }
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  lastSaveAt = performance.now();
}

function loadState() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) {
    return cloneInitialState();
  }

  try {
    const parsed = JSON.parse(saved);
    return normalizeState(parsed);
  } catch {
    return cloneInitialState();
  }
}

function normalizeState(saved) {
  const nextState = cloneInitialState();
  const oldUpgradeLevels = saved.upgradeLevels ?? {};

  nextState.points = cleanNumber(saved.points, 0);
  nextState.totalPoints = cleanNumber(saved.totalPoints, 0);
  nextState.sides = Math.min(
    CIRCLE_SIDES,
    Math.max(3, Math.floor(cleanNumber(saved.sides, 3))),
  );
  nextState.pointsPerClick = Math.max(1, cleanNumber(saved.pointsPerClick, 1));
  nextState.pointsPerSecond = Math.max(0, cleanNumber(saved.pointsPerSecond, 0));
  nextState.upgradeLevels.polish = Math.max(
    0,
    Math.floor(cleanNumber(oldUpgradeLevels.polish ?? saved.polishLevel, 0)),
  );
  nextState.upgradeLevels.drafting = Math.max(
    0,
    Math.floor(cleanNumber(oldUpgradeLevels.drafting ?? saved.draftingLevel, 0)),
  );
  nextState.upgradeLevels.golden = Math.max(
    0,
    Math.floor(cleanNumber(oldUpgradeLevels.golden ?? saved.goldenLevel, 0)),
  );
  nextState.upgradeLevels.compass = Math.max(
    0,
    Math.floor(cleanNumber(oldUpgradeLevels.compass, 0)),
  );
  nextState.upgradeLevels.metronome = Math.max(
    0,
    Math.floor(cleanNumber(oldUpgradeLevels.metronome, 0)),
  );
  nextState.upgradeLevels.autoChisel = Math.max(
    0,
    Math.floor(cleanNumber(oldUpgradeLevels.autoChisel, 0)),
  );

  nextState.artifacts = normalizeArtifacts(saved.artifacts);
  nextState.artifactChoices = Array.isArray(saved.artifactChoices)
    ? saved.artifactChoices.filter((id) => artifactById.has(id))
    : [];
  nextState.pendingDraft = Boolean(saved.pendingDraft);
  nextState.draftHistory = Array.isArray(saved.draftHistory) ? saved.draftHistory : [];
  nextState.mirrorCharges = Math.max(0, Math.floor(cleanNumber(saved.mirrorCharges, 0)));
  nextState.circleAchieved = Boolean(saved.circleAchieved) || nextState.sides >= CIRCLE_SIDES;
  nextState.manualClicks = Math.max(0, Math.floor(cleanNumber(saved.manualClicks, 0)));
  nextState.kineticCharge = Math.max(0, cleanNumber(saved.kineticCharge, 0));

  return nextState;
}

function normalizeArtifacts(savedArtifacts) {
  const normalized = {};
  if (!savedArtifacts || typeof savedArtifacts !== "object") {
    return normalized;
  }

  for (const [id, value] of Object.entries(savedArtifacts)) {
    const artifact = artifactById.get(id);
    if (!artifact || artifact.transient) {
      continue;
    }

    normalized[id] = Math.min(
      artifact.maxStacks,
      Math.max(0, Math.floor(cleanNumber(value, 0))),
    );
  }

  return normalized;
}

function resetGame() {
  const confirmed = window.confirm("Reset Polygon Forge progress?");
  if (!confirmed) {
    return;
  }

  state = cloneInitialState();
  clickCombo = 0;
  state.artifactChoices = [];
  localStorage.removeItem(SAVE_KEY);
  render();
}

function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[otherIndex]] = [items[otherIndex], items[index]];
  }
}

function cleanNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function formatNumber(value) {
  if (value === Infinity) {
    return "-";
  }

  if (value >= 1000000) {
    return Intl.NumberFormat("en", {
      maximumFractionDigits: 2,
      notation: "compact",
    }).format(value);
  }

  if (value >= 1000) {
    return Intl.NumberFormat("en", {
      maximumFractionDigits: 1,
    }).format(value);
  }

  if (!Number.isInteger(value)) {
    return Intl.NumberFormat("en", {
      maximumFractionDigits: 1,
    }).format(value);
  }

  return Intl.NumberFormat("en").format(value);
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
