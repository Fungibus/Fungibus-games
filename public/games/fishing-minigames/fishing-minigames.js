const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const els = {
  tabs: [...document.querySelectorAll(".tab-button")],
  dirButtons: [...document.querySelectorAll(".dir-button")],
  startButton: document.querySelector("#startButton"),
  resetButton: document.querySelector("#resetButton"),
  holdButton: document.querySelector("#holdButton"),
  directionPanel: document.querySelector("#directionPanel"),
  upgradePanel: document.querySelector("#upgradePanel"),
  upgradeInputs: [...document.querySelectorAll("[data-upgrade]")],
  difficultySlider: document.querySelector("#difficultySlider"),
  difficultyValue: document.querySelector("#difficultyValue"),
  activeGameTitle: document.querySelector("#activeGameTitle"),
  statusPill: document.querySelector("#statusPill"),
  statsList: document.querySelector("#statsList"),
  resultPanel: document.querySelector("#resultPanel"),
  resultKicker: document.querySelector("#resultKicker"),
  resultTitle: document.querySelector("#resultTitle"),
  resultText: document.querySelector("#resultText"),
  retryPopup: document.querySelector("#retryPopup"),
  retryKicker: document.querySelector("#retryKicker"),
  retryTitle: document.querySelector("#retryTitle"),
  retryText: document.querySelector("#retryText"),
  retryButton: document.querySelector("#retryButton"),
};

let width = 0;
let height = 0;
let difficulty = Number(els.difficultySlider.value);
let activeId = "bar";
let inputDown = false;
let inputSource = null;
let lastTime = performance.now();
const pointer = { x: 0, y: 0, active: false };
const directionsDown = new Set();

const games = {
  bar: createBarKeeper(difficulty),
  ring: createTimingRing(difficulty),
  cast: createShadowCast(difficulty),
  tug: createSquareTug(difficulty),
  rod: createRodTug(difficulty),
  drifter: createCurrentDrifter(difficulty),
  sorter: createNetSorter(difficulty),
  depth: createDepthDial(difficulty),
  bite: createBiteCode(difficulty),
  kelp: createKelpThread(difficulty),
  net: createDragNet(difficulty),
};

let activeGame = games[activeId];

els.tabs.forEach((button) => {
  button.addEventListener("click", () => selectGame(button.dataset.game));
});

els.dirButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setDirection(button.dataset.dir, true);
  });
  button.addEventListener("pointerup", () => setDirection(button.dataset.dir, false));
  button.addEventListener("pointercancel", () => setDirection(button.dataset.dir, false));
});

els.upgradeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    syncActiveUpgrades();
    updateUi();
  });
});

els.startButton.addEventListener("click", () => {
  activeGame.start();
  updateUi();
});

els.resetButton.addEventListener("click", () => {
  activeGame.reset();
  updateUi();
});

els.retryButton.addEventListener("click", retryActiveGame);

els.difficultySlider.addEventListener("input", () => {
  difficulty = Number(els.difficultySlider.value);
  activeGame.setDifficulty(difficulty);
  activeGame.reset();
  updateUi();
});

els.holdButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  els.holdButton.setPointerCapture(event.pointerId);
  pressAction("button");
});
els.holdButton.addEventListener("pointerup", releaseAction);
els.holdButton.addEventListener("pointercancel", releaseAction);

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  setPointer(event);
  canvas.setPointerCapture(event.pointerId);
  pressAction("canvas");
});
canvas.addEventListener("pointermove", setPointer);
canvas.addEventListener("pointerup", (event) => {
  setPointer(event);
  releaseAction();
});
canvas.addEventListener("pointercancel", () => {
  pointer.active = false;
  releaseAction();
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat) pressAction("keyboard");
  }

  if (event.code === "KeyR") {
    event.preventDefault();
    activeGame.reset();
    updateUi();
  }

  const direction = directionFromCode(event.code);
  if (direction) {
    event.preventDefault();
    setDirection(direction, true);
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    releaseAction();
  }

  const direction = directionFromCode(event.code);
  if (direction) {
    event.preventDefault();
    setDirection(direction, false);
  }
});

resize();
new ResizeObserver(resize).observe(canvas);
updateUi();
requestAnimationFrame(tick);

function selectGame(id) {
  if (!games[id] || id === activeId) return;
  inputDown = false;
  inputSource = null;
  directionsDown.clear();
  els.dirButtons.forEach((button) => button.classList.remove("is-pressed"));
  activeId = id;
  activeGame = games[activeId];
  activeGame.setDifficulty(difficulty);
  syncActiveUpgrades();
  activeGame.reset();

  els.tabs.forEach((button) => {
    const selected = button.dataset.game === activeId;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  updateUi();
}

function selectedUpgrades() {
  return els.upgradeInputs.filter((input) => input.checked).map((input) => input.dataset.upgrade);
}

function syncActiveUpgrades() {
  if (activeGame.setUpgrades) {
    activeGame.setUpgrades(selectedUpgrades());
  }
}

function pressAction(source = "button") {
  const status = activeGame.getStatus();
  if (isEnded(status)) {
    retryActiveGame();
    return;
  }

  inputDown = true;
  inputSource = source;
  els.holdButton.classList.add("is-pressed");
  if (status.state === "ready") activeGame.start();
  activeGame.handlePress(source);
  updateUi();
}

function retryActiveGame() {
  inputDown = false;
  inputSource = null;
  els.holdButton.classList.remove("is-pressed");
  activeGame.start();
  updateUi();
}

function isEnded(status) {
  return status.state === "won" || status.state === "lost";
}

function releaseAction() {
  if (!inputDown) return;
  const source = inputSource;
  inputDown = false;
  inputSource = null;
  els.holdButton.classList.remove("is-pressed");
  activeGame.handleRelease(source);
  updateUi();
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  pointer.active = true;
}

function setDirection(direction, active) {
  if (active) {
    directionsDown.add(direction);
  } else {
    directionsDown.delete(direction);
  }

  els.dirButtons.forEach((button) => {
    button.classList.toggle("is-pressed", directionsDown.has(button.dataset.dir));
  });
}

function directionFromCode(code) {
  return {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
  }[code];
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  activeGame.draw(ctx, width, height);
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  activeGame.update(dt, inputDown);
  activeGame.draw(ctx, width, height);
  updateUi();
  requestAnimationFrame(tick);
}

function updateUi() {
  const status = activeGame.getStatus();
  const ended = isEnded(status);
  els.difficultyValue.textContent = String(difficulty);
  els.activeGameTitle.textContent = activeGame.title;
  els.statusPill.textContent = status.label;
  els.statusPill.dataset.state = status.state;
  els.resultPanel.hidden = ended;
  els.resultKicker.textContent = status.label;
  els.resultTitle.textContent = status.title;
  els.resultText.textContent = status.text;
  els.retryPopup.hidden = !ended;
  els.retryKicker.textContent = status.label;
  els.retryTitle.textContent = status.state === "won" ? "Caught" : "Try Again";
  els.retryText.textContent = status.text;
  els.holdButton.textContent = ended ? "Try Again" : activeGame.actionLabel;
  els.directionPanel.hidden = !activeGame.usesDirections;
  els.upgradePanel.hidden = !activeGame.supportsUpgrades;
  els.upgradeInputs.forEach((input) => {
    input.disabled = !activeGame.supportsUpgrades;
  });
  els.statsList.replaceChildren(
    ...activeGame.getStats().map(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      row.append(term, detail);
      return row;
    })
  );
}

function createBarKeeper(level) {
  const game = {
    id: "bar",
    title: "Bar Keeper",
    actionLabel: "Lift Bar",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress() {},
    handleRelease() {},
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    game.state = {
      mode: "ready",
      barY: 0.62,
      barV: 0,
      fishY: 0.44,
      fishV: 0,
      fishTarget: 0.44,
      fishTimer: 0,
      progress: 0.34,
      timeLeft: 30,
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt, pressed) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = barSettings();
    state.timeLeft -= dt;
    state.barV += (pressed ? -settings.lift : settings.gravity) * dt;
    state.barV *= Math.pow(0.04, dt);
    state.barY = clamp(state.barY + state.barV * dt, settings.barSize / 2, 1 - settings.barSize / 2);
    if (state.barY <= settings.barSize / 2 || state.barY >= 1 - settings.barSize / 2) {
      state.barV *= -0.18;
    }

    state.fishTimer -= dt;
    if (state.fishTimer <= 0) {
      state.fishTarget = random(0.11, 0.89);
      state.fishTimer = random(0.32, 1.05) / settings.fishTempo;
    }

    const delta = state.fishTarget - state.fishY;
    state.fishV += delta * settings.fishPull * dt;
    state.fishV *= Math.pow(0.11, dt);
    state.fishY = clamp(state.fishY + state.fishV * dt, 0.05, 0.95);

    const overlap = Math.abs(state.fishY - state.barY) <= settings.barSize / 2;
    state.progress = clamp(
      state.progress + (overlap ? settings.gain : -settings.drain) * dt,
      0,
      1
    );

    if (state.progress >= 1) state.mode = "won";
    if (state.progress <= 0 || state.timeLeft <= 0) state.mode = "lost";
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Bar Keeper");
    const state = game.state;
    const settings = barSettings();
    const track = fitRect(W, H, 110, 54, Math.min(148, W * 0.2), Math.min(520, H * 0.72));
    const meter = {
      x: Math.min(W - 86, track.x + track.w + 42),
      y: track.y,
      w: 22,
      h: track.h,
    };

    drawPanel(context, track.x, track.y, track.w, track.h, 14);
    drawPanel(context, meter.x, meter.y, meter.w, meter.h, 11);

    const barH = track.h * settings.barSize;
    const barY = track.y + state.barY * track.h - barH / 2;
    const fishY = track.y + state.fishY * track.h;

    context.fillStyle = "rgba(127, 212, 255, 0.16)";
    context.fillRect(track.x + 10, barY, track.w - 20, barH);
    context.strokeStyle = "#7fd4ff";
    context.lineWidth = 3;
    context.strokeRect(track.x + 10, barY, track.w - 20, barH);

    context.fillStyle = "#ffd36b";
    context.beginPath();
    context.ellipse(track.x + track.w / 2, fishY, 20, 12, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#102023";
    context.beginPath();
    context.arc(track.x + track.w / 2 + 8, fishY - 2, 2.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ff876f";
    context.beginPath();
    context.moveTo(track.x + track.w / 2 - 21, fishY);
    context.lineTo(track.x + track.w / 2 - 34, fishY - 10);
    context.lineTo(track.x + track.w / 2 - 34, fishY + 10);
    context.closePath();
    context.fill();

    const fillH = meter.h * state.progress;
    context.fillStyle = state.progress > 0.28 ? "#91d576" : "#ff876f";
    context.fillRect(meter.x, meter.y + meter.h - fillH, meter.w, fillH);

    drawStageText(context, W, H, state.mode === "running" ? "Keep the fish inside the bar" : getStatus().text);
  }

  function getStats() {
    const state = game.state;
    return [
      ["Progress", formatPercent(state.progress)],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
      ["Fish", `${Math.round(state.fishY * 100)}`],
      ["Bar", `${Math.round(state.barY * 100)}`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") {
      return {
        state: "won",
        label: "Caught",
        title: "Bar Keeper",
        text: "Catch meter filled.",
      };
    }
    if (state.mode === "lost") {
      return {
        state: "lost",
        label: "Lost",
        title: "Bar Keeper",
        text: state.timeLeft <= 0 ? "Timer expired." : "Catch meter drained.",
      };
    }
    if (state.mode === "running") {
      return {
        state: "running",
        label: "Running",
        title: "Bar Keeper",
        text: "Tracking active.",
      };
    }
    return {
      state: "ready",
      label: "Ready",
      title: "Bar Keeper",
      text: "Press Start to begin.",
    };
  }

  function barSettings() {
    const d = game.level;
    return {
      barSize: 0.34 - d * 0.026,
      lift: 2.95 + d * 0.18,
      gravity: 2.1 + d * 0.12,
      fishPull: 4.7 + d * 1.6,
      fishTempo: 0.86 + d * 0.2,
      gain: 0.17 - d * 0.01,
      drain: 0.11 + d * 0.018,
    };
  }
}

function createTimingRing(level) {
  const game = {
    id: "ring",
    title: "Timing Ring",
    actionLabel: "Strike",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease() {},
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    game.state = {
      mode: "ready",
      angle: -Math.PI / 2,
      progress: 0,
      misses: 0,
      hits: 0,
      streak: 0,
      pulse: 0,
      zones: makeZones(),
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt) {
    const state = game.state;
    if (state.mode !== "running") return;
    const speed = 1.8 + game.level * 0.38;
    state.angle = normalizeAngle(state.angle + speed * dt);
    state.pulse = Math.max(0, state.pulse - dt * 2.4);
    if (state.progress >= 1) state.mode = "won";
    if (state.misses >= 6) state.mode = "lost";
  }

  function handlePress() {
    const state = game.state;
    if (state.mode === "ready") start();
    if (state.mode !== "running") return;

    const hitZone = state.zones.find((zone) => angleInZone(state.angle, zone));
    if (hitZone) {
      const value = hitZone.bonus ? 0.23 : 0.15;
      state.progress = clamp(state.progress + value + state.streak * 0.01, 0, 1);
      state.hits += 1;
      state.streak += 1;
      state.pulse = hitZone.bonus ? 1 : 0.62;
      state.zones = makeZones();
    } else {
      state.progress = clamp(state.progress - 0.09, 0, 1);
      state.misses += 1;
      state.streak = 0;
      state.pulse = -0.7;
    }

    if (state.progress >= 1) state.mode = "won";
    if (state.misses >= 6) state.mode = "lost";
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Timing Ring");
    const state = game.state;
    const cx = W / 2;
    const cy = H * 0.47;
    const radius = Math.min(W, H) * 0.24;

    drawPanel(context, cx - radius - 26, cy - radius - 26, radius * 2 + 52, radius * 2 + 52, 18);

    context.lineWidth = Math.max(12, radius * 0.08);
    context.strokeStyle = "rgba(255, 255, 255, 0.16)";
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();

    state.zones.forEach((zone) => {
      context.strokeStyle = zone.bonus ? "#ffd36b" : "#91d576";
      context.lineWidth = zone.bonus ? Math.max(16, radius * 0.105) : Math.max(13, radius * 0.085);
      context.beginPath();
      context.arc(cx, cy, radius, zone.start, zone.end);
      context.stroke();
    });

    context.save();
    context.translate(cx, cy);
    context.rotate(state.angle);
    context.fillStyle = state.pulse < 0 ? "#ff876f" : "#7fd4ff";
    context.fillRect(0, -3, radius + 18, 6);
    context.beginPath();
    context.arc(radius + 20, 0, 8 + Math.abs(state.pulse) * 6, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.fillStyle = "rgba(16, 32, 35, 0.88)";
    context.beginPath();
    context.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#f5fbf8";
    context.font = `900 ${Math.max(24, radius * 0.22)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${Math.round(state.progress * 100)}%`, cx, cy);

    drawProgressBar(context, W * 0.22, H * 0.82, W * 0.56, 16, state.progress, "#91d576");
    drawStageText(context, W, H, state.mode === "running" ? "Hit the bright arcs as the needle passes" : getStatus().text);
  }

  function getStats() {
    const state = game.state;
    return [
      ["Progress", formatPercent(state.progress)],
      ["Hits", String(state.hits)],
      ["Misses", `${state.misses} / 6`],
      ["Streak", String(state.streak)],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") {
      return {
        state: "won",
        label: "Caught",
        title: "Timing Ring",
        text: "Rhythm meter filled.",
      };
    }
    if (state.mode === "lost") {
      return {
        state: "lost",
        label: "Lost",
        title: "Timing Ring",
        text: "Too many missed strikes.",
      };
    }
    if (state.mode === "running") {
      return {
        state: "running",
        label: "Running",
        title: "Timing Ring",
        text: "Timing active.",
      };
    }
    return {
      state: "ready",
      label: "Ready",
      title: "Timing Ring",
      text: "Press Start to begin.",
    };
  }

  function makeZones() {
    const count = game.level >= 4 ? 2 : 3;
    const width = 0.48 - game.level * 0.045;
    const start = random(0, Math.PI * 2);
    return Array.from({ length: count }, (_, index) => {
      const center = normalizeAngle(start + (Math.PI * 2 * index) / count + random(-0.2, 0.2));
      const zoneWidth = index === 0 ? width * 0.56 : width;
      return {
        start: center - zoneWidth / 2,
        end: center + zoneWidth / 2,
        bonus: index === 0,
      };
    });
  }
}

function createShadowCast(level) {
  const game = {
    id: "cast",
    title: "Shadow Cast",
    actionLabel: "Hold to Charge",
    supportsUpgrades: true,
    level,
    upgrades: new Set(),
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease,
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    setUpgrades(nextUpgrades) {
      game.upgrades = new Set(nextUpgrades);
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    game.state = {
      mode: "ready",
      timeLeft: 45,
      attempts: 8,
      hits: 0,
      streak: 0,
      charge: 0,
      chargeDirection: 1,
      charging: false,
      result: "Lead the fish shadow and cast where it will be.",
      splashTimer: 0,
      softSplashTimer: 0,
      cast: null,
      fish: {
        x: 0.5,
        y: 0.48,
        vx: 0,
        vy: 0,
        targetX: 0.5,
        targetY: 0.48,
        targetTimer: 0,
      },
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt, pressed) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = castSettings();
    state.timeLeft -= dt;
    state.splashTimer = Math.max(0, state.splashTimer - dt);
    state.softSplashTimer = Math.max(0, state.softSplashTimer - dt);

    updateShadowFish(dt, settings);

    if (state.charging && pressed) {
      state.charge += settings.chargeRate * state.chargeDirection * dt;
      if (state.charge >= 1) {
        state.charge = 1;
        state.chargeDirection = -1;
      } else if (state.charge <= 0) {
        state.charge = 0;
        state.chargeDirection = 1;
      }
    }

    if (state.cast) {
      state.cast.t += dt / state.cast.duration;
      if (state.cast.t >= 1) {
        resolveCast(settings);
      }
    }

    if (state.hits >= 1) state.mode = "won";
    if ((state.attempts <= 0 || state.timeLeft <= 0) && state.mode !== "won") {
      state.mode = "lost";
    }
    if (state.mode === "won" || state.mode === "lost") {
      state.charging = false;
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Shadow Cast");
    const state = game.state;
    const settings = castSettings();
    const square = getCastSquare(W, H);
    const origin = getCastOrigin(W, H);
    const aim = getAimVector(origin);
    const target = getCastTarget(origin, aim, state.charge, square);
    const fish = {
      x: square.x + state.fish.x * square.size,
      y: square.y + state.fish.y * square.size,
    };
    const landingDelay = state.cast
      ? Math.max(0, (1 - clamp(state.cast.t, 0, 1)) * state.cast.duration)
      : settings.travelBase + state.charge * settings.travelCharge;
    const lensFish = predictShadowFish(state.fish, landingDelay);

    drawPanel(context, square.x - 12, square.y - 12, square.size + 24, square.size + 24, 16);

    context.fillStyle = "rgba(127, 212, 255, 0.14)";
    context.fillRect(square.x, square.y, square.size, square.size);
    context.strokeStyle = "rgba(245, 251, 248, 0.58)";
    context.lineWidth = 3;
    context.strokeRect(square.x, square.y, square.size, square.size);

    context.strokeStyle = "rgba(245, 251, 248, 0.12)";
    context.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const pos = square.x + (square.size * i) / 4;
      context.beginPath();
      context.moveTo(pos, square.y);
      context.lineTo(pos, square.y + square.size);
      context.moveTo(square.x, square.y + (square.size * i) / 4);
      context.lineTo(square.x + square.size, square.y + (square.size * i) / 4);
      context.stroke();
    }

    context.strokeStyle = "rgba(255, 211, 107, 0.86)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(target.x, target.y);
    context.stroke();

    context.fillStyle = "rgba(255, 211, 107, 0.24)";
    context.beginPath();
    context.arc(target.x, target.y, 14 + state.charge * 12, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(16, 32, 35, 0.78)";
    context.beginPath();
    context.ellipse(fish.x, fish.y, 26, 13, state.fish.vx * 0.45, 0, Math.PI * 2);
    context.fill();

    if (hasUpgrade("shadowLens")) {
      context.strokeStyle = "rgba(127, 212, 255, 0.72)";
      context.lineWidth = 2;
      context.setLineDash([6, 6]);
      context.beginPath();
      context.ellipse(
        square.x + lensFish.x * square.size,
        square.y + lensFish.y * square.size,
        24,
        12,
        state.fish.vx * 0.45,
        0,
        Math.PI * 2
      );
      context.stroke();
      context.setLineDash([]);
    }

    context.fillStyle = "#91d576";
    context.beginPath();
    context.arc(origin.x, origin.y, 18, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#102023";
    context.lineWidth = 3;
    context.stroke();

    if (state.cast) {
      const castX = lerp(state.cast.startX, state.cast.targetX, clamp(state.cast.t, 0, 1));
      const castY = lerp(state.cast.startY, state.cast.targetY, clamp(state.cast.t, 0, 1));
      const arc = Math.sin(clamp(state.cast.t, 0, 1) * Math.PI) * 48;
      context.fillStyle = "#ffd36b";
      context.beginPath();
      context.arc(castX, castY - arc, 7, 0, Math.PI * 2);
      context.fill();
    }

    if (state.splashTimer > 0) {
      const alpha = state.splashTimer / 0.45;
      context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.72})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(state.lastSplashX, state.lastSplashY, 18 + (1 - alpha) * 32, 0, Math.PI * 2);
      context.stroke();
    }

    drawProgressBar(context, W * 0.2, H * 0.82, W * 0.48, 16, state.hits, "#91d576");
    drawProgressBar(context, W * 0.2, H * 0.87, W * 0.48, 12, state.charge, "#ffd36b");
    drawStageText(context, W, H, state.mode === "running" ? "Aim with pointer, hold to charge, release to cast ahead" : getStatus().text);
  }

  function getStats() {
    const state = game.state;
    return [
      ["Catch", `${state.hits} / 1`],
      ["Casts", String(state.attempts)],
      ["Charge", formatPercent(state.charge)],
      ["Upgrades", String(game.upgrades.size)],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") {
      return {
        state: "won",
        label: "Caught",
        title: "Shadow Cast",
        text: "Fish caught.",
      };
    }
    if (state.mode === "lost") {
      return {
        state: "lost",
        label: "Lost",
        title: "Shadow Cast",
        text: state.timeLeft <= 0 ? "Timer expired." : "No casts left.",
      };
    }
    if (state.mode === "running") {
      return {
        state: "running",
        label: "Running",
        title: "Shadow Cast",
        text: game.state.result,
      };
    }
    return {
      state: "ready",
      label: "Ready",
      title: "Shadow Cast",
      text: "Aim into the square, hold to charge, release to cast.",
    };
  }

  function handlePress() {
    const state = game.state;
    if (state.mode === "ready") start();
    if (state.mode !== "running" || state.cast) return;
    state.charging = true;
    state.charge = 0;
    state.chargeDirection = 1;
    state.result = "Charging cast. Release when the line reaches the right distance.";
  }

  function handleRelease() {
    const state = game.state;
    if (state.mode !== "running" || !state.charging || state.cast) return;
    const settings = castSettings();
    const square = getCastSquare(width, height);
    const origin = getCastOrigin(width, height);
    const aim = getAimVector(origin);
    const target = getCastTarget(origin, aim, Math.max(0.12, state.charge), square);

    state.charging = false;
    state.cast = {
      startX: origin.x,
      startY: origin.y,
      targetX: target.x,
      targetY: target.y,
      targetNx: (target.x - square.x) / square.size,
      targetNy: (target.y - square.y) / square.size,
      t: 0,
      duration: settings.travelBase + state.charge * settings.travelCharge,
    };
    state.result = "Cast airborne.";
  }

  function updateShadowFish(dt, settings) {
    const fish = game.state.fish;
    const pull = game.state.softSplashTimer > 0 ? settings.fishPull * settings.softSplashPull : settings.fishPull;
    fish.targetTimer -= dt;
    if (fish.targetTimer <= 0) {
      fish.targetX = random(0.08, 0.92);
      fish.targetY = random(0.08, 0.92);
      fish.targetTimer = random(settings.dartMin, settings.dartMax);
    }

    fish.vx += (fish.targetX - fish.x) * pull * dt;
    fish.vy += (fish.targetY - fish.y) * pull * dt;
    fish.vx *= Math.pow(0.13, dt);
    fish.vy *= Math.pow(0.13, dt);
    fish.x = clamp(fish.x + fish.vx * dt, 0.04, 0.96);
    fish.y = clamp(fish.y + fish.vy * dt, 0.04, 0.96);
  }

  function resolveCast(settings) {
    const state = game.state;
    const cast = state.cast;
    const fish = state.fish;
    const dx = cast.targetNx - fish.x;
    const dy = cast.targetNy - fish.y;
    const distance = Math.hypot(dx, dy);
    const inSquare = cast.targetNx >= 0 && cast.targetNx <= 1 && cast.targetNy >= 0 && cast.targetNy <= 1;
    const hit = inSquare && distance <= settings.hitRadius;

    state.lastSplashX = cast.targetX;
    state.lastSplashY = cast.targetY;
    state.splashTimer = 0.45;
    state.cast = null;
    state.attempts -= 1;
    state.charge = 0;

    if (hit) {
      state.hits += 1;
      state.streak += 1;
      state.result = `Hit shadow. Lead distance ${Math.round(distance * 100)}.`;
      fish.targetTimer = 0;
    } else {
      state.streak = 0;
      if (hasUpgrade("softSplash") && inSquare && distance <= settings.softSplashRange) {
        state.softSplashTimer = settings.softSplashDuration;
      }
      state.result = inSquare ? `Missed by ${Math.round(distance * 100)}.` : "Cast landed outside the square.";
    }
  }

  function castSettings() {
    const d = game.level;
    const settings = {
      chargeRate: 0.92 + d * 0.1,
      travelBase: 0.22 + d * 0.015,
      travelCharge: 0.34 + d * 0.025,
      fishPull: 4.3 + d * 1.15,
      dartMin: 0.34 - d * 0.035,
      dartMax: 0.9 - d * 0.06,
      hitRadius: 0.12 - d * 0.011,
      softSplashDuration: 1.25,
      softSplashPull: 0.42,
      softSplashRange: 0.2,
    };

    if (hasUpgrade("quickReel")) {
      settings.travelBase *= 0.58;
      settings.travelCharge *= 0.58;
    }
    if (hasUpgrade("steadyHands")) {
      settings.chargeRate *= 0.62;
    }
    if (hasUpgrade("barbedHook")) {
      settings.hitRadius += 0.035;
    }

    return settings;
  }

  function hasUpgrade(upgrade) {
    return game.upgrades.has(upgrade);
  }

  function predictShadowFish(fish, delay) {
    return {
      x: clamp(fish.x + fish.vx * delay, 0.04, 0.96),
      y: clamp(fish.y + fish.vy * delay, 0.04, 0.96),
    };
  }
}

function createSquareTug(level) {
  const game = {
    id: "tug",
    title: "Square Tug",
    actionLabel: "Tap to Reel",
    usesDirections: true,
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease() {},
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    game.state = {
      mode: "ready",
      tension: 0.12,
      progress: 0,
      timeLeft: 70,
      result: "Pull opposite the fish at the edge. Tap reel only when calm.",
      messageTimer: 0,
      reelFlash: 0,
      reelTaps: 0,
      fish: {
        x: 0.5,
        y: 0.5,
        vx: 0,
        vy: 0,
        targetX: 0.5,
        targetY: 0.5,
        targetTimer: 0,
      },
      thrashing: false,
      thrashTimer: 2.6,
      thrashLeft: 0,
      pulse: 0,
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = tugSettings();
    state.timeLeft -= dt;
    state.pulse = Math.max(0, state.pulse - dt * 2.8);
    state.reelFlash = Math.max(0, state.reelFlash - dt * 5);
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    updateTugFish(dt, settings);
    updateThrash(dt, settings);

    const edge = getEdgePressure(state.fish);
    const pull = getPullVector();
    const oppositePull =
      edge.pressure > settings.edgeThreshold ? Math.max(0, dot(pull, edge.reliefX, edge.reliefY)) : 0;
    const wrongPull =
      edge.pressure > settings.edgeThreshold ? Math.max(0, dot(pull, -edge.reliefX, -edge.reliefY)) : 0;
    const edgeRise = Math.max(0, edge.pressure - settings.edgeThreshold) * settings.edgeTension;
    const relief = oppositePull * settings.pullRelief;
    const wrong = wrongPull * settings.wrongPullTension;

    let tensionDelta = edgeRise + wrong - relief - settings.passiveRelief;
    if (state.thrashing) {
      tensionDelta += settings.thrashTension;
    }

    state.tension = clamp(state.tension + tensionDelta * dt, 0, 1);

    if (state.progress >= 1) {
      state.mode = "won";
      state.result = "Fish landed.";
    } else if (state.tension >= 1) {
      state.mode = "lost";
      state.result = "Line tension maxed out.";
    } else if (state.timeLeft <= 0) {
      state.mode = "lost";
      state.result = "Timer expired.";
    } else if (state.messageTimer <= 0) {
      if (state.thrashing) {
        state.result = "Thrashing. Hold line direction.";
      } else if (edge.pressure > settings.edgeWarnThreshold && oppositePull < 0.35) {
        state.result = `Pull ${edge.direction} to counter the edge.`;
      } else {
        state.result = "Tap reel while calm. Holding reel will not help.";
      }
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Square Tug");
    const state = game.state;
    const settings = tugSettings();
    const square = getTugSquare(W, H);
    const fishX = square.x + state.fish.x * square.size;
    const fishY = square.y + state.fish.y * square.size;
    const edge = getEdgePressure(state.fish);
    const pull = getPullVector();
    const centerX = square.x + square.size / 2;
    const centerY = square.y + square.size / 2;

    drawProgressBar(context, square.x, square.y - 42, square.size, 17, state.tension, state.tension > 0.76 ? "#ff876f" : "#ffd36b");
    drawPanel(context, square.x - 12, square.y - 12, square.size + 24, square.size + 24, 16);

    context.fillStyle = state.thrashing ? "rgba(255, 135, 111, 0.17)" : "rgba(127, 212, 255, 0.14)";
    context.fillRect(square.x, square.y, square.size, square.size);
    context.strokeStyle = edge.pressure > settings.edgeWarnThreshold ? "#ff876f" : "rgba(245, 251, 248, 0.58)";
    context.lineWidth = edge.pressure > settings.edgeWarnThreshold ? 5 : 3;
    context.strokeRect(square.x, square.y, square.size, square.size);

    context.strokeStyle = "rgba(245, 251, 248, 0.12)";
    context.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const pos = square.x + (square.size * i) / 4;
      context.beginPath();
      context.moveTo(pos, square.y);
      context.lineTo(pos, square.y + square.size);
      context.moveTo(square.x, square.y + (square.size * i) / 4);
      context.lineTo(square.x + square.size, square.y + (square.size * i) / 4);
      context.stroke();
    }

    context.strokeStyle = "rgba(245, 251, 248, 0.45)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.quadraticCurveTo((centerX + fishX) / 2, centerY - 34 * state.tension, fishX, fishY);
    context.stroke();

    if (pull.x || pull.y) {
      context.strokeStyle = "#7fd4ff";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(centerX + pull.x * 72, centerY + pull.y * 72);
      context.stroke();
      context.fillStyle = "#7fd4ff";
      context.beginPath();
      context.arc(centerX + pull.x * 72, centerY + pull.y * 72, 8, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = state.thrashing ? "rgba(255, 135, 111, 0.88)" : "rgba(16, 32, 35, 0.78)";
    context.beginPath();
    context.ellipse(
      fishX + Math.sin(performance.now() / 45) * state.pulse * 7,
      fishY,
      28 + state.pulse * 5,
      14 + state.pulse * 3,
      state.fish.vx * 0.35,
      0,
      Math.PI * 2
    );
    context.fill();

    if (state.thrashing) {
      context.strokeStyle = "rgba(255, 255, 255, 0.72)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(fishX, fishY, 38 + Math.sin(performance.now() / 70) * 5, 0, Math.PI * 2);
      context.stroke();
    }

    drawProgressBar(
      context,
      square.x,
      square.y + square.size + 28,
      square.size,
      17 + state.reelFlash * 5,
      state.progress,
      state.reelFlash > 0 ? "#ffd36b" : "#91d576"
    );
    drawStageText(context, W, H, state.mode === "running" ? "Pull away from edge pressure. Tap reel only when calm." : getStatus().text);
  }

  function getStats() {
    const state = game.state;
    const edge = getEdgePressure(state.fish);
    return [
      ["Progress", formatPercent(state.progress)],
      ["Tension", formatPercent(state.tension)],
      ["Fish State", state.thrashing ? "Thrash" : "Calm"],
      ["Edge Pull", edge.direction],
      ["Reel Taps", String(state.reelTaps)],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") {
      return {
        state: "won",
        label: "Caught",
        title: "Square Tug",
        text: "Progress bar filled.",
      };
    }
    if (state.mode === "lost") {
      return {
        state: "lost",
        label: "Lost",
        title: "Square Tug",
        text: state.result,
      };
    }
    if (state.mode === "running") {
      return {
        state: "running",
        label: "Running",
        title: "Square Tug",
        text: state.result,
      };
    }
    return {
      state: "ready",
      label: "Ready",
      title: "Square Tug",
      text: "Use WASD or arrows to pull. Spam click or tap Space to reel when calm.",
    };
  }

  function handlePress() {
    let state = game.state;
    if (state.mode === "ready") {
      start();
      state = game.state;
    }
    if (state.mode !== "running") return;

    const settings = tugSettings();
    state.reelTaps += 1;
    state.reelFlash = 1;
    state.messageTimer = 0.45;

    if (state.thrashing) {
      state.tension = clamp(state.tension + settings.reelDuringThrashTension, 0, 1);
      state.result = "Bad reel. Fish is thrashing.";
      return;
    }

    state.progress = clamp(state.progress + settings.reelProgress, 0, 1);
    state.tension = clamp(state.tension + settings.calmReelTension, 0, 1);
    state.result = "Reel tap gained progress.";
  }

  function updateTugFish(dt, settings) {
    const fish = game.state.fish;
    fish.targetTimer -= dt;
    if (fish.targetTimer <= 0) {
      const target = chooseTugTarget(settings);
      fish.targetX = target.x;
      fish.targetY = target.y;
      fish.targetTimer = random(settings.targetMin, settings.targetMax);
    }

    fish.vx += (fish.targetX - fish.x) * settings.fishPull * dt;
    fish.vy += (fish.targetY - fish.y) * settings.fishPull * dt;
    fish.vx *= Math.pow(0.12, dt);
    fish.vy *= Math.pow(0.12, dt);
    fish.x = clamp(fish.x + fish.vx * dt, 0.03, 0.97);
    fish.y = clamp(fish.y + fish.vy * dt, 0.03, 0.97);
  }

  function updateThrash(dt, settings) {
    const state = game.state;
    if (state.thrashing) {
      state.thrashLeft -= dt;
      state.pulse = 1;
      if (state.thrashLeft <= 0) {
        state.thrashing = false;
        state.thrashTimer = random(settings.thrashGapMin, settings.thrashGapMax);
      }
      return;
    }

    state.thrashTimer -= dt;
    if (state.thrashTimer <= 0) {
      state.thrashing = true;
      state.thrashLeft = random(settings.thrashMin, settings.thrashMax);
      state.pulse = 1;
    }
  }

  function chooseTugTarget(settings) {
    if (Math.random() < settings.edgeTargetChance) {
      const side = Math.floor(Math.random() * 4);
      const lowEdge = settings.edgeTargetInset;
      const highEdge = 1 - settings.edgeTargetInset;
      const edgeValue = Math.random() < 0.5 ? lowEdge : highEdge;
      if (side === 0) return { x: random(0.16, 0.84), y: lowEdge };
      if (side === 1) return { x: highEdge, y: random(0.16, 0.84) };
      if (side === 2) return { x: random(0.16, 0.84), y: highEdge };
      return { x: edgeValue, y: random(0.16, 0.84) };
    }

    return {
      x: random(0.26, 0.74),
      y: random(0.26, 0.74),
    };
  }

  function tugSettings() {
    const d = game.level - 1;
    return {
      fishPull: 2.7 + d * 0.45,
      targetMin: 0.72 - d * 0.04,
      targetMax: 1.45 - d * 0.07,
      edgeThreshold: 0.64 - d * 0.015,
      edgeWarnThreshold: 0.78 - d * 0.015,
      edgeTargetChance: 0.42 + d * 0.045,
      edgeTargetInset: 0.14 - d * 0.012,
      edgeTension: 0.86 + d * 0.16,
      pullRelief: 0.58 + d * 0.035,
      wrongPullTension: 0.26 + d * 0.08,
      passiveRelief: 0.08,
      calmReelTension: 0.012 + d * 0.003,
      reelProgress: 0.022 - d * 0.0013,
      reelDuringThrashTension: 0.11 + d * 0.025,
      thrashTension: 0.05 + d * 0.035,
      thrashGapMin: 2.05 - d * 0.12,
      thrashGapMax: 3.55 - d * 0.16,
      thrashMin: 0.52 + d * 0.035,
      thrashMax: 0.9 + d * 0.045,
    };
  }
}

function createRodTug(level) {
  const game = {
    id: "rod",
    title: "Rod Tug",
    actionLabel: "Tap to Reel",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease,
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    game.state = {
      mode: "ready",
      tension: 0.12,
      progress: 0,
      timeLeft: 70,
      result: "Move the rod away from center opposite edge pressure. Tap reel only when calm.",
      messageTimer: 0,
      reelFlash: 0,
      reelTaps: 0,
      brace: 0,
      wrongBrace: 0,
      rodLoad: 0,
      pulling: false,
      fish: {
        x: 0.5,
        y: 0.5,
        vx: 0,
        vy: 0,
        targetX: 0.5,
        targetY: 0.5,
        targetTimer: 0,
      },
      thrashing: false,
      thrashTimer: 2.6,
      thrashLeft: 0,
      pulse: 0,
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt, pressed) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = rodTugSettings();
    const square = getTugSquare(width, height);
    state.timeLeft -= dt;
    state.pulse = Math.max(0, state.pulse - dt * 2.8);
    state.reelFlash = Math.max(0, state.reelFlash - dt * 5);
    state.messageTimer = Math.max(0, state.messageTimer - dt);

    const edge = getEdgePressure(state.fish);
    const pulling = pressed && inputSource === "canvas" && pointer.active;
    const pull = pulling ? getRodPullVector(square) : { x: 0, y: 0 };
    const oppositePull =
      edge.pressure > settings.edgeThreshold ? Math.max(0, dot(pull, edge.reliefX, edge.reliefY)) : 0;
    const wrongPull =
      edge.pressure > settings.edgeThreshold ? Math.max(0, dot(pull, -edge.reliefX, -edge.reliefY)) : 0;
    state.pulling = pulling;
    state.brace = oppositePull;
    state.wrongBrace = wrongPull;
    state.rodLoad = lerp(
      state.rodLoad,
      pulling ? clamp(edge.pressure * 0.42 + oppositePull * 0.52 + wrongPull * 0.36, 0, 1) : 0,
      clamp(dt * 12, 0, 1)
    );

    updateRodTugFish(dt, settings, oppositePull);
    updateRodThrash(dt, settings);

    const edgeRise = Math.max(0, edge.pressure - settings.edgeThreshold) * settings.edgeTension;
    const relief = oppositePull * settings.pullRelief;
    const wrong = wrongPull * settings.wrongPullTension;

    let tensionDelta = edgeRise + wrong - relief - settings.passiveRelief;
    if (state.thrashing) {
      tensionDelta += settings.thrashTension;
    }

    state.tension = clamp(state.tension + tensionDelta * dt, 0, 1);

    if (state.progress >= 1) {
      state.mode = "won";
      state.result = "Fish landed.";
    } else if (state.tension >= 1) {
      state.mode = "lost";
      state.result = "Line tension maxed out.";
    } else if (state.timeLeft <= 0) {
      state.mode = "lost";
      state.result = "Timer expired.";
    } else if (state.messageTimer <= 0) {
      if (!pointer.active) {
        state.result = "Move the cursor over the water to control the rod.";
      } else if (state.thrashing) {
        state.result = pulling ? "Thrashing. Keep pressure opposite the fish." : "Click and hold the rod to brace the thrash.";
      } else if (!pulling && edge.pressure > settings.edgeWarnThreshold) {
        state.result = `Click and drag rod ${edge.direction} to load the line.`;
      } else if (wrongPull > 0.35) {
        state.result = "Wrong pull. The fish is loading the line.";
      } else if (edge.pressure > settings.edgeWarnThreshold && oppositePull < 0.35) {
        state.result = pulling ? `Pull farther ${edge.direction} to slow the fish.` : `Click and drag rod ${edge.direction}.`;
      } else if (oppositePull > 0.45) {
        state.result = "Good brace. Fish is slowing down.";
      } else {
        state.result = "Tap reel while calm. Click-drag only when the fish reaches an edge.";
      }
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Rod Tug");
    const state = game.state;
    const settings = rodTugSettings();
    const square = getTugSquare(W, H);
    const fishX = square.x + state.fish.x * square.size;
    const fishY = square.y + state.fish.y * square.size;
    const edge = getEdgePressure(state.fish);
    const pull = state.pulling ? getRodPullVector(square) : { x: 0, y: 0 };
    const rodBase = getRodBase(square, W, H);
    const rod = getRodPoint(rodBase, W, H, state.rodLoad);
    const pullStrength = Math.hypot(pull.x, pull.y);
    const gripTop = { x: rodBase.x, y: rodBase.y - 48 };
    const rodControl = { x: rodBase.x + 52 - state.rodLoad * 12, y: rodBase.y - 88 + state.rodLoad * 16 };
    const reel = { x: rodBase.x - 18, y: rodBase.y - 34 };
    const feedbackColor = state.wrongBrace > 0.3 ? "#ff876f" : state.brace > 0.3 ? "#7fd4ff" : "rgba(245, 251, 248, 0.58)";

    drawProgressBar(context, square.x, square.y - 42, square.size, 17, state.tension, state.tension > 0.76 ? "#ff876f" : "#ffd36b");
    drawPanel(context, square.x - 12, square.y - 12, square.size + 24, square.size + 24, 16);

    context.fillStyle = state.thrashing ? "rgba(255, 135, 111, 0.17)" : "rgba(127, 212, 255, 0.14)";
    context.fillRect(square.x, square.y, square.size, square.size);
    context.strokeStyle = edge.pressure > settings.edgeWarnThreshold ? "#ff876f" : "rgba(245, 251, 248, 0.58)";
    context.lineWidth = edge.pressure > settings.edgeWarnThreshold ? 5 : 3;
    context.strokeRect(square.x, square.y, square.size, square.size);

    context.strokeStyle = "rgba(245, 251, 248, 0.12)";
    context.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const pos = square.x + (square.size * i) / 4;
      context.beginPath();
      context.moveTo(pos, square.y);
      context.lineTo(pos, square.y + square.size);
      context.moveTo(square.x, square.y + (square.size * i) / 4);
      context.lineTo(square.x + square.size, square.y + (square.size * i) / 4);
      context.stroke();
    }

    context.strokeStyle = feedbackColor;
    context.lineWidth = state.pulling ? 3 + state.rodLoad * 2 : 2;
    context.beginPath();
    context.moveTo(rod.x, rod.y);
    context.quadraticCurveTo((rod.x + fishX) / 2, Math.min(rod.y, fishY) - 32 * state.tension, fishX, fishY);
    context.stroke();

    context.lineCap = "round";
    context.strokeStyle = "rgba(5, 10, 12, 0.45)";
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(gripTop.x, gripTop.y);
    context.quadraticCurveTo(rodControl.x, rodControl.y, rod.x, rod.y);
    context.stroke();

    context.strokeStyle = state.pulling ? "#26313a" : "#38424a";
    context.lineWidth = 6 + state.rodLoad * 2;
    context.beginPath();
    context.moveTo(gripTop.x, gripTop.y);
    context.quadraticCurveTo(rodControl.x, rodControl.y, rod.x, rod.y);
    context.stroke();

    context.strokeStyle = state.brace > 0.25 ? "#7fd4ff" : "#e8e2d0";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(gripTop.x + 2, gripTop.y - 1);
    context.quadraticCurveTo(rodControl.x + 3, rodControl.y, rod.x + 1, rod.y);
    context.stroke();

    context.strokeStyle = "#2b1d14";
    context.lineWidth = 14;
    context.beginPath();
    context.moveTo(rodBase.x, rodBase.y);
    context.lineTo(gripTop.x, gripTop.y);
    context.stroke();

    context.strokeStyle = "#8d5524";
    context.lineWidth = 9;
    context.beginPath();
    context.moveTo(rodBase.x, rodBase.y - 4);
    context.lineTo(gripTop.x, gripTop.y + 4);
    context.stroke();

    context.strokeStyle = state.pulling ? feedbackColor : "#d7a64a";
    context.lineWidth = 3;
    for (let i = 0; i < 4; i += 1) {
      const y = rodBase.y - 10 - i * 9;
      context.beginPath();
      context.moveTo(rodBase.x - 7, y);
      context.lineTo(rodBase.x + 7, y);
      context.stroke();
    }

    context.strokeStyle = "#d7a64a";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(rod.x, rod.y, 6, 0, Math.PI * 2);
    context.stroke();
    context.lineCap = "butt";

    context.fillStyle = "#2b1d14";
    context.beginPath();
    context.arc(rodBase.x, rodBase.y, 8, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#d7a64a";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "#1e2529";
    context.beginPath();
    context.arc(reel.x, reel.y, 13, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#d7a64a";
    context.lineWidth = 4;
    context.stroke();

    context.strokeStyle = "#e8e2d0";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(reel.x + 9, reel.y + 7);
    context.lineTo(reel.x + 22, reel.y + 16);
    context.stroke();

    context.fillStyle = "#e8e2d0";
    context.beginPath();
    context.arc(reel.x, reel.y, 4, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(reel.x + 24, reel.y + 17, 4, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = pullStrength > 0.2 ? "#7fd4ff" : "rgba(127, 212, 255, 0.42)";
    context.beginPath();
    context.arc(rod.x, rod.y, 5 + pullStrength * 3, 0, Math.PI * 2);
    context.fill();

    if (state.pulling && pullStrength > 0.05) {
      context.strokeStyle = feedbackColor;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(fishX, fishY);
      context.lineTo(fishX + pull.x * 78, fishY + pull.y * 78);
      context.stroke();
      context.fillStyle = feedbackColor;
      context.beginPath();
      context.arc(fishX + pull.x * 78, fishY + pull.y * 78, 8, 0, Math.PI * 2);
      context.fill();
    }

    if (state.pulling && (state.brace > 0.05 || state.wrongBrace > 0.05)) {
      const feedback = Math.max(state.brace, state.wrongBrace);
      context.strokeStyle = state.brace >= state.wrongBrace ? "rgba(127, 212, 255, 0.72)" : "rgba(255, 135, 111, 0.72)";
      context.lineWidth = 2 + feedback * 3;
      context.beginPath();
      context.arc(fishX, fishY, 34 + feedback * 18 + Math.sin(performance.now() / 80) * 3, 0, Math.PI * 2);
      context.stroke();
    }

    context.fillStyle = state.thrashing ? "rgba(255, 135, 111, 0.88)" : "rgba(16, 32, 35, 0.78)";
    context.beginPath();
    context.ellipse(
      fishX + Math.sin(performance.now() / 45) * state.pulse * 7,
      fishY,
      28 + state.pulse * 5,
      14 + state.pulse * 3,
      state.fish.vx * 0.35,
      0,
      Math.PI * 2
    );
    context.fill();

    if (state.thrashing) {
      context.strokeStyle = "rgba(255, 255, 255, 0.72)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(fishX, fishY, 38 + Math.sin(performance.now() / 70) * 5, 0, Math.PI * 2);
      context.stroke();
    }

    drawProgressBar(
      context,
      square.x,
      square.y + square.size + 28,
      square.size,
      17 + state.reelFlash * 5,
      state.progress,
      state.reelFlash > 0 ? "#ffd36b" : "#91d576"
    );
    drawStageText(context, W, H, state.mode === "running" ? "Click-hold the rod, then drag opposite edge pressure. Use Space or Action to reel." : getStatus().text);
  }

  function getStats() {
    const state = game.state;
    const square = getTugSquare(width, height);
    const edge = getEdgePressure(state.fish);
    const pull = state.pulling ? getRodPullVector(square) : { x: 0, y: 0 };
    return [
      ["Progress", formatPercent(state.progress)],
      ["Tension", formatPercent(state.tension)],
      ["Fish State", state.thrashing ? "Thrash" : "Calm"],
      ["Edge Pull", edge.direction],
      ["Rod Pull", formatPercent(Math.hypot(pull.x, pull.y))],
      ["Brace", formatPercent(state.brace)],
      ["Reel Taps", String(state.reelTaps)],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") {
      return {
        state: "won",
        label: "Caught",
        title: "Rod Tug",
        text: "Progress bar filled.",
      };
    }
    if (state.mode === "lost") {
      return {
        state: "lost",
        label: "Lost",
        title: "Rod Tug",
        text: state.result,
      };
    }
    if (state.mode === "running") {
      return {
        state: "running",
        label: "Running",
        title: "Rod Tug",
        text: state.result,
      };
    }
    return {
      state: "ready",
      label: "Ready",
      title: "Rod Tug",
      text: "Click-hold the rod and drag opposite edge pressure. Use Space or Action to reel.",
    };
  }

  function handlePress(source) {
    let state = game.state;
    if (state.mode === "ready") {
      start();
      state = game.state;
    }
    if (state.mode !== "running") return;
    if (source === "canvas") {
      state.pulling = true;
      state.messageTimer = 0.2;
      state.result = "Rod loaded. Drag opposite the fish.";
      return;
    }

    const settings = rodTugSettings();
    state.reelTaps += 1;
    state.reelFlash = 1;
    state.messageTimer = 0.45;

    if (state.thrashing) {
      state.tension = clamp(state.tension + settings.reelDuringThrashTension, 0, 1);
      state.result = "Bad reel. Fish is thrashing.";
      return;
    }

    state.progress = clamp(state.progress + settings.reelProgress, 0, 1);
    state.tension = clamp(state.tension + settings.calmReelTension, 0, 1);
    state.result = "Reel tap gained progress.";
  }

  function handleRelease(source) {
    if (source !== "canvas") return;
    const state = game.state;
    state.pulling = false;
    state.brace = 0;
    state.wrongBrace = 0;
    state.result = state.mode === "running" ? "Rod released." : state.result;
  }

  function updateRodTugFish(dt, settings, brace) {
    const fish = game.state.fish;
    fish.targetTimer -= dt;
    if (fish.targetTimer <= 0) {
      const target = chooseRodTugTarget(settings);
      fish.targetX = target.x;
      fish.targetY = target.y;
      fish.targetTimer = random(settings.targetMin, settings.targetMax);
    }

    const slow = 1 - brace * settings.braceSlow;
    fish.vx += (fish.targetX - fish.x) * settings.fishPull * slow * dt;
    fish.vy += (fish.targetY - fish.y) * settings.fishPull * slow * dt;
    const damping = clamp(0.12 - brace * 0.075, 0.045, 0.12);
    fish.vx *= Math.pow(damping, dt);
    fish.vy *= Math.pow(damping, dt);
    fish.targetTimer += brace * dt * 0.34;
    fish.x = clamp(fish.x + fish.vx * dt, 0.03, 0.97);
    fish.y = clamp(fish.y + fish.vy * dt, 0.03, 0.97);
  }

  function updateRodThrash(dt, settings) {
    const state = game.state;
    if (state.thrashing) {
      state.thrashLeft -= dt;
      state.pulse = 1;
      if (state.thrashLeft <= 0) {
        state.thrashing = false;
        state.thrashTimer = random(settings.thrashGapMin, settings.thrashGapMax);
      }
      return;
    }

    state.thrashTimer -= dt;
    if (state.thrashTimer <= 0) {
      state.thrashing = true;
      state.thrashLeft = random(settings.thrashMin, settings.thrashMax);
      state.pulse = 1;
    }
  }

  function chooseRodTugTarget(settings) {
    if (Math.random() < settings.edgeTargetChance) {
      const side = Math.floor(Math.random() * 4);
      const lowEdge = settings.edgeTargetInset;
      const highEdge = 1 - settings.edgeTargetInset;
      const edgeValue = Math.random() < 0.5 ? lowEdge : highEdge;
      if (side === 0) return { x: random(0.16, 0.84), y: lowEdge };
      if (side === 1) return { x: highEdge, y: random(0.16, 0.84) };
      if (side === 2) return { x: random(0.16, 0.84), y: highEdge };
      return { x: edgeValue, y: random(0.16, 0.84) };
    }

    return {
      x: random(0.26, 0.74),
      y: random(0.26, 0.74),
    };
  }

  function rodTugSettings() {
    const d = game.level - 1;
    return {
      fishPull: 2.7 + d * 0.45,
      targetMin: 0.72 - d * 0.04,
      targetMax: 1.45 - d * 0.07,
      edgeThreshold: 0.64 - d * 0.015,
      edgeWarnThreshold: 0.78 - d * 0.015,
      edgeTargetChance: 0.42 + d * 0.045,
      edgeTargetInset: 0.14 - d * 0.012,
      edgeTension: 0.86 + d * 0.16,
      pullRelief: 0.58 + d * 0.035,
      wrongPullTension: 0.26 + d * 0.08,
      braceSlow: 0.68,
      passiveRelief: 0.08,
      calmReelTension: 0.012 + d * 0.003,
      reelProgress: 0.022 - d * 0.0013,
      reelDuringThrashTension: 0.11 + d * 0.025,
      thrashTension: 0.05 + d * 0.035,
      thrashGapMin: 2.05 - d * 0.12,
      thrashGapMax: 3.55 - d * 0.16,
      thrashMin: 0.52 + d * 0.035,
      thrashMax: 0.9 + d * 0.045,
    };
  }
}

function createCurrentDrifter(level) {
  const game = {
    id: "drifter",
    title: "Current Drifter",
    actionLabel: "Hold to Sink",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress() {},
    handleRelease() {},
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    const settings = drifterSettings();
    game.state = {
      mode: "ready",
      timeLeft: 48,
      oxygen: 1,
      bites: 0,
      hits: 0,
      flash: 0,
      result: "Drift through bite rings. Sink under floating hazards.",
      bobber: { x: 0.2, y: 0.5, vx: 0, vy: 0, sunk: false },
      rings: Array.from({ length: 4 }, () => makeDriftRing(settings)),
      hazards: Array.from({ length: settings.hazardCount }, (_, index) => makeDriftHazard(index, settings)),
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt, pressed) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = drifterSettings();
    const bobber = state.bobber;
    const pull = getPullVector();
    const current = currentAt(bobber.y, settings);

    state.timeLeft -= dt;
    state.flash = Math.max(0, state.flash - dt * 4);
    bobber.sunk = pressed && state.oxygen > 0.04;
    state.oxygen = clamp(state.oxygen + (bobber.sunk ? -settings.oxygenDrain : settings.oxygenRecover) * dt, 0, 1);
    if (state.oxygen <= 0.01) bobber.sunk = false;

    bobber.vx += (current + pull.x * settings.steer - bobber.vx) * dt * 3.4;
    bobber.vy += (pull.y * settings.steer - bobber.vy) * dt * 3.8;
    bobber.x += bobber.vx * dt;
    bobber.y += bobber.vy * dt;
    bobber.x = clamp(bobber.x, 0.05, 0.95);
    bobber.y = clamp(bobber.y, 0.1, 0.9);

    for (const ring of state.rings) {
      ring.x -= (settings.scroll + currentAt(ring.y, settings) * 0.18) * dt;
      ring.pulse += dt;
      if (ring.x < -0.08) {
        Object.assign(ring, makeDriftRing(settings, 1.05));
      }
      if (Math.hypot(ring.x - bobber.x, ring.y - bobber.y) < ring.r + 0.035) {
        state.bites += 1;
        state.flash = 1;
        state.result = "Bite ring collected.";
        Object.assign(ring, makeDriftRing(settings, 1.05));
      }
    }

    for (const hazard of state.hazards) {
      hazard.x -= hazard.speed * dt;
      hazard.wobble += dt;
      if (hazard.x < -0.14) Object.assign(hazard, makeDriftHazard(Math.floor(random(0, 1000)), settings, 1.1));
      const hit =
        !bobber.sunk &&
        Math.abs(hazard.x - bobber.x) < hazard.w / 2 + 0.025 &&
        Math.abs(hazard.y - bobber.y) < hazard.h / 2 + 0.025;
      if (hit) {
        state.hits += 1;
        state.flash = -1;
        state.result = "Hazard clipped the bobber.";
        bobber.x = clamp(bobber.x - 0.08, 0.05, 0.95);
        hazard.x = -0.2;
      }
    }

    if (state.bites >= settings.quota) {
      state.mode = "won";
      state.result = "Current run landed.";
    } else if (state.hits >= 4) {
      state.mode = "lost";
      state.result = "Too many floating hazards hit.";
    } else if (state.timeLeft <= 0) {
      state.mode = "lost";
      state.result = "Timer expired.";
    } else if (state.oxygen <= 0.01 && pressed) {
      state.result = "Out of oxygen. Surface to recover.";
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Current Drifter");
    const state = game.state;
    const river = getPlayBox(W, H, 0.68, 0.58);
    const bobber = toBoxPoint(river, state.bobber.x, state.bobber.y);

    drawPanel(context, river.x - 12, river.y - 12, river.w + 24, river.h + 24, 16);
    context.fillStyle = "rgba(127, 212, 255, 0.13)";
    context.fillRect(river.x, river.y, river.w, river.h);

    for (let i = 0; i < 5; i += 1) {
      const laneY = river.y + (river.h * i) / 4;
      context.strokeStyle = i % 2 ? "rgba(255, 255, 255, 0.09)" : "rgba(255, 211, 107, 0.13)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(river.x, laneY);
      context.lineTo(river.x + river.w, laneY);
      context.stroke();
    }

    state.rings.forEach((ring) => {
      const point = toBoxPoint(river, ring.x, ring.y);
      const radius = ring.r * river.h + Math.sin(ring.pulse * 7) * 2;
      context.strokeStyle = "#91d576";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.stroke();
    });

    state.hazards.forEach((hazard) => {
      const point = toBoxPoint(river, hazard.x, hazard.y + Math.sin(hazard.wobble * 4) * 0.008);
      context.fillStyle = "#ff876f";
      roundedRect(context, point.x - (hazard.w * river.w) / 2, point.y - 9, hazard.w * river.w, 18, 7);
      context.fill();
      context.fillStyle = "rgba(16, 32, 35, 0.55)";
      context.fillRect(point.x - (hazard.w * river.w) / 2 + 8, point.y - 2, hazard.w * river.w - 16, 4);
    });

    context.globalAlpha = state.bobber.sunk ? 0.42 : 1;
    context.fillStyle = state.flash < 0 ? "#ff876f" : "#ffd36b";
    context.beginPath();
    context.arc(bobber.x, bobber.y, 14 + Math.max(0, state.flash) * 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f5fbf8";
    context.beginPath();
    context.arc(bobber.x, bobber.y - 5, 7, Math.PI, 0);
    context.fill();
    context.globalAlpha = 1;

    drawProgressBar(context, river.x, river.y - 42, river.w, 16, state.bites / drifterSettings().quota, "#91d576");
    drawProgressBar(context, river.x, river.y + river.h + 26, river.w, 14, state.oxygen, state.oxygen > 0.25 ? "#7fd4ff" : "#ff876f");
    drawStageText(context, W, H, state.mode === "running" ? "Steer through rings. Hold action to sink under hazards." : getStatus().text);
  }

  function getStats() {
    const state = game.state;
    return [
      ["Bites", `${state.bites} / ${drifterSettings().quota}`],
      ["Oxygen", formatPercent(state.oxygen)],
      ["Hazards", `${state.hits} / 4`],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") return { state: "won", label: "Caught", title: "Current Drifter", text: state.result };
    if (state.mode === "lost") return { state: "lost", label: "Lost", title: "Current Drifter", text: state.result };
    if (state.mode === "running") return { state: "running", label: "Running", title: "Current Drifter", text: state.result };
    return {
      state: "ready",
      label: "Ready",
      title: "Current Drifter",
      text: "Use WASD or arrows to drift. Hold action to sink.",
    };
  }

  function drifterSettings() {
    const d = game.level - 1;
    return {
      quota: 6 + Math.floor(d * 0.75),
      steer: 0.54 + d * 0.03,
      scroll: 0.13 + d * 0.018,
      currentBase: 0.07 + d * 0.015,
      oxygenDrain: 0.34 + d * 0.035,
      oxygenRecover: 0.2 - d * 0.012,
      hazardCount: 3 + Math.floor(d * 0.65),
    };
  }
}

function createNetSorter(level) {
  const itemTypes = [
    { kind: "keep", name: "Keeper", color: "#91d576", symbol: "K" },
    { kind: "release", name: "Fry", color: "#7fd4ff", symbol: "R" },
    { kind: "trash", name: "Boot", color: "#ff876f", symbol: "T" },
  ];
  const routeNames = { keep: "keep", release: "release", trash: "trash", none: "none" };
  const game = {
    id: "sorter",
    title: "Net Sorter",
    actionLabel: "Start Chute",
    usesDirections: true,
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress() {
      if (game.state.mode === "ready") start();
    },
    handleRelease() {},
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    game.state = {
      mode: "ready",
      timeLeft: 52,
      sorted: 0,
      quota: sorterSettings().quota,
      mistakes: 0,
      streak: 0,
      spawnTimer: 0.4,
      result: "Route each item before it falls past the gate.",
      items: [],
      flashes: [],
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = sorterSettings();
    state.timeLeft -= dt;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.items.push(makeSorterItem(settings));
      state.spawnTimer = random(settings.spawnMin, settings.spawnMax);
    }

    state.flashes = state.flashes
      .map((flash) => ({ ...flash, age: flash.age + dt }))
      .filter((flash) => flash.age < 0.55);

    for (const item of state.items) {
      item.y += item.speed * dt;
      item.wobble += dt;
      if (!item.sorted && item.y >= 0.72) {
        sortItem(item);
      }
    }
    state.items = state.items.filter((item) => item.y < 1.12 && !item.remove);

    if (state.sorted >= state.quota) {
      state.mode = "won";
      state.result = "Sorting quota filled.";
    } else if (state.mistakes >= settings.maxMistakes) {
      state.mode = "lost";
      state.result = "Too many bad routes.";
    } else if (state.timeLeft <= 0) {
      state.mode = "lost";
      state.result = "Timer expired.";
    }
  }

  function sortItem(item) {
    const state = game.state;
    const route = currentSortRoute();
    const correct = route === item.kind;
    item.sorted = true;
    item.remove = true;
    state.flashes.push({ x: item.x, route, correct, age: 0 });

    if (correct) {
      state.sorted += 1;
      state.streak += 1;
      state.result = `${item.name} routed to ${routeNames[route]}.`;
    } else {
      state.mistakes += 1;
      state.streak = 0;
      state.result = route === "none" ? `${item.name} missed the gate.` : `${item.name} sent to ${routeNames[route]}.`;
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Net Sorter");
    const state = game.state;
    const box = getPlayBox(W, H, 0.58, 0.64);
    const route = currentSortRoute();
    const gateY = box.y + box.h * 0.72;
    const bins = getSorterBins(box);

    drawPanel(context, box.x - 12, box.y - 12, box.w + 24, box.h + 24, 16);
    context.fillStyle = "rgba(127, 212, 255, 0.13)";
    context.fillRect(box.x, box.y, box.w, box.h);

    context.strokeStyle = "rgba(245, 251, 248, 0.18)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(box.x + box.w * 0.18, box.y);
    context.lineTo(box.x + box.w * 0.34, gateY);
    context.moveTo(box.x + box.w * 0.82, box.y);
    context.lineTo(box.x + box.w * 0.66, gateY);
    context.stroke();

    context.strokeStyle = route === "none" ? "rgba(255, 255, 255, 0.3)" : "#ffd36b";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(box.x + box.w * 0.2, gateY);
    context.lineTo(box.x + box.w * 0.8, gateY);
    context.stroke();

    Object.entries(bins).forEach(([kind, bin]) => {
      context.fillStyle = route === kind ? "rgba(255, 211, 107, 0.28)" : "rgba(16, 32, 35, 0.62)";
      roundedRect(context, bin.x, bin.y, bin.w, bin.h, 10);
      context.fill();
      context.strokeStyle = bin.color;
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = "#f5fbf8";
      context.font = "900 12px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(bin.label, bin.x + bin.w / 2, bin.y + bin.h / 2);
    });

    state.items.forEach((item) => {
      const x = box.x + box.w * item.x + Math.sin(item.wobble * 5) * 8;
      const y = box.y + box.h * item.y;
      context.fillStyle = item.color;
      roundedRect(context, x - 22, y - 13, 44, 26, item.kind === "trash" ? 5 : 13);
      context.fill();
      context.fillStyle = "#102023";
      context.font = "900 13px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(item.symbol, x, y);
    });

    state.flashes.forEach((flash) => {
      const alpha = 1 - flash.age / 0.55;
      context.fillStyle = flash.correct ? `rgba(145, 213, 118, ${alpha})` : `rgba(255, 135, 111, ${alpha})`;
      const x = box.x + box.w * flash.x;
      context.beginPath();
      context.arc(x, gateY, 14 + (1 - alpha) * 28, 0, Math.PI * 2);
      context.fill();
    });

    drawProgressBar(context, box.x, box.y - 42, box.w, 16, state.sorted / state.quota, "#91d576");
    drawStageText(context, W, H, state.mode === "running" ? "Left release, up keep, right trash before items cross the gate." : getStatus().text);
  }

  function getStats() {
    const state = game.state;
    return [
      ["Sorted", `${state.sorted} / ${state.quota}`],
      ["Mistakes", `${state.mistakes} / ${sorterSettings().maxMistakes}`],
      ["Route", routeNames[currentSortRoute()]],
      ["Streak", String(state.streak)],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") return { state: "won", label: "Caught", title: "Net Sorter", text: state.result };
    if (state.mode === "lost") return { state: "lost", label: "Lost", title: "Net Sorter", text: state.result };
    if (state.mode === "running") return { state: "running", label: "Running", title: "Net Sorter", text: state.result };
    return {
      state: "ready",
      label: "Ready",
      title: "Net Sorter",
      text: "Hold left for release, up for keep, right for trash.",
    };
  }

  function currentSortRoute() {
    if (directionsDown.has("up")) return "keep";
    if (directionsDown.has("left")) return "release";
    if (directionsDown.has("right")) return "trash";
    return "none";
  }

  function makeSorterItem(settings) {
    const type = itemTypes[Math.floor(random(0, itemTypes.length))];
    return {
      ...type,
      x: random(0.36, 0.64),
      y: -0.08,
      speed: random(settings.speedMin, settings.speedMax),
      wobble: random(0, Math.PI * 2),
      sorted: false,
      remove: false,
    };
  }

  function sorterSettings() {
    const d = game.level - 1;
    return {
      quota: 12 + d * 2,
      maxMistakes: Math.max(3, 7 - Math.floor(d * 0.75)),
      spawnMin: 0.68 - d * 0.055,
      spawnMax: 1.06 - d * 0.065,
      speedMin: 0.22 + d * 0.02,
      speedMax: 0.32 + d * 0.025,
    };
  }
}

function createDepthDial(level) {
  const game = {
    id: "depth",
    title: "Depth Dial",
    actionLabel: "Lower Hook",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease,
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    const settings = depthSettings();
    game.state = {
      mode: "ready",
      depth: 0.08,
      lowering: false,
      catches: 0,
      attempts: settings.attempts,
      target: makeDepthTarget(settings),
      ping: "Hold to lower the hook, release to ping a depth.",
      sonar: [],
      pulse: 0,
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt, pressed) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = depthSettings();
    state.pulse = Math.max(0, state.pulse - dt * 3.2);
    state.sonar = state.sonar
      .map((ping) => ({ ...ping, age: ping.age + dt * 1.6 }))
      .filter((ping) => ping.age < 1);
    if (pressed || state.lowering) {
      state.depth += settings.dropSpeed * dt;
      if (state.depth >= 0.96) {
        state.depth = 0.96;
      }
    } else {
      state.depth = Math.max(0.08, state.depth - settings.reelBack * dt);
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Depth Dial");
    const state = game.state;
    const shaft = getDepthShaft(W, H);
    const hookY = shaft.y + shaft.h * state.depth;
    const targetY = shaft.y + shaft.h * state.target.depth;

    drawPanel(context, shaft.x - 24, shaft.y - 16, shaft.w + 48, shaft.h + 32, 16);
    const gradient = context.createLinearGradient(0, shaft.y, 0, shaft.y + shaft.h);
    gradient.addColorStop(0, "rgba(127, 212, 255, 0.22)");
    gradient.addColorStop(1, "rgba(16, 32, 35, 0.82)");
    context.fillStyle = gradient;
    context.fillRect(shaft.x, shaft.y, shaft.w, shaft.h);

    for (let i = 0; i <= 5; i += 1) {
      const y = shaft.y + (shaft.h * i) / 5;
      context.strokeStyle = "rgba(245, 251, 248, 0.16)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(shaft.x, y);
      context.lineTo(shaft.x + shaft.w, y);
      context.stroke();
      context.fillStyle = "rgba(245, 251, 248, 0.52)";
      context.font = "800 11px system-ui, sans-serif";
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(`${i * 20}`, shaft.x - 8, y);
    }

    state.sonar.forEach((ping) => {
      const y = shaft.y + shaft.h * ping.depth;
      const alpha = 1 - ping.age;
      context.strokeStyle = ping.hit ? `rgba(145, 213, 118, ${alpha})` : `rgba(255, 211, 107, ${alpha * 0.72})`;
      context.lineWidth = ping.hit ? 5 : 2;
      context.beginPath();
      context.moveTo(shaft.x, y);
      context.lineTo(shaft.x + shaft.w, y);
      context.stroke();
    });

    context.strokeStyle = "#f5fbf8";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(shaft.x + shaft.w / 2, shaft.y - 30);
    context.lineTo(shaft.x + shaft.w / 2, hookY);
    context.stroke();

    context.fillStyle = state.pulse > 0 ? "#91d576" : "#ffd36b";
    context.beginPath();
    context.arc(shaft.x + shaft.w / 2, hookY, 10 + state.pulse * 8, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#102023";
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = "rgba(16, 32, 35, 0.72)";
    roundedRect(context, shaft.x + shaft.w + 34, shaft.y + shaft.h * 0.15, Math.min(210, W * 0.26), 100, 12);
    context.fill();
    context.fillStyle = "#f5fbf8";
    context.font = "900 14px system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";
    wrapText(context, state.ping, shaft.x + shaft.w + 48, shaft.y + shaft.h * 0.15 + 16, Math.min(180, W * 0.22), 18);

    context.fillStyle = "rgba(145, 213, 118, 0.16)";
    context.beginPath();
    context.ellipse(shaft.x + shaft.w / 2, targetY, shaft.w * 0.42, 12, 0, 0, Math.PI * 2);
    if (state.mode !== "running" && state.catches > 0) context.fill();

    drawProgressBar(context, shaft.x, shaft.y + shaft.h + 28, shaft.w, 16, state.catches / depthSettings().quota, "#91d576");
    drawStageText(context, W, H, state.mode === "running" ? "Hold to lower. Release at the hidden depth after reading sonar pings." : getStatus().text);
  }

  function handlePress() {
    const state = game.state;
    if (state.mode === "ready") start();
    if (state.mode !== "running") return;
    state.lowering = true;
    state.ping = "Lowering hook.";
  }

  function handleRelease() {
    const state = game.state;
    if (state.mode !== "running" || !state.lowering) return;
    const settings = depthSettings();
    state.lowering = false;
    state.attempts -= 1;
    const delta = state.depth - state.target.depth;
    const distance = Math.abs(delta);
    const hit = distance <= settings.hitRadius;
    state.pulse = hit ? 1 : 0.35;
    state.sonar.push({ depth: state.depth, hit, age: 0 });

    if (hit) {
      state.catches += 1;
      state.ping = `Hooked fish at depth ${Math.round(state.depth * 100)}.`;
      state.depth = 0.08;
      state.target = makeDepthTarget(settings);
      if (state.catches >= settings.quota) {
        state.mode = "won";
        state.ping = "Depth pattern solved.";
      }
    } else {
      const distanceText = distance < 0.12 ? "near" : distance < 0.28 ? "mid" : "far";
      state.ping = `Sonar says ${delta < 0 ? "deeper" : "shallower"} and ${distanceText}.`;
      if (state.attempts <= 0) {
        state.mode = "lost";
        state.ping = "No drops left.";
      }
    }
  }

  function getStats() {
    const state = game.state;
    return [
      ["Caught", `${state.catches} / ${depthSettings().quota}`],
      ["Drops", String(state.attempts)],
      ["Depth", `${Math.round(state.depth * 100)}`],
      ["Signal", state.ping],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") return { state: "won", label: "Caught", title: "Depth Dial", text: state.ping };
    if (state.mode === "lost") return { state: "lost", label: "Lost", title: "Depth Dial", text: state.ping };
    if (state.mode === "running") return { state: "running", label: "Running", title: "Depth Dial", text: state.ping };
    return {
      state: "ready",
      label: "Ready",
      title: "Depth Dial",
      text: "Hold action to lower the hook, release to test a depth.",
    };
  }

  function makeDepthTarget(settings) {
    return { depth: random(settings.minDepth, settings.maxDepth) };
  }

  function depthSettings() {
    const d = game.level - 1;
    return {
      quota: 3 + Math.floor(d * 0.5),
      attempts: 12 - Math.floor(d * 0.75),
      hitRadius: 0.07 - d * 0.006,
      dropSpeed: 0.42 + d * 0.045,
      reelBack: 0.08 + d * 0.005,
      minDepth: 0.16,
      maxDepth: 0.9,
    };
  }
}

function createBiteCode(level) {
  const game = {
    id: "bite",
    title: "Bite Code",
    actionLabel: "Tap / Hold",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease,
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    const settings = biteSettings();
    game.state = {
      mode: "ready",
      phase: "observe",
      elapsed: 0,
      round: 1,
      quota: settings.quota,
      pattern: makeBitePattern(settings),
      observeIndex: 0,
      inputIndex: 0,
      phaseTimer: 0.7,
      pulseLeft: 0,
      lastPulse: null,
      inputTimeout: 0,
      mistakes: 0,
      pressing: false,
      pressStart: 0,
      feedback: 0,
      result: "Watch the bobber code, then replay short taps and long holds.",
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = biteSettings();
    state.elapsed += dt;
    state.feedback = Math.max(0, state.feedback - dt * 3.8);
    state.pulseLeft = Math.max(0, state.pulseLeft - dt);

    if (state.phase === "observe") {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        if (state.observeIndex < state.pattern.length) {
          const symbol = state.pattern[state.observeIndex];
          const duration = symbol === "long" ? settings.longPulse : settings.shortPulse;
          state.lastPulse = symbol;
          state.pulseLeft = duration;
          state.phaseTimer = duration + settings.rest;
          state.observeIndex += 1;
          state.result = symbol === "long" ? "Long bite." : "Short bite.";
        } else {
          state.phase = "input";
          state.inputIndex = 0;
          state.inputTimeout = settings.inputBase + state.pattern.length * settings.inputPerSymbol;
          state.result = "Replay the bite code.";
        }
      }
      return;
    }

    state.inputTimeout -= dt;
    if (state.inputTimeout <= 0) {
      state.mode = "lost";
      state.result = "Bite code timed out.";
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Bite Code");
    const state = game.state;
    const pond = getPlayBox(W, H, 0.62, 0.56);
    const bobberX = pond.x + pond.w * 0.5;
    const bobberY = pond.y + pond.h * 0.46 + Math.sin(state.elapsed * 2.2) * 5;
    const pulseAmount = state.pulseLeft > 0 ? (state.lastPulse === "long" ? 1 : 0.56) : 0;

    drawPanel(context, pond.x - 12, pond.y - 12, pond.w + 24, pond.h + 24, 16);
    context.fillStyle = "rgba(127, 212, 255, 0.14)";
    context.fillRect(pond.x, pond.y, pond.w, pond.h);

    context.strokeStyle = "rgba(245, 251, 248, 0.14)";
    context.lineWidth = 2;
    for (let i = 1; i < 5; i += 1) {
      const y = pond.y + (pond.h * i) / 5;
      context.beginPath();
      context.moveTo(pond.x + 18, y + Math.sin(state.elapsed * 2 + i) * 4);
      context.bezierCurveTo(pond.x + pond.w * 0.35, y - 16, pond.x + pond.w * 0.65, y + 16, pond.x + pond.w - 18, y);
      context.stroke();
    }

    context.strokeStyle = "#f5fbf8";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(bobberX, pond.y + 18);
    context.lineTo(bobberX, bobberY);
    context.stroke();

    context.fillStyle = state.phase === "observe" && pulseAmount ? "#ffd36b" : "#ff876f";
    context.beginPath();
    context.arc(bobberX, bobberY, 18 + pulseAmount * 12 + state.feedback * 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f5fbf8";
    context.beginPath();
    context.arc(bobberX, bobberY - 7, 9, Math.PI, 0);
    context.fill();

    if (pulseAmount) {
      context.strokeStyle = state.lastPulse === "long" ? "rgba(255, 211, 107, 0.72)" : "rgba(127, 212, 255, 0.72)";
      context.lineWidth = state.lastPulse === "long" ? 5 : 3;
      context.beginPath();
      context.arc(bobberX, bobberY, 36 + pulseAmount * 18, 0, Math.PI * 2);
      context.stroke();
    }

    const slotY = pond.y + pond.h * 0.78;
    const slotGap = Math.min(58, pond.w / Math.max(5, state.pattern.length + 1));
    const startX = bobberX - ((state.pattern.length - 1) * slotGap) / 2;
    state.pattern.forEach((symbol, index) => {
      const x = startX + index * slotGap;
      const answered = state.phase === "input" && index < state.inputIndex;
      const visible = state.phase === "observe" && index < state.observeIndex;
      context.fillStyle = answered ? "#91d576" : visible ? "rgba(255, 211, 107, 0.28)" : "rgba(16, 32, 35, 0.62)";
      roundedRect(context, x - 21, slotY - 15, 42, 30, 10);
      context.fill();
      context.strokeStyle = visible || answered ? (symbol === "long" ? "#ffd36b" : "#7fd4ff") : "rgba(245, 251, 248, 0.2)";
      context.lineWidth = symbol === "long" ? 5 : 3;
      context.beginPath();
      context.moveTo(x - (symbol === "long" ? 13 : 6), slotY);
      context.lineTo(x + (symbol === "long" ? 13 : 6), slotY);
      context.stroke();
    });

    drawProgressBar(context, pond.x, pond.y - 42, pond.w, 16, (state.round - 1) / state.quota, "#91d576");
    if (state.phase === "input" && state.mode === "running") {
      drawProgressBar(context, pond.x, pond.y + pond.h + 26, pond.w, 12, state.inputTimeout / (biteSettings().inputBase + state.pattern.length * biteSettings().inputPerSymbol), "#ffd36b");
    }
    drawStageText(context, W, H, state.mode === "running" ? state.result : getStatus().text);
  }

  function handlePress() {
    let state = game.state;
    if (state.mode === "ready") {
      start();
      state = game.state;
    }
    if (state.mode !== "running" || state.phase !== "input" || state.pressing) return;
    state.pressing = true;
    state.pressStart = state.elapsed;
    state.result = "Reading hold length.";
  }

  function handleRelease() {
    const state = game.state;
    if (state.mode !== "running" || state.phase !== "input" || !state.pressing) return;

    const settings = biteSettings();
    const held = state.elapsed - state.pressStart;
    const symbol = held >= settings.longThreshold ? "long" : "short";
    const expected = state.pattern[state.inputIndex];
    state.pressing = false;

    if (symbol !== expected) {
      state.mistakes += 1;
      state.feedback = 1;
      state.result = `Wrong code: ${symbol}, expected ${expected}.`;
      if (state.mistakes >= settings.maxMistakes) {
        state.mode = "lost";
        state.result = "Too many wrong bite codes.";
        return;
      }
      replayPattern();
      return;
    }

    state.inputIndex += 1;
    state.feedback = 1;
    state.result = symbol === "long" ? "Long hold matched." : "Short tap matched.";

    if (state.inputIndex >= state.pattern.length) {
      state.round += 1;
      if (state.round > state.quota) {
        state.mode = "won";
        state.result = "Bite codes matched.";
      } else {
        state.pattern = makeBitePattern(settings);
        replayPattern();
      }
    }
  }

  function replayPattern() {
    const state = game.state;
    state.phase = "observe";
    state.observeIndex = 0;
    state.inputIndex = 0;
    state.phaseTimer = 0.62;
    state.pulseLeft = 0;
    state.pressing = false;
  }

  function getStats() {
    const state = game.state;
    return [
      ["Round", `${Math.min(state.round, state.quota)} / ${state.quota}`],
      ["Phase", state.phase === "observe" ? "Watch" : "Replay"],
      ["Code", `${state.inputIndex} / ${state.pattern.length}`],
      ["Mistakes", `${state.mistakes} / ${biteSettings().maxMistakes}`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") return { state: "won", label: "Caught", title: "Bite Code", text: state.result };
    if (state.mode === "lost") return { state: "lost", label: "Lost", title: "Bite Code", text: state.result };
    if (state.mode === "running") return { state: "running", label: "Running", title: "Bite Code", text: state.result };
    return {
      state: "ready",
      label: "Ready",
      title: "Bite Code",
      text: "Memorize the bobber bites, then replay short taps and long holds.",
    };
  }

  function makeBitePattern(settings) {
    const length = settings.baseLength + Math.floor((game.state.round || 1) / 2);
    return Array.from({ length }, () => (Math.random() < settings.longChance ? "long" : "short"));
  }

  function biteSettings() {
    const d = game.level - 1;
    return {
      quota: 4 + Math.floor(d * 0.5),
      baseLength: 3 + Math.floor(d * 0.45),
      maxMistakes: Math.max(2, 5 - Math.floor(d * 0.6)),
      shortPulse: 0.22,
      longPulse: 0.66,
      rest: Math.max(0.18, 0.34 - d * 0.03),
      longThreshold: Math.max(0.32, 0.48 - d * 0.018),
      inputBase: Math.max(2.6, 4.2 - d * 0.22),
      inputPerSymbol: Math.max(0.82, 1.22 - d * 0.045),
      longChance: 0.42 + d * 0.025,
    };
  }
}

function createKelpThread(level) {
  const game = {
    id: "kelp",
    title: "Kelp Thread",
    actionLabel: "Grab Lure",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease,
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    const settings = kelpSettings();
    const gates = makeKelpGates(settings);
    game.state = {
      mode: "ready",
      timeLeft: 46,
      gates,
      gateIndex: 1,
      lure: { x: gates[0].x, y: gates[0].y, vx: 0, vy: 0 },
      snags: 0,
      invuln: 0,
      wake: [],
      kelp: makeKelpHazards(settings, gates),
      dragging: false,
      result: "Guide the lure through each glowing gate without brushing kelp.",
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = kelpSettings();
    const box = getPlayBox(width, height, 0.66, 0.6);
    const lure = state.lure;
    const pull = getKelpPull(box);

    state.timeLeft -= dt;
    state.invuln = Math.max(0, state.invuln - dt);
    state.wake = state.wake.map((wake) => ({ ...wake, age: wake.age + dt * 1.4 })).filter((wake) => wake.age < 1);

    lure.vx += (pull.x * settings.speed - lure.vx) * dt * 5.4;
    lure.vy += (pull.y * settings.speed - lure.vy) * dt * 5.4;
    lure.x = clamp(lure.x + lure.vx * dt, 0.04, 0.96);
    lure.y = clamp(lure.y + lure.vy * dt, 0.08, 0.92);
    if (Math.hypot(lure.vx, lure.vy) > 0.06) {
      state.wake.push({ x: lure.x, y: lure.y, age: 0 });
    }

    const target = state.gates[state.gateIndex];
    if (target && Math.hypot(lure.x - target.x, lure.y - target.y) <= target.r) {
      state.gateIndex += 1;
      state.result = "Gate threaded.";
    }

    for (const hazard of state.kelp) {
      hazard.sway += dt * hazard.speed;
      const hx = hazard.x + Math.sin(hazard.sway) * hazard.swaySize;
      const hit = Math.hypot(lure.x - hx, lure.y - hazard.y) < hazard.r + 0.028;
      if (hit && state.invuln <= 0) {
        const dx = lure.x - hx;
        const dy = lure.y - hazard.y;
        const len = Math.hypot(dx, dy) || 1;
        lure.vx += (dx / len) * 0.7;
        lure.vy += (dy / len) * 0.7;
        state.snags += 1;
        state.invuln = 0.85;
        state.result = "Kelp snagged the lure.";
      }
    }

    if (state.gateIndex >= state.gates.length) {
      state.mode = "won";
      state.result = "Lure cleared the kelp lane.";
    } else if (state.snags >= settings.maxSnags) {
      state.mode = "lost";
      state.result = "Too many kelp snags.";
    } else if (state.timeLeft <= 0) {
      state.mode = "lost";
      state.result = "Timer expired.";
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Kelp Thread");
    const state = game.state;
    const box = getPlayBox(W, H, 0.66, 0.6);
    const lure = toBoxPoint(box, state.lure.x, state.lure.y);

    drawPanel(context, box.x - 12, box.y - 12, box.w + 24, box.h + 24, 16);
    context.fillStyle = "rgba(127, 212, 255, 0.12)";
    context.fillRect(box.x, box.y, box.w, box.h);

    context.strokeStyle = "rgba(245, 251, 248, 0.16)";
    context.lineWidth = 2;
    context.beginPath();
    state.gates.forEach((gate, index) => {
      const point = toBoxPoint(box, gate.x, gate.y);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();

    state.wake.forEach((wake) => {
      const point = toBoxPoint(box, wake.x, wake.y);
      const alpha = 1 - wake.age;
      context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.32})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, 5 + (1 - alpha) * 16, 0, Math.PI * 2);
      context.stroke();
    });

    state.kelp.forEach((hazard) => {
      const top = toBoxPoint(box, hazard.x, 1);
      const bulb = toBoxPoint(box, hazard.x + Math.sin(hazard.sway) * hazard.swaySize, hazard.y);
      context.strokeStyle = "rgba(145, 213, 118, 0.54)";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(top.x, top.y);
      context.quadraticCurveTo((top.x + bulb.x) / 2 + Math.sin(hazard.sway * 0.7) * 18, (top.y + bulb.y) / 2, bulb.x, bulb.y);
      context.stroke();
      context.fillStyle = "#91d576";
      context.beginPath();
      context.ellipse(bulb.x, bulb.y, hazard.r * box.w, hazard.r * box.h * 1.4, Math.sin(hazard.sway) * 0.4, 0, Math.PI * 2);
      context.fill();
    });

    state.gates.forEach((gate, index) => {
      const point = toBoxPoint(box, gate.x, gate.y);
      const done = index < state.gateIndex;
      const active = index === state.gateIndex;
      context.strokeStyle = done ? "#91d576" : active ? "#ffd36b" : "rgba(245, 251, 248, 0.32)";
      context.lineWidth = active ? 5 : 3;
      context.beginPath();
      context.arc(point.x, point.y, gate.r * box.w, 0, Math.PI * 2);
      context.stroke();
      if (active) {
        context.fillStyle = "rgba(255, 211, 107, 0.18)";
        context.beginPath();
        context.arc(point.x, point.y, gate.r * box.w, 0, Math.PI * 2);
        context.fill();
      }
    });

    context.fillStyle = state.invuln > 0 ? "#ff876f" : "#ffd36b";
    context.beginPath();
    context.ellipse(lure.x, lure.y, 18, 10, state.lure.vx * 0.35, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#102023";
    context.lineWidth = 3;
    context.stroke();

    drawProgressBar(context, box.x, box.y - 42, box.w, 16, (state.gateIndex - 1) / (state.gates.length - 1), "#91d576");
    drawStageText(context, W, H, state.mode === "running" ? "Drag the lure or steer with arrows through gates in order." : getStatus().text);
  }

  function handlePress(source) {
    let state = game.state;
    if (state.mode === "ready") {
      start();
      state = game.state;
    }
    if (state.mode === "running" && source === "canvas") {
      state.dragging = true;
      state.result = "Lure grabbed.";
    }
  }

  function handleRelease(source) {
    if (source !== "canvas") return;
    const state = game.state;
    state.dragging = false;
    if (state.mode === "running") state.result = "Lure released. Arrows still steer.";
  }

  function getStats() {
    const state = game.state;
    return [
      ["Gates", `${Math.max(0, state.gateIndex - 1)} / ${state.gates.length - 1}`],
      ["Snags", `${state.snags} / ${kelpSettings().maxSnags}`],
      ["Control", state.dragging ? "Pointer" : "Directions"],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") return { state: "won", label: "Caught", title: "Kelp Thread", text: state.result };
    if (state.mode === "lost") return { state: "lost", label: "Lost", title: "Kelp Thread", text: state.result };
    if (state.mode === "running") return { state: "running", label: "Running", title: "Kelp Thread", text: state.result };
    return {
      state: "ready",
      label: "Ready",
      title: "Kelp Thread",
      text: "Thread the lure through the gate path. Avoid kelp bulbs.",
    };
  }

  function getKelpPull(box) {
    if (inputDown && inputSource === "canvas" && pointer.active) {
      const target = {
        x: clamp((pointer.x - box.x) / box.w, 0, 1),
        y: clamp((pointer.y - box.y) / box.h, 0, 1),
      };
      const lure = game.state.lure;
      const dx = target.x - lure.x;
      const dy = target.y - lure.y;
      const length = Math.hypot(dx, dy);
      if (length > 0.012) {
        return {
          x: dx / length,
          y: dy / length,
        };
      }
    }
    return getPullVector();
  }

  function makeKelpGates(settings) {
    return Array.from({ length: settings.gateCount }, (_, index) => {
      const t = index / (settings.gateCount - 1);
      return {
        x: 0.09 + t * 0.82,
        y: clamp(0.5 + Math.sin(t * Math.PI * 2.4 + settings.seed) * 0.25 + random(-0.08, 0.08), 0.16, 0.84),
        r: 0.05,
      };
    });
  }

  function makeKelpHazards(settings, gates) {
    const hazards = [];
    let guard = 0;
    while (hazards.length < settings.hazardCount && guard < 240) {
      guard += 1;
      const hazard = {
        x: random(0.12, 0.88),
        y: random(0.15, 0.85),
        r: random(0.028, 0.044),
        sway: random(0, Math.PI * 2),
        swaySize: random(0.012, 0.032),
        speed: random(1.1, 2.2),
      };
      const nearGate = gates.some((gate) => Math.hypot(gate.x - hazard.x, gate.y - hazard.y) < 0.13);
      if (!nearGate) hazards.push(hazard);
    }
    return hazards;
  }

  function kelpSettings() {
    const d = game.level - 1;
    return {
      gateCount: 6 + Math.floor(d * 0.8),
      hazardCount: 9 + Math.floor(d * 1.8),
      maxSnags: Math.max(3, 7 - Math.floor(d * 0.75)),
      speed: 0.54 + d * 0.04,
      seed: random(0, Math.PI * 2),
    };
  }
}

function createDragNet(level) {
  const game = {
    id: "net",
    title: "Drag Net",
    actionLabel: "Close Net",
    level,
    state: {},
    reset,
    start,
    update,
    draw,
    handlePress,
    handleRelease() {},
    setDifficulty(nextLevel) {
      game.level = nextLevel;
    },
    getStats,
    getStatus,
  };

  reset();
  return game;

  function reset() {
    const settings = dragNetSettings();
    game.state = {
      mode: "ready",
      timeLeft: 44,
      caught: 0,
      fouls: 0,
      net: { x: 0.5, y: 0.5, vx: 0, vy: 0, pulse: 0 },
      fish: Array.from({ length: settings.schoolSize }, (_, index) => makeNetFish(settings, index)),
      ripples: [],
      result: "Move the net over keeper fish. Close it without scooping red bycatch.",
    };
  }

  function start() {
    let state = game.state;
    if (state.mode === "running") return;
    if (state.mode === "won" || state.mode === "lost") {
      reset();
      state = game.state;
    }
    state.mode = "running";
  }

  function update(dt, pressed) {
    const state = game.state;
    if (state.mode !== "running") return;

    const settings = dragNetSettings();
    const box = getPlayBox(width, height, 0.66, 0.6);
    const net = state.net;
    const pull = getNetPull(box);

    state.timeLeft -= dt;
    net.pulse = Math.max(0, net.pulse - dt * 3.6);
    state.ripples = state.ripples.map((ripple) => ({ ...ripple, age: ripple.age + dt * 1.6 })).filter((ripple) => ripple.age < 1);

    net.vx += (pull.x * settings.netSpeed - net.vx) * dt * 5.5;
    net.vy += (pull.y * settings.netSpeed - net.vy) * dt * 5.5;
    net.x = clamp(net.x + net.vx * dt, 0.08, 0.92);
    net.y = clamp(net.y + net.vy * dt, 0.1, 0.9);

    for (const fish of state.fish) {
      fish.wander -= dt;
      if (fish.wander <= 0) {
        fish.tx = random(0.08, 0.92);
        fish.ty = random(0.12, 0.88);
        fish.wander = random(0.7, 1.6);
      }
      const flee = getFishFlee(fish, net, settings);
      fish.vx += ((fish.tx - fish.x) * fish.speed + flee.x - fish.vx) * dt * 2.6;
      fish.vy += ((fish.ty - fish.y) * fish.speed + flee.y - fish.vy) * dt * 2.6;
      fish.x = clamp(fish.x + fish.vx * dt, 0.04, 0.96);
      fish.y = clamp(fish.y + fish.vy * dt, 0.08, 0.92);
    }

    if (pressed) {
      const netRadius = settings.radius * 0.78;
      for (const fish of state.fish) {
        if (fish.caught) continue;
        const distance = Math.hypot(fish.x - net.x, fish.y - net.y);
        if (distance <= netRadius) {
          fish.caught = true;
          net.pulse = 1;
          state.ripples.push({ x: fish.x, y: fish.y, good: fish.kind === "keeper", age: 0 });
          if (fish.kind === "keeper") {
            state.caught += 1;
            state.result = "Keeper fish netted.";
          } else {
            state.fouls += 1;
            state.result = "Bycatch fouled the net.";
          }
        }
      }
    }

    state.fish = state.fish.filter((fish) => !fish.caught);
    while (state.fish.length < settings.schoolSize) {
      state.fish.push(makeNetFish(settings, Math.floor(random(0, 1000))));
    }

    if (state.caught >= settings.quota) {
      state.mode = "won";
      state.result = "Keeper quota netted.";
    } else if (state.fouls >= settings.maxFouls) {
      state.mode = "lost";
      state.result = "Too much bycatch.";
    } else if (state.timeLeft <= 0) {
      state.mode = "lost";
      state.result = "Timer expired.";
    }
  }

  function draw(context, W, H) {
    drawBackdrop(context, W, H, "Drag Net");
    const state = game.state;
    const settings = dragNetSettings();
    const box = getPlayBox(W, H, 0.66, 0.6);
    const net = toBoxPoint(box, state.net.x, state.net.y);
    const radius = settings.radius * Math.min(box.w, box.h);
    const closed = inputDown && state.mode === "running";

    drawPanel(context, box.x - 12, box.y - 12, box.w + 24, box.h + 24, 16);
    context.fillStyle = "rgba(127, 212, 255, 0.12)";
    context.fillRect(box.x, box.y, box.w, box.h);

    state.ripples.forEach((ripple) => {
      const point = toBoxPoint(box, ripple.x, ripple.y);
      const alpha = 1 - ripple.age;
      context.strokeStyle = ripple.good ? `rgba(145, 213, 118, ${alpha})` : `rgba(255, 135, 111, ${alpha})`;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(point.x, point.y, 8 + (1 - alpha) * 28, 0, Math.PI * 2);
      context.stroke();
    });

    state.fish.forEach((fish) => {
      const point = toBoxPoint(box, fish.x, fish.y);
      context.fillStyle = fish.kind === "keeper" ? "#ffd36b" : "#ff876f";
      context.beginPath();
      context.ellipse(point.x, point.y, fish.kind === "keeper" ? 17 : 15, fish.kind === "keeper" ? 9 : 13, fish.vx * 0.45, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = fish.kind === "keeper" ? "#ff876f" : "#102023";
      context.beginPath();
      context.moveTo(point.x - 17, point.y);
      context.lineTo(point.x - 28, point.y - 8);
      context.lineTo(point.x - 28, point.y + 8);
      context.closePath();
      context.fill();
      if (fish.kind === "bycatch") {
        context.strokeStyle = "#f5fbf8";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(point.x - 8, point.y - 10);
        context.lineTo(point.x + 8, point.y + 10);
        context.moveTo(point.x + 8, point.y - 10);
        context.lineTo(point.x - 8, point.y + 10);
        context.stroke();
      }
    });

    context.strokeStyle = closed ? "#ffd36b" : "rgba(245, 251, 248, 0.7)";
    context.lineWidth = closed ? 6 : 4;
    context.beginPath();
    context.arc(net.x, net.y, radius * (closed ? 0.78 : 1), 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(245, 251, 248, 0.28)";
    context.lineWidth = 1;
    for (let i = -2; i <= 2; i += 1) {
      context.beginPath();
      context.moveTo(net.x - radius, net.y + i * radius * 0.32);
      context.lineTo(net.x + radius, net.y + i * radius * 0.32);
      context.moveTo(net.x + i * radius * 0.32, net.y - radius);
      context.lineTo(net.x + i * radius * 0.32, net.y + radius);
      context.stroke();
    }
    if (state.net.pulse > 0) {
      context.strokeStyle = "rgba(255, 255, 255, 0.72)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(net.x, net.y, radius + state.net.pulse * 18, 0, Math.PI * 2);
      context.stroke();
    }

    drawProgressBar(context, box.x, box.y - 42, box.w, 16, state.caught / settings.quota, "#91d576");
    drawStageText(context, W, H, state.mode === "running" ? "Aim with pointer or arrows. Hold action to close the net over yellow fish." : getStatus().text);
  }

  function handlePress() {
    const state = game.state;
    if (state.mode === "ready") start();
  }

  function getStats() {
    const state = game.state;
    const settings = dragNetSettings();
    return [
      ["Keepers", `${state.caught} / ${settings.quota}`],
      ["Bycatch", `${state.fouls} / ${settings.maxFouls}`],
      ["Net", inputDown && state.mode === "running" ? "Closed" : "Open"],
      ["Timer", `${Math.max(0, state.timeLeft).toFixed(1)}s`],
    ];
  }

  function getStatus() {
    const state = game.state;
    if (state.mode === "won") return { state: "won", label: "Caught", title: "Drag Net", text: state.result };
    if (state.mode === "lost") return { state: "lost", label: "Lost", title: "Drag Net", text: state.result };
    if (state.mode === "running") return { state: "running", label: "Running", title: "Drag Net", text: state.result };
    return {
      state: "ready",
      label: "Ready",
      title: "Drag Net",
      text: "Move the net, then close it around keeper fish without red bycatch.",
    };
  }

  function getNetPull(box) {
    if (pointer.active) {
      const target = {
        x: clamp((pointer.x - box.x) / box.w, 0, 1),
        y: clamp((pointer.y - box.y) / box.h, 0, 1),
      };
      const net = game.state.net;
      const dx = target.x - net.x;
      const dy = target.y - net.y;
      const length = Math.hypot(dx, dy);
      if (length > 0.02) {
        return {
          x: dx / length,
          y: dy / length,
        };
      }
    }
    return getPullVector();
  }

  function getFishFlee(fish, net, settings) {
    const dx = fish.x - net.x;
    const dy = fish.y - net.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > settings.radius * 1.65) return { x: 0, y: 0 };
    const strength = (1 - distance / (settings.radius * 1.65)) * settings.flee;
    return {
      x: (dx / distance) * strength,
      y: (dy / distance) * strength,
    };
  }

  function makeNetFish(settings, index) {
    const edge = Math.random() < 0.5;
    const keeper = Math.random() > settings.bycatchChance;
    return {
      kind: keeper ? "keeper" : "bycatch",
      x: edge ? random(0.04, 0.16) : random(0.18, 0.94),
      y: edge ? random(0.1, 0.9) : random(0.08, 0.92),
      vx: random(-0.04, 0.04),
      vy: random(-0.04, 0.04),
      tx: random(0.08, 0.92),
      ty: random(0.12, 0.88),
      speed: random(settings.fishSpeedMin, settings.fishSpeedMax) * (keeper ? 1 : 0.84),
      wander: random(0.25, 1.2) + index * 0.03,
      caught: false,
    };
  }

  function dragNetSettings() {
    const d = game.level - 1;
    return {
      quota: 9 + Math.floor(d * 1.25),
      maxFouls: Math.max(2, 5 - Math.floor(d * 0.65)),
      schoolSize: 12 + Math.floor(d * 1.2),
      bycatchChance: 0.24 + d * 0.035,
      radius: Math.max(0.085, 0.13 - d * 0.006),
      netSpeed: 0.58 + d * 0.04,
      fishSpeedMin: 0.11 + d * 0.012,
      fishSpeedMax: 0.22 + d * 0.018,
      flee: 0.16 + d * 0.016,
    };
  }
}

function getPullVector() {
  const x = (directionsDown.has("right") ? 1 : 0) - (directionsDown.has("left") ? 1 : 0);
  const y = (directionsDown.has("down") ? 1 : 0) - (directionsDown.has("up") ? 1 : 0);
  const length = Math.hypot(x, y);
  if (!length) return { x: 0, y: 0 };
  return {
    x: x / length,
    y: y / length,
  };
}

function getRodPoint(base, W, H) {
  return {
    x: clamp(base.x + 42, 18, W - 18),
    y: clamp(base.y - 150, 18, H - 18),
  };
}

function getRodBase(square, W, H) {
  if (!pointer.active) {
    return {
      x: square.x + square.size * 0.5,
      y: clamp(square.y + square.size + 52, 18, H - 18),
    };
  }

  return {
    x: clamp(pointer.x, 18, W - 18),
    y: clamp(pointer.y, 18, H - 18),
  };
}

function getRodPullVector(square) {
  if (!pointer.active) return { x: 0, y: 0 };

  const centerX = square.x + square.size / 2;
  const centerY = square.y + square.size / 2;
  const dx = pointer.x - centerX;
  const dy = pointer.y - centerY;
  const length = Math.hypot(dx, dy);
  const deadZone = square.size * 0.13;
  if (length < deadZone) return { x: 0, y: 0 };

  const strength = clamp((length - deadZone) / (square.size * 0.32), 0, 1);
  return {
    x: (dx / length) * strength,
    y: (dy / length) * strength,
  };
}

function getTugSquare(W, H) {
  const size = Math.min(W * 0.56, H * 0.46, 390);
  return {
    x: W / 2 - size / 2,
    y: Math.max(84, H * 0.2),
    size,
  };
}

function getEdgePressure(fish) {
  const left = 1 - fish.x / 0.5;
  const right = 1 - (1 - fish.x) / 0.5;
  const up = 1 - fish.y / 0.5;
  const down = 1 - (1 - fish.y) / 0.5;
  const entries = [
    { pressure: left, reliefX: 1, reliefY: 0, direction: "right" },
    { pressure: right, reliefX: -1, reliefY: 0, direction: "left" },
    { pressure: up, reliefX: 0, reliefY: 1, direction: "down" },
    { pressure: down, reliefX: 0, reliefY: -1, direction: "up" },
  ];
  const edge = entries.reduce((best, next) => (next.pressure > best.pressure ? next : best));
  return {
    ...edge,
    pressure: clamp(edge.pressure, 0, 1),
  };
}

function getCastSquare(W, H) {
  const size = Math.min(W * 0.58, H * 0.52, 430);
  return {
    x: W / 2 - size / 2,
    y: Math.max(70, H * 0.16),
    size,
  };
}

function getCastOrigin(W, H) {
  const square = getCastSquare(W, H);
  return {
    x: W / 2,
    y: Math.min(H - 78, square.y + square.size + 72),
  };
}

function getAimVector(origin) {
  if (!pointer.active) {
    return { x: 0, y: -1 };
  }

  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: dx / length,
    y: dy / length,
  };
}

function getCastTarget(origin, aim, charge, square) {
  const minDistance = square.size * 0.16;
  const maxDistance = Math.hypot(square.size / 2, square.size + 72) * 1.08;
  const distance = minDistance + clamp(charge, 0, 1) * (maxDistance - minDistance);
  return {
    x: origin.x + aim.x * distance,
    y: origin.y + aim.y * distance,
  };
}

function makeDriftRing(settings, startX = random(0.2, 1.04)) {
  return {
    x: startX,
    y: random(0.16, 0.84),
    r: random(0.035, 0.052) - settings.scroll * 0.02,
    pulse: random(0, Math.PI * 2),
  };
}

function makeDriftHazard(index, settings, startX = random(0.35, 1.16)) {
  return {
    x: startX + index * 0.18,
    y: random(0.15, 0.85),
    w: random(0.09, 0.16),
    h: 0.08,
    speed: settings.scroll * random(0.92, 1.45),
    wobble: random(0, Math.PI * 2),
  };
}

function currentAt(y, settings) {
  const lane = Math.floor(clamp(y, 0, 0.999) * 5);
  const sign = lane % 2 === 0 ? 1 : -1;
  return sign * settings.currentBase * (0.72 + lane * 0.12);
}

function getPlayBox(W, H, widthRatio, heightRatio) {
  const w = Math.min(W * widthRatio, 560);
  const h = Math.min(H * heightRatio, 420);
  return {
    x: W / 2 - w / 2,
    y: Math.max(74, H * 0.16),
    w,
    h,
  };
}

function toBoxPoint(box, x, y) {
  return {
    x: box.x + box.w * x,
    y: box.y + box.h * y,
  };
}

function getSorterBins(box) {
  const binW = box.w * 0.3;
  const binH = 40;
  const y = box.y + box.h - binH - 14;
  return {
    release: { x: box.x + box.w * 0.04, y, w: binW, h: binH, color: "#7fd4ff", label: "RELEASE" },
    keep: { x: box.x + box.w * 0.35, y, w: binW, h: binH, color: "#91d576", label: "KEEP" },
    trash: { x: box.x + box.w * 0.66, y, w: binW, h: binH, color: "#ff876f", label: "TRASH" },
  };
}

function getDepthShaft(W, H) {
  const h = Math.min(H * 0.62, 450);
  const w = Math.min(W * 0.28, 220);
  return {
    x: Math.max(74, W * 0.34),
    y: Math.max(76, H * 0.15),
    w,
    h,
  };
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) context.fillText(line, x, lineY);
}

function drawBackdrop(context, W, H, title) {
  const gradient = context.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#2a7f89");
  gradient.addColorStop(1, "#123f4c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, W, H);

  context.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (let y = 30; y < H; y += 54) {
    context.beginPath();
    context.ellipse(W * 0.16, y, W * 0.18, 10, 0, 0, Math.PI * 2);
    context.ellipse(W * 0.72, y + 20, W * 0.22, 12, 0, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(245, 251, 248, 0.74)";
  context.font = "900 13px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(title.toUpperCase(), 18, 16);
}

function drawPanel(context, x, y, w, h, radius) {
  context.fillStyle = "rgba(16, 32, 35, 0.72)";
  context.strokeStyle = "rgba(255, 255, 255, 0.2)";
  context.lineWidth = 1;
  roundedRect(context, x, y, w, h, radius);
  context.fill();
  context.stroke();
}

function drawProgressBar(context, x, y, w, h, value, color) {
  drawPanel(context, x, y, w, h, h / 2);
  context.fillStyle = color;
  roundedRect(context, x + 2, y + 2, Math.max(0, (w - 4) * value), h - 4, h / 2);
  context.fill();
}

function drawStageText(context, W, H, text) {
  context.fillStyle = "rgba(16, 32, 35, 0.64)";
  roundedRect(context, W * 0.18, H * 0.07, W * 0.64, 38, 12);
  context.fill();

  context.fillStyle = "#f5fbf8";
  context.font = "800 14px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, W / 2, H * 0.07 + 19, W * 0.58);
}

function fitRect(W, H, x, y, w, h) {
  return {
    x: clamp(x, 22, Math.max(22, W - w - 22)),
    y: clamp(y, 58, Math.max(58, H - h - 72)),
    w,
    h,
  };
}

function roundedRect(context, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function angleInZone(angle, zone) {
  const normalized = normalizeAngle(angle);
  const start = normalizeAngle(zone.start);
  const end = normalizeAngle(zone.end);
  if (start <= end) return normalized >= start && normalized <= end;
  return normalized >= start || normalized <= end;
}

function normalizeAngle(angle) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function dot(vector, x, y) {
  return vector.x * x + vector.y * y;
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
