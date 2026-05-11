(() => {
  const TOKEN_KEY = "skull-player-token";
  const NAME_KEY = "skull-player-name";

  const state = {
    socket: null,
    room: null,
    playerToken: getToken(),
    connected: false,
    logEntries: ["Create a room or open a shared link."],
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
    gameControlBlock: document.querySelector("#gameControlBlock"),
    handControls: document.querySelector("#handControls"),
    actionControls: document.querySelector("#actionControls"),
    actionLog: document.querySelector("#actionLog"),
    phaseBadge: document.querySelector("#phaseBadge"),
    bidBadge: document.querySelector("#bidBadge"),
    tableGrid: document.querySelector("#tableGrid"),
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
    if (roomParam) joinRoom(roomParam);
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

  function registrationPayload() {
    const name = els.playerName.value.trim().slice(0, 24) || "Player";
    localStorage.setItem(NAME_KEY, name);
    return { playerToken: state.playerToken, name };
  }

  async function createRoom() {
    setBusy(true);
    setStatus("Creating room.");
    try {
      const response = await fetch("/api/skull/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registrationPayload()),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Room could not be created.");

      const shareUrl = setUrlRoom(payload.roomCode, payload.shareUrl);
      await connect(payload.roomCode);
      setStatus("Room ready. Invite 2 to 5 more players.");
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
    setStatus("Opening shared room.");
    try {
      const response = await fetch(`/api/skull/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registrationPayload()),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Room could not be joined.");

      const shareUrl = setUrlRoom(payload.roomCode, payload.shareUrl);
      await connect(payload.roomCode);
      setStatus("Joined shared room.");
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
    if (state.socket) state.socket.close(1000, "reconnect");

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/skull/rooms/${roomCode}/socket?playerToken=${encodeURIComponent(
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
          state.room = payload.room;
          state.logEntries = payload.room.log?.length ? payload.room.log : state.logEntries;
          syncControlsFromServer();
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
    const url = new URL("/skull/", window.location.origin);
    url.searchParams.set("room", roomCode);
    return url.toString();
  }

  function setShareUrl(value) {
    els.shareUrl.value = value || "";
    els.shareBlock.hidden = !value;
    els.copyShareButton.disabled = !value || els.createRoomButton.disabled;
  }

  async function copyShareUrl() {
    const shareUrl = els.shareUrl.value;
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Share link copied.");
    } catch {
      els.shareUrl.focus();
      els.shareUrl.select();
      setStatus(document.execCommand("copy") ? "Share link copied." : "Share link selected.");
    }
  }

  function updatePlayer() {
    const payload = registrationPayload();
    if (state.room?.you && state.socket?.readyState === WebSocket.OPEN) {
      send({ type: "set_player", name: payload.name });
    }
  }

  function send(message) {
    if (state.socket?.readyState !== WebSocket.OPEN) {
      setStatus("Not connected.");
      return;
    }
    state.socket.send(JSON.stringify(message));
  }

  function syncControlsFromServer() {
    const you = state.room?.you;
    if (!you) return;
    if (document.activeElement !== els.playerName) {
      els.playerName.value = you.name;
    }
    localStorage.setItem(NAME_KEY, you.name);
  }

  function render() {
    renderConnection();
    renderHostControls();
    renderBadges();
    renderHand();
    renderActions();
    renderTable();
    renderActionLog();
  }

  function renderConnection() {
    els.connectionLabel.classList.toggle("is-online", state.connected);
    els.connectionLabel.classList.toggle("is-offline", !state.connected);
    els.roomLabel.textContent = state.room
      ? `Room - ${state.connected ? "Live" : "Offline"}`
      : "No room";
  }

  function renderHostControls() {
    const room = state.room;
    els.createRoomButton.hidden = Boolean(room);
    els.gameControlBlock.hidden = Boolean(room && !room.isHost);
    els.newGameButton.textContent = room?.status === "waiting" ? "Start game" : "New game";
    const canStart = room?.status !== "waiting" || (room?.players || []).length >= 3;
    els.newGameButton.disabled = !state.connected || !room?.isHost || !canStart;
  }

  function renderBadges() {
    const room = state.room;
    if (!room) {
      els.phaseBadge.textContent = "No game";
      els.bidBadge.textContent = "No bid";
      return;
    }

    if (room.winnerToken) {
      els.phaseBadge.textContent = `${playerName(room.winnerToken)} wins`;
    } else if (room.phase === "waiting") {
      els.phaseBadge.textContent = `${room.players.length}/6 players`;
    } else if (room.phase === "setup") {
      els.phaseBadge.textContent = `${playerName(room.turnToken)} places`;
    } else if (room.phase === "placing") {
      els.phaseBadge.textContent = `${playerName(room.turnToken)} acts`;
    } else if (room.phase === "bidding") {
      els.phaseBadge.textContent = `${playerName(room.turnToken)} bids or passes`;
    } else if (room.phase === "challenge") {
      els.phaseBadge.textContent = `${playerName(room.challengerToken)} flips`;
    } else if (room.phase === "loss_selection") {
      els.phaseBadge.textContent = `${playerName(room.turnToken)} chooses a lost disc`;
    } else if (room.phase === "choose_next_first") {
      els.phaseBadge.textContent = `${playerName(room.turnToken)} chooses first`;
    } else {
      els.phaseBadge.textContent = capitalize(room.phase);
    }

    els.bidBadge.textContent = room.currentBid
      ? `Bid ${room.currentBid} by ${playerName(room.challengerToken)}`
      : `Round ${room.roundNumber || "-"}`;
  }

  function renderHand() {
    const you = state.room?.you;
    if (!you) {
      els.handControls.replaceChildren(emptyLine("Create or join a room."));
      return;
    }

    if (you.eliminated) {
      els.handControls.replaceChildren(emptyLine("Eliminated."));
      return;
    }

    const canPlace = you.allowedActions.includes("place_disc");
    const groups = [
      { kind: "flower", source: "base", label: "Flower", count: you.handCounts.flower },
      { kind: "skull", source: "base", label: "Skull", count: you.handCounts.skull },
      {
        kind: "flower",
        source: "lastChance",
        label: "Last Chance",
        count: you.handCounts.lastChance,
      },
    ];

    els.handControls.replaceChildren(
      ...groups.map((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "disc-button";
        button.dataset.kind = item.kind;
        button.dataset.source = item.source;
        button.disabled = !canPlace || item.count < 1;
        button.addEventListener("click", () =>
          send({ type: "place_disc", kind: item.kind, source: item.source }),
        );

        const symbol = document.createElement("span");
        symbol.className = "disc-symbol";
        symbol.textContent = item.kind === "skull" ? "SK" : "FL";
        const label = document.createElement("span");
        label.textContent = `${item.label} x${item.count}`;
        button.append(symbol, label);
        return button;
      }),
    );
  }

  function renderActions() {
    const room = state.room;
    const you = room?.you;
    if (!room || !you) {
      els.actionControls.replaceChildren(emptyLine("Waiting for a room."));
      return;
    }

    const nodes = [];
    if (you.allowedActions.includes("open_bid") || you.allowedActions.includes("outbid")) {
      nodes.push(renderBidForm(you.allowedActions.includes("open_bid") ? "open_bid" : "outbid"));
    }
    if (you.allowedActions.includes("pass")) {
      nodes.push(actionButton("Pass", () => send({ type: "pass" }), "secondary"));
    }
    if (you.allowedActions.includes("choose_lost_disc")) {
      nodes.push(renderLossChoices(you.lossChoices));
    }
    if (you.allowedActions.includes("choose_next_first")) {
      nodes.push(renderNextFirstChoices());
    }
    if (!nodes.length) {
      nodes.push(emptyLine(actionHint(room, you)));
    }

    els.actionControls.replaceChildren(...nodes);
  }

  function renderBidForm(type) {
    const room = state.room;
    const form = document.createElement("form");
    form.className = "bid-form";
    const max = room.players.reduce((total, player) => total + player.stackCount, 0);
    const min = type === "outbid" ? room.currentBid + 1 : 1;

    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = type === "outbid" ? "Raise bid" : "Open bid";
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.value = String(min);
    label.append(span, input);

    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = type === "outbid" ? "Raise" : "Bid";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      send({ type, amount: Number.parseInt(input.value, 10) });
    });

    form.append(label, button);
    return form;
  }

  function renderLossChoices(choices) {
    const group = document.createElement("div");
    group.className = "choice-grid";
    if (!choices.length) {
      group.append(emptyLine("No disc choices."));
      return group;
    }
    choices.forEach((choice) => {
      const button = actionButton(
        choice.kind ? `${capitalize(choice.kind)} disc` : `Hidden disc ${choice.slot + 1}`,
        () => send({ type: "choose_lost_disc", slot: choice.slot }),
        "secondary",
      );
      group.append(button);
    });
    return group;
  }

  function renderNextFirstChoices() {
    const group = document.createElement("div");
    group.className = "choice-grid";
    state.room.players
      .filter((player) => !player.eliminated && player.remainingCount > 0)
      .forEach((player) => {
        group.append(
          actionButton(player.name, () =>
            send({ type: "choose_next_first", playerToken: player.token }),
          ),
        );
      });
    return group;
  }

  function renderTable() {
    const room = state.room;
    if (!room?.players?.length) {
      els.tableGrid.replaceChildren(...Array.from({ length: 3 }, () => emptySeat()));
      return;
    }

    els.tableGrid.replaceChildren(...room.players.map(renderSeat));
  }

  function renderSeat(player) {
    const seat = document.createElement("article");
    seat.className = "player-seat";
    seat.dataset.active = state.room.turnToken === player.token ? "true" : "false";
    seat.dataset.eliminated = player.eliminated ? "true" : "false";

    const header = document.createElement("div");
    header.className = "seat-header";
    const name = document.createElement("h2");
    name.textContent = player.name;
    const meta = document.createElement("span");
    meta.className = "seat-meta";
    meta.textContent = player.connected ? "Live" : "Offline";
    header.append(name, meta);

    const score = document.createElement("div");
    score.className = "score-row";
    score.append(
      statPill(`Score ${player.score}/2`),
      statPill(`${player.remainingCount} discs`),
      statPill(player.hasLastChance ? "Last Chance" : `${player.handCount} in hand`),
    );

    const stack = document.createElement("div");
    stack.className = "disc-stack";
    if (player.stack.length) {
      player.stack.forEach((disc, index) => {
        const marker = document.createElement("span");
        marker.className = "stack-disc";
        marker.dataset.kind = disc.kind || "hidden";
        marker.dataset.revealed = disc.revealed ? "true" : "false";
        marker.textContent = disc.revealed ? (disc.kind === "skull" ? "SK" : "FL") : "?";
        marker.style.setProperty("--offset", String(index));
        stack.append(marker);
      });
    } else {
      stack.append(emptyLine("No discs placed."));
    }

    const footer = document.createElement("div");
    footer.className = "seat-footer";
    if (player.eliminated) {
      footer.textContent = "Eliminated";
    } else if (state.room.challengerToken === player.token) {
      footer.textContent = `Challenger${player.currentBid ? ` - ${player.currentBid}` : ""}`;
    } else if (player.passed) {
      footer.textContent = "Passed";
    } else {
      footer.textContent = `${player.unrevealedStackCount} hidden`;
    }

    const flipButton = document.createElement("button");
    flipButton.type = "button";
    flipButton.className = "flip-button secondary";
    flipButton.textContent = "Flip top";
    flipButton.disabled = !canFlip(player);
    flipButton.addEventListener("click", () =>
      send({ type: "flip_disc", playerToken: player.token }),
    );

    seat.append(header, score, stack, footer, flipButton);
    return seat;
  }

  function canFlip(player) {
    const room = state.room;
    const you = room?.you;
    if (!you?.allowedActions.includes("flip_disc")) return false;
    if (player.unrevealedStackCount < 1) return false;
    const self = room.players.find((item) => item.token === you.token);
    if (self?.unrevealedStackCount > 0 && player.token !== you.token) return false;
    return true;
  }

  function renderActionLog() {
    els.actionLog.replaceChildren(
      ...state.logEntries.map((entry) => {
        const item = document.createElement("li");
        item.textContent = entry;
        return item;
      }),
    );
    els.actionLog.scrollTop = els.actionLog.scrollHeight;
  }

  function actionButton(label, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function statPill(label) {
    const pill = document.createElement("span");
    pill.className = "stat-pill";
    pill.textContent = label;
    return pill;
  }

  function emptyLine(text) {
    const line = document.createElement("p");
    line.className = "muted-line";
    line.textContent = text;
    return line;
  }

  function emptySeat() {
    const seat = document.createElement("article");
    seat.className = "player-seat is-empty";
    seat.append(emptyLine("Waiting for players."));
    return seat;
  }

  function actionHint(room, you) {
    if (room.status === "waiting") {
      return room.players.length < 3 ? "Waiting for at least 3 players." : "Host can start.";
    }
    if (you.eliminated) return "Watch the remaining players.";
    if (room.turnToken === you.token) return "Choose an available action.";
    return `Waiting for ${playerName(room.turnToken)}.`;
  }

  function playerName(token) {
    return state.room?.players.find((player) => player.token === token)?.name || "Player";
  }

  function setStatus(message) {
    if (!message || message === "Connected." || message === "Disconnected.") return;
    if (state.logEntries.at(-1) !== message) {
      state.logEntries.push(message);
      if (state.logEntries.length > 80) state.logEntries.shift();
    }
    renderActionLog();
  }

  function setBusy(isBusy) {
    els.createRoomButton.disabled = isBusy;
    els.copyShareButton.disabled = isBusy || !els.shareUrl.value;
  }

  function capitalize(value) {
    return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
  }
})();
