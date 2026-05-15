(() => {
  const TOKEN_KEY = "no-thanks-player-token";
  const NAME_KEY = "no-thanks-player-name";

  const state = {
    socket: null,
    room: null,
    playerToken: getToken(),
    connected: false,
    busy: false,
    notice: "Create a room or open a shared link.",
  };

  const els = {
    roomForm: document.querySelector("#roomForm"),
    createRoomButton: document.querySelector("#createRoomButton"),
    playerName: document.querySelector("#playerName"),
    shareBlock: document.querySelector("#shareBlock"),
    shareUrl: document.querySelector("#shareUrl"),
    copyShareButton: document.querySelector("#copyShareButton"),
    connectionLabel: document.querySelector("#connectionLabel"),
    roomLabel: document.querySelector("#roomLabel"),
    newGameButton: document.querySelector("#newGameButton"),
    phaseEyebrow: document.querySelector("#phaseEyebrow"),
    phaseTitle: document.querySelector("#phaseTitle"),
    phaseCopy: document.querySelector("#phaseCopy"),
    deckBadge: document.querySelector("#deckBadge"),
    currentCard: document.querySelector("#currentCard"),
    counterPile: document.querySelector("#counterPile"),
    actionPanel: document.querySelector("#actionPanel"),
    playersGrid: document.querySelector("#playersGrid"),
    roundLog: document.querySelector("#roundLog"),
    noticeLine: document.querySelector("#noticeLine"),
  };

  boot();

  function boot() {
    els.playerName.value =
      localStorage.getItem(NAME_KEY) || `Player ${state.playerToken.slice(0, 4)}`;

    const params = new URLSearchParams(window.location.search);
    const roomParam = cleanRoomCode(params.get("room") || "");

    els.roomForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createRoom();
    });
    els.copyShareButton.addEventListener("click", copyShareUrl);
    els.playerName.addEventListener("change", updatePlayer);
    els.newGameButton.addEventListener("click", () => {
      send({ type: state.room?.status === "waiting" ? "start_game" : "reset_game" });
    });

    render();

    if (roomParam) {
      joinRoom(roomParam);
    }
  }

  function getToken() {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) return existing;

    const token =
      crypto.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  function cleanRoomCode(value) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }

  function playerPayload() {
    const name = els.playerName.value.trim().slice(0, 24) || "Player";
    localStorage.setItem(NAME_KEY, name);
    return {
      playerToken: state.playerToken,
      name,
    };
  }

  async function createRoom() {
    setBusy(true);
    setStatus("Creating room.");
    try {
      const response = await fetch("/api/no-thanks/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playerPayload()),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Room could not be created.");

      const shareUrl = setUrlRoom(payload.roomCode, payload.shareUrl);
      await connect(payload.roomCode);
      setStatus("Room ready.");
      setShareUrl(shareUrl);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(roomCode) {
    if (!roomCode) {
      setStatus("Open a shared room link.");
      return;
    }

    setBusy(true);
    setStatus("Opening room.");
    try {
      const response = await fetch(`/api/no-thanks/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playerPayload()),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Room could not be joined.");

      const shareUrl = setUrlRoom(payload.roomCode, payload.shareUrl);
      await connect(payload.roomCode);
      setStatus("Joined room.");
      setShareUrl(shareUrl);
    } catch (error) {
      setStatus(error.message);
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
    if (state.socket) {
      state.socket.close(1000, "reconnect");
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/no-thanks/rooms/${roomCode}/socket?playerToken=${encodeURIComponent(
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
        setStatus("Connected.");
        render();
        resolve();
      });

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "state") {
          const previousRoom = state.room;
          state.room = payload.room;
          logRoomChanges(previousRoom, state.room);
          render();
        }
        if (payload.type === "error") {
          setStatus(payload.error || "Action failed.");
        }
      });

      socket.addEventListener("close", () => {
        state.connected = false;
        if (state.socket === socket) {
          setStatus(opened ? "Disconnected." : "Connection failed.");
        }
        render();
      });

      socket.addEventListener("error", () => {
        if (!opened) reject(new Error("WebSocket connection failed."));
      });
    });
  }

  function setUrlRoom(roomCode, fallbackUrl) {
    const shareUrl = getRoomUrl(roomCode, fallbackUrl);
    history.replaceState(null, "", shareUrl);
    setShareUrl(shareUrl);
    return shareUrl;
  }

  function getRoomUrl(roomCode, fallbackUrl) {
    if (fallbackUrl) return fallbackUrl;

    const url = new URL("/no-thanks/", window.location.origin);
    url.searchParams.set("room", roomCode);
    return url.toString();
  }

  function setShareUrl(value) {
    els.shareUrl.value = value || "";
    els.shareBlock.hidden = !value;
    els.copyShareButton.disabled = !value || state.busy;
  }

  async function copyShareUrl() {
    const shareUrl = els.shareUrl.value;
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Link copied.");
    } catch {
      els.shareUrl.select();
      setStatus("Copy the selected link.");
    }
  }

  function updatePlayer() {
    playerPayload();
    if (state.room) {
      send({ type: "set_player", name: els.playerName.value });
    }
  }

  function send(action) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      setStatus("Connect to a room first.");
      return;
    }
    state.socket.send(JSON.stringify(action));
  }

  function render() {
    renderHeader();
    renderStatus();
    renderCurrentCard();
    renderActionPanel();
    renderPlayers();
    renderRoundLog();
    renderNotice();
  }

  function renderHeader() {
    const room = state.room;
    const waiting = room?.status === "waiting";
    const canStart = waiting && room.players.length >= room.minPlayers;

    els.connectionLabel.classList.toggle("is-online", state.connected);
    els.connectionLabel.classList.toggle("is-offline", !state.connected);
    els.roomLabel.textContent = room ? room.roomCode : "No room";
    els.createRoomButton.disabled = Boolean(room) || state.busy;
    els.newGameButton.disabled = !room || !room.isHost || (waiting && !canStart);
    els.newGameButton.textContent = !room || waiting ? "Start" : "Reset";
    setShareUrl(els.shareUrl.value);
  }

  function renderStatus() {
    const room = state.room;
    if (!room) {
      setPhase("Room", "Create a room", "Invite 3-7 players, then start.");
      setDeckBadge("No deck");
      return;
    }

    if (room.status === "waiting") {
      const needed = Math.max(0, room.minPlayers - room.players.length);
      setPhase(
        "Lobby",
        needed ? `${needed} more` : "Ready",
        `${room.players.length}/${room.maxPlayers} players`,
      );
      setDeckBadge("No deck");
      return;
    }

    if (room.status === "finished") {
      setPhase("Finished", winnerText(room), "Host can reset.");
      setDeckBadge("Game over");
      return;
    }

    const current = playerName(room.currentTurnToken);
    setPhase("Turn", current, `${current}: take it or pay one counter.`);
    setDeckBadge(`${room.deckCount} left`);
  }

  function setPhase(eyebrow, title, copy) {
    els.phaseEyebrow.textContent = eyebrow;
    els.phaseTitle.textContent = title;
    els.phaseCopy.textContent = copy;
  }

  function setDeckBadge(text) {
    els.deckBadge.textContent = text;
  }

  function renderCurrentCard() {
    const room = state.room;

    if (!room || room.status === "waiting") {
      els.currentCard.innerHTML = `<span>No card</span>`;
      els.counterPile.innerHTML = `<span class="counter-note">Counters appear after start.</span>`;
      return;
    }

    if (room.status === "finished") {
      els.currentCard.innerHTML = `<span>Done</span>`;
      els.counterPile.innerHTML = `<span class="counter-note">Final scores are below.</span>`;
      return;
    }

    els.currentCard.innerHTML = `<span>${room.currentCard}</span>`;
    els.counterPile.innerHTML = `
      <span class="pile-count">${room.cardCounters}</span>
      <span class="counter-stack">${counterDots(room.cardCounters)}</span>
    `;
  }

  function renderActionPanel() {
    const room = state.room;

    if (!room) {
      els.actionPanel.innerHTML = `<span class="panel-note">Create or join.</span>`;
      return;
    }

    if (room.status === "waiting") {
      els.actionPanel.innerHTML = room.isHost
        ? `<span class="panel-note">Start at ${room.minPlayers} players.</span>`
        : `<span class="panel-note">Waiting for host.</span>`;
      return;
    }

    if (room.status === "finished") {
      els.actionPanel.innerHTML = `<span class="panel-note">${escapeHtml(winnerText(room))}</span>`;
      return;
    }

    if (!isMyTurn()) {
      els.actionPanel.innerHTML = `<span class="panel-note">Waiting for ${escapeHtml(
        playerName(room.currentTurnToken),
      )}.</span>`;
      return;
    }

    const canPass = (room.you?.counters || 0) > 0;
    els.actionPanel.innerHTML = `
      <button type="button" data-take>Take ${escapeHtml(room.currentCard)}</button>
      <button class="secondary" type="button" data-pass ${canPass ? "" : "disabled"}>No Thanks</button>
      <span class="panel-note">${canPass ? `${room.you.counters} counters` : "No counters: take it."}</span>
    `;
    els.actionPanel.querySelector("[data-take]")?.addEventListener("click", () => {
      send({ type: "take_card" });
    });
    els.actionPanel.querySelector("[data-pass]")?.addEventListener("click", () => {
      send({ type: "pass_card" });
    });
  }

  function renderPlayers() {
    const players = state.room?.players || [];
    els.playersGrid.className = `players-grid players-${players.length}`;

    if (!players.length) {
      els.playersGrid.innerHTML = `<p class="empty-players">Create or join a room.</p>`;
      return;
    }

    els.playersGrid.innerHTML = players.map(playerCardHtml).join("");
  }

  function playerCardHtml(player) {
    const classes = [
      "player-card",
      player.token === state.playerToken ? "is-you" : "",
      player.isCurrentTurn ? "is-current" : "",
      player.isWinner ? "is-winner" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const counterText = `${player.counters}`;
    const scoreText =
      state.room?.status === "finished"
        ? `${player.finalScore}`
        : `${player.cardScore}${player.cards.length ? "+" : ""}`;

    return `
      <article class="${classes}">
        <div class="player-top">
          <h2>${escapeHtml(player.name)}</h2>
          <span>${player.connected ? "online" : "away"}</span>
        </div>
        <div class="player-stats">
          <span>Score ${escapeHtml(scoreText)}</span>
          <span>Counters ${escapeHtml(counterText)}</span>
        </div>
        <div class="counter-bank" aria-label="${escapeAttribute(player.name)} counters">
          ${counterDots(player.counters)}
        </div>
        <div class="runs" aria-label="${escapeAttribute(player.name)} cards">
          ${runsHtml(player.runs)}
        </div>
      </article>
    `;
  }

  function runsHtml(runs) {
    if (!runs.length) return `<span class="empty-run">No cards</span>`;

    return runs
      .map(
        (run) => `
          <span class="run">
            ${run.map((card, index) => `<span class="mini-card ${index === 0 ? "counts" : ""}">${card}</span>`).join("")}
          </span>
        `,
      )
      .join("");
  }

  function renderRoundLog() {
    const events = state.room?.history || [];

    if (!events.length) {
      els.roundLog.innerHTML = `<li>${state.room ? "No turns yet." : "Create or join."}</li>`;
      return;
    }

    els.roundLog.innerHTML = events.slice(0, 18).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  }

  function counterDots(count) {
    const visible = Math.min(count, 18);
    const dots = Array.from({ length: visible }, () => `<span class="counter-dot"></span>`).join("");
    return `${dots}${count > visible ? `<span class="counter-more">+${count - visible}</span>` : ""}`;
  }

  function renderNotice() {
    els.noticeLine.textContent = state.notice;
  }

  function isMyTurn() {
    return state.room?.currentTurnToken === state.playerToken;
  }

  function playerName(token) {
    if (!token) return "Waiting";
    return state.room?.players.find((player) => player.token === token)?.name || "Player";
  }

  function winnerText(room) {
    const winners = room.winners || [];
    if (!winners.length) return "Game over";
    if (winners.length === 1) return `${winners[0].name} wins`;
    return `${winners.map((winner) => winner.name).join(", ")} tie`;
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    els.createRoomButton.disabled = isBusy || Boolean(state.room);
    els.copyShareButton.disabled = isBusy || !els.shareUrl.value;
  }

  function setStatus(message) {
    if (!message) return;
    state.notice = message;
    renderNotice();
  }

  function logRoomChanges(previous, next) {
    if (!previous || !next) return;
    if (previous.status !== "finished" && next.status === "finished") {
      setStatus(winnerText(next));
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
