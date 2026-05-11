(() => {
  const TOKEN_KEY = "codename-grid-player-token";
  const NAME_KEY = "codename-grid-player-name";
  const TEAM_KEY = "codename-grid-team";
  const ROLE_KEY = "codename-grid-role";
  const LOCAL_API_ORIGIN = "http://127.0.0.1:8787";
  const API_ORIGIN = getApiOrigin();

  const state = {
    socket: null,
    room: null,
    playerToken: getToken(),
    connected: false,
  };

  const els = {
    roomForm: document.querySelector("#roomForm"),
    createRoomButton: document.querySelector("#createRoomButton"),
    playerName: document.querySelector("#playerName"),
    shareBlock: document.querySelector("#shareBlock"),
    shareUrl: document.querySelector("#shareUrl"),
    copyShareButton: document.querySelector("#copyShareButton"),
    teamSelect: document.querySelector("#teamSelect"),
    roleSelect: document.querySelector("#roleSelect"),
    connectionLabel: document.querySelector("#connectionLabel"),
    roomLabel: document.querySelector("#roomLabel"),
    turnBadge: document.querySelector("#turnBadge"),
    clueText: document.querySelector("#clueText"),
    statusText: document.querySelector("#statusText"),
    clueForm: document.querySelector("#clueForm"),
    clueWord: document.querySelector("#clueWord"),
    clueCount: document.querySelector("#clueCount"),
    endTurnButton: document.querySelector("#endTurnButton"),
    newBoardButton: document.querySelector("#newBoardButton"),
    playersList: document.querySelector("#playersList"),
    redScore: document.querySelector("#redScore"),
    blueScore: document.querySelector("#blueScore"),
    boardGrid: document.querySelector("#boardGrid"),
  };

  boot();

  function boot() {
    els.playerName.value =
      localStorage.getItem(NAME_KEY) || `Player ${state.playerToken.slice(0, 4)}`;
    els.teamSelect.value = localStorage.getItem(TEAM_KEY) || "red";
    els.roleSelect.value = localStorage.getItem(ROLE_KEY) || "operative";

    const params = new URLSearchParams(window.location.search);
    const roomParam = cleanRoomCode(params.get("room") || "");

    els.roomForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createRoom();
    });
    els.copyShareButton.addEventListener("click", copyShareUrl);
    els.teamSelect.addEventListener("change", updatePlayer);
    els.roleSelect.addEventListener("change", updatePlayer);
    els.playerName.addEventListener("change", updatePlayer);
    els.clueForm.addEventListener("submit", submitClue);
    els.endTurnButton.addEventListener("click", () => send({ type: "end_turn" }));
    els.newBoardButton.addEventListener("click", () => {
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
    const team = els.teamSelect.value === "blue" ? "blue" : "red";
    const role = els.roleSelect.value === "spymaster" ? "spymaster" : "operative";

    localStorage.setItem(NAME_KEY, name);
    localStorage.setItem(TEAM_KEY, team);
    localStorage.setItem(ROLE_KEY, role);

    return {
      playerToken: state.playerToken,
      name,
      team,
      role,
    };
  }

  async function createRoom() {
    setBusy(true);
    setStatus("Creating room.");
    try {
      ensureApiOrigin();

      const response = await fetch(apiUrl("/api/codenames/rooms"), {
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
      ensureApiOrigin();

      const response = await fetch(apiUrl(`/api/codenames/rooms/${roomCode}/join`), {
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
      try {
        ensureApiOrigin();
      } catch (error) {
        reject(error);
        return;
      }

      const socket = new WebSocket(socketUrl(roomCode));

      let opened = false;
      state.socket = socket;
      state.connected = false;
      renderConnection();

      socket.addEventListener("open", () => {
        opened = true;
        state.connected = true;
        setStatus("Connected.");
        renderConnection();
        updatePlayer();
        resolve();
      });

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "state") {
          state.room = payload.room;
          syncControlsFromServer();
          render();
        }
        if (payload.type === "error") {
          setStatus(payload.error || "Action failed.");
        }
      });

      socket.addEventListener("close", () => {
        state.connected = false;
        renderConnection();
        if (state.socket === socket) {
          setStatus(opened ? "Disconnected." : "Connection failed.");
        }
      });

      socket.addEventListener("error", () => {
        if (!opened) reject(new Error("WebSocket connection failed."));
      });
    });
  }

  function getRoomUrl(roomCode, fallbackUrl) {
    if (fallbackUrl) return fallbackUrl;

    const url = new URL("/codenames/", window.location.origin);
    url.searchParams.set("room", roomCode);
    return url.toString();
  }

  function setUrlRoom(roomCode, fallbackUrl) {
    const shareUrl = getRoomUrl(roomCode, fallbackUrl);
    history.replaceState(null, "", shareUrl);
    setShareUrl(shareUrl);
    return shareUrl;
  }

  function getApiOrigin() {
    const configured = document
      .querySelector('meta[name="fungibus-api-origin"]')
      ?.content.trim();

    if ((!configured || isPlaceholderApiOrigin(configured)) && isLocalFrontend()) {
      return LOCAL_API_ORIGIN;
    }
    if (!configured || isPlaceholderApiOrigin(configured)) return "";

    try {
      return new URL(configured).origin;
    } catch {
      return "";
    }
  }

  function isPlaceholderApiOrigin(value) {
    return value.includes("derekyi2001");
  }

  function isLocalFrontend() {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname);
  }

  function ensureApiOrigin() {
    if (API_ORIGIN) return;
    throw new Error("Cloudflare backend URL is not configured.");
  }

  function apiUrl(path) {
    return new URL(path, API_ORIGIN).toString();
  }

  function socketUrl(roomCode) {
    const url = new URL(
      `/api/codenames/rooms/${roomCode}/socket?playerToken=${encodeURIComponent(state.playerToken)}`,
      API_ORIGIN,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
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
    const payload = playerPayload();
    if (state.socket?.readyState === WebSocket.OPEN) {
      send({ type: "set_player", ...payload });
    }
  }

  function submitClue(event) {
    event.preventDefault();
    const word = els.clueWord.value.trim();
    const count = Number.parseInt(els.clueCount.value, 10);
    send({
      type: "submit_clue",
      word,
      count: Number.isFinite(count) ? count : 1,
    });
    els.clueWord.value = "";
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
    els.teamSelect.value = you.team;
    els.roleSelect.value = you.role;
    localStorage.setItem(NAME_KEY, you.name);
    localStorage.setItem(TEAM_KEY, you.team);
    localStorage.setItem(ROLE_KEY, you.role);
  }

  function render() {
    renderConnection();
    renderRoomInfo();
    renderPlayers();
    renderBoard();
  }

  function renderConnection() {
    els.connectionLabel.classList.toggle("is-online", state.connected);
    els.connectionLabel.classList.toggle("is-offline", !state.connected);
    els.roomLabel.textContent = state.room
      ? `Room - ${state.connected ? "Live" : "Offline"}`
      : "No room";
  }

  function renderRoomInfo() {
    const room = state.room;
    const turn = room?.turn || "-";
    els.turnBadge.textContent = room ? turn.toUpperCase() : "-";
    els.turnBadge.dataset.team = turn;

    if (!room) {
      els.clueText.textContent = "No clue";
      els.redScore.textContent = "Red -";
      els.blueScore.textContent = "Blue -";
      els.newBoardButton.textContent = "Start";
      els.clueForm.querySelectorAll("input, button").forEach((element) => {
        element.disabled = true;
      });
      els.endTurnButton.disabled = true;
      els.newBoardButton.disabled = true;
      return;
    }

    const clue = room.clue ? `${room.clue.word} ${room.clue.count}` : "No clue";
    els.clueText.textContent = room.winner ? `${room.winner.toUpperCase()} wins` : clue;
    els.redScore.textContent = `Red ${room.remaining.red}`;
    els.blueScore.textContent = `Blue ${room.remaining.blue}`;
    els.newBoardButton.textContent = room.status === "waiting" ? "Start" : "New board";

    const canSubmitClue =
      room.status === "playing" &&
      !room.winner &&
      room.you?.role === "spymaster" &&
      room.you?.team === room.turn;
    els.clueForm.querySelectorAll("input, button").forEach((element) => {
      element.disabled = !canSubmitClue;
    });

    const canEndTurn = room.status === "playing" && !room.winner && room.you?.team === room.turn;
    els.endTurnButton.disabled = !canEndTurn;
    els.newBoardButton.disabled = !state.connected;
  }

  function renderPlayers() {
    const players = state.room?.players || [];
    els.playersList.replaceChildren(
      ...players.map((player) => {
        const item = document.createElement("li");
        item.className = "player-item";
        item.dataset.team = player.team;
        const name = document.createElement("span");
        name.textContent = player.name;
        const meta = document.createElement("span");
        meta.textContent = `${player.team} ${player.role}${player.connected ? "" : " offline"}`;
        item.append(name, meta);
        return item;
      }),
    );
  }

  function renderBoard() {
    const room = state.room;
    if (!room?.board?.length) {
      els.boardGrid.replaceChildren(
        ...Array.from({ length: 25 }, () => {
          const tile = document.createElement("div");
          tile.className = "word-card is-empty";
          tile.textContent = "-";
          return tile;
        }),
      );
      return;
    }

    const canReveal =
      room.status === "playing" &&
      !room.winner &&
      room.clue &&
      room.you?.role === "operative" &&
      room.you?.team === room.turn;

    els.boardGrid.replaceChildren(
      ...room.board.map((card, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "word-card";
        button.dataset.kind = card.kind || "hidden";
        button.dataset.revealed = card.revealed ? "true" : "false";
        button.disabled = card.revealed || !canReveal;
        button.addEventListener("click", () => send({ type: "reveal_card", index }));

        const word = document.createElement("span");
        word.className = "word";
        word.textContent = card.word;
        button.append(word);

        if (card.kind && (card.revealed || room.you?.role === "spymaster")) {
          const marker = document.createElement("span");
          marker.className = "card-kind";
          marker.textContent = card.kind;
          button.append(marker);
        }

        return button;
      }),
    );
  }

  function setStatus(message) {
    els.statusText.textContent = message;
  }

  function setBusy(isBusy) {
    els.createRoomButton.disabled = isBusy;
    els.copyShareButton.disabled = isBusy || !els.shareUrl.value;
  }
})();
