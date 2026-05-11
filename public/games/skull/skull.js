(() => {
  const TOKEN_KEY = "skull-player-token";
  const NAME_KEY = "skull-player-name";

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
    bidBadge: document.querySelector("#bidBadge"),
    tableGrid: document.querySelector("#tableGrid"),
    handList: document.querySelector("#handList"),
    actionPanel: document.querySelector("#actionPanel"),
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
      const response = await fetch("/api/skull/rooms", {
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
      const response = await fetch(`/api/skull/rooms/${roomCode}/join`, {
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
    renderTable();
    renderHand();
    renderActionPanel();
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
      setPhase("Room", "Create a room", "Invite 3-6 players, then start.");
      setBidBadge("No bid");
      return;
    }

    if (room.status === "waiting") {
      const needed = Math.max(0, room.minPlayers - room.players.length);
      setPhase(
        "Lobby",
        needed ? `${needed} more` : "Ready",
        `${room.players.length}/${room.maxPlayers} players`,
      );
      setBidBadge("No bid");
      return;
    }

    if (room.status === "finished") {
      setPhase("Finished", `${room.winner?.name || "A player"} wins`, "Host can reset.");
      setBidBadge("Game over");
      return;
    }

    const current = playerName(room.currentTurnToken);
    if (room.phase === "placement") {
      setPhase(`Round ${room.round}`, "Place one", "Everyone puts one disc down.");
    } else if (room.phase === "adding") {
      setPhase("Turn", current, `${current}: add a disc or bid.`);
    } else if (room.phase === "bidding") {
      setPhase("Bid", current, `${current}: raise or pass.`);
    } else if (room.phase === "revealing") {
      const remaining = room.attempt?.remaining || 0;
      setPhase("Reveal", room.attempt?.challengerName || current, `${remaining} left.`);
    } else if (room.phase === "choosing_loss") {
      setPhase("Lose one", room.loss?.chooserName || current, "Choose a disc to discard.");
    } else if (room.phase === "choosing_starter") {
      setPhase("Next", current, "Choose the starter.");
    }

    setBidBadge(room.bid ? `${room.bid.count}/${room.totalDiscs} by ${room.bid.playerName}` : "No bid");
  }

  function setPhase(eyebrow, title, copy) {
    els.phaseEyebrow.textContent = eyebrow;
    els.phaseTitle.textContent = title;
    els.phaseCopy.textContent = copy;
  }

  function setBidBadge(text) {
    els.bidBadge.textContent = text;
  }

  function renderTable() {
    const room = state.room;
    const players = room?.players || [];

    els.tableGrid.className = `table-grid players-${Math.max(players.length, 0)}`;

    if (!players.length) {
      els.tableGrid.innerHTML = `<p class="empty-table">Create or join a room.</p>`;
      return;
    }

    els.tableGrid.innerHTML = players
      .map((player, index) => seatHtml(player, seatPosition(index, players.length)))
      .join("");

    els.tableGrid.querySelectorAll("[data-flip]").forEach((button) => {
      button.addEventListener("click", () => {
        send({ type: "reveal_disc", ownerToken: button.dataset.flip });
      });
    });
  }

  function seatPosition(index, total) {
    const radius = total <= 3 ? 31 : total === 4 ? 34 : 37;
    const angle = -90 + (360 / Math.max(total, 1)) * index;
    const radians = (angle * Math.PI) / 180;
    return {
      left: 50 + Math.cos(radians) * radius,
      top: 50 + Math.sin(radians) * radius,
    };
  }

  function seatHtml(player, position) {
    const classes = [
      "player-seat",
      player.token === state.playerToken ? "is-you" : "",
      player.isCurrentTurn ? "is-current" : "",
      player.isBidder ? "is-bidder" : "",
      player.hasPassed ? "has-passed" : "",
      player.eliminated ? "is-eliminated" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const stateMarks = [
      player.isFirstPlayer ? "first" : "",
      player.hasPassed ? "pass" : "",
      !player.connected ? "away" : "",
      player.eliminated ? "out" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const stack = stackHtml(player);

    return `
      <article class="${classes}" style="left:${position.left.toFixed(3)}%; top:${position.top.toFixed(
        3,
      )}%;">
        <div class="seat-top">
          <span class="seat-name">${escapeHtml(player.name)}</span>
          <span class="win-track" aria-label="${player.wins} wins">
            ${[0, 1].map((index) => `<span class="${index < player.wins ? "won" : ""}"></span>`).join("")}
          </span>
        </div>
        ${stack}
        <div class="seat-foot">
          <span>${player.stackCount}/${player.handCount + player.stackCount}</span>
          <span>${stateMarks}</span>
        </div>
      </article>
    `;
  }

  function stackHtml(player) {
    const discs = player.stack.length
      ? player.stack.map((disc, index) => discHtml(disc.kind, { hidden: !disc.revealed, index })).join("")
      : `<span class="empty-stack"></span>`;

    if (!canFlip(player)) {
      return `<div class="stack" aria-label="${escapeAttribute(player.name)} stack">${discs}</div>`;
    }

    return `
      <button class="stack can-flip" type="button" data-flip="${escapeAttribute(
        player.token,
      )}" aria-label="Reveal ${escapeAttribute(player.name)} top disc">
        ${discs}
      </button>
    `;
  }

  function renderHand() {
    const room = state.room;
    const hand = room?.hand || [];

    if (!room || room.status === "waiting") {
      els.handList.innerHTML = `<span class="strip-note">Hand appears after start.</span>`;
      return;
    }

    if (!hand.length) {
      els.handList.innerHTML = `<span class="strip-note">No hand discs.</span>`;
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
          ></button>
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
      els.actionPanel.innerHTML = `<span class="strip-note">Create or join.</span>`;
      return;
    }

    if (room.status === "waiting") {
      els.actionPanel.innerHTML = room.isHost
        ? `<span class="strip-note">Start at ${room.minPlayers} players.</span>`
        : `<span class="strip-note">Waiting for host.</span>`;
      return;
    }

    if (room.status === "finished") {
      els.actionPanel.innerHTML = `<span class="strip-note">Game over.</span>`;
      return;
    }

    if (room.phase === "placement") {
      els.actionPanel.innerHTML = canPlayDisc()
        ? `<span class="strip-note">Choose a disc.</span>`
        : `<span class="strip-note">Waiting for placements.</span>`;
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
        ? `<span class="strip-note">Reveal your stack first.</span>`
        : `<span class="strip-note">Waiting for ${escapeHtml(room.attempt?.challengerName || "challenger")}.</span>`;
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
      els.actionPanel.innerHTML = `<span class="strip-note">Waiting for ${escapeHtml(
        playerName(room.currentTurnToken),
      )}.</span>`;
      return;
    }

    els.actionPanel.innerHTML = `
      <span class="strip-note">${room.hand.length ? "Add or bid." : "Bid."}</span>
      ${bidFormHtml("start_bid", (room.bid?.count || 0) + 1, room.totalDiscs, "Bid")}
    `;
    bindBidForm();
  }

  function renderBiddingPanel(room) {
    if (!isMyTurn()) {
      els.actionPanel.innerHTML = `<span class="strip-note">Waiting for ${escapeHtml(
        playerName(room.currentTurnToken),
      )}.</span>`;
      return;
    }

    const nextBid = (room.bid?.count || 0) + 1;
    const canRaise = nextBid <= room.totalDiscs && room.bid?.playerToken !== state.playerToken;
    els.actionPanel.innerHTML = `
      <span class="strip-note">Bid ${room.bid?.count || 0}/${room.totalDiscs}</span>
      ${canRaise ? bidFormHtml("raise_bid", nextBid, room.totalDiscs, "Raise") : ""}
      <button class="secondary" type="button" data-pass>Pass</button>
    `;
    bindBidForm();
    els.actionPanel.querySelector("[data-pass]")?.addEventListener("click", () => {
      send({ type: "pass_bid" });
    });
  }

  function renderLossPanel(room) {
    const loss = room.loss;
    if (!loss) {
      els.actionPanel.innerHTML = `<span class="strip-note">Resolving.</span>`;
      return;
    }

    if (loss.chooserToken !== state.playerToken) {
      els.actionPanel.innerHTML = `<span class="strip-note">Waiting for ${escapeHtml(
        loss.chooserName,
      )}.</span>`;
      return;
    }

    els.actionPanel.innerHTML = `
      <span class="strip-note">${escapeHtml(loss.challengerName)} loses one.</span>
      <div class="loss-options">
        ${loss.options
          .map(
            (option, index) => `
              <button class="disc ${option.kind ? `is-${option.kind}` : "is-hidden"}" type="button" data-loss="${escapeAttribute(
                option.id,
              )}" aria-label="Choose disc ${index + 1}"></button>
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
      els.actionPanel.innerHTML = `<span class="strip-note">Waiting for ${escapeHtml(
        playerName(room.currentTurnToken),
      )}.</span>`;
      return;
    }

    els.actionPanel.innerHTML = `
      <span class="strip-note">Starter:</span>
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
        <input name="bid" aria-label="Bid" type="number" min="${min}" max="${max}" value="${min}">
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

  function renderNotice() {
    els.noticeLine.textContent = state.notice;
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
    const style = Number.isInteger(options.index) ? ` style="--i:${options.index}"` : "";
    return `<span class="disc ${hidden ? "is-hidden" : `is-${kind}`}"${style}></span>`;
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
    if (previous.status !== "finished" && next.status === "finished" && next.winner) {
      setStatus(`${next.winner.name} won.`);
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
