const SAVE_KEY = "lightWheelSave";
const SAVE_VERSION = 1;
const SEGMENTS = 24;
const FINAL_STAGE = 8;
const AUTOSAVE_MS = 5000;
const PASSIVE_TICK_MS = 250;

const runUpgrades = [
  {
    id: "target",
    name: "Wider Target",
    description: () => "Adds target coverage up to 3 lights.",
    baseCost: 32,
    scale: 2.15,
    max: 2,
  },
  {
    id: "payout",
    name: "Payout Lamps",
    description: () => "+35% credits from hits.",
    baseCost: 24,
    scale: 1.72,
  },
  {
    id: "brake",
    name: "Soft Brake",
    description: () => "Slightly slows the wheel this run.",
    baseCost: 42,
    scale: 1.95,
    max: 6,
  },
  {
    id: "streak",
    name: "Streak Relay",
    description: () => "Streaks add more payout.",
    baseCost: 70,
    scale: 1.9,
  },
  {
    id: "auto",
    name: "Auto Spinner",
    description: () => "Generates passive credits.",
    baseCost: 130,
    scale: 2.05,
  },
];

const ticketUpgrades = [
  {
    id: "starter",
    name: "Starter Credits",
    description: (level) => `Begin runs with ${formatNumber((level + 1) * 30)} credits.`,
    baseCost: 1,
    scale: 1.8,
  },
  {
    id: "steady",
    name: "Steady Hand",
    description: () => "Permanent +8% hit payout.",
    baseCost: 2,
    scale: 2,
    max: 8,
  },
  {
    id: "wide",
    name: "Marked Glass",
    description: () => "First Wider Target level is free.",
    baseCost: 4,
    scale: 3,
    max: 1,
  },
];

const relics = [
  {
    id: "goldMemory",
    name: "Gold Memory",
    text: "Perfect hits charge jackpot 35% faster.",
    tags: ["Perfect"],
    maxStacks: 4,
    apply: "stack",
  },
  {
    id: "mercyBulb",
    name: "Mercy Bulb",
    text: "The first miss after each jackpot keeps your streak.",
    tags: ["Streak"],
    maxStacks: 3,
    apply: "stack",
  },
  {
    id: "creditEcho",
    name: "Credit Echo",
    text: "Good hits repeat 25% of their payout.",
    tags: ["Credits"],
    maxStacks: 4,
    apply: "stack",
  },
  {
    id: "steadyMotor",
    name: "Steady Motor",
    text: "Wheel speed is reduced by 7%.",
    tags: ["Speed"],
    maxStacks: 3,
    apply: "stack",
  },
  {
    id: "neonFuse",
    name: "Neon Fuse",
    text: "Streak bonus is 30% stronger.",
    tags: ["Streak"],
    maxStacks: 4,
    apply: "stack",
  },
  {
    id: "sidePocket",
    name: "Side Pocket",
    text: "Misses still pay 20% of a good hit.",
    tags: ["Miss"],
    maxStacks: 3,
    apply: "stack",
  },
  {
    id: "prizeLadder",
    name: "Prize Ladder",
    text: "Advancing stages pays bonus credits.",
    tags: ["Stage"],
    maxStacks: 4,
    apply: "stack",
  },
  {
    id: "wideHalo",
    name: "Wide Halo",
    text: "Target can grow to 4 lights.",
    tags: ["Target"],
    maxStacks: 1,
    apply: "stack",
  },
  {
    id: "mirrorLens",
    name: "Mirror Lens",
    text: "Your next relic applies twice.",
    tags: ["Draft"],
    maxStacks: 2,
    apply: "charge",
  },
];

const relicById = new Map(relics.map((relic) => [relic.id, relic]));

const defaultRunUpgrades = {
  target: 0,
  payout: 0,
  brake: 0,
  streak: 0,
  auto: 0,
};

const defaultTicketUpgrades = {
  starter: 0,
  steady: 0,
  wide: 0,
};

const initialState = {
  version: SAVE_VERSION,
  credits: 0,
  totalCredits: 0,
  stage: 1,
  jackpot: 0,
  streak: 0,
  bestStreak: 0,
  runPerfectHits: 0,
  perfectHits: 0,
  totalHits: 0,
  misses: 0,
  run: 1,
  tickets: 0,
  runUpgrades: { ...defaultRunUpgrades },
  ticketUpgrades: { ...defaultTicketUpgrades },
  relics: {},
  relicChoices: [],
  pendingDraft: false,
  mirrorCharges: 0,
  mercyCharges: 0,
  targetStart: 0,
  lastResult: "ready",
  lastAwardedTickets: 0,
};

let state = loadState();
let wheelPosition = 0;
let activeIndex = 0;
let lastFrameAt = performance.now();
let lastPassiveAt = performance.now();
let lastSaveAt = performance.now();
let reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let draftRenderKey = "";
let relicRenderKey = "";
let upgradeRenderKey = "";
let resultTimer = 0;

const elements = {
  resetButton: document.querySelector("#resetButton"),
  creditsValue: document.querySelector("#creditsValue"),
  streakValue: document.querySelector("#streakValue"),
  stageValue: document.querySelector("#stageValue"),
  resultLine: document.querySelector("#resultLine"),
  wheelSvg: document.querySelector("#wheelSvg"),
  jackpotValue: document.querySelector("#jackpotValue"),
  jackpotPercent: document.querySelector("#jackpotPercent"),
  jackpotMeterLabel: document.querySelector("#jackpotMeterLabel"),
  jackpotProgress: document.querySelector("#jackpotProgress"),
  targetLabel: document.querySelector("#targetLabel"),
  payoutLabel: document.querySelector("#payoutLabel"),
  stopButton: document.querySelector("#stopButton"),
  upgradeList: document.querySelector("#upgradeList"),
  shopCredits: document.querySelector("#shopCredits"),
  overlay: document.querySelector("#overlay"),
  draftPanel: document.querySelector("#draftPanel"),
  draftChoices: document.querySelector("#draftChoices"),
  draftCount: document.querySelector("#draftCount"),
  relicList: document.querySelector("#relicList"),
  runCompletePanel: document.querySelector("#runCompletePanel"),
  runCompleteText: document.querySelector("#runCompleteText"),
  runContinueButton: document.querySelector("#runContinueButton"),
  tabs: [...document.querySelectorAll(".tab")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
};

let segmentNodes = [];

elements.resetButton.addEventListener("click", resetGame);
elements.stopButton.addEventListener("click", stopWheel);
elements.runContinueButton.addEventListener("click", dismissRunComplete);
elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => setTab(tab.dataset.tab));
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  if (event.code !== "Space" && event.code !== "Enter") {
    return;
  }

  const tagName = document.activeElement?.tagName;
  if (tagName === "BUTTON" && document.activeElement !== elements.stopButton) {
    return;
  }

  event.preventDefault();
  stopWheel();
});

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
motionQuery.addEventListener("change", (event) => {
  reduceMotion = event.matches;
});

buildWheel();
normalizeRunStart();
ensureTarget();
ensureDraftChoices();
render();
setInterval(tickPassiveIncome, PASSIVE_TICK_MS);
requestAnimationFrame(tickWheel);

function buildWheel() {
  const cx = 50;
  const cy = 50;
  const outer = 47;
  const inner = 30;
  const step = 360 / SEGMENTS;
  const point = (radius, degrees) => {
    const angle = ((degrees - 90) * Math.PI) / 180;
    return [
      (cx + radius * Math.cos(angle)).toFixed(2),
      (cy + radius * Math.sin(angle)).toFixed(2),
    ];
  };

  let markup = `
    <defs>
      <filter id="wheelPixelFilter" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
        <feComponentTransfer in="SourceGraphic" result="posterized">
          <feFuncR type="discrete" tableValues="0.05 0.12 0.28 0.48 0.72 0.9 1"/>
          <feFuncG type="discrete" tableValues="0.03 0.09 0.18 0.36 0.58 0.78 0.96"/>
          <feFuncB type="discrete" tableValues="0.02 0.06 0.12 0.24 0.42 0.68 0.9"/>
          <feFuncA type="identity"/>
        </feComponentTransfer>
        <feDropShadow in="posterized" dx="0.7" dy="0.7" stdDeviation="0" flood-color="#07000b" flood-opacity="0.95"/>
        <feDropShadow dx="0" dy="0" stdDeviation="0.55" flood-color="#ffd12c" flood-opacity="0.42"/>
      </filter>
      <pattern id="wheelPixelGrid" width="2" height="2" patternUnits="userSpaceOnUse">
        <path d="M 2 0 L 0 0 0 2" fill="none" stroke="#fff4b8" stroke-width="0.09" opacity="0.18"/>
      </pattern>
    </defs>
    <rect class="pixel-grid" x="3" y="3" width="94" height="94" rx="0" fill="url(#wheelPixelGrid)"/>
    <g class="wheel-filtered">
      <g class="rim-bulbs">`;
  for (let index = 0; index < SEGMENTS; index += 1) {
    const [x, y] = point(47.5, index * step + step / 2);
    markup += `<circle class="rim-bulb ${index % 2 === 0 ? "is-gold" : "is-red"}" cx="${x}" cy="${y}" r="1.35"/>`;
  }
  markup += `
      </g>
      <g class="ring">`;
  const hubPoints = [];
  for (let index = 0; index < SEGMENTS; index += 1) {
    const [ix0, iy0] = point(inner, index * step);
    const [ox0, oy0] = point(outer, index * step);
    const [ox1, oy1] = point(outer, (index + 1) * step);
    const [ix1, iy1] = point(inner, (index + 1) * step);
    hubPoints.push(`${ix0},${iy0}`);
    markup +=
      `<g class="segment" data-index="${index}">` +
      `<polygon class="facet" points="${ix0},${iy0} ${ox0},${oy0} ${ox1},${oy1}"/>` +
      `<polygon class="facet alt" points="${ix0},${iy0} ${ox1},${oy1} ${ix1},${iy1}"/>` +
      "</g>";
  }
  markup += "</g>";
  markup += `<polygon class="hub" points="${hubPoints.join(" ")}"/>`;
  markup += "</g>";

  elements.wheelSvg.innerHTML = markup;
  segmentNodes = [...elements.wheelSvg.querySelectorAll(".segment")];
}

function setTab(name) {
  elements.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === name));
  elements.tabPanels.forEach((panel) =>
    panel.classList.toggle("is-active", panel.dataset.panel === name),
  );
}

function dismissRunComplete() {
  state.lastAwardedTickets = 0;
  saveState();
  render();
}

function tickWheel(now) {
  const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;

  const speed = getWheelSpeed();
  const motionScale = reduceMotion ? 0.55 : 1;
  wheelPosition = (wheelPosition + speed * dt * motionScale) % SEGMENTS;
  const nextIndex = Math.floor(wheelPosition) % SEGMENTS;
  resultTimer = Math.max(0, resultTimer - dt);

  if (nextIndex !== activeIndex || resultTimer > 0) {
    activeIndex = nextIndex;
    renderWheelLights();
  }

  requestAnimationFrame(tickWheel);
}

function stopWheel() {
  if (state.pendingDraft) {
    setResult("Choose a relic before the wheel advances.", "miss");
    return;
  }

  const accuracy = getAccuracy(activeIndex);
  const effects = getEffects();
  const goodPayout = getGoodPayout(effects);
  let gain = 0;
  let jackpotGain = 0;

  state.totalHits += 1;

  if (accuracy === "perfect") {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.runPerfectHits += 1;
    state.perfectHits += 1;
    gain = goodPayout * 2.6 * getStreakMultiplier(effects);
    jackpotGain = 28 * effects.jackpotMultiplier;
    setResult(`Perfect stop. +${formatNumber(gain)} credits.`, "perfect");
  } else if (accuracy === "good") {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    gain = goodPayout * getStreakMultiplier(effects);
    gain += gain * 0.25 * getRelicCount("creditEcho");
    jackpotGain = 14 * effects.jackpotMultiplier;
    setResult(`Good stop. +${formatNumber(gain)} credits.`, "good");
  } else {
    state.misses += 1;
    gain = goodPayout * 0.2 * getRelicCount("sidePocket");
    jackpotGain = gain > 0 ? 4 : 0;

    if (state.mercyCharges > 0) {
      state.mercyCharges -= 1;
      setResult(`Mercy held the streak. +${formatNumber(gain)} credits.`, "miss");
    } else {
      state.streak = 0;
      setResult(gain > 0 ? `Glancing miss. +${formatNumber(gain)} credits.` : "Miss. Streak reset.", "miss");
    }
  }

  if (gain > 0) {
    addCredits(gain);
  }

  state.jackpot += jackpotGain;
  pulseMachine();
  advanceTarget();
  checkJackpot();
  saveState();
  render();
}

function checkJackpot() {
  const requirement = getJackpotRequirement();
  if (state.jackpot < requirement) {
    return;
  }

  state.jackpot -= requirement;

  if (state.stage >= FINAL_STAGE) {
    completeRun();
    return;
  }

  state.stage += 1;
  state.mercyCharges = getRelicCount("mercyBulb");
  const stageBonus = getRelicCount("prizeLadder") * state.stage * 18;
  if (stageBonus > 0) {
    addCredits(stageBonus);
  }
  state.pendingDraft = true;
  state.relicChoices = generateRelicChoices();
  setResult(`Stage ${state.stage} lit. Choose a relic.`, "perfect");
}

function completeRun() {
  const awarded = getTicketAward();
  const nextRun = state.run + 1;
  const ticketUpgrades = { ...state.ticketUpgrades };
  const tickets = state.tickets + awarded;
  const totalCredits = state.totalCredits;
  const bestStreak = state.bestStreak;
  const perfectHits = state.perfectHits;
  const totalHits = state.totalHits;
  const misses = state.misses;

  state = {
    ...structuredClone(initialState),
    run: nextRun,
    tickets,
    totalCredits,
    bestStreak,
    runPerfectHits: 0,
    perfectHits,
    totalHits,
    misses,
    ticketUpgrades,
    lastAwardedTickets: awarded,
    lastResult: "complete",
  };
  normalizeRunStart();
  advanceTarget();
  wheelPosition = 0;
  activeIndex = 0;
  setResult("Run complete. A stronger wheel is ready.", "perfect");
}

function buyRunUpgrade(id) {
  if (state.pendingDraft) {
    return;
  }

  const upgrade = runUpgrades.find((item) => item.id === id);
  if (!upgrade) {
    return;
  }

  const level = state.runUpgrades[id] ?? 0;
  if (upgrade.max && level >= upgrade.max) {
    return;
  }

  const cost = getRunUpgradeCost(upgrade);
  if (state.credits < cost) {
    return;
  }

  state.credits -= cost;
  state.runUpgrades[id] = level + 1;
  saveState();
  render();
}

function buyTicketUpgrade(id) {
  const upgrade = ticketUpgrades.find((item) => item.id === id);
  if (!upgrade) {
    return;
  }

  const level = state.ticketUpgrades[id] ?? 0;
  if (upgrade.max && level >= upgrade.max) {
    return;
  }

  const cost = getTicketUpgradeCost(upgrade);
  if (state.tickets < cost) {
    return;
  }

  state.tickets -= cost;
  state.ticketUpgrades[id] = level + 1;
  normalizeRunStart();
  saveState();
  render();
}

function chooseRelic(id) {
  if (!state.pendingDraft || !state.relicChoices.includes(id)) {
    return;
  }

  const relic = relicById.get(id);
  if (!relic) {
    return;
  }

  if (relic.apply === "charge") {
    state.mirrorCharges = Math.min(relic.maxStacks, state.mirrorCharges + 1);
  } else {
    const copies = 1 + (state.mirrorCharges > 0 ? 1 : 0);
    state.mirrorCharges = Math.max(0, state.mirrorCharges - 1);
    state.relics[id] = Math.min(relic.maxStacks, getRelicCount(id) + copies);
  }

  state.pendingDraft = false;
  state.relicChoices = [];
  setResult(`${relic.name} added to this run.`, "good");
  saveState();
  render();
}

function tickPassiveIncome() {
  const now = performance.now();
  const elapsed = (now - lastPassiveAt) / 1000;
  lastPassiveAt = now;

  const passive = getPassiveCredits() * elapsed;
  if (passive > 0 && !state.pendingDraft) {
    addCredits(passive);
    render();
  }

  if (now - lastSaveAt >= AUTOSAVE_MS) {
    saveState();
  }
}

function render() {
  const effects = getEffects();
  const jackpotRequirement = getJackpotRequirement();
  const targetWidth = getTargetWidth();

  elements.creditsValue.textContent = formatNumber(state.credits);
  elements.streakValue.textContent = String(state.streak);
  elements.stageValue.textContent = `${state.stage} / ${FINAL_STAGE}`;
  elements.jackpotValue.textContent = `${formatNumber(state.jackpot)} / ${formatNumber(jackpotRequirement)}`;
  const jackpotPercent = clamp((state.jackpot / jackpotRequirement) * 100, 0, 100);
  elements.jackpotPercent.textContent = `${jackpotPercent.toFixed(0)}%`;
  elements.jackpotMeterLabel.textContent = `${jackpotPercent.toFixed(0)}%`;
  elements.jackpotProgress.style.width = `${jackpotPercent}%`;
  elements.targetLabel.textContent = `${targetWidth} ${targetWidth === 1 ? "light" : "lights"}`;
  elements.payoutLabel.textContent = formatNumber(getGoodPayout(effects) * 2.6 * getStreakMultiplier(effects));
  elements.shopCredits.textContent = formatNumber(state.credits);
  elements.stopButton.disabled = state.pendingDraft;

  renderResultLine();
  renderWheelLights();
  renderRunUpgrades();
  renderDraft();
  renderRelics();
  renderRunComplete();
  elements.overlay.hidden = elements.draftPanel.hidden && elements.runCompletePanel.hidden;
}

function renderResultLine() {
  elements.resultLine.classList.remove("is-perfect", "is-good", "is-miss");
  if (state.lastResult === "perfect" || state.lastResult === "complete") {
    elements.resultLine.classList.add("is-perfect");
  } else if (state.lastResult === "good") {
    elements.resultLine.classList.add("is-good");
  } else if (state.lastResult === "miss") {
    elements.resultLine.classList.add("is-miss");
  }
}

function renderWheelLights() {
  const targetIndexes = getTargetIndexes();
  const perfectIndex = getPerfectIndex();

  segmentNodes.forEach((node, index) => {
    node.classList.toggle("is-active", index === activeIndex);
    node.classList.toggle("is-target", targetIndexes.includes(index));
    node.classList.toggle("is-perfect", index === perfectIndex);
  });
}

function renderRunUpgrades() {
  const key = JSON.stringify({ credits: Math.floor(state.credits), levels: state.runUpgrades, pending: state.pendingDraft });
  if (key === upgradeRenderKey && elements.upgradeList.children.length) {
    return;
  }

  const buttons = runUpgrades.map((upgrade) => {
    const level = state.runUpgrades[upgrade.id] ?? 0;
    const cost = getRunUpgradeCost(upgrade);
    const maxed = Boolean(upgrade.max && level >= upgrade.max);
    const affordable = state.credits >= cost;
    const button = document.createElement("button");
    button.className = "upgrade-button";
    button.type = "button";
    button.classList.toggle("is-affordable", affordable && !maxed && !state.pendingDraft);
    button.disabled = state.pendingDraft || maxed || !affordable;
    button.addEventListener("click", () => buyRunUpgrade(upgrade.id));

    const copy = document.createElement("span");
    copy.className = "upgrade-copy";
    const title = document.createElement("strong");
    title.textContent = upgrade.name;
    const meta = document.createElement("span");
    meta.className = "upgrade-meta";
    meta.textContent = maxed ? "Max level" : `Level ${level}`;
    const description = document.createElement("small");
    description.textContent = maxed ? "Maxed for this run." : upgrade.description(level);
    copy.append(title, meta, description);

    const price = document.createElement("span");
    price.className = "upgrade-price";
    const priceLabel = document.createElement("span");
    priceLabel.textContent = maxed ? "Status" : "Cost";
    const priceValue = document.createElement("b");
    priceValue.textContent = maxed ? "Max" : formatNumber(cost);
    price.append(priceLabel, priceValue);

    const meter = document.createElement("span");
    meter.className = "upgrade-meter";
    const fill = document.createElement("i");
    fill.style.width = `${maxed ? 100 : clamp((state.credits / cost) * 100, 0, 100)}%`;
    meter.append(fill);

    button.append(copy, price, meter);
    return button;
  });

  elements.upgradeList.replaceChildren(...buttons);
  upgradeRenderKey = key;
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

  const key = state.relicChoices.join("|");
  elements.draftCount.textContent = `${state.relicChoices.length} choices`;
  if (key === draftRenderKey && elements.draftChoices.children.length) {
    return;
  }

  const choices = state.relicChoices.map((id) => {
    const relic = relicById.get(id);
    const button = document.createElement("button");
    button.className = "draft-card";
    button.type = "button";
    button.addEventListener("click", () => chooseRelic(id));

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = relic.name;
    const text = document.createElement("small");
    text.textContent = relic.text;
    copy.append(title, text);

    const tags = document.createElement("b");
    tags.textContent = relic.tags.join(" / ");
    button.append(copy, tags);
    return button;
  });

  elements.draftChoices.replaceChildren(...choices);
  draftRenderKey = key;
}

function renderRelics() {
  const key = JSON.stringify({ relics: state.relics, mirror: state.mirrorCharges });
  if (key === relicRenderKey && elements.relicList.children.length) {
    return;
  }

  const active = relics
    .filter((relic) => getRelicCount(relic.id) > 0)
    .map((relic) => renderRelic(relic, getRelicCount(relic.id)));

  if (state.mirrorCharges > 0) {
    const mirror = document.createElement("div");
    mirror.className = "relic-pill";
    mirror.innerHTML = `<strong>Mirror Charge x${state.mirrorCharges}</strong><span>Next relic applies twice.</span>`;
    active.push(mirror);
  }

  if (!active.length) {
    const empty = document.createElement("p");
    empty.className = "empty-line";
    empty.textContent = "Fill the jackpot meter to draft your first relic.";
    elements.relicList.replaceChildren(empty);
    relicRenderKey = key;
    return;
  }

  elements.relicList.replaceChildren(...active);
  relicRenderKey = key;
}

function renderRelic(relic, count) {
  const item = document.createElement("div");
  item.className = "relic-pill";
  const title = document.createElement("strong");
  title.textContent = `${relic.name} x${count}`;
  const text = document.createElement("span");
  text.textContent = relic.text;
  item.append(title, text);
  return item;
}

function renderRunComplete() {
  elements.runCompletePanel.hidden = state.lastAwardedTickets <= 0 || state.pendingDraft;
  elements.runCompleteText.textContent = `Best streak ${state.bestStreak}. The next run is ready.`;
}

function setResult(message, result) {
  elements.resultLine.textContent = message;
  state.lastResult = result;
  resultTimer = 0.5;
}

function pulseMachine() {
  elements.wheelSvg.classList.remove("is-hit");
  requestAnimationFrame(() => {
    elements.wheelSvg.classList.add("is-hit");
  });
}

function advanceTarget() {
  const offset = 5 + Math.floor(Math.random() * (SEGMENTS - 10));
  state.targetStart = (activeIndex + offset) % SEGMENTS;
}

function ensureTarget() {
  if (!Number.isInteger(state.targetStart)) {
    state.targetStart = 4;
  }
}

function normalizeRunStart() {
  const starterCredits = (state.ticketUpgrades.starter ?? 0) * 30;
  if (state.credits < starterCredits && state.stage === 1) {
    state.credits = starterCredits;
  }

  if ((state.ticketUpgrades.wide ?? 0) > 0) {
    state.runUpgrades.target = Math.max(state.runUpgrades.target ?? 0, 1);
  }
}

function ensureDraftChoices() {
  if (state.pendingDraft && state.relicChoices.length === 0) {
    state.relicChoices = generateRelicChoices();
  }
}

function generateRelicChoices() {
  const eligible = relics.filter((relic) => {
    if (relic.apply === "charge") {
      return state.mirrorCharges < relic.maxStacks;
    }
    return getRelicCount(relic.id) < relic.maxStacks;
  });

  shuffle(eligible);
  return eligible.slice(0, 3).map((relic) => relic.id);
}

function getAccuracy(index) {
  if (index === getPerfectIndex()) {
    return "perfect";
  }
  return getTargetIndexes().includes(index) ? "good" : "miss";
}

function getTargetIndexes() {
  const width = getTargetWidth();
  return Array.from({ length: width }, (_, offset) => (state.targetStart + offset) % SEGMENTS);
}

function getPerfectIndex() {
  return (state.targetStart + Math.floor(getTargetWidth() / 2)) % SEGMENTS;
}

function getTargetWidth() {
  const haloBonus = getRelicCount("wideHalo") > 0 ? 1 : 0;
  return clamp(1 + (state.runUpgrades.target ?? 0) + haloBonus, 1, 4);
}

function getWheelSpeed() {
  const brake = state.runUpgrades.brake ?? 0;
  const relicSlow = getRelicCount("steadyMotor") * 0.07;
  const speed = (4.25 + state.stage * 0.58 + state.run * 0.05 - brake * 0.26) * (1 - relicSlow);
  return Math.max(2.2, speed);
}

function getJackpotRequirement() {
  return Math.round(84 + state.stage * 24 + state.run * 6);
}

function getGoodPayout(effects = getEffects()) {
  const base = 8 + state.stage * 3.5 + state.run * 0.8;
  return base * effects.payoutMultiplier;
}

function getStreakMultiplier(effects = getEffects()) {
  const level = state.runUpgrades.streak ?? 0;
  const streakPower = 0.018 + level * 0.006;
  const boostedPower = streakPower * effects.streakMultiplier;
  return 1 + Math.min(2.6, state.streak * boostedPower);
}

function getPassiveCredits() {
  const auto = state.runUpgrades.auto ?? 0;
  if (auto <= 0) {
    return 0;
  }
  return auto * (1.2 + state.stage * 0.2) * getEffects().payoutMultiplier;
}

function getEffects() {
  return {
    payoutMultiplier:
      (1 + (state.runUpgrades.payout ?? 0) * 0.35) *
      (1 + (state.ticketUpgrades.steady ?? 0) * 0.08),
    jackpotMultiplier: 1 + getRelicCount("goldMemory") * 0.35,
    streakMultiplier: 1 + getRelicCount("neonFuse") * 0.3,
  };
}

function getTicketAward() {
  const stageTickets = Math.ceil(FINAL_STAGE / 2);
  const perfectTickets = Math.floor(state.runPerfectHits / 18);
  return Math.max(1, stageTickets + perfectTickets);
}

function getRunUpgradeCost(upgrade) {
  const level = state.runUpgrades[upgrade.id] ?? 0;
  return Math.round(upgrade.baseCost * upgrade.scale ** level * (1 + state.stage * 0.04));
}

function getTicketUpgradeCost(upgrade) {
  const level = state.ticketUpgrades[upgrade.id] ?? 0;
  return Math.max(1, Math.round(upgrade.baseCost * upgrade.scale ** level));
}

function getRelicCount(id) {
  return state.relics[id] ?? 0;
}

function addCredits(amount) {
  state.credits += amount;
  state.totalCredits += amount;
}

function saveState() {
  state.version = SAVE_VERSION;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  lastSaveAt = performance.now();
}

function loadState() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) {
    return structuredClone(initialState);
  }

  try {
    const parsed = JSON.parse(saved);
    return normalizeState(parsed);
  } catch {
    return structuredClone(initialState);
  }
}

function normalizeState(saved) {
  const next = structuredClone(initialState);
  next.version = SAVE_VERSION;
  next.credits = cleanNumber(saved.credits, 0);
  next.totalCredits = cleanNumber(saved.totalCredits, 0);
  next.stage = clamp(Math.floor(cleanNumber(saved.stage, 1)), 1, FINAL_STAGE);
  next.jackpot = cleanNumber(saved.jackpot, 0);
  next.streak = Math.max(0, Math.floor(cleanNumber(saved.streak, 0)));
  next.bestStreak = Math.max(0, Math.floor(cleanNumber(saved.bestStreak, 0)));
  next.runPerfectHits = Math.max(0, Math.floor(cleanNumber(saved.runPerfectHits, 0)));
  next.perfectHits = Math.max(0, Math.floor(cleanNumber(saved.perfectHits, 0)));
  next.totalHits = Math.max(0, Math.floor(cleanNumber(saved.totalHits, 0)));
  next.misses = Math.max(0, Math.floor(cleanNumber(saved.misses, 0)));
  next.run = Math.max(1, Math.floor(cleanNumber(saved.run, 1)));
  next.tickets = Math.max(0, Math.floor(cleanNumber(saved.tickets, 0)));
  next.runUpgrades = normalizeLevels(saved.runUpgrades, defaultRunUpgrades, runUpgrades);
  next.ticketUpgrades = normalizeLevels(saved.ticketUpgrades, defaultTicketUpgrades, ticketUpgrades);
  next.relics = normalizeRelics(saved.relics);
  next.relicChoices = Array.isArray(saved.relicChoices)
    ? saved.relicChoices.filter((id) => relicById.has(id)).slice(0, 3)
    : [];
  next.pendingDraft = Boolean(saved.pendingDraft);
  next.mirrorCharges = Math.max(0, Math.floor(cleanNumber(saved.mirrorCharges, 0)));
  next.mercyCharges = Math.max(0, Math.floor(cleanNumber(saved.mercyCharges, 0)));
  next.targetStart = clamp(Math.floor(cleanNumber(saved.targetStart, 0)), 0, SEGMENTS - 1);
  next.lastResult = typeof saved.lastResult === "string" ? saved.lastResult : "ready";
  next.lastAwardedTickets = Math.max(0, Math.floor(cleanNumber(saved.lastAwardedTickets, 0)));
  return next;
}

function normalizeLevels(savedLevels, defaults, definitions) {
  const levels = { ...defaults };
  const source = savedLevels && typeof savedLevels === "object" ? savedLevels : {};
  definitions.forEach((definition) => {
    const raw = Math.max(0, Math.floor(cleanNumber(source[definition.id], defaults[definition.id] ?? 0)));
    levels[definition.id] = definition.max ? Math.min(definition.max, raw) : raw;
  });
  return levels;
}

function normalizeRelics(savedRelics) {
  const normalized = {};
  const source = savedRelics && typeof savedRelics === "object" ? savedRelics : {};
  Object.entries(source).forEach(([id, count]) => {
    const relic = relicById.get(id);
    if (!relic || relic.apply === "charge") {
      return;
    }
    normalized[id] = Math.min(relic.maxStacks, Math.max(0, Math.floor(cleanNumber(count, 0))));
  });
  return normalized;
}

function resetGame() {
  const confirmed = window.confirm("Reset Light Wheel and clear the saved run?");
  if (!confirmed) {
    return;
  }

  state = structuredClone(initialState);
  wheelPosition = 0;
  activeIndex = 0;
  localStorage.removeItem(SAVE_KEY);
  normalizeRunStart();
  advanceTarget();
  setResult("Fresh wheel ready. Stop the light on the target.", "ready");
  saveState();
  render();
}

function cleanNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function formatNumber(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}m`;
  }
  if (value >= 10000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (value >= 100) {
    return value.toFixed(0);
  }
  if (value >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}
