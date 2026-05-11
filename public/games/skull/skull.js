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
    phaseEyebrow: document.querySelector("#phaseEyebrow"),
    phaseTitle: document.querySelector("#phaseTitle"),
    phaseCopy: document.querySelector("#phaseCopy"),
    scoreStrip: document.querySelector("#scoreStrip"),
    bidBadge: document.querySelector("#bidBadge"),
    tableGrid: document.querySelector("#tableGrid"),
    handList: document.querySelector("#handList"),
    actionPanel: document.querySelector("#actionPanel"),
    playersList: document.querySelector("#playersList"),
    actionLog: document.querySelector("#actionLog"),
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
      const response = await fetch("/api/skull/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playerPayload()),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Room could not be created.");

      const shareUrl = setUrlRoom(payload.roomCode, payload.shareUrl);
      await connect(payload.roomCode);
      setStatus("Room ready. Share the link to invite players.");
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
        body: JSON.stringify(playerPayload()),
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
    if (state.socket) {
      state.socket.close(1000, "reconnect");
    }

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
    renderScores();
    renderTable();
    renderHand();
    renderActionPanel();
    renderPlayers();
    renderLog();
  }

  function renderHeader() {
    els.connectionLabel.classList.toggle("is-online", state.connected);
    els.connectionLabel.classList.toggle("is-offline", !state.connected);
    els.roomLabel.textContent = state.room ? `Room ${state.room.roomCode}` : "No room";
    els.createRoomButton.disabled = Boolean(state.room) || els.createRoomButton.disabled;
    els.newGameButton.disabled = !state.room || !state.room.isHost;
    els.newGameButton.textContent = state.room?.status === "waiting" ? "Start game" : "Reset table";
    setShareUrl(els.shareUrl.value);
  }

  function renderStatus() {
    const room = state.room;
    if (!room) {
      setPhase("Room", "Create a room", "Invite 3-6 players, then start the first round.");
      setBidBadge("No bid");
      return;
    }

    if (room.status === "waiting") {
      const needed = Math.max(0, room.minPlayers - room.players.length);
      setPhase(
        "Lobby",
        needed ? `${needed} more player${needed === 1 ? "" : "s"} needed` : "Ready to start",
        `${room.players.length}/${room.maxPlayers} seats filled. The host starts the game.`,
      );
      setBidBadge("No bid");
      return;
    }

    if (room.status === "finished") {
      setPhase("Finished", `${room.winner?.name || "A player"} wins`, "Reset the table to play again.");
      setBidBadge("Game over");
      return;
    }

    const current = playerName(room.currentTurnToken);
    if (room.phase === "placement") {
      setPhase("Round " + room.round, "Opening placement", "Each active player places one hidden disc.");
    } else if (room.phase === "adding") {
      setPhase("Turn", current, `${current} may add a disc or start the challenge bidding.`);
    } else if (room.phase === "bidding") {
      setPhase("Bidding", current, `${current} must raise the bid or pass.`);
    } else if (room.phase === "revealing") {
      setPhase(
        "Challenge",
        room.attempt?.challengerName || current,
        `Reveal ${room.attempt?.remaining || 0} more flower disc${room.attempt?.remaining === 1 ? "" : "s"}.`,
      );
    } else if (room.phase === "choosing_loss") {
      setPhase("Penalty", room.loss?.chooserName || current, "Choose one of the challenger's discs to lose.");
    } else if (room.phase === "choosing_starter") {
      setPhase("Next round", current, `${current} chooses who starts the next round.`);
    }

    setBidBadge(room.bid ? `${room.bid.playerName} bid ${room.bid.count}/${room.totalDiscs}` : "No bid");
  }

  function setPhase(eyebrow, title, copy) {
    els.phaseEyebrow.textContent = eyebrow;
    els.phaseTitle.textContent = title;
    els.phaseCopy.textContent = copy;
  }

  function setBidBadge(text) {
    els.bidBadge.textContent = text;
  }

  function renderScores() {
    const players = state.room?.players || [];
    if (!players.length) {
      els.scoreStrip.innerHTML = `<p class="muted-note">No players seated.</p>`;
      return;
    }

    els.scoreStrip.innerHTML = players
      .map(
        (player) => `
          <div class="score-pill">
            <span>${escapeHtml(player.name)}</span>
            <span class="win-track" aria-label="${player.wins} wins">
              ${[0, 1]
                .map((index) => `<span class="win-mark ${index < player.wins ? "is-filled" : ""}"></span>`)
                .join("")}
            </span>
          </div>
        `,
      )
      .join("");
  }

  function renderTable() {
    const room = state.room;
    const players = room?.players || [];
    if (!players.length) {
      els.tableGrid.innerHTML = `<p class="muted-note">Create or join a room to take a seat.</p>`;
      return;
    }

    els.tableGrid.innerHTML = players
      .map((player) => {
        const tags = seatTags(player).map((tag) => `<span class="${tag.className}">${tag.label}</span>`).join("");
        const stack = player.stack.length
          ? player.stack.map((disc) => discHtml(disc.kind, { hidden: !disc.revealed })).join("")
          : `<p class="muted-note">No discs down.</p>`;
        const flipButton = canFlip(player)
          ? `<button class="secondary" type="button" data-flip="${escapeAttribute(player.token)}">Flip top</button>`
          : "";

        return `
          <article class="player-seat ${player.isCurrentTurn ? "is-current" : ""} ${
            player.eliminated ? "is-eliminated" : ""
          }">
            <div class="seat-head">
              <div class="seat-name">${escapeHtml(player.name)}</div>
              <div class="seat-meta">${tags}</div>
            </div>
            <div class="stack-row">${stack}</div>
            <p class="stack-count">${player.stackCount} on table, ${player.handCount} in hand</p>
            ${flipButton}
          </article>
        `;
      })
      .join("");

    els.tableGrid.querySelectorAll("[data-flip]").forEach((button) => {
      button.addEventListener("click", () => {
        send({ type: "reveal_disc", ownerToken: button.dataset.flip });
      });
    });
  }

  function seatTags(player) {
    const tags = [];
    if (player.token === state.playerToken) tags.push({ label: "You", className: "seat-tag is-active" });
    if (player.isFirstPlayer) tags.push({ label: "First", className: "seat-tag is-active" });
    if (player.isCurrentTurn) tags.push({ label: "Turn", className: "seat-tag is-active" });
    if (player.isBidder) tags.push({ label: "Bidder", className: "seat-tag is-active" });
    if (player.hasPassed) tags.push({ label: "Passed", className: "seat-tag" });
    if (player.eliminated) tags.push({ label: "Out", className: "seat-tag is-danger" });
    if (!player.connected) tags.push({ label: "Away", className: "seat-tag" });
    return tags;
  }

  function renderHand() {
    const room = state.room;
    const hand = room?.hand || [];
    if (!room) {
      els.handList.innerHTML = `<p class="muted-note">Your private hand appears after the game starts.</p>`;
      return;
    }
    if (room.status === "waiting") {
      els.handList.innerHTML = `<p class="muted-note">Hands are dealt when the host starts the game.</p>`;
      return;
    }
    if (!hand.length) {
      els.handList.innerHTML = `<p class="muted-note">No discs in hand.</p>`;
      return;
    }

    const playable = canPlayDisc();
    els.handList.innerHTML = hand
      .map(
        (disc) => `
          <button
            class="disc is-${disc.kind}"
            type="button"
            data-card-id="${escapeAttribute(disc.id)}"
            ${playable ? "" : "disabled"}
            aria-label="Play ${disc.kind}"
          >${disc.kind === "skull" ? "S" : "F"}</button>
        `,
      )
      .join("");

    els.handList.querySelectorAll("[data-card-id]").forEach((button) => {
      button.addEventListener("click", () => {
        send({ type: "play_disc", cardId: button.dataset.cardId });
      });
    });
  }

  function renderActionPanel() {
    const room = state.room;
    if (!room) {
      els.actionPanel.innerHTML = `<p class="muted-note">Create a room or open a shared link.</p>`;
      return;
    }
    if (room.status === "waiting") {
      els.actionPanel.innerHTML = room.isHost
        ? `<p class="muted-note">Start is enabled at ${room.minPlayers} players.</p>`
        : `<p class="muted-note">Waiting for the host.</p>`;
      return;
    }
    if (room.status === "finished") {
      els.actionPanel.innerHTML = `<p class="muted-note">The host can reset the table.</p>`;
      return;
    }

    if (room.phase === "placement") {
      els.actionPanel.innerHTML = canPlayDisc()
        ? `<p class="muted-note">Choose one disc from your hand to place face down.</p>`
        : `<p class="muted-note">Waiting for opening placements.</p>`;
      return;
    }

    if (room.phase === "adding") {
      renderAddingPanel(room);
      return;
    }

    if (room.phase === "bidding") {
      renderBiddingPanel(room);
      return;
    }

    if (room.phase === "revealing") {
      els.actionPanel.innerHTML = isMyTurn()
        ? `<p class="muted-note">Flip your own stack first, then choose opponent stacks until the bid is met.</p>`
        : `<p class="muted-note">Waiting for ${escapeHtml(room.attempt?.challengerName || "the challenger")}.</p>`;
      return;
    }

    if (room.phase === "choosing_loss") {
      renderLossPanel(room);
      return;
    }

    if (room.phase === "choosing_starter") {
      renderStarterPanel(room);
    }
  }

  function renderAddingPanel(room) {
    if (!isMyTurn()) {
      els.actionPanel.innerHTML = `<p class="muted-note">Waiting for ${escapeHtml(playerName(room.currentTurnToken))}.</p>`;
      return;
    }

    const canAdd = (room.hand || []).length > 0;
    els.actionPanel.innerHTML = `
      <p class="muted-note">${canAdd ? "Add a disc from your hand or begin bidding." : "No hand discs remain; start bidding."}</p>
      ${bidFormHtml("start_bid", (room.bid?.count || 0) + 1, room.totalDiscs, "Bid")}
    `;
    bindBidForm();
  }

  function renderBiddingPanel(room) {
    if (!isMyTurn()) {
      els.actionPanel.innerHTML = `<p class="muted-note">Waiting for ${escapeHtml(playerName(room.currentTurnToken))}.</p>`;
      return;
    }

    const nextBid = (room.bid?.count || 0) + 1;
    const canRaise = nextBid <= room.totalDiscs && room.bid?.playerToken !== state.playerToken;
    els.actionPanel.innerHTML = `
      <p class="muted-note">Current bid: ${room.bid?.count || 0} of ${room.totalDiscs} discs.</p>
      ${
        canRaise
          ? bidFormHtml("raise_bid", nextBid, room.totalDiscs, "Raise")
          : `<p class="danger-note">The bid cannot be raised.</p>`
      }
      <div class="inline-actions">
        <button class="secondary" type="button" data-pass>Pass</button>
      </div>
    `;
    bindBidForm();
    els.actionPanel.querySelector("[data-pass]")?.addEventListener("click", () => {
      send({ type: "pass_bid" });
    });
  }

  function renderLossPanel(room) {
    const loss = room.loss;
    if (!loss) {
      els.actionPanel.innerHTML = `<p class="muted-note">Resolving the challenge.</p>`;
      return;
    }
    if (loss.chooserToken !== state.playerToken) {
      els.actionPanel.innerHTML = `<p class="muted-note">Waiting for ${escapeHtml(loss.chooserName)} to choose a lost disc.</p>`;
      return;
    }

    els.actionPanel.innerHTML = `
      <p class="muted-note">Choose one disc for ${escapeHtml(loss.challengerName)} to lose.</p>
      <div class="loss-options">
        ${loss.options
          .map(
            (option, index) => `
              <button class="disc ${option.kind ? `is-${option.kind}` : "is-hidden"}" type="button" data-loss="${escapeAttribute(
                option.id,
              )}" aria-label="Choose disc ${index + 1}">${option.kind === "skull" ? "S" : option.kind === "flower" ? "F" : "?"}</button>
            `,
          )
          .join("")}
      </div>
    `;
    els.actionPanel.querySelectorAll("[data-loss]").forEach((button) => {
      button.addEventListener("click", () => {
        send({ type: "choose_loss", optionId: button.dataset.loss });
      });
    });
  }

  function renderStarterPanel(room) {
    if (!isMyTurn()) {
      els.actionPanel.innerHTML = `<p class="muted-note">Waiting for ${escapeHtml(playerName(room.currentTurnToken))}.</p>`;
      return;
    }

    els.actionPanel.innerHTML = `
      <p class="muted-note">Choose who starts the next round.</p>
      <div class="starter-options">
        ${room.players
          .filter((player) => !player.eliminated)
          .map(
            (player) => `
              <button class="secondary" type="button" data-starter="${escapeAttribute(player.token)}">
                ${escapeHtml(player.name)}
              </button>
            `,
          )
          .join("")}
      </div>
    `;
    els.actionPanel.querySelectorAll("[data-starter]").forEach((button) => {
      button.addEventListener("click", () => {
        send({ type: "choose_starter", playerToken: button.dataset.starter });
      });
    });
  }

  function bidFormHtml(action, min, max, label) {
    return `
      <form class="bid-form" data-bid-form="${action}">
        <label>
          <span>Bid</span>
          <input name="bid" type="number" min="${min}" max="${max}" value="${min}">
        </label>
        <p class="muted-note">Maximum: ${max}</p>
        <button type="submit">${label}</button>
      </form>
    `;
  }

  function bindBidForm() {
    const form = els.actionPanel.querySelector("[data-bid-form]");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      send({
        type: form.dataset.bidForm,
        count: form.elements.bid.value,
      });
    });
  }

  function renderPlayers() {
    const players = state.room?.players || [];
    if (!players.length) {
      els.playersList.innerHTML = `<p class="muted-note">No players yet.</p>`;
      return;
    }

    els.playersList.innerHTML = players
      .map(
        (player) => `
          <div class="player-line">
            <span class="player-line-name">${escapeHtml(player.name)}${player.token === state.playerToken ? " (you)" : ""}</span>
            <span class="player-line-meta">${player.eliminated ? "Out" : `${player.handCount + player.stackCount} discs`}</span>
          </div>
        `,
      )
      .join("");
  }

  function renderLog() {
    const entries = state.room?.history?.length ? state.room.history : state.logEntries;
    els.actionLog.innerHTML = entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  }

  function canPlayDisc() {
    const room = state.room;
    const you = room?.players.find((player) => player.token === state.playerToken);
    if (!room || !you || you.eliminated || room.status !== "playing") return false;
    if (room.phase === "placement") return you.stackCount === 0;
    if (room.phase === "adding") return room.currentTurnToken === state.playerToken && room.hand.length > 0;
    return false;
  }

  function canFlip(player) {
    const room = state.room;
    if (!room || room.phase !== "revealing" || !isMyTurn() || player.eliminated) return false;
    if (!player.stack.some((disc) => !disc.revealed)) return false;
    if ((room.attempt?.remaining || 0) <= 0) return false;

    const you = room.players.find((item) => item.token === state.playerToken);
    const ownHidden = you?.stack.filter((disc) => !disc.revealed).length || 0;
    return player.token === state.playerToken || ownHidden === 0;
  }

  function isMyTurn() {
    return state.room?.currentTurnToken === state.playerToken;
  }

  function playerName(token) {
    if (!token) return "Waiting";
    return state.room?.players.find((player) => player.token === token)?.name || "Player";
  }

  function discHtml(kind, options = {}) {
    const hidden = options.hidden || !kind;
    const label = hidden ? "?" : kind === "skull" ? "S" : "F";
    return `<span class="disc ${hidden ? "is-hidden" : `is-${kind}`}">${label}</span>`;
  }

  function setBusy(isBusy) {
    els.createRoomButton.disabled = isBusy || Boolean(state.room);
    els.copyShareButton.disabled = isBusy || !els.shareUrl.value;
  }

  function setStatus(message) {
    if (!message) return;
    state.logEntries = [message, ...state.logEntries].slice(0, 8);
    renderLog();
  }

  function logRoomChanges(previous, next) {
    if (!previous || !next) return;
    if (previous.status !== "finished" && next.status === "finished" && next.winner) {
      setStatus(`${next.winner.name} won the game.`);
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
