(() => {
  const TOKEN_KEY = "magical-athlete-player-token";
  const NAME_KEY = "magical-athlete-player-name";
  const TRACK_COORDS = [
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [6, 1],
    [7, 1],
    [8, 1],
    [9, 1],
    [10, 1],
    [11, 1],
    [12, 1],
    [13, 1],
    [14, 2],
    [14, 3],
    [14, 4],
    [14, 5],
    [14, 6],
    [14, 7],
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
    [8, 7],
    [7, 7],
    [6, 7],
    [5, 7],
    [4, 7],
    [3, 7],
    [2, 7],
  ].map(([column, row]) => ({ column, row }));
  const PLAYER_COLORS = [
    ["#ed4d3d", "#ffd24a"],
    ["#2f76cf", "#8fe0ff"],
    ["#37a765", "#f6f0c1"],
    ["#f08b29", "#ffcf8a"],
    ["#8a56d6", "#f5b1ff"],
    ["#e84c92", "#ffd1e6"],
  ];
  const MOTION_QUERY = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  const state = {
    socket: null,
    room: null,
    playerToken: getToken(),
    connected: false,
    busy: false,
    selectedTeam: new Set(),
    selectedTurnRacerId: null,
    selectedTurnAction: "roll",
    turnSignature: "",
    logExpanded: false,
    latestRoll: null,
  };

  const els = {
    roomForm: document.querySelector("#roomForm"),
    createRoomButton: document.querySelector("#createRoomButton"),
    playerName: document.querySelector("#playerName"),
    connectionDot: document.querySelector("#connectionDot"),
    roomLabel: document.querySelector("#roomLabel"),
    doubleVariant: document.querySelector("#doubleVariant"),
    doubleVariantLabel: document.querySelector("#doubleVariantLabel"),
    shareBlock: document.querySelector("#shareBlock"),
    shareUrl: document.querySelector("#shareUrl"),
    copyShareButton: document.querySelector("#copyShareButton"),
    mainGameButton: document.querySelector("#mainGameButton"),
    phaseLabel: document.querySelector("#phaseLabel"),
    phaseTitle: document.querySelector("#phaseTitle"),
    phaseDetail: document.querySelector("#phaseDetail"),
    playersList: document.querySelector("#playersList"),
    draftPanel: document.querySelector("#draftPanel"),
    trackBoard: document.querySelector("#trackBoard"),
    actionTitle: document.querySelector("#actionTitle"),
    actionPanel: document.querySelector("#actionPanel"),
    powersPanel: document.querySelector("#powersPanel"),
    raceLog: document.querySelector("#raceLog"),
    noticeLine: document.querySelector("#noticeLine"),
  };

  boot();

  function boot() {
    els.playerName.value = localStorage.getItem(NAME_KEY) || `Player ${state.playerToken.slice(0, 4)}`;
    const params = new URLSearchParams(window.location.search);
    const roomParam = cleanRoomCode(params.get("room") || "");

    els.roomForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createRoom();
    });
    els.copyShareButton.addEventListener("click", copyShareUrl);
    els.playerName.addEventListener("change", updatePlayer);
    els.mainGameButton.addEventListener("click", () => {
      const room = state.room;
      if (!room) return;
      if (room.status === "waiting") {
        send({ type: "start_game", doubleRacerVariant: els.doubleVariant.checked });
      } else if (room.phase === "between_race") {
        send({ type: "continue" });
      } else {
        send({ type: "reset_game" });
      }
    });

    render();
    if (roomParam) joinRoom(roomParam);
  }

  function getToken() {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    const token = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  function cleanRoomCode(value) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }

  function playerPayload() {
    const name = els.playerName.value.trim().slice(0, 24) || "Player";
    localStorage.setItem(NAME_KEY, name);
    return { playerToken: state.playerToken, name };
  }

  async function createRoom() {
    setBusy(true);
    setNotice("Creating room.");
    try {
      const response = await fetch("/api/magical-athlete/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playerPayload()),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Room could not be created.");
      const shareUrl = setUrlRoom(payload.roomCode, payload.shareUrl);
      await connect(payload.roomCode);
      setShareUrl(shareUrl);
      setNotice("Room ready.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(roomCode) {
    setBusy(true);
    setNotice("Opening room.");
    try {
      const response = await fetch(`/api/magical-athlete/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playerPayload()),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Room could not be joined.");
      const shareUrl = setUrlRoom(payload.roomCode, payload.shareUrl);
      await connect(payload.roomCode);
      setShareUrl(shareUrl);
      setNotice("Joined room.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  function connect(roomCode) {
    if (state.socket) state.socket.close(1000, "reconnect");
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/magical-athlete/rooms/${roomCode}/socket?playerToken=${encodeURIComponent(
          state.playerToken,
        )}`,
      );
      let opened = false;
      state.socket = socket;
      state.connected = false;
      render();

      socket.addEventListener("open", () => {
        opened = true;
        state.connected = true;
        setNotice("Connected.");
        render();
        resolve();
      });
      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "state") {
          captureLatestRoll(payload.room);
          state.room = payload.room;
          trimSelections();
          trimTurnControls();
          render();
        }
        if (payload.type === "error") setNotice(payload.error || "Action failed.");
      });
      socket.addEventListener("close", () => {
        state.connected = false;
        if (state.socket === socket) setNotice(opened ? "Disconnected." : "Connection failed.");
        render();
      });
      socket.addEventListener("error", () => {
        if (!opened) reject(new Error("WebSocket connection failed."));
      });
    });
  }

  function setUrlRoom(roomCode, fallbackUrl) {
    const shareUrl = fallbackUrl || roomUrl(roomCode);
    history.replaceState(null, "", shareUrl);
    return shareUrl;
  }

  function roomUrl(roomCode) {
    const url = new URL("/magical-athlete/", window.location.origin);
    url.searchParams.set("room", roomCode);
    return url.toString();
  }

  function setShareUrl(value) {
    els.shareUrl.value = value || "";
    els.shareBlock.hidden = !value;
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(els.shareUrl.value);
      setNotice("Link copied.");
    } catch {
      els.shareUrl.select();
      setNotice("Copy the selected link.");
    }
  }

  function updatePlayer() {
    playerPayload();
    if (state.room) send({ type: "set_player", name: els.playerName.value });
  }

  function send(action) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      setNotice("Connect to a room first.");
      return;
    }
    state.socket.send(JSON.stringify(action));
  }

  function setBusy(value) {
    state.busy = value;
    els.createRoomButton.disabled = value || Boolean(state.room);
  }

  function setNotice(value) {
    els.noticeLine.textContent = value;
  }

  function render() {
    document.body.classList.toggle("is-racing-focus", state.room?.phase === "racing");
    renderHeader();
    renderPhase();
    renderPlayers();
    renderDraftOrBoard();
    renderAction();
    renderPowers();
    renderLog();
    if (state.latestRoll) state.latestRoll.fresh = false;
  }

  function renderHeader() {
    const room = state.room;
    els.connectionDot.classList.toggle("online", state.connected);
    els.roomLabel.textContent = room ? room.roomCode : "No room";
    els.createRoomButton.disabled = state.busy || Boolean(room);
    els.doubleVariantLabel.hidden = Boolean(room && room.status !== "waiting");

    if (!room) {
      els.mainGameButton.disabled = true;
      els.mainGameButton.textContent = "Start";
      return;
    }

    els.mainGameButton.disabled =
      !room.isHost ||
      (room.status === "waiting" && room.players.length < room.minPlayers) ||
      (room.phase !== "between_race" && room.status !== "waiting" && room.status !== "finished");
    els.mainGameButton.textContent =
      room.status === "waiting" ? "Start" : room.phase === "between_race" ? "Next race" : "Reset";
  }

  function renderPhase() {
    const room = state.room;
    if (!room) {
      setPhase("Room", "Magical Athlete", "Create a room, draft racers, then run four ridiculous races.");
      return;
    }
    if (room.phase === "waiting") {
      setPhase("Lobby", `${room.players.length}/${room.maxPlayers} racers`, "Host starts when everyone has joined.");
      return;
    }
    if (room.phase === "drafting") {
      setPhase("Draft", playerName(room.currentTurnToken), "Pick from the face-up racers.");
      return;
    }
    if (room.phase === "selecting") {
      setPhase(`Race ${room.raceNumber}`, "Choose racers", `${trackName(room.track)} is next.`);
      return;
    }
    if (room.phase === "before_race") {
      setPhase(`Race ${room.raceNumber}`, "Before race", `${playerName(room.currentTurnToken)} has a setup choice.`);
      return;
    }
    if (room.phase === "racing") {
      setPhase(`Race ${room.raceNumber}`, playerName(room.currentTurnToken), `${trackName(room.track)}: roll, move, resolve powers.`);
      return;
    }
    if (room.phase === "between_race") {
      setPhase(`Race ${room.raceNumber}`, "Trophies awarded", "Host can set up the next race.");
      return;
    }
    setPhase("Final", winnerText(room), "No tiebreaker. Shared wins stay shared.");
  }

  function setPhase(label, title, detail) {
    els.phaseLabel.textContent = label;
    els.phaseTitle.textContent = title;
    els.phaseDetail.textContent = detail;
  }

  function renderPlayers() {
    const room = state.room;
    if (!room) {
      els.playersList.innerHTML = `<p class="empty">No racers yet.</p>`;
      return;
    }
    els.playersList.replaceChildren(
      ...room.players.map((player) => {
        const card = document.createElement("article");
        card.className = "player-card";
        if (player.token === room.currentTurnToken) card.classList.add("active");
        const team = (player.team || []).map((entry) => entry.racerId || entry).filter(Boolean);
        card.innerHTML = `
          <div class="player-row">
            <strong>${escapeHtml(player.name)}</strong>
            <span>${player.score} pts</span>
          </div>
          <div class="chip-row">${(player.chips || []).map(renderChip).join("") || "<span class='tiny'>No chips</span>"}</div>
          <div class="mini-team">${team.map((id) => `<span>${escapeHtml(racerName(id))}</span>`).join("")}</div>
        `;
        return card;
      }),
    );
  }

  function renderDraftOrBoard() {
    const room = state.room;
    if (!room || room.phase === "waiting") {
      els.draftPanel.innerHTML = `<div class="poster-card"><p class="label">Ready</p><h2>Draft a strange team.</h2><p>Racer cards will appear here after the host starts.</p></div>`;
      els.trackBoard.innerHTML = "";
      return;
    }

    if (room.phase === "drafting") {
      const canPick = room.currentTurnToken === state.playerToken;
      els.draftPanel.replaceChildren(
        ...room.draft.visible.map((racer) => racerCard(racer, canPick, () => send({ type: "draft_racer", racerId: racer.id }))),
      );
      els.trackBoard.innerHTML = "";
      return;
    }

    els.draftPanel.innerHTML = "";
    renderTrack();
  }

  function racerCard(racer, enabled, onClick) {
    const button = document.createElement("button");
    button.className = "racer-card";
    button.type = "button";
    button.disabled = !enabled;
    button.innerHTML = `<strong>${escapeHtml(racer.name)}</strong><span>${escapeHtml(racer.summary)}</span>`;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderTrack() {
    const room = state.room;
    const race = room.race;
    if (!race) {
      els.trackBoard.innerHTML = `<div class="poster-card"><p class="label">Team</p><h2>Pick your racer.</h2></div>`;
      return;
    }

    const previousRects = tokenRects();
    const board = document.createElement("div");
    board.className = "track-surface";
    board.dataset.track = room.track;
    board.setAttribute("aria-label", `${trackName(room.track)} race track`);

    const infield = document.createElement("div");
    infield.className = "track-infield";
    infield.innerHTML = `
      <div>
        <p class="label">${room.track === "wild" ? "Wild Wilds" : "Mild Mile"}</p>
        <h3>Race ${room.raceNumber}</h3>
      </div>
      ${renderDieBlock()}
      <div class="podium-rail" aria-label="Race podium">
        <span><strong>1st</strong> Gold</span>
        <span><strong>2nd</strong> Silver</span>
      </div>
    `;
    board.append(infield);

    for (let position = 0; position <= race.finish; position += 1) {
      const cell = document.createElement("div");
      cell.className = "track-space";
      cell.dataset.space = String(position);
      if (position === 0) cell.classList.add("start");
      if (position === race.finish) cell.classList.add("finish");
      const coord = TRACK_COORDS[position] || TRACK_COORDS.at(-1);
      cell.style.gridColumn = String(coord.column);
      cell.style.gridRow = String(coord.row);
      const wild = room.wildSpaces?.[position];
      if (room.track === "wild" && wild) {
        cell.classList.add("wild", `wild-${wild.type}`);
      }
      const racers = race.racers.filter((racer) => racer.position === position);
      cell.innerHTML = `
        <span class="space-num">${position === 0 ? "Start" : position === race.finish ? "Finish" : position}</span>
        ${wildSpaceMark(room.track, wild)}
        <div class="token-stack">${racers.map(renderToken).join("")}</div>
      `;
      board.append(cell);
    }
    els.trackBoard.replaceChildren(board);
    animateTokenMoves(previousRects);
  }

  function renderAction() {
    const room = state.room;
    if (!room) {
      els.actionTitle.textContent = "Waiting";
      els.actionPanel.innerHTML = `<p class="empty">Create or join a room.</p>`;
      return;
    }

    if (room.phase === "waiting") {
      els.actionTitle.textContent = "Lobby";
      els.actionPanel.innerHTML = `<p class="empty">Invite 2-6 players. Two-player games use the official double-racer rules; with 3 players, the checkbox enables that variant.</p>`;
      return;
    }
    if (room.phase === "drafting") return renderDraftAction(room);
    if (room.phase === "selecting") return renderSelectionAction(room);
    if (room.phase === "before_race") return renderBeforeRaceAction(room);
    if (room.phase === "racing") return renderRacingAction(room);
    if (room.phase === "between_race") {
      els.actionTitle.textContent = "Race complete";
      els.actionPanel.innerHTML = room.isHost ? `<p class="empty">Use Next race in the top bar.</p>` : `<p class="empty">Waiting for host.</p>`;
      return;
    }
    els.actionTitle.textContent = "Winner";
    els.actionPanel.innerHTML = `<div class="podium">${winnerText(room)}</div>`;
  }

  function renderDraftAction(room) {
    els.actionTitle.textContent = room.currentTurnToken === state.playerToken ? "Pick a racer" : "Drafting";
    els.actionPanel.innerHTML = `<p class="empty">${room.currentTurnToken === state.playerToken ? "Choose one face-up card." : `${playerName(room.currentTurnToken)} is choosing.`}</p>`;
  }

  function renderSelectionAction(room) {
    els.actionTitle.textContent = "Choose racers";
    const you = room.you;
    const unused = (you?.team || []).map((entry) => entry.racerId || entry).filter((id) => !you.usedRacers.includes(id));
    const locked = you?.selectedRacers?.length === room.racersPerRace;
    const wrapper = document.createElement("div");
    wrapper.className = "choice-stack";
    wrapper.append(
      textBlock(locked ? "Locked in." : `Pick ${room.racersPerRace} racer${room.racersPerRace === 1 ? "" : "s"} for this race.`),
    );
    for (const racerId of unused) {
      const label = document.createElement("label");
      label.className = "select-card";
      label.innerHTML = `<input type="checkbox" value="${racerId}" ${state.selectedTeam.has(racerId) ? "checked" : ""} ${locked ? "disabled" : ""}><span><strong>${escapeHtml(racerName(racerId))}</strong><small>${escapeHtml(racerSummary(racerId))}</small></span>`;
      label.querySelector("input").addEventListener("change", (event) => {
        if (event.target.checked) state.selectedTeam.add(racerId);
        else state.selectedTeam.delete(racerId);
        trimSelections();
        renderAction();
      });
      wrapper.append(label);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = locked || state.selectedTeam.size !== room.racersPerRace;
    button.textContent = "Reveal racers";
    button.addEventListener("click", () => send({ type: "select_racers", racerIds: [...state.selectedTeam] }));
    wrapper.append(button);
    els.actionPanel.replaceChildren(wrapper);
  }

  function renderBeforeRaceAction(room) {
    const racer = room.race.racers.find((item) => item.instanceId === room.currentTurnRacerId);
    els.actionTitle.textContent = racer ? racerName(racer.racerId) : "Before race";
    if (!racer || room.currentTurnToken !== state.playerToken) {
      els.actionPanel.innerHTML = `<p class="empty">Waiting for ${playerName(room.currentTurnToken)}.</p>`;
      return;
    }

    if (racer.racerId === "egg") {
      els.actionPanel.replaceChildren(optionButtons("Choose Egg's copied power.", racer.eggOptions, (copyRacerId) => {
        send({ type: "choose_egg_power", racerId: racer.instanceId, copyRacerId });
      }));
      return;
    }

    if (racer.racerId === "twin") {
      const options = room.players.flatMap((player) => player.chips || []).filter((chip) => chip.kind === "gold").map((chip) => chip.racerId);
      const box = optionButtons("Choose Twin's copied winner, or skip.", [...new Set(options)], (copyRacerId) => {
        send({ type: "choose_twin_power", racerId: racer.instanceId, copyRacerId });
      });
      const skip = document.createElement("button");
      skip.type = "button";
      skip.textContent = "Skip";
      skip.addEventListener("click", () => send({ type: "choose_twin_power", racerId: racer.instanceId, copyRacerId: null }));
      box.append(skip);
      els.actionPanel.replaceChildren(box);
    }
  }

  function renderRacingAction(room) {
    const canAct = room.currentTurnToken === state.playerToken;
    els.actionTitle.textContent = canAct ? "Your move" : `${playerName(room.currentTurnToken)} moves`;
    if (!canAct) {
      els.actionPanel.innerHTML = `<div class="watch-panel">${renderDieBlock()}<p class="empty">${playerName(room.currentTurnToken)} is up.</p></div>`;
      return;
    }

    const active = room.race.racers.filter(
      (racer) => racer.ownerToken === state.playerToken && !racer.finished && !racer.eliminated && !racer.actedThisPlayerTurn,
    );
    if (!active.length) {
      els.actionPanel.innerHTML = `<p class="empty">Your remaining racers have acted.</p>`;
      return;
    }

    ensureTurnSelection(room, active);
    const selected = active.find((racer) => racer.instanceId === state.selectedTurnRacerId) || active[0];
    const wrapper = document.createElement("div");
    wrapper.className = "turn-stack";
    wrapper.append(renderDieNode());

    if (active.length > 1) {
      const racerPicker = document.createElement("div");
      racerPicker.className = "racer-picker";
      for (const racer of active) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "racer-pick";
        button.classList.toggle("selected", racer.instanceId === selected.instanceId);
        button.innerHTML = `<strong>${escapeHtml(racerName(racer.racerId))}</strong><span>${escapeHtml(powerBadge(racer))}</span>`;
        button.addEventListener("click", () => {
          state.selectedTurnRacerId = racer.instanceId;
          state.selectedTurnAction = "roll";
          renderAction();
        });
        racerPicker.append(button);
      }
      wrapper.append(racerPicker);
    } else {
      wrapper.append(summaryCard(selected));
    }

    const actions = legalTurnActions(selected);
    if (!actions.some((action) => action.mode === state.selectedTurnAction)) state.selectedTurnAction = "roll";
    if (actions.length > 1) {
      const actionRail = document.createElement("div");
      actionRail.className = "action-rail";
      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mode-button";
        button.classList.toggle("selected", action.mode === state.selectedTurnAction);
        button.textContent = action.label;
        button.addEventListener("click", () => {
          state.selectedTurnAction = action.mode;
          renderAction();
        });
        actionRail.append(button);
      }
      wrapper.append(actionRail);
    }
    wrapper.append(actionDetail(room, selected, state.selectedTurnAction));
    els.actionPanel.replaceChildren(wrapper);
  }

  function ensureTurnSelection(room, active) {
    const signature = [
      room.phase,
      room.raceNumber,
      room.currentTurnToken,
      active.map((racer) => `${racer.instanceId}:${racer.actedThisPlayerTurn ? 1 : 0}`).join(","),
    ].join("|");
    if (state.turnSignature !== signature) {
      state.turnSignature = signature;
      state.selectedTurnRacerId = active[0]?.instanceId || null;
      state.selectedTurnAction = "roll";
      return;
    }
    if (!active.some((racer) => racer.instanceId === state.selectedTurnRacerId)) {
      state.selectedTurnRacerId = active[0]?.instanceId || null;
      state.selectedTurnAction = "roll";
    }
  }

  function legalTurnActions(racer) {
    const actions = [{ mode: "roll", label: racer.tripped ? "Recover" : "Main move" }];
    if (hasPower(racer, "legs")) actions.push({ mode: "legs", label: "Legs" });
    if (hasPower(racer, "cheerleader")) actions.push({ mode: "cheerleader", label: "Cheer" });
    if (hasPower(racer, "flip-flop")) actions.push({ mode: "flip-flop", label: "Flip Flop" });
    if (hasPower(racer, "hypnotist")) actions.push({ mode: "hypnotist", label: "Hypnotize" });
    if (hasPower(racer, "third-wheel")) actions.push({ mode: "third-wheel", label: "Third Wheel" });
    return actions;
  }

  function actionDetail(room, racer, mode) {
    if (mode === "roll") return rollActionDetail(room, racer);
    if (mode === "legs") return instantActionDetail(racer, "legs", "Move 5 instead of rolling.");
    if (mode === "cheerleader") return instantActionDetail(racer, "cheerleader", "Move last-place racers, then roll.");
    if (mode === "flip-flop") return targetRacerActionDetail(room, racer, "flip-flop", "Swap with another racer.");
    if (mode === "hypnotist") return targetRacerActionDetail(room, racer, "hypnotist", "Warp a racer to your space, then roll.");
    if (mode === "third-wheel") return targetSpaceActionDetail(room, racer);
    return rollActionDetail(room, racer);
  }

  function rollActionDetail(room, racer) {
    const form = document.createElement("form");
    form.className = "action-detail-card roll-detail";
    const rerollLimit = rerollLimitFor(room, racer);
    form.innerHTML = `
      ${mastermindPicker(room, racer)}
      ${hasPower(racer, "genius") ? `<label><span>Genius prediction</span><input name="predictedRoll" type="number" min="1" max="6" placeholder="1-6"></label>` : ""}
      ${rerollLimit ? rerollPicker(rerollLimit) : ""}
      ${hasPower(racer, "alchemist") ? `<label class="toggle-line object-toggle"><input name="useAlchemist" type="checkbox" checked><span>Use Alchemist on 1-2</span></label>` : ""}
      ${hasPower(racer, "rocket-scientist") ? `<label class="toggle-line object-toggle"><input name="useDouble" type="checkbox"><span>Double with Rocket</span></label>` : ""}
      <button type="submit" class="primary-action">${racer.tripped ? "Stand back up" : "Roll die"}</button>
    `;
    form.addEventListener("click", (event) => {
      const button = event.target.closest("[data-rerolls]");
      if (!button) return;
      const input = form.querySelector("input[name='rerolls']");
      input.value = button.dataset.rerolls;
      for (const item of form.querySelectorAll("[data-rerolls]")) item.classList.toggle("selected", item === button);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        type: "take_turn",
        racerId: racer.instanceId,
        mode: "roll",
        predictedWinnerId: data.get("predictedWinnerId") || null,
        predictedRoll: Number(data.get("predictedRoll")) || null,
        rerolls: Number(data.get("rerolls")) || 0,
        useDouble: Boolean(data.get("useDouble")),
      };
      if (form.elements.useAlchemist) payload.useAlchemist = Boolean(data.get("useAlchemist"));
      send(payload);
    });
    return form;
  }

  function instantActionDetail(racer, mode, detail) {
    const wrapper = document.createElement("div");
    wrapper.className = "action-detail-card";
    wrapper.innerHTML = `<p class="empty">${escapeHtml(detail)}</p>`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-action";
    button.textContent = mode === "legs" ? "Use Legs" : "Cheer then roll";
    button.addEventListener("click", () => send({ type: "take_turn", racerId: racer.instanceId, mode }));
    wrapper.append(button);
    return wrapper;
  }

  function targetRacerActionDetail(room, racer, mode, detail) {
    const wrapper = document.createElement("div");
    wrapper.className = "action-detail-card";
    wrapper.append(textBlock(detail));
    const targets = room.race.racers.filter((item) => item.instanceId !== racer.instanceId && !item.finished && !item.eliminated);
    const picker = document.createElement("div");
    picker.className = "target-grid";
    for (const target of targets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "target-button";
      button.innerHTML = `<strong>${escapeHtml(racerName(target.racerId))}</strong><span>${escapeHtml(playerName(target.ownerToken))}</span>`;
      button.addEventListener("click", () => send({ type: "take_turn", racerId: racer.instanceId, mode, targetRacerId: target.instanceId }));
      picker.append(button);
    }
    wrapper.append(picker.children.length ? picker : textBlock("No legal targets."));
    return wrapper;
  }

  function targetSpaceActionDetail(room, racer) {
    const wrapper = document.createElement("div");
    wrapper.className = "action-detail-card";
    wrapper.append(textBlock("Warp to a space with exactly two racers, then roll."));
    const counts = new Map();
    for (const item of room.race.racers.filter((entry) => !entry.finished && !entry.eliminated)) {
      counts.set(item.position, (counts.get(item.position) || 0) + 1);
    }
    const spaces = [...counts.entries()].filter(([, count]) => count === 2).map(([position]) => position).sort((a, b) => a - b);
    const picker = document.createElement("div");
    picker.className = "target-grid space-targets";
    for (const position of spaces) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "target-button";
      button.innerHTML = `<strong>${position === 0 ? "Start" : position}</strong><span>2 racers</span>`;
      button.addEventListener("click", () => send({ type: "take_turn", racerId: racer.instanceId, mode: "third-wheel", targetPosition: position }));
      picker.append(button);
    }
    wrapper.append(picker.children.length ? picker : textBlock("No space currently has exactly two racers."));
    return wrapper;
  }

  function mastermindPicker(room, racer) {
    if (!hasPower(racer, "mastermind") || racer.turnsTaken > 0) return "";
    const options = room.race.racers
      .filter((item) => !item.finished && !item.eliminated)
      .map((item) => `<option value="${escapeHtml(item.instanceId)}">${escapeHtml(racerName(item.racerId))} - ${escapeHtml(playerName(item.ownerToken))}</option>`)
      .join("");
    return `<label><span>Mastermind prediction</span><select name="predictedWinnerId" required>${options}</select></label>`;
  }

  function rerollLimitFor(room, racer) {
    if (hasPower(racer, "magician")) return 2;
    return room.race?.racers?.some((item) => !item.finished && !item.eliminated && hasPower(item, "dicemonger")) ? 1 : 0;
  }

  function rerollPicker(limit) {
    const buttons = Array.from({ length: limit + 1 }, (_, value) => {
      const selected = value === 0 ? " selected" : "";
      return `<button type="button" class="reroll-choice${selected}" data-rerolls="${value}">${value}</button>`;
    }).join("");
    return `<div class="reroll-panel"><span>Rerolls</span><input name="rerolls" type="hidden" value="0"><div class="reroll-choices">${buttons}</div></div>`;
  }

  function summaryCard(racer) {
    const card = document.createElement("div");
    card.className = "selected-racer-card";
    card.innerHTML = `<strong>${escapeHtml(racerName(racer.racerId))}</strong><span>${escapeHtml(powerBadge(racer))}</span>`;
    return card;
  }

  function optionButtons(copy, ids, onPick) {
    const wrapper = document.createElement("div");
    wrapper.className = "choice-stack";
    wrapper.append(textBlock(copy));
    for (const id of ids) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "racer-option";
      button.innerHTML = `<strong>${escapeHtml(racerName(id))}</strong><span>${escapeHtml(racerSummary(id))}</span>`;
      button.addEventListener("click", () => onPick(id));
      wrapper.append(button);
    }
    return wrapper;
  }

  function textBlock(text) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = text;
    return p;
  }

  function renderPowers() {
    const room = state.room;
    if (!room) {
      els.powersPanel.innerHTML = "";
      return;
    }

    const box = document.createElement("section");
    box.className = "power-reference";
    const title = document.createElement("div");
    title.className = "power-reference-title";
    title.innerHTML = `<p class="label">Powers</p><h3>${room.phase === "racing" || room.phase === "before_race" ? "Current race" : "Your team"}</h3>`;
    box.append(title);

    const ids = relevantPowerIds(room);
    if (!ids.length) {
      box.append(textBlock(room.phase === "waiting" ? "Powers appear after the draft starts." : "No racers to show yet."));
      els.powersPanel.replaceChildren(box);
      return;
    }

    const list = document.createElement("div");
    list.className = "power-list";
    for (const entry of ids) {
      const item = document.createElement("article");
      item.className = "power-item";
      const copied = entry.effectiveRacerId && entry.effectiveRacerId !== entry.racerId;
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(racerName(entry.racerId))}${copied ? ` -> ${escapeHtml(racerName(entry.effectiveRacerId))}` : ""}</strong>
          <span>${escapeHtml(entry.ownerName || "")}${entry.positionLabel ? ` · ${escapeHtml(entry.positionLabel)}` : ""}</span>
        </div>
        <p>${escapeHtml(racerSummary(entry.effectiveRacerId || entry.racerId))}</p>
      `;
      list.append(item);
    }
    box.append(list);
    els.powersPanel.replaceChildren(box);
  }

  function relevantPowerIds(room) {
    if (room.race?.racers?.length && ["before_race", "racing", "between_race", "finished"].includes(room.phase)) {
      return room.race.racers.map((racer) => ({
        racerId: racer.racerId,
        effectiveRacerId: racer.effectiveRacerId,
        ownerName: playerName(racer.ownerToken),
        positionLabel: racer.finished ? "finished" : racer.eliminated ? "out" : racer.position === 0 ? "Start" : `Space ${racer.position}`,
      }));
    }

    const team = (room.you?.team || []).map((entry) => entry.racerId || entry);
    return team.map((racerId) => ({
      racerId,
      effectiveRacerId: racerId,
      ownerName: room.you?.name || "",
      positionLabel: room.you?.usedRacers?.includes(racerId) ? "used" : "",
    }));
  }

  function renderLog() {
    const room = state.room;
    const items = room?.history?.length ? room.history : ["Create or join."];
    const compact = room?.phase === "racing" && !state.logExpanded;
    const visibleItems = items.slice(0, compact ? 5 : 18);
    const nodes = visibleItems.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    });
    if (room?.phase === "racing" && items.length > 5) {
      const li = document.createElement("li");
      li.className = "log-toggle-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "log-toggle";
      button.textContent = state.logExpanded ? "Show less" : "Show history";
      button.addEventListener("click", () => {
        state.logExpanded = !state.logExpanded;
        renderLog();
      });
      li.append(button);
      nodes.push(li);
    }
    els.raceLog.replaceChildren(...nodes);
  }

  function trimSelections() {
    const room = state.room;
    if (!room?.you) return;
    const legal = new Set((room.you.team || []).map((entry) => entry.racerId || entry).filter((id) => !room.you.usedRacers.includes(id)));
    for (const id of [...state.selectedTeam]) {
      if (!legal.has(id)) state.selectedTeam.delete(id);
    }
    while (state.selectedTeam.size > room.racersPerRace) state.selectedTeam.delete([...state.selectedTeam].at(-1));
  }

  function trimTurnControls() {
    const room = state.room;
    if (room?.phase !== "racing") {
      state.turnSignature = "";
      state.selectedTurnRacerId = null;
      state.selectedTurnAction = "roll";
      return;
    }
    const active = room.race?.racers?.filter(
      (racer) => racer.ownerToken === state.playerToken && !racer.finished && !racer.eliminated && !racer.actedThisPlayerTurn,
    ) || [];
    if (!active.length) return;
    ensureTurnSelection(room, active);
  }

  function captureLatestRoll(nextRoom) {
    const previous = new Map((state.room?.race?.racers || []).map((racer) => [racer.instanceId, racer.lastRoll || null]));
    for (const racer of nextRoom?.race?.racers || []) {
      const roll = racer.lastRoll || null;
      if (roll && previous.get(racer.instanceId) !== roll) {
        state.latestRoll = {
          instanceId: racer.instanceId,
          racerId: racer.racerId,
          ownerToken: racer.ownerToken,
          roll,
          key: `${racer.instanceId}-${roll}-${Date.now()}`,
          fresh: true,
        };
      }
    }
  }

  function renderToken(racer) {
    const owner = state.room.players.find((player) => player.token === racer.ownerToken);
    const ownerIndex = Math.max(0, state.room.players.findIndex((player) => player.token === racer.ownerToken));
    const [tokenColor, tokenAccent] = PLAYER_COLORS[ownerIndex % PLAYER_COLORS.length];
    const name = racerName(racer.racerId);
    const ownerName = owner?.name || "Player";
    return `<span class="racer-token ${racer.tripped ? "tripped" : ""}" data-racer-instance-id="${escapeHtml(
      racer.instanceId,
    )}" title="${escapeHtml(`${name} - ${ownerName}`)}" aria-label="${escapeHtml(`${name}, ${ownerName}`)}" style="--token-color: ${tokenColor}; --token-accent: ${tokenAccent};">
      <span class="meeple-body" aria-hidden="true"></span>
      <span class="token-initials">${escapeHtml(initials(ownerName))}</span>
      <span class="token-name">${escapeHtml(shortRacerName(name))}</span>
    </span>`;
  }

  function wildSpaceMark(track, wild) {
    if (track !== "wild" || !wild) return "";
    if (wild.type === "star") return `<span class="space-mark star">STAR +${wild.points || 1}</span>`;
    if (wild.type === "trip") return `<span class="space-mark trip">TRIP</span>`;
    if (wild.type === "arrow") {
      const amount = Number(wild.amount) || 0;
      return `<span class="space-mark arrow">${amount >= 0 ? ">>" : "<<"} ${Math.abs(amount)}</span>`;
    }
    return "";
  }

  function renderDieBlock() {
    const latest = latestRoll();
    const roll = latest?.roll || null;
    const label = latest ? `${racerName(latest.racerId)} rolled ${roll}` : "No roll yet";
    return `<div class="die-panel ${latest?.fresh ? "is-new" : ""}" data-roll-key="${escapeHtml(latest?.key || "none")}">
      <span class="die-label">${escapeHtml(label)}</span>
      <span class="die-face" data-roll="${roll || 0}" aria-label="${escapeHtml(label)}">${diePips(roll)}</span>
    </div>`;
  }

  function renderDieNode() {
    const template = document.createElement("template");
    template.innerHTML = renderDieBlock();
    return template.content.firstElementChild;
  }

  function latestRoll() {
    const racers = state.room?.race?.racers || [];
    if (state.latestRoll && racers.some((racer) => racer.instanceId === state.latestRoll.instanceId && racer.lastRoll === state.latestRoll.roll)) {
      return state.latestRoll;
    }
    const selected = racers.find((racer) => racer.instanceId === state.selectedTurnRacerId && racer.lastRoll);
    const fallback = selected || racers.find((racer) => racer.lastRoll);
    return fallback
      ? {
          instanceId: fallback.instanceId,
          racerId: fallback.racerId,
          ownerToken: fallback.ownerToken,
          roll: fallback.lastRoll,
          key: `${fallback.instanceId}-${fallback.lastRoll}`,
          fresh: false,
        }
      : null;
  }

  function diePips(roll) {
    const value = Number(roll);
    if (!value) return "<span></span>";
    return Array.from({ length: value }, () => "<i></i>").join("");
  }

  function hasPower(racer, powerId) {
    return racer?.effectiveRacerId === powerId;
  }

  function powerBadge(racer) {
    const name = racerName(racer.effectiveRacerId || racer.racerId);
    if (racer.tripped) return `${name} - tripped`;
    if (racer.copiedRacerId) return `${name} copy`;
    return name;
  }

  function tokenRects() {
    const rects = new Map();
    for (const token of els.trackBoard.querySelectorAll("[data-racer-instance-id]")) {
      rects.set(token.dataset.racerInstanceId, token.getBoundingClientRect());
    }
    return rects;
  }

  function animateTokenMoves(previousRects) {
    if (!previousRects.size || MOTION_QUERY?.matches || !Element.prototype.animate) return;
    for (const token of els.trackBoard.querySelectorAll("[data-racer-instance-id]")) {
      const previous = previousRects.get(token.dataset.racerInstanceId);
      if (!previous) continue;
      const current = token.getBoundingClientRect();
      const dx = previous.left - current.left;
      const dy = previous.top - current.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      token.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.96)`, zIndex: "5" },
          { transform: "translate(0, 0) scale(1.05)", zIndex: "5", offset: 0.82 },
          { transform: "translate(0, 0) scale(1)", zIndex: "1" },
        ],
        {
          duration: 560,
          easing: "cubic-bezier(0.2, 0.82, 0.22, 1)",
        },
      );
    }
  }

  function renderChip(chip) {
    return `<span class="chip ${chip.kind}">${chip.points}</span>`;
  }

  function racerName(id) {
    return state.room?.racers?.find((racer) => racer.id === id)?.name || id;
  }

  function racerSummary(id) {
    return state.room?.racers?.find((racer) => racer.id === id)?.summary || "";
  }

  function playerName(token) {
    return state.room?.players?.find((player) => player.token === token)?.name || "Player";
  }

  function trackName(track) {
    return track === "wild" ? "Wild Wilds" : "Mild Mile";
  }

  function winnerText(room) {
    return (room.winners || []).map((winner) => `${winner.name} (${winner.score})`).join(" + ") || "No winner";
  }

  function initials(name) {
    return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }

  function shortRacerName(name) {
    return name.replace(/^Loveable\s+/, "").replace(/^Rocket\s+/, "Rocket ").split(/\s+/)[0].slice(0, 9);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }
})();
