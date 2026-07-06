const SAVE_KEY = "addictiveFishingSave";
const SAVE_VERSION = 1;
const RAID_SECONDS = 240;
const TILE = 32;

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const els = {
  deployButton: document.querySelector("#deployButton"),
  resetSaveButton: document.querySelector("#resetSaveButton"),
  cashValue: document.querySelector("#cashValue"),
  timerValue: document.querySelector("#timerValue"),
  packValue: document.querySelector("#packValue"),
  noiseValue: document.querySelector("#noiseValue"),
  resolveValue: document.querySelector("#resolveValue"),
  inventoryCount: document.querySelector("#inventoryCount"),
  inventoryGrid: document.querySelector("#inventoryGrid"),
  kitTier: document.querySelector("#kitTier"),
  upgradeList: document.querySelector("#upgradeList"),
  messagePanel: document.querySelector("#messagePanel"),
  overlay: document.querySelector("#overlay"),
  overlayKicker: document.querySelector("#overlayKicker"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayText: document.querySelector("#overlayText"),
  summaryStats: document.querySelector("#summaryStats"),
  overlayPrimaryButton: document.querySelector("#overlayPrimaryButton"),
  overlayCloseButton: document.querySelector("#overlayCloseButton"),
};

let W = 960;
let H = 640;
let save = loadSave();
let raid = null;
let lastTime = performance.now();
let animTime = 0;
let messageTimer = 0;
let inventorySignature = "";
let upgradeSignature = "";
const keys = new Set();
const pointer = { x: W / 2, y: H / 2, down: false };

const upgrades = [
  {
    id: "rod",
    name: "Rod Strength",
    max: 6,
    baseCost: 90,
    scale: 1.65,
    text: (level) => `Reel power +${Math.round(level * 26.7)}%`,
  },
  {
    id: "pack",
    name: "Block Pack",
    max: 6,
    baseCost: 120,
    scale: 1.72,
    text: (level) => `${packSlots(level)} slots · ${packCapacity(level)} kg`,
  },
  {
    id: "reel",
    name: "Quiet Reel",
    max: 5,
    baseCost: 110,
    scale: 1.7,
    text: (level) => `Noise reduced ${level * 10}%`,
  },
  {
    id: "extract",
    name: "Dock Route",
    max: 5,
    baseCost: 140,
    scale: 1.76,
    text: (level) => `Extract timer ${extractSeconds(level).toFixed(1)}s`,
  },
];

const fishTypes = [
  {
    name: "Mud Minnow",
    rarity: "Common",
    color: "#9fb96a",
    accent: "#e8d67a",
    value: 18,
    weight: 0.7,
    strength: 1,
    speed: 34,
    size: 5,
  },
  {
    name: "Copper Bass",
    rarity: "Common",
    color: "#c48642",
    accent: "#f1c15c",
    value: 34,
    weight: 1.4,
    strength: 1.35,
    speed: 28,
    size: 6,
  },
  {
    name: "Night Pike",
    rarity: "Uncommon",
    color: "#5db1a3",
    accent: "#d8f2b0",
    value: 64,
    weight: 2.1,
    strength: 1.8,
    speed: 42,
    size: 7,
  },
  {
    name: "Vault Carp",
    rarity: "Rare",
    color: "#6f8ee8",
    accent: "#f1e37d",
    value: 118,
    weight: 3.2,
    strength: 2.45,
    speed: 24,
    size: 8,
  },
  {
    name: "Gold Block Koi",
    rarity: "Elite",
    color: "#e1b843",
    accent: "#fff2a3",
    value: 210,
    weight: 4.5,
    strength: 3.15,
    speed: 30,
    size: 9,
  },
];

const colors = {
  black: "#07100d",
  waterA: "#1d6670",
  waterB: "#1a5a66",
  waterC: "#23717c",
  grassA: "#3d6f3a",
  grassB: "#4f8b45",
  reed: "#8a8f42",
  reedLight: "#c0bd62",
  dockA: "#80613e",
  dockB: "#9a7548",
  playerA: "#d7ce74",
  playerB: "#6d7f52",
  line: "#f2edc8",
  danger: "#b94b3b",
  safe: "#d7ce74",
  text: "#f2edc8",
};

els.deployButton.addEventListener("click", deployRaid);
els.overlayPrimaryButton.addEventListener("click", deployRaid);
els.overlayCloseButton.addEventListener("click", () => {
  els.overlay.hidden = true;
});
els.resetSaveButton.addEventListener("click", () => {
  if (window.confirm("Reset Addictive Fishing save data?")) {
    save = createDefaultSave();
    persistSave();
    if (raid) endRaid(false, "Save reset. The carried catch was lost.");
    updateAllUi();
    showStashOverlay("Save Reset", "Fresh dock ledger. Deploy when ready.");
  }
});

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    beginRodAction();
  }
  if (event.code === "KeyE") {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    releaseRodAction();
  }
});

canvas.addEventListener("pointermove", setPointer);
canvas.addEventListener("pointerdown", (event) => {
  setPointer(event);
  pointer.down = true;
  canvas.setPointerCapture(event.pointerId);
  beginRodAction();
});
canvas.addEventListener("pointerup", (event) => {
  setPointer(event);
  pointer.down = false;
  releaseRodAction();
});
canvas.addEventListener("pointercancel", () => {
  pointer.down = false;
  releaseRodAction();
});

resize();
new ResizeObserver(resize).observe(canvas);
updateAllUi();
showStashOverlay(
  "Block Dock Ready",
  "Deploy, catch square-built loot-fish, and extract before the pond turns hostile."
);
requestAnimationFrame(tick);

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  W = Math.floor(rect.width);
  H = Math.floor(rect.height);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (raid) {
    raid.player.x = clamp(raid.player.x, 36, W - 36);
    raid.player.y = clamp(raid.player.y, 36, H - 36);
  }
}

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;
  animTime += dt;
  update(dt);
  draw();
  requestAnimationFrame(tick);
}

function deployRaid() {
  raid = {
    phase: "raid",
    timeLeft: RAID_SECONDS,
    nightfall: 0,
    noise: 0,
    resolve: 100,
    extractHold: 0,
    extractPromptTimer: 1.8,
    hazardTimer: 2.4,
    player: { x: Math.floor(W / 2), y: Math.max(70, H - 78), speed: 128 },
    inventory: [],
    weight: 0,
    fish: Array.from({ length: 24 }, (_, index) => createFish(index)),
    hazards: [],
    particles: [],
    floatText: [],
    cast: { mode: "ready", charge: 0, lure: null, fish: null, reel: 0, escape: 0 },
    stats: { caught: 0, gross: 0, rarest: "None" },
  };
  els.overlay.hidden = true;
  showMessage("Raid started. Catch loot-fish, watch noise, extract at a yellow dock.");
  updateAllUi();
}

function update(dt) {
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) els.messagePanel.classList.remove("is-visible");
  }
  if (!raid || raid.phase !== "raid") return;

  raid.timeLeft -= dt;
  if (raid.timeLeft <= 0) {
    raid.timeLeft = 0;
    raid.nightfall += dt;
    addNoise(dt * 9);
  }

  updatePlayer(dt);
  updateCast(dt);
  updateFish(dt);
  updateHazards(dt);
  if (raid.resolve <= 0) {
    endRaid(false, "Resolve broke. The catch was lost before extraction.");
    return;
  }
  updateEffects(dt);
  updateExtraction(dt);
  if (!raid) return;

  raid.noise = clamp(raid.noise - dt * (3.2 + save.upgrades.reel * 0.55), 0, 100);
  if (raid.nightfall >= 55) {
    endRaid(false, "Nightfall swallowed the route. The carried catch was lost.");
    return;
  }
  updateAllUi();
}

function updatePlayer(dt) {
  let mx = 0;
  let my = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) my -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) my += 1;

  if (mx || my) {
    const len = Math.hypot(mx, my);
    const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = raid.player.speed * (sprinting ? 1.48 : 1);
    raid.player.x = clamp(raid.player.x + (mx / len) * speed * dt, 30, W - 30);
    raid.player.y = clamp(raid.player.y + (my / len) * speed * dt, 30, H - 30);
    if (sprinting) addNoise(dt * 9);
  }
}

function updateCast(dt) {
  const cast = raid.cast;
  if (cast.mode === "charging") {
    cast.charge = clamp(cast.charge + dt * 0.9, 0, 1);
    addNoise(dt * 0.7);
    return;
  }

  if (cast.mode === "flight") {
    cast.t += dt;
    const p = clamp(cast.t / cast.duration, 0, 1);
    cast.lure = {
      x: lerp(cast.start.x, cast.end.x, p),
      y: lerp(cast.start.y, cast.end.y, p),
    };
    if (Math.random() < dt * 18) addParticle(cast.lure.x, cast.lure.y, colors.line, 4, 0.35);
    if (p >= 1) {
      cast.mode = "lure";
      cast.wait = 6;
      addNoise(4 + cast.power * 10);
      blockBurst(cast.lure.x, cast.lure.y, colors.waterC, 10);
    }
    return;
  }

  if (cast.mode === "lure") {
    cast.wait -= dt;
    const bite = raid.fish.find((fish) => !fish.hooked && distance(fish, cast.lure) < fish.size * 5 + 18);
    if (bite) {
      bite.hooked = true;
      cast.mode = "hooked";
      cast.fish = bite;
      cast.reel = 12;
      cast.escape = 8.5 + Math.max(0, 3 - bite.strength);
      showMessage(`${bite.name} hooked. Hold click or Space to reel.`);
      addNoise(8 + bite.strength * 3);
    } else if (cast.wait <= 0) {
      cast.mode = "ready";
      cast.lure = null;
      showMessage("Lure went quiet. Cast again.");
    }
    return;
  }

  if (cast.mode === "hooked") {
    const fish = cast.fish;
    if (!fish) {
      cast.mode = "ready";
      return;
    }
    const reeling = pointer.down || keys.has("Space");
    const rodPower = 18 + save.upgrades.rod * 4.8;
    const fishPull = fish.strength * 6.2 + raid.noise * 0.035;
    if (reeling) {
      cast.reel += (rodPower - fishPull) * dt;
      cast.escape -= dt * 0.45;
      addNoise(dt * fish.strength * (4.8 - save.upgrades.reel * 0.28));
      pullHookedFishTowardPlayer(fish, dt);
    } else {
      cast.reel -= dt * (9 + fish.strength * 2);
      cast.escape -= dt * (0.85 + fish.strength * 0.18);
      swimFishAway(fish, dt, 38);
    }

    cast.reel = clamp(cast.reel, -28, 110);
    cast.lure = { x: fish.x, y: fish.y };
    if (cast.reel >= 100 || distance(fish, raid.player) < 22) {
      landFish(fish);
    } else if (cast.escape <= 0 || cast.reel <= -25) {
      fishEscapes(fish);
    }
  }
}

function updateFish(dt) {
  for (const fish of raid.fish) {
    if (fish.hooked) continue;
    const cast = raid.cast;
    if (cast.mode === "lure" && cast.lure && distance(fish, cast.lure) < 150) {
      const angle = Math.atan2(cast.lure.y - fish.y, cast.lure.x - fish.x);
      fish.vx += Math.cos(angle) * dt * (12 + fish.strength * 4);
      fish.vy += Math.sin(angle) * dt * (12 + fish.strength * 4);
    }

    fish.wiggle += dt * (1.2 + fish.speed * 0.015);
    fish.vx += Math.cos(fish.wiggle) * dt * 12;
    fish.vy += Math.sin(fish.wiggle * 0.8) * dt * 10;
    const maxSpeed = fish.speed;
    const speed = Math.hypot(fish.vx, fish.vy) || 1;
    if (speed > maxSpeed) {
      fish.vx = (fish.vx / speed) * maxSpeed;
      fish.vy = (fish.vy / speed) * maxSpeed;
    }
    fish.x += fish.vx * dt;
    fish.y += fish.vy * dt;
    bounceInWater(fish, 44);
  }
}

function updateHazards(dt) {
  raid.hazardTimer -= dt;
  const pressure = raid.noise / 100 + raid.nightfall / 22;
  if (raid.hazardTimer <= 0) {
    if (raid.noise > 32 || raid.nightfall > 0 || Math.random() < 0.2) {
      spawnHazard();
    }
    raid.hazardTimer = clamp(3.6 - pressure * 1.2, 0.85, 4.2);
  }

  for (let i = raid.hazards.length - 1; i >= 0; i -= 1) {
    const hazard = raid.hazards[i];
    hazard.life -= dt;
    if (hazard.type === "patrol") {
      const angle = Math.atan2(raid.player.y - hazard.y, raid.player.x - hazard.x);
      hazard.vx += Math.cos(angle) * dt * 22;
      hazard.vy += Math.sin(angle) * dt * 22;
      const speed = Math.hypot(hazard.vx, hazard.vy) || 1;
      const max = 54 + raid.nightfall * 0.4;
      if (speed > max) {
        hazard.vx = (hazard.vx / speed) * max;
        hazard.vy = (hazard.vy / speed) * max;
      }
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
    } else {
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
    }

    if (rectDistance(raid.player.x, raid.player.y, hazard.x, hazard.y) < hazard.size) {
      raid.resolve -= hazard.damage;
      addNoise(14);
      blockBurst(raid.player.x, raid.player.y, colors.danger, 14);
      showMessage(hazard.type === "patrol" ? "Patrol clipped your route." : "Snag hazard tore through the pack.");
      raid.hazards.splice(i, 1);
    } else if (hazard.life <= 0 || hazard.x < -80 || hazard.x > W + 80 || hazard.y < -80 || hazard.y > H + 80) {
      raid.hazards.splice(i, 1);
    }
  }
}

function updateExtraction(dt) {
  raid.extractPromptTimer = Math.max(0, raid.extractPromptTimer - dt);
  const inZone = getExtractZones().some((zone) => pointInRect(raid.player, zone));
  if (inZone && keys.has("KeyE")) {
    raid.extractHold += dt;
    if (raid.extractHold >= extractSeconds(save.upgrades.extract)) {
      endRaid(true, "Extracted with the catch.");
      return;
    }
  } else {
    raid.extractHold = Math.max(0, raid.extractHold - dt * 1.9);
  }

  if (inZone && raid.extractHold === 0 && raid.extractPromptTimer <= 0) {
    showMessage("Hold E inside the yellow dock blocks to extract.", 1.05);
    raid.extractPromptTimer = 2.4;
  }
}

function updateEffects(dt) {
  for (let i = raid.particles.length - 1; i >= 0; i -= 1) {
    const p = raid.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) raid.particles.splice(i, 1);
  }
  for (let i = raid.floatText.length - 1; i >= 0; i -= 1) {
    const text = raid.floatText[i];
    text.life -= dt;
    text.y -= dt * 20;
    if (text.life <= 0) raid.floatText.splice(i, 1);
  }
}

function beginRodAction() {
  if (!raid || raid.phase !== "raid") return;
  const cast = raid.cast;
  if (cast.mode === "ready") {
    cast.mode = "charging";
    cast.charge = 0;
  }
}

function releaseRodAction() {
  if (!raid || raid.phase !== "raid") return;
  const cast = raid.cast;
  if (cast.mode !== "charging") return;
  const angle = Math.atan2(pointer.y - raid.player.y, pointer.x - raid.player.x);
  const power = clamp(cast.charge, 0.08, 1);
  const maxDistance = 150 + save.upgrades.rod * 18;
  const distanceOut = 44 + power * maxDistance;
  cast.mode = "flight";
  cast.power = power;
  cast.t = 0;
  cast.duration = 0.22 + power * 0.18;
  cast.start = { x: raid.player.x, y: raid.player.y };
  cast.end = {
    x: clamp(raid.player.x + Math.cos(angle) * distanceOut, 34, W - 34),
    y: clamp(raid.player.y + Math.sin(angle) * distanceOut, 34, H - 34),
  };
  cast.lure = { ...cast.start };
}

function landFish(fish) {
  const value = Math.round(fish.value * random(0.86, 1.18));
  const weight = Number((fish.weight * random(0.84, 1.24)).toFixed(1));
  const item = {
    name: fish.name,
    rarity: fish.rarity,
    value,
    weight,
    color: fish.color,
    accent: fish.accent,
  };

  if (raid.inventory.length >= packSlots(save.upgrades.pack) || raid.weight + weight > packCapacity(save.upgrades.pack)) {
    showMessage(`Pack full. ${fish.name} slipped back into the square pond.`);
    addFloatText(fish.x, fish.y, "PACK FULL", colors.danger);
  } else {
    raid.inventory.push(item);
    raid.weight = Number((raid.weight + weight).toFixed(1));
    raid.stats.caught += 1;
    raid.stats.gross += value;
    raid.stats.rarest = rarestName(raid.stats.rarest, fish.rarity);
    addFloatText(fish.x, fish.y, `+$${value}`, fish.accent);
    showMessage(`${fish.name} packed. Extract to bank $${value}.`);
  }

  blockBurst(fish.x, fish.y, fish.accent, 16);
  raid.fish = raid.fish.filter((candidate) => candidate !== fish);
  raid.fish.push(createFish(raid.fish.length + raid.stats.caught));
  raid.cast = { mode: "ready", charge: 0, lure: null, fish: null, reel: 0, escape: 0 };
}

function fishEscapes(fish) {
  fish.hooked = false;
  swimFishAway(fish, 0.4, 160);
  blockBurst(fish.x, fish.y, colors.waterC, 10);
  addNoise(5 + fish.strength * 2);
  showMessage(`${fish.name} broke loose.`);
  raid.cast = { mode: "ready", charge: 0, lure: null, fish: null, reel: 0, escape: 0 };
}

function endRaid(success, reason) {
  if (!raid) return;
  const gross = success ? raid.inventory.reduce((sum, item) => sum + item.value, 0) : 0;
  const caught = raid.inventory.length;
  const weight = raid.weight;
  const rarest = raid.stats.rarest;
  if (success) {
    save.money += gross;
    save.runs += 1;
    save.bestValue = Math.max(save.bestValue, gross);
    persistSave();
  }
  const title = success ? "Extraction Complete" : "Raid Failed";
  const body = success
    ? `Sold ${caught} packed catch blocks for $${gross}. Upgrade the kit or deploy again.`
    : `${reason} Soft loss applied: money and permanent kit stayed, carried catch did not.`;
  raid.phase = success ? "extracted" : "failed";
  raid = null;
  updateAllUi();
  showResultOverlay(title, body, [
    ["Catch", `${caught} fish`],
    ["Weight", `${weight.toFixed(1)} kg`],
    ["Value", `$${gross}`],
    ["Rarest", rarest],
    ["Best", `$${save.bestValue}`],
    ["Cash", `$${save.money}`],
  ]);
}

function draw() {
  drawWorld();
  if (raid) {
    for (const fish of raid.fish) drawFish(fish);
    drawCast();
    for (const hazard of raid.hazards) drawHazard(hazard);
    drawPlayer();
    drawParticles();
    drawFloatText();
    drawRaidBars();
  } else {
    drawIdleDock();
  }
}

function drawWorld() {
  ctx.fillStyle = colors.waterA;
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += TILE) {
    for (let x = 0; x < W; x += TILE) {
      const variant = (x / TILE + y / TILE) % 3;
      ctx.fillStyle = variant === 0 ? colors.waterA : variant === 1 ? colors.waterB : colors.waterC;
      ctx.fillRect(x, y, TILE, TILE);
      if ((x + y + Math.floor(animTime * 6) * TILE) % 128 === 0) {
        ctx.fillStyle = "#2b8190";
        ctx.fillRect(x + 8, y + 12, 8, 8);
      }
    }
  }

  drawShore();
  for (const zone of getExtractZones()) drawDock(zone);
  drawReeds();
}

function drawShore() {
  ctx.fillStyle = colors.grassA;
  ctx.fillRect(0, 0, W, 28);
  ctx.fillRect(0, H - 28, W, 28);
  ctx.fillRect(0, 0, 28, H);
  ctx.fillRect(W - 28, 0, 28, H);
  ctx.fillStyle = colors.grassB;
  for (let x = 0; x < W; x += 32) {
    ctx.fillRect(x, 20, 16, 8);
    ctx.fillRect(x + 16, H - 28, 16, 8);
  }
  for (let y = 0; y < H; y += 32) {
    ctx.fillRect(20, y, 8, 16);
    ctx.fillRect(W - 28, y + 16, 8, 16);
  }
}

function drawDock(zone) {
  ctx.fillStyle = colors.dockA;
  ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  ctx.fillStyle = colors.dockB;
  const vertical = zone.h > zone.w;
  if (vertical) {
    for (let y = zone.y; y < zone.y + zone.h; y += 18) ctx.fillRect(zone.x, y, zone.w, 8);
  } else {
    for (let x = zone.x; x < zone.x + zone.w; x += 18) ctx.fillRect(x, zone.y, 8, zone.h);
  }
  ctx.fillStyle = colors.safe;
  ctx.fillRect(zone.x - 4, zone.y - 4, zone.w + 8, 4);
  ctx.fillRect(zone.x - 4, zone.y + zone.h, zone.w + 8, 4);
  ctx.fillRect(zone.x - 4, zone.y - 4, 4, zone.h + 8);
  ctx.fillRect(zone.x + zone.w, zone.y - 4, 4, zone.h + 8);
}

function drawReeds() {
  ctx.fillStyle = colors.reed;
  for (let i = 0; i < 38; i += 1) {
    const edge = i % 4;
    const x = edge === 0 ? 34 : edge === 1 ? W - 42 : 42 + ((i * 67) % Math.max(80, W - 84));
    const y = edge === 2 ? 34 : edge === 3 ? H - 42 : 42 + ((i * 53) % Math.max(80, H - 84));
    ctx.fillRect(x, y, 8, 24);
    ctx.fillStyle = colors.reedLight;
    ctx.fillRect(x + 8, y + 8, 8, 8);
    ctx.fillStyle = colors.reed;
  }
}

function drawIdleDock() {
  const x = Math.floor(W / 2 - 56);
  const y = Math.floor(H / 2 - 30);
  ctx.fillStyle = "#14251f";
  ctx.fillRect(x - 24, y - 24, 160, 104);
  ctx.fillStyle = colors.line;
  ctx.font = "900 18px 'Courier New', monospace";
  ctx.fillText("DEPLOY FROM STASH", x - 8, y + 8);
  ctx.font = "900 12px 'Courier New', monospace";
  ctx.fillText("BUY KIT · ENTER RAID · EXTRACT", x - 8, y + 34);
}

function drawFish(fish) {
  const dir = fish.vx >= 0 ? 1 : -1;
  const unit = fish.size;
  const x = Math.floor(fish.x);
  const y = Math.floor(fish.y);
  ctx.fillStyle = "#0d2527";
  ctx.fillRect(x - unit * 2, y + unit * 2, unit * 5, unit);
  ctx.fillStyle = fish.color;
  ctx.fillRect(x - unit * 2, y - unit, unit * 4, unit * 2);
  ctx.fillRect(x - unit, y - unit * 2, unit * 2, unit);
  ctx.fillStyle = fish.accent;
  ctx.fillRect(x + dir * unit * 2, y - unit, unit, unit);
  ctx.fillRect(x - dir * unit * 3, y, unit, unit);
  ctx.fillStyle = colors.black;
  ctx.fillRect(x + dir * unit, y - unit, Math.max(3, unit - 2), Math.max(3, unit - 2));
}

function drawCast() {
  const cast = raid.cast;
  if (cast.mode === "ready") return;
  const lure = cast.lure ?? cast.end;
  if (lure) {
    drawSteppedLine(raid.player.x, raid.player.y, lure.x, lure.y, colors.line);
    ctx.fillStyle = cast.mode === "hooked" ? colors.danger : colors.line;
    ctx.fillRect(Math.floor(lure.x - 5), Math.floor(lure.y - 5), 10, 10);
    ctx.fillStyle = colors.black;
    ctx.fillRect(Math.floor(lure.x - 2), Math.floor(lure.y - 2), 4, 4);
  }

  if (cast.mode === "charging") {
    drawBlockMeter(raid.player.x - 30, raid.player.y - 40, 60, 8, cast.charge, colors.safe);
  }
  if (cast.mode === "hooked") {
    drawBlockMeter(raid.player.x - 36, raid.player.y - 48, 72, 8, cast.reel / 100, colors.danger);
  }
}

function drawHazard(hazard) {
  const x = Math.floor(hazard.x);
  const y = Math.floor(hazard.y);
  if (hazard.type === "patrol") {
    ctx.fillStyle = "#20272b";
    ctx.fillRect(x - 22, y - 10, 44, 20);
    ctx.fillStyle = "#5d6870";
    ctx.fillRect(x - 14, y - 18, 28, 12);
    ctx.fillStyle = colors.danger;
    ctx.fillRect(x + 10, y - 6, 12, 12);
    ctx.fillStyle = colors.black;
    ctx.fillRect(x - 26, y + 10, 52, 6);
  } else {
    ctx.fillStyle = colors.danger;
    ctx.fillRect(x - 14, y - 14, 28, 28);
    ctx.fillStyle = "#f0b56b";
    ctx.fillRect(x - 6, y - 6, 12, 12);
    ctx.fillStyle = colors.black;
    ctx.fillRect(x - 18, y - 18, 8, 8);
    ctx.fillRect(x + 10, y + 10, 8, 8);
  }
}

function drawPlayer() {
  const x = Math.floor(raid.player.x);
  const y = Math.floor(raid.player.y);
  ctx.fillStyle = "#0c1713";
  ctx.fillRect(x - 14, y + 12, 28, 8);
  ctx.fillStyle = colors.playerB;
  ctx.fillRect(x - 12, y - 12, 24, 24);
  ctx.fillStyle = colors.playerA;
  ctx.fillRect(x - 8, y - 20, 16, 10);
  ctx.fillStyle = "#4a3424";
  ctx.fillRect(x + 10, y - 5, 24, 5);
  ctx.fillStyle = colors.black;
  ctx.fillRect(x - 4, y - 16, 4, 4);
  ctx.fillRect(x + 4, y - 16, 4, 4);
}

function drawParticles() {
  for (const p of raid.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
  }
}

function drawFloatText() {
  ctx.font = "900 13px 'Courier New', monospace";
  for (const item of raid.floatText) {
    ctx.fillStyle = colors.black;
    ctx.fillText(item.text, Math.floor(item.x + 2), Math.floor(item.y + 2));
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, Math.floor(item.x), Math.floor(item.y));
  }
}

function drawRaidBars() {
  if (raid.extractHold > 0) {
    const required = extractSeconds(save.upgrades.extract);
    drawBlockMeter(raid.player.x - 42, raid.player.y + 30, 84, 10, raid.extractHold / required, colors.safe);
  }
  if (raid.timeLeft <= 0) {
    ctx.fillStyle = colors.danger;
    const pulse = Math.floor(animTime * 4) % 2;
    if (pulse) {
      ctx.fillRect(0, 0, W, 8);
      ctx.fillRect(0, H - 8, W, 8);
      ctx.fillRect(0, 0, 8, H);
      ctx.fillRect(W - 8, 0, 8, H);
    }
  }
}

function drawBlockMeter(x, y, w, h, value, color) {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  ctx.fillStyle = colors.black;
  ctx.fillRect(sx - 3, sy - 3, w + 6, h + 6);
  ctx.fillStyle = "#233026";
  ctx.fillRect(sx, sy, w, h);
  ctx.fillStyle = color;
  const filled = Math.floor(clamp(value, 0, 1) * w);
  for (let px = 0; px < filled; px += 8) {
    ctx.fillRect(sx + px, sy, Math.min(6, filled - px), h);
  }
}

function drawSteppedLine(x1, y1, x2, y2, color) {
  ctx.fillStyle = colors.black;
  stepLineRects(x1 + 2, y1 + 2, x2 + 2, y2 + 2, 4);
  ctx.fillStyle = color;
  stepLineRects(x1, y1, x2, y2, 4);
}

function stepLineRects(x1, y1, x2, y2, size) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(1, Math.ceil((Math.abs(dx) + Math.abs(dy)) / 10));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.floor(x1 + dx * t);
    const y = Math.floor(y1 + dy * t);
    ctx.fillRect(x, y, size, size);
  }
}

function updateAllUi() {
  els.cashValue.textContent = `$${save.money}`;
  els.timerValue.textContent = raid ? formatTime(raid.timeLeft) : "04:00";
  els.noiseValue.textContent = `${Math.round(raid?.noise ?? 0)}%`;
  els.resolveValue.textContent = `${Math.max(0, Math.round(raid?.resolve ?? 100))}%`;
  const level = save.upgrades.pack;
  const weight = raid?.weight ?? 0;
  els.packValue.textContent = `${weight.toFixed(1)} / ${packCapacity(level)} kg`;
  els.inventoryCount.textContent = `${raid?.inventory.length ?? 0} / ${packSlots(level)} items`;
  els.kitTier.textContent = `Tier ${1 + Object.values(save.upgrades).reduce((sum, value) => sum + value, 0)}`;
  els.deployButton.disabled = Boolean(raid);

  const nextInventorySignature = `${packSlots(level)}:${raid?.inventory.map((item) => `${item.name}-${item.value}-${item.weight}`).join("|") ?? ""}`;
  if (nextInventorySignature !== inventorySignature) {
    inventorySignature = nextInventorySignature;
    renderInventory();
  }

  const nextUpgradeSignature = `${save.money}:${Boolean(raid)}:${JSON.stringify(save.upgrades)}`;
  if (nextUpgradeSignature !== upgradeSignature) {
    upgradeSignature = nextUpgradeSignature;
    renderUpgrades();
  }
}

function renderInventory() {
  const slots = packSlots(save.upgrades.pack);
  const items = raid?.inventory ?? [];
  const nodes = [];
  for (let i = 0; i < slots; i += 1) {
    const item = items[i];
    const slot = document.createElement("div");
    slot.className = item ? "inventory-slot" : "inventory-slot empty";
    if (item) {
      slot.style.setProperty("--item-color", item.color);
      slot.style.setProperty("--item-accent", item.accent);
      slot.innerHTML = `
        <span class="item-pixel" aria-hidden="true"></span>
        <span class="item-name">${item.name}</span>
        <span class="item-meta">$${item.value} · ${item.weight.toFixed(1)} kg</span>
      `;
    }
    nodes.push(slot);
  }
  els.inventoryGrid.replaceChildren(...nodes);
}

function renderUpgrades() {
  const rows = upgrades.map((upgrade) => {
    const level = save.upgrades[upgrade.id] ?? 0;
    const maxed = level >= upgrade.max;
    const cost = upgradeCost(upgrade, level);
    const row = document.createElement("div");
    row.className = "upgrade-row";
    const copy = document.createElement("div");
    copy.innerHTML = `
      <strong>${upgrade.name} ${level}/${upgrade.max}</strong>
      <span>${upgrade.text(level)}</span>
    `;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = maxed ? "Max" : `$${cost}`;
    button.disabled = Boolean(raid) || maxed || save.money < cost;
    button.addEventListener("click", () => buyUpgrade(upgrade, cost));
    row.append(copy, button);
    return row;
  });
  els.upgradeList.replaceChildren(...rows);
}

function buyUpgrade(upgrade, cost) {
  const level = save.upgrades[upgrade.id] ?? 0;
  if (level >= upgrade.max || save.money < cost || raid) return;
  save.money -= cost;
  save.upgrades[upgrade.id] = level + 1;
  persistSave();
  updateAllUi();
  showMessage(`${upgrade.name} upgraded.`);
}

function showStashOverlay(title, text) {
  els.overlayKicker.textContent = "Stash";
  els.overlayTitle.textContent = title;
  els.overlayText.textContent = text;
  els.summaryStats.replaceChildren(
    statNode("Cash", `$${save.money}`),
    statNode("Best", `$${save.bestValue}`),
    statNode("Runs", String(save.runs))
  );
  els.overlayPrimaryButton.textContent = "Deploy";
  els.overlayCloseButton.textContent = "Shop Only";
  els.overlay.hidden = false;
}

function showResultOverlay(title, text, stats) {
  els.overlayKicker.textContent = "Raid Report";
  els.overlayTitle.textContent = title;
  els.overlayText.textContent = text;
  els.summaryStats.replaceChildren(...stats.map(([label, value]) => statNode(label, value)));
  els.overlayPrimaryButton.textContent = "Deploy Again";
  els.overlayCloseButton.textContent = "Shop";
  els.overlay.hidden = false;
}

function statNode(label, value) {
  const node = document.createElement("div");
  node.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return node;
}

function showMessage(text, seconds = 2.35) {
  els.messagePanel.textContent = text;
  els.messagePanel.classList.add("is-visible");
  messageTimer = seconds;
}

function createFish(index) {
  const roll = Math.random();
  const type =
    roll > 0.97 ? fishTypes[4] : roll > 0.88 ? fishTypes[3] : roll > 0.64 ? fishTypes[2] : fishTypes[index % 2];
  const pos = randomWaterPoint();
  const heading = random(0, Math.PI * 2);
  return {
    ...type,
    id: `${Date.now()}-${index}-${Math.random()}`,
    x: pos.x,
    y: pos.y,
    vx: Math.cos(heading) * type.speed,
    vy: Math.sin(heading) * type.speed,
    wiggle: random(0, Math.PI * 2),
    hooked: false,
  };
}

function spawnHazard() {
  const side = Math.floor(random(0, 4));
  const pos = sidePoint(side);
  const type = Math.random() < 0.68 || raid.nightfall > 0 ? "patrol" : "snag";
  raid.hazards.push({
    type,
    x: pos.x,
    y: pos.y,
    vx: side === 0 ? random(18, 44) : side === 1 ? -random(18, 44) : random(-18, 18),
    vy: side === 2 ? random(18, 44) : side === 3 ? -random(18, 44) : random(-18, 18),
    size: type === "patrol" ? 38 : 28,
    damage: type === "patrol" ? 16 : 10,
    life: type === "patrol" ? 12 : 15,
  });
}

function sidePoint(side) {
  if (side === 0) return { x: -40, y: random(50, H - 50) };
  if (side === 1) return { x: W + 40, y: random(50, H - 50) };
  if (side === 2) return { x: random(50, W - 50), y: -40 };
  return { x: random(50, W - 50), y: H + 40 };
}

function randomWaterPoint() {
  return {
    x: random(58, Math.max(59, W - 58)),
    y: random(58, Math.max(59, H - 58)),
  };
}

function bounceInWater(entity, margin) {
  if (entity.x < margin || entity.x > W - margin) {
    entity.vx *= -1;
    entity.x = clamp(entity.x, margin, W - margin);
  }
  if (entity.y < margin || entity.y > H - margin) {
    entity.vy *= -1;
    entity.y = clamp(entity.y, margin, H - margin);
  }
}

function pullHookedFishTowardPlayer(fish, dt) {
  const angle = Math.atan2(raid.player.y - fish.y, raid.player.x - fish.x);
  fish.x += Math.cos(angle) * dt * (34 + save.upgrades.rod * 7);
  fish.y += Math.sin(angle) * dt * (34 + save.upgrades.rod * 7);
}

function swimFishAway(fish, dt, force) {
  const angle = Math.atan2(fish.y - raid.player.y, fish.x - raid.player.x);
  fish.x = clamp(fish.x + Math.cos(angle) * force * dt, 42, W - 42);
  fish.y = clamp(fish.y + Math.sin(angle) * force * dt, 42, H - 42);
}

function addNoise(amount) {
  if (!raid) return;
  const quiet = 1 - save.upgrades.reel * 0.1;
  raid.noise = clamp(raid.noise + amount * quiet, 0, 100);
}

function addParticle(x, y, color, size, life) {
  raid.particles.push({
    x,
    y,
    color,
    size,
    life,
    vx: random(-24, 24),
    vy: random(-24, 24),
  });
}

function blockBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    addParticle(x + random(-8, 8), y + random(-8, 8), color, Math.random() < 0.5 ? 4 : 8, random(0.28, 0.7));
  }
}

function addFloatText(x, y, text, color) {
  raid.floatText.push({ x, y, text, color, life: 1.1 });
}

function getExtractZones() {
  return [
    { x: Math.floor(W / 2 - 52), y: H - 78, w: 104, h: 48 },
    { x: 30, y: 46, w: 48, h: 104 },
    { x: W - 78, y: Math.floor(H * 0.42), w: 48, h: 104 },
  ];
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = clamp(event.clientX - rect.left, 0, W);
  pointer.y = clamp(event.clientY - rect.top, 0, H);
}

function packSlots(level) {
  return 8 + level * 2;
}

function packCapacity(level) {
  return 8 + level * 4;
}

function extractSeconds(level) {
  return Math.max(1.8, 3.6 - level * 0.34);
}

function upgradeCost(upgrade, level) {
  return Math.round(upgrade.baseCost * upgrade.scale ** level);
}

function rarestName(current, next) {
  const order = ["None", "Common", "Uncommon", "Rare", "Elite"];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return createDefaultSave();
    const parsed = JSON.parse(raw);
    if (parsed.version !== SAVE_VERSION) return createDefaultSave();
    return {
      ...createDefaultSave(),
      ...parsed,
      upgrades: { ...createDefaultSave().upgrades, ...(parsed.upgrades ?? {}) },
    };
  } catch {
    return createDefaultSave();
  }
}

function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    money: 120,
    runs: 0,
    bestValue: 0,
    upgrades: { rod: 0, pack: 0, reel: 0, extract: 0 },
  };
}

function persistSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    showMessage("Save storage is unavailable in this browser.");
  }
}

function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function rectDistance(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}
