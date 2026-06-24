const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const restartButton = document.querySelector("#restartButton");
const scoreValue = document.querySelector("#scoreValue");
const timeValue = document.querySelector("#timeValue");
const comboValue = document.querySelector("#comboValue");
const catchValue = document.querySelector("#catchValue");
const messagePanel = document.querySelector("#messagePanel");

// W/H are CSS pixels; the backing store is scaled by devicePixelRatio in resize().
let W = canvas.width;
let H = canvas.height;
const pond = { x: W / 2, y: H / 2, rx: 1, ry: 1 };
const shore = { rx: 1, ry: 1 };
const runLength = 90;
const fishCount = 16;
const minCast = 76;
const maxCast = 470;
const directHitRadius = 15;
const attractRadius = 64;
const spookRadius = 44;

const keys = new Set();
const pointer = { x: W / 2, y: H / 2, active: false, id: null };
const ripples = [];
const floaters = [];
let state;
let lastTime = performance.now();
let messageTimer = 0;
let animTime = 0;

const fishTypes = [
  {
    name: "Minnow",
    color: "#d9c76f",
    value: 8,
    radius: 9,
    speed: 42,
    turn: 1.8,
    curiosity: 0.84,
    spook: 0.55,
  },
  {
    name: "Bass",
    color: "#5f9b61",
    value: 18,
    radius: 13,
    speed: 32,
    turn: 1.25,
    curiosity: 1.05,
    spook: 0.72,
  },
  {
    name: "Carp",
    color: "#c58a44",
    value: 26,
    radius: 16,
    speed: 24,
    turn: 0.95,
    curiosity: 0.62,
    spook: 1,
  },
  {
    name: "Pike",
    color: "#4e7b72",
    value: 34,
    radius: 14,
    speed: 54,
    turn: 1.35,
    curiosity: 1.22,
    spook: 0.82,
  },
];

restartButton.addEventListener("click", resetGame);
window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    beginCharge();
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    releaseCast();
  }
});

canvas.addEventListener("pointermove", (event) => {
  setPointer(event);
});
canvas.addEventListener("pointerdown", (event) => {
  setPointer(event);
  pointer.active = true;
  pointer.id = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  beginCharge();
});
canvas.addEventListener("pointerup", (event) => {
  setPointer(event);
  pointer.active = false;
  pointer.id = null;
  releaseCast();
});
canvas.addEventListener("pointercancel", () => {
  pointer.active = false;
  pointer.id = null;
  cancelCharge();
});

resize();
new ResizeObserver(resize).observe(canvas);
resetGame();
requestAnimationFrame(tick);

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  pond.x = W / 2;
  pond.y = H / 2 + H * 0.02;
  pond.rx = W * 0.36;
  pond.ry = H * 0.35;
  const margin = Math.min(W, H) * 0.075;
  shore.rx = pond.rx + margin;
  shore.ry = pond.ry + margin;
}

function resetGame() {
  state = {
    score: 0,
    catches: 0,
    combo: 1,
    comboTimer: 0,
    timeLeft: runLength,
    runOver: false,
    playerAngle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    mode: "ready",
    charge: 0,
    chargeDir: 1,
    cast: null,
    lure: null,
    fish: Array.from({ length: fishCount }, (_, index) => createFish(index)),
  };
  ripples.length = 0;
  floaters.length = 0;
  showMessage("Land close to a fish, lead the moving ones, and avoid noisy splashes.");
  updateHud();
}

function createFish(index) {
  const type = fishTypes[index % fishTypes.length];
  const pos = randomPondPoint(0.84);
  const heading = Math.random() * Math.PI * 2;
  const speed = type.speed * random(0.78, 1.18);
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${index}-${Math.random()}`,
    ...type,
    x: pos.x,
    y: pos.y,
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    baseSpeed: speed,
    wiggle: Math.random() * Math.PI * 2,
    spooked: 0,
    hooked: false,
    biteDelay: 0,
  };
}

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(tick);
}

function update(dt) {
  animTime += dt;
  if (!state.runOver) {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft <= 0) {
      endRun();
    }
  }

  updatePlayer(dt);
  updateCharge(dt);
  updateCast(dt);
  updateLure(dt);
  updateFish(dt);
  updateEffects(dt);
  updateHud();
}

function updatePlayer(dt) {
  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  const up = keys.has("ArrowUp") || keys.has("KeyW");
  const down = keys.has("ArrowDown") || keys.has("KeyS");
  let direction = 0;

  if (left) direction -= 1;
  if (right) direction += 1;
  if (up) direction -= 0.7;
  if (down) direction += 0.7;

  state.playerAngle = normalizeAngle(state.playerAngle + direction * dt * 1.55);
  const player = getPlayerPosition();
  const targetAngle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
  if (Number.isFinite(targetAngle)) {
    state.aimAngle = targetAngle;
  }
}

function updateCharge(dt) {
  if (state.mode !== "charging") return;

  state.charge += state.chargeDir * dt * 0.85;
  if (state.charge >= 1) {
    state.charge = 1;
    state.chargeDir = -1;
  } else if (state.charge <= 0.08) {
    state.charge = 0.08;
    state.chargeDir = 1;
  }
}

function updateCast(dt) {
  if (state.mode !== "casting" || !state.cast) return;

  const cast = state.cast;
  cast.t = Math.min(1, cast.t + dt / cast.duration);
  const eased = easeOutCubic(cast.t);
  const arc = Math.sin(cast.t * Math.PI) * cast.arc;
  cast.x = lerp(cast.start.x, cast.target.x, eased);
  cast.y = lerp(cast.start.y, cast.target.y, eased) - arc;
  cast.shadowX = lerp(cast.start.x, cast.target.x, eased);
  cast.shadowY = lerp(cast.start.y, cast.target.y, eased);

  if (cast.t >= 1) {
    landLure(cast.target.x, cast.target.y);
  }
}

function updateLure(dt) {
  if (state.mode !== "lure" || !state.lure) return;

  state.lure.life -= dt;
  state.lure.pulse += dt * 5;

  if (state.lure.life <= 0) {
    missCast("The bait went quiet.");
  }
}

function updateFish(dt) {
  for (const fish of state.fish) {
    if (fish.hooked) continue;

    fish.wiggle += dt * fish.turn;
    const lure = state.mode === "lure" ? state.lure : null;
    const dx = lure ? lure.x - fish.x : 0;
    const dy = lure ? lure.y - fish.y : 0;
    const lureDist = lure ? Math.hypot(dx, dy) : Infinity;
    const canNotice = lure && lureDist < attractRadius * fish.curiosity;

    if (fish.spooked > 0) {
      fish.spooked = Math.max(0, fish.spooked - dt);
      const away = angleFrom(fish.x - (lure?.x ?? pond.x), fish.y - (lure?.y ?? pond.y));
      steerFish(fish, away, fish.baseSpeed * 1.75, dt);
    } else if (canNotice) {
      steerFish(fish, Math.atan2(dy, dx), fish.baseSpeed * 1.16, dt);
      if (lureDist < fish.radius + 8) {
        fish.biteDelay += dt;
        if (fish.biteDelay > 0.14) {
          hookFish(fish, lureDist <= fish.radius + 3);
        }
      } else {
        fish.biteDelay = Math.max(0, fish.biteDelay - dt * 0.6);
      }
    } else {
      fish.biteDelay = 0;
      const wanderAngle = Math.atan2(fish.vy, fish.vx) + Math.sin(fish.wiggle) * dt * fish.turn;
      steerFish(fish, wanderAngle, fish.baseSpeed, dt * 0.65);
    }

    fish.x += fish.vx * dt;
    fish.y += fish.vy * dt;
    keepFishInPond(fish);
  }
}

function updateEffects(dt) {
  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    ripples[i].age += dt;
    if (ripples[i].age >= ripples[i].life) ripples.splice(i, 1);
  }

  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    floaters[i].age += dt;
    floaters[i].y -= dt * 24;
    if (floaters[i].age >= floaters[i].life) floaters.splice(i, 1);
  }

  if (state.comboTimer > 0) {
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer === 0) state.combo = 1;
  }

  if (messageTimer > 0) {
    messageTimer = Math.max(0, messageTimer - dt);
    if (messageTimer === 0) messagePanel.classList.remove("is-visible");
  }
}

function beginCharge() {
  if (state.runOver || state.mode !== "ready") return;

  state.mode = "charging";
  state.charge = Math.max(state.charge, 0.08);
  state.chargeDir = 1;
}

function cancelCharge() {
  if (state.mode !== "charging") return;
  state.mode = "ready";
  state.charge = 0;
}

function releaseCast() {
  if (state.runOver || state.mode !== "charging") return;

  const player = getPlayerPosition();
  const strength = state.charge;
  const distance = minCast + strength * maxCast;
  const target = {
    x: player.x + Math.cos(state.aimAngle) * distance,
    y: player.y + Math.sin(state.aimAngle) * distance,
  };

  state.mode = "casting";
  state.cast = {
    start: player,
    target,
    x: player.x,
    y: player.y,
    shadowX: player.x,
    shadowY: player.y,
    t: 0,
    duration: 0.35 + strength * 0.32,
    arc: 54 + strength * 96,
    strength,
  };
}

function landLure(x, y) {
  const inWater = isInsidePond(x, y, 1);
  ripples.push({ x, y, age: 0, life: 0.75, color: inWater ? "#eff9f8" : "#9a6d3d" });

  state.cast = null;

  if (!inWater) {
    missCast("Bank shot. No bite.");
    return;
  }

  const direct = findNearestFish(x, y, directHitRadius);
  if (direct) {
    hookFish(direct, true);
    return;
  }

  let spooked = 0;
  for (const fish of state.fish) {
    const d = Math.hypot(fish.x - x, fish.y - y);
    if (d < spookRadius * fish.spook) {
      fish.spooked = random(0.8, 1.5);
      spooked += 1;
    }
  }

  state.lure = {
    x,
    y,
    life: 2.85,
    pulse: 0,
    spooked,
  };
  state.mode = "lure";

  if (spooked > 0) {
    state.combo = 1;
    state.comboTimer = 0;
    showMessage(`${spooked} fish spooked by the splash.`);
  }
}

function hookFish(fish, perfect) {
  if (fish.hooked || state.runOver) return;

  fish.hooked = true;
  const player = getPlayerPosition();
  const distanceBonus = Math.floor(Math.hypot(player.x - fish.x, player.y - fish.y) / 56);
  const perfectBonus = perfect ? 10 : 0;
  const gained = Math.round((fish.value + distanceBonus + perfectBonus) * state.combo);
  state.score += gained;
  state.catches += 1;
  state.combo = Math.min(9, state.combo + (perfect ? 1 : 0.5));
  state.comboTimer = 5.5;
  floaters.push({
    x: fish.x,
    y: fish.y - fish.radius,
    text: `+${gained}`,
    age: 0,
    life: 0.9,
    color: perfect ? "#fff2ad" : "#ffffff",
  });
  ripples.push({ x: fish.x, y: fish.y, age: 0, life: 0.65, color: "#ffffff" });

  showMessage(perfect ? `Perfect ${fish.name}!` : `${fish.name} hooked.`);
  replaceFish(fish);
  state.mode = "ready";
  state.cast = null;
  state.lure = null;
  state.charge = 0;
}

function replaceFish(fish) {
  const index = state.fish.indexOf(fish);
  if (index === -1) return;

  window.setTimeout(() => {
    if (!state || state.runOver) return;
    state.fish[index] = createFish(Math.floor(Math.random() * 1000));
  }, 520);
}

function missCast(message) {
  state.mode = "ready";
  state.cast = null;
  state.lure = null;
  state.charge = 0;
  state.combo = 1;
  state.comboTimer = 0;
  showMessage(message);
}

function endRun() {
  state.runOver = true;
  state.mode = "ready";
  state.cast = null;
  state.lure = null;
  showMessage(`Run over. ${state.catches} catches, ${state.score} points.`);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawGround();
  drawPond();
  drawCaustics();
  drawFish();
  drawRipples();
  drawLure();
  drawLilies();
  drawReeds();
  drawPlayer();
  drawCast();
  drawAim();
  drawFloaters();
  drawVignette();
  drawOverlay();
}

function drawGround() {
  const grass = ctx.createLinearGradient(0, 0, W * 0.4, H);
  grass.addColorStop(0, "#9cba66");
  grass.addColorStop(0.55, "#7fa353");
  grass.addColorStop(1, "#5f8741");
  ctx.fillStyle = grass;
  ctx.fillRect(0, 0, W, H);

  // warm sunlight wash from the top-left
  const sun = ctx.createRadialGradient(W * 0.18, H * 0.08, 0, W * 0.18, H * 0.08, Math.max(W, H));
  sun.addColorStop(0, "rgba(255, 246, 200, 0.4)");
  sun.addColorStop(0.45, "rgba(255, 246, 200, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  // static grass speckle for texture (deterministic, no flicker)
  ctx.fillStyle = "rgba(40, 70, 30, 0.10)";
  for (let i = 0; i < 150; i += 1) {
    const x = randomStatic(i, 0, W);
    const y = randomStatic(i + 300, 0, H);
    ctx.fillRect(x, y, 2, randomStatic(i + 9, 4, 9));
  }
}

function drawPond() {
  ctx.save();
  ctx.translate(pond.x, pond.y);

  // soft drop shadow of the basin on the grass
  ctx.fillStyle = "rgba(20, 40, 25, 0.18)";
  ellipsePath(0, 10, pond.rx + 28, pond.ry + 24);
  ctx.fill();

  // sandy bank ring
  const bank = ctx.createRadialGradient(0, 0, pond.rx * 0.82, 0, 0, pond.rx + 32);
  bank.addColorStop(0, "#e7cf9a");
  bank.addColorStop(0.62, "#d6ba80");
  bank.addColorStop(1, "rgba(176, 142, 84, 0)");
  ctx.fillStyle = bank;
  ellipsePath(0, 0, pond.rx + 32, pond.ry + 28);
  ctx.fill();

  // water — lighter at the near edge, deep and dark in the centre
  const water = ctx.createRadialGradient(-pond.rx * 0.18, -pond.ry * 0.22, pond.ry * 0.2, 0, 0, pond.rx);
  water.addColorStop(0, "#5aa6b0");
  water.addColorStop(0.45, "#2f7585");
  water.addColorStop(0.82, "#1d5566");
  water.addColorStop(1, "#143f4e");
  ctx.fillStyle = water;
  ellipsePath(0, 0, pond.rx, pond.ry);
  ctx.fill();

  // sky-reflection sheen along the top
  const sheen = ctx.createLinearGradient(0, -pond.ry, 0, pond.ry * 0.1);
  sheen.addColorStop(0, "rgba(225, 248, 248, 0.3)");
  sheen.addColorStop(1, "rgba(225, 248, 248, 0)");
  ctx.fillStyle = sheen;
  ellipsePath(0, 0, pond.rx, pond.ry);
  ctx.fill();

  // crisp waterline
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ellipsePath(0, 0, pond.rx, pond.ry);
  ctx.stroke();

  ctx.restore();
}

function drawReeds() {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 48; i += 1) {
    const angle = (i / 48) * Math.PI * 2;
    const base = pointOnEllipse(
      pond.x,
      pond.y,
      pond.rx + randomStatic(i, 4, 18),
      pond.ry + randomStatic(i + 4, 2, 14),
      angle,
    );
    const h = randomStatic(i + 9, 16, 42);
    const sway = Math.sin(animTime * 1.2 + i) * 4;
    ctx.strokeStyle = i % 3 === 0 ? "#4d7a35" : "#5e8c3e";
    ctx.lineWidth = randomStatic(i + 1, 2, 3.5);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.quadraticCurveTo(base.x + sway, base.y - h * 0.55, base.x + sway * 1.6, base.y - h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFish() {
  for (const fish of state.fish) {
    if (fish.hooked) continue;
    const heading = Math.atan2(fish.vy, fish.vx);
    const r = fish.radius;
    const swish = Math.sin(fish.wiggle * 3) * 0.45;

    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.rotate(heading);

    // soft shadow on the pond floor
    ctx.fillStyle = "rgba(8, 28, 33, 0.28)";
    ctx.beginPath();
    ctx.ellipse(2, 4, r * 1.55, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = fish.spooked > 0 ? 0.95 : 0.9;

    // tail
    ctx.fillStyle = shade(fish.color, -20);
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, 0);
    ctx.lineTo(-r * 2.1, (-0.7 + swish) * r);
    ctx.lineTo(-r * 1.65, 0);
    ctx.lineTo(-r * 2.1, (0.7 + swish) * r);
    ctx.closePath();
    ctx.fill();

    // dorsal fin
    ctx.fillStyle = shade(fish.color, -8);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.55);
    ctx.quadraticCurveTo(r * 0.15, -r * 1.15, r * 0.5, -r * 0.5);
    ctx.closePath();
    ctx.fill();

    // body
    const body = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
    body.addColorStop(0, shade(fish.color, 34));
    body.addColorStop(0.5, fish.color);
    body.addColorStop(1, shade(fish.color, -28));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.45, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // back highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.beginPath();
    ctx.ellipse(r * 0.15, -r * 0.28, r * 0.85, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // eye
    ctx.fillStyle = "#15201f";
    ctx.beginPath();
    ctx.arc(r * 0.82, -r * 0.12, Math.max(1.6, r * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(r * 0.86, -r * 0.18, Math.max(0.6, r * 0.06), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawRipples() {
  for (const ripple of ripples) {
    const t = ripple.age / ripple.life;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = ripple.color;
    ctx.lineWidth = (1 - t) * 2 + 0.5;
    ctx.beginPath();
    ctx.ellipse(ripple.x, ripple.y, 10 + t * 54, 5 + t * 28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLure() {
  if (state.mode !== "lure" || !state.lure) return;
  const { x, y } = state.lure;
  const pulse = (Math.sin(state.lure.pulse) + 1) * 0.5;

  ctx.save();
  // expanding attract ring
  ctx.strokeStyle = `rgba(255, 240, 170, ${0.5 - pulse * 0.32})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, attractRadius * (0.65 + pulse * 0.35), 0, Math.PI * 2);
  ctx.stroke();

  // glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
  glow.addColorStop(0, "rgba(255, 235, 150, 0.7)");
  glow.addColorStop(1, "rgba(255, 235, 150, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();

  drawBobber(x, y, 6);
  ctx.restore();
}

function drawPlayer() {
  const player = getPlayerPosition();

  ctx.save();
  ctx.translate(player.x, player.y);

  // ground shadow
  ctx.fillStyle = "rgba(20, 40, 25, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 7, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // fishing rod (points at the aim direction)
  ctx.save();
  ctx.rotate(state.aimAngle);
  ctx.strokeStyle = "#6c4a2a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(42, -5);
  ctx.stroke();
  ctx.restore();

  // body
  const body = ctx.createLinearGradient(0, -14, 0, 16);
  body.addColorStop(0, "#3c6b4f");
  body.addColorStop(1, "#264a37");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // head + cap
  ctx.fillStyle = "#f0cf9d";
  ctx.beginPath();
  ctx.arc(0, -7, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b5572f";
  ctx.beginPath();
  ctx.arc(0, -9, 8, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-9, -9, 18, 2);
  ctx.restore();
}

function drawCast() {
  if (state.mode !== "casting" || !state.cast) return;

  const cast = state.cast;
  const player = getPlayerPosition();
  ctx.save();
  // line from rod
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y - 6);
  ctx.lineTo(cast.x, cast.y);
  ctx.stroke();

  // landing shadow
  ctx.fillStyle = "rgba(15, 35, 38, 0.25)";
  ctx.beginPath();
  ctx.ellipse(cast.shadowX, cast.shadowY, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  drawBobber(cast.x, cast.y, 5);
  ctx.restore();
}

function drawAim() {
  if (state.runOver || state.mode === "casting" || state.mode === "lure") return;

  const player = getPlayerPosition();
  const strength = state.mode === "charging" ? state.charge : 0.08;
  const distance = minCast + strength * maxCast;
  const target = {
    x: player.x + Math.cos(state.aimAngle) * distance,
    y: player.y + Math.sin(state.aimAngle) * distance,
  };
  const inWater = isInsidePond(target.x, target.y, 1);
  const tint = inWater ? "#ffe27a" : "#e0795a";

  ctx.save();
  ctx.globalAlpha = state.mode === "charging" ? 1 : 0.5;

  // dotted trajectory
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.setLineDash([1, 11]);
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // reticle with tick marks
  const rad = 10 + strength * 8;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(target.x, target.y, rad, 0, Math.PI * 2);
  ctx.stroke();
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(target.x + Math.cos(a) * (rad - 4), target.y + Math.sin(a) * (rad - 4));
    ctx.lineTo(target.x + Math.cos(a) * (rad + 4), target.y + Math.sin(a) * (rad + 4));
    ctx.stroke();
  }

  // power arc around the angler while charging
  if (state.mode === "charging") {
    const a0 = -Math.PI * 0.75;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, 26, a0, a0 + Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = strength > 0.85 ? "#ff6b4a" : "#ffe27a";
    ctx.beginPath();
    ctx.arc(player.x, player.y, 26, a0, a0 + strength * Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloaters() {
  ctx.save();
  ctx.textAlign = "center";
  for (const floater of floaters) {
    const t = floater.age / floater.life;
    ctx.globalAlpha = 1 - t;
    ctx.font = `800 ${20 + (1 - t) * 4}px Inter, system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(15, 30, 25, 0.55)";
    ctx.strokeText(floater.text, floater.x, floater.y);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.restore();
}

function drawOverlay() {
  if (!state.runOver) return;

  ctx.save();
  ctx.fillStyle = "rgba(12, 22, 20, 0.55)";
  ctx.fillRect(0, 0, W, H);

  const cardW = Math.min(W * 0.82, 420);
  const cardH = 200;
  const cx = W / 2 - cardW / 2;
  const cy = H / 2 - cardH / 2;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cardW, cardH, 18);
  ctx.fillStyle = "rgba(250, 250, 242, 0.97)";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "#1d5566";
  ctx.font = "900 32px Inter, system-ui, sans-serif";
  ctx.fillText("Run Complete", W / 2, cy + 54);

  ctx.fillStyle = "#17201b";
  ctx.font = "800 46px Inter, system-ui, sans-serif";
  ctx.fillText(state.score.toLocaleString(), W / 2, cy + 110);

  ctx.fillStyle = "#5f685f";
  ctx.font = "700 16px Inter, system-ui, sans-serif";
  ctx.fillText(`${state.catches} catches`, W / 2, cy + 138);

  ctx.fillStyle = "#2f7585";
  ctx.font = "700 13px Inter, system-ui, sans-serif";
  ctx.fillText("Press Restart to cast again", W / 2, cy + 172);
  ctx.restore();
}

function drawCaustics() {
  ctx.save();
  ellipsePath(pond.x, pond.y, pond.rx - 3, pond.ry - 3);
  ctx.clip();
  ctx.globalCompositeOperation = "soft-light";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  const rows = 7;
  for (let i = 0; i < rows; i += 1) {
    const y = pond.y - pond.ry + (i + 0.5) * ((pond.ry * 2) / rows);
    ctx.beginPath();
    for (let x = pond.x - pond.rx; x <= pond.x + pond.rx; x += 14) {
      const wy = y + Math.sin(x * 0.05 + animTime * 1.5 + i) * 6;
      x <= pond.x - pond.rx ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawLilies() {
  const pads = 5;
  for (let i = 0; i < pads; i += 1) {
    const a = (i / pads) * Math.PI * 2 + 1.3;
    const rr = 0.5 + randomStatic(i, 0, 0.28);
    const x = pond.x + Math.cos(a) * pond.rx * rr;
    const y = pond.y + Math.sin(a) * pond.ry * rr;
    const size = randomStatic(i + 3, 12, 20);

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(8, 28, 28, 0.18)";
    ctx.beginPath();
    ctx.ellipse(2, 3, size, size * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(-size * 0.3, -size * 0.3, 1, 0, 0, size);
    grad.addColorStop(0, "#6fae54");
    grad.addColorStop(1, "#3f7a3a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, size, a + 0.5, a + Math.PI * 2 - 0.5);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawVignette() {
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0, 0, 0, 0)");
  v.addColorStop(1, "rgba(18, 28, 20, 0.3)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawBobber(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#f4f0e6";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, Math.PI * 2);
  ctx.fillStyle = "#e8503f";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(40, 20, 10, 0.4)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function getPlayerPosition() {
  return pointOnEllipse(pond.x, pond.y, shore.rx, shore.ry, state.playerAngle);
}

function steerFish(fish, targetAngle, targetSpeed, dt) {
  const currentAngle = Math.atan2(fish.vy, fish.vx);
  const delta = shortestAngle(currentAngle, targetAngle);
  const nextAngle = currentAngle + clamp(delta, -fish.turn * dt, fish.turn * dt);
  const speed = lerp(Math.hypot(fish.vx, fish.vy), targetSpeed, clamp(dt * 2.8, 0, 1));
  fish.vx = Math.cos(nextAngle) * speed;
  fish.vy = Math.sin(nextAngle) * speed;
}

function keepFishInPond(fish) {
  const nx = (fish.x - pond.x) / (pond.rx - fish.radius * 2);
  const ny = (fish.y - pond.y) / (pond.ry - fish.radius * 2);
  const d = nx * nx + ny * ny;
  if (d <= 1) return;

  const angle = Math.atan2(ny, nx);
  const edge = pointOnEllipse(pond.x, pond.y, pond.rx - fish.radius * 2, pond.ry - fish.radius * 2, angle);
  fish.x = edge.x;
  fish.y = edge.y;
  const inward = Math.atan2(pond.y - fish.y, pond.x - fish.x) + random(-0.45, 0.45);
  fish.vx = Math.cos(inward) * fish.baseSpeed;
  fish.vy = Math.sin(inward) * fish.baseSpeed;
}

function findNearestFish(x, y, radius) {
  let nearest = null;
  let best = radius;
  for (const fish of state.fish) {
    if (fish.hooked) continue;
    const distance = Math.hypot(fish.x - x, fish.y - y) - fish.radius;
    if (distance < best) {
      best = distance;
      nearest = fish;
    }
  }
  return nearest;
}

function randomPondPoint(scale = 1) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * scale;
  return {
    x: pond.x + Math.cos(angle) * pond.rx * radius,
    y: pond.y + Math.sin(angle) * pond.ry * radius,
  };
}

function isInsidePond(x, y, scale = 1) {
  const nx = (x - pond.x) / (pond.rx * scale);
  const ny = (y - pond.y) / (pond.ry * scale);
  return nx * nx + ny * ny <= 1;
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
}

function updateHud() {
  scoreValue.textContent = state.score.toLocaleString();
  timeValue.textContent = `${Math.ceil(state.timeLeft)}`;
  comboValue.textContent = `x${formatCombo(state.combo)}`;
  catchValue.textContent = state.catches.toLocaleString();
}

function showMessage(text) {
  messagePanel.textContent = text;
  messagePanel.classList.add("is-visible");
  messageTimer = 2.5;
}

function pointOnEllipse(cx, cy, rx, ry, angle) {
  return {
    x: cx + Math.cos(angle) * rx,
    y: cy + Math.sin(angle) * ry,
  };
}

function ellipsePath(x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function angleFrom(x, y) {
  return Math.atan2(y, x);
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

function shortestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function randomStatic(seed, min, max) {
  const x = Math.sin(seed * 999) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

function formatCombo(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
