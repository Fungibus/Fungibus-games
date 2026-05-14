(() => {
  const TOKEN_KEY = "just-one-player-token";
  const NAME_KEY = "just-one-player-name";

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
    scoreBadge: document.querySelector("#scoreBadge"),
    mysteryWord: document.querySelector("#mysteryWord"),
    cardBoard: document.querySelector("#cardBoard"),
    clueBoard: document.querySelector("#clueBoard"),
    numberPanel: document.querySelector("#numberPanel"),
    clueForm: document.querySelector("#clueForm"),
    clueLabel: document.querySelector("#clueLabel"),
    clueInput: document.querySelector("#clueInput"),
    guessForm: document.querySelector("#guessForm"),
    guessInput: document.querySelector("#guessInput"),
    passButton: document.querySelector("#passButton"),
    checkPanel: document.querySelector("#checkPanel"),
    submittedGuess: document.querySelector("#submittedGuess"),
    playersList: document.querySelector("#playersList"),
    actionLog: document.querySelector("#actionLog"),
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
    els.clueForm.addEventListener("submit", (event) => {
      event.preventDefault();
      send({ type: "submit_clue", clue: els.clueInput.value });
      els.clueInput.value = "";
    });
    els.guessForm.addEventListener("submit", (event) => {
      event.preventDefault();
      send({
        type: "submit_guess",
        guess: els.guessInput.value,
      });
    });
    els.passButton.addEventListener("click", () => {
      send({ type: "submit_guess", pass: true });
      els.guessInput.value = "";
    });
    els.checkPanel.querySelectorAll("[data-check-result]").forEach((button) => {
      button.addEventListener("click", () => {
        send({
          type: "resolve_guess",
          result: button.dataset.checkResult,
        });
        els.guessInput.value = "";
      });
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
      const response = await fetch("/api/just-one/rooms", {
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
      const response = await fetch(`/api/just-one/rooms/${roomCode}/join`, {
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
        `${protocol}//${window.location.host}/api/just-one/rooms/${roomCode}/socket?playerToken=${encodeURIComponent(
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

    const url = new URL("/just-one/", window.location.origin);
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
    renderWord();
    renderCard();
    renderClues();
    renderControls();
    renderPlayers();
    renderLog();
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
    els.newGameButton.textContent = !room || waiting ? "Start game" : "Reset game";
    setShareUrl(els.shareUrl.value);
  }

  function renderStatus() {
    const room = state.room;
    if (!room) {
      setPhase("Room", "Create a room", "Invite 3-7 players, then start.");
      els.scoreBadge.textContent = "0/13";
      return;
    }

    els.scoreBadge.textContent = `${room.score}/${room.roundTotal}`;

    if (room.status === "waiting") {
      const needed = Math.max(0, room.minPlayers - room.players.length);
      setPhase(
        "Lobby",
        needed ? `${needed} more` : "Ready",
        `${room.players.length}/${room.maxPlayers} players`,
      );
      return;
    }

    if (room.status === "finished") {
      setPhase("Finished", `${room.score}/${room.roundTotal}`, scoreLine(room.score, room.roundTotal));
      return;
    }

    const active = room.activePlayerName || "Player";
    if (room.phase === "selecting_word") {
      setPhase(`Round ${room.round}`, active, `${active} chooses 1-5`);
    } else if (room.phase === "writing_clues") {
      setPhase(`Round ${room.round}`, active, `${room.clueCount}/${room.clueTarget} clues locked`);
    } else if (room.phase === "guessing") {
      setPhase(`Round ${room.round}`, `${active} guesses`, `${room.clues.length} clues remain`);
    } else if (room.phase === "checking_guess") {
      setPhase(`Round ${room.round}`, "Check guess", `"${room.lastGuess?.guess || ""}"`);
    }
  }

  function setPhase(eyebrow, title, copy) {
    els.phaseEyebrow.textContent = eyebrow;
    els.phaseTitle.textContent = title;
    els.phaseCopy.textContent = copy;
  }

  function renderWord() {
    const room = state.room;
    if (!room) {
      els.mysteryWord.textContent = "Hidden";
      els.mysteryWord.classList.add("is-hidden");
      return;
    }

    if (room.status === "waiting") {
      els.mysteryWord.textContent = "Ready";
      els.mysteryWord.classList.remove("is-hidden");
      return;
    }

    if (room.status === "finished") {
      els.mysteryWord.textContent = scoreLine(room.score, room.roundTotal);
      els.mysteryWord.classList.remove("is-hidden");
      return;
    }

    els.mysteryWord.textContent = room.word || "Hidden";
    els.mysteryWord.classList.toggle("is-hidden", !room.word);
  }

  function renderCard() {
    const room = state.room;
    const card = room?.card || [];

    if (!room || room.status !== "playing" || !card.length || room.isActivePlayer) {
      els.cardBoard.innerHTML = "";
      els.cardBoard.hidden = true;
      return;
    }

    els.cardBoard.hidden = false;
    els.cardBoard.innerHTML = card
      .map(
        (word, index) => `
          <div class="card-word ${room.selectedNumber === index + 1 ? "is-selected" : ""}">
            <b>${index + 1}</b>
            <span>${escapeHtml(word)}</span>
          </div>
        `,
      )
      .join("");
  }

  function renderClues() {
    const room = state.room;
    const clues = room?.clues || [];

    if (!room || room.status === "waiting") {
      els.clueBoard.innerHTML = `<p class="empty-state">Create or join a room.</p>`;
      return;
    }

    if (room.status === "finished") {
      els.clueBoard.innerHTML = `<p class="empty-state">${escapeHtml(scoreLine(room.score, room.roundTotal))}</p>`;
      return;
    }

    if (room.phase === "selecting_word") {
      els.clueBoard.innerHTML = `<p class="empty-state">${
        room.isActivePlayer ? "Choose a number." : "Waiting for the number."
      }</p>`;
      return;
    }

    if (room.phase === "writing_clues") {
      els.clueBoard.innerHTML = `
        <div class="clue-progress" aria-label="Clue progress">
          ${room.players
            .filter((player) => !player.isActivePlayer)
            .flatMap((player) =>
              Array.from(
                { length: room.cluesPerPlayer },
                (_, index) => `<span class="${player.clueCount > index ? "is-ready" : ""}"></span>`,
              ),
            )
            .join("")}
        </div>
      `;
      return;
    }

    if (!clues.length) {
      els.clueBoard.innerHTML = `<p class="empty-state">No clues remain.</p>`;
      return;
    }

    els.clueBoard.innerHTML = clues
      .map(
        (clue) => `
          <article class="clue-card ${clue.eliminated ? "is-eliminated" : ""}">
            <span>${escapeHtml(clue.text)}</span>
            <small>${escapeHtml(clue.eliminated ? "duplicate" : clue.playerName)}</small>
          </article>
        `,
      )
      .join("");
  }

  function renderControls() {
    const room = state.room;
    const you = room?.players.find((player) => player.token === state.playerToken);
    const showNumbers = room?.status === "playing" && room.phase === "selecting_word" && room.isActivePlayer;
    const showClueForm =
      room?.status === "playing" &&
      room.phase === "writing_clues" &&
      !room.isActivePlayer &&
      !you?.hasClue;
    const showGuess = room?.status === "playing" && room.phase === "guessing" && room.isActivePlayer;
    const showCheck = room?.status === "playing" && room.phase === "checking_guess";
    const canCheck = showCheck && !room.isActivePlayer;

    els.numberPanel.hidden = !showNumbers;
    els.clueForm.hidden = !showClueForm;
    els.guessForm.hidden = !showGuess;
    els.checkPanel.hidden = !showCheck;

    if (showNumbers) {
      els.numberPanel.innerHTML = [1, 2, 3, 4, 5]
        .map((number) => `<button type="button" data-number="${number}">${number}</button>`)
        .join("");
      els.numberPanel.querySelectorAll("[data-number]").forEach((button) => {
        button.addEventListener("click", () => {
          send({ type: "choose_number", number: button.dataset.number });
        });
      });
    } else {
      els.numberPanel.innerHTML = "";
    }

    if (showClueForm) {
      els.clueLabel.textContent =
        room.cluesPerPlayer > 1 ? `Your clue ${you.clueCount + 1}/${room.cluesPerPlayer}` : "Your clue";
    }

    if (showCheck) {
      els.submittedGuess.textContent = room.lastGuess?.guess || "-";
      els.checkPanel.querySelectorAll("[data-check-result]").forEach((button) => {
        button.disabled = !canCheck;
      });
    }
  }

  function renderPlayers() {
    const players = state.room?.players || [];
    if (!players.length) {
      els.playersList.innerHTML = `<p class="empty-state">No players yet.</p>`;
      return;
    }

    els.playersList.innerHTML = players
      .map((player) => {
        const tags = [
          player.isActivePlayer ? "guesser" : "",
          player.hasClue ? "clue" : "",
          !player.connected ? "away" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `
          <article class="player-row ${player.token === state.playerToken ? "is-you" : ""}">
            <span>${escapeHtml(player.name)}</span>
            <small>${escapeHtml(tags || "ready")}</small>
          </article>
        `;
      })
      .join("");
  }

  function renderLog() {
    const history = state.room?.history || [];
    if (!history.length) {
      els.actionLog.innerHTML = `<li>${state.room ? "No rounds yet." : "Create or join."}</li>`;
      return;
    }
    els.actionLog.innerHTML = history.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  }

  function renderNotice() {
    const room = state.room;
    if (!room) {
      els.noticeLine.textContent = state.notice;
      return;
    }
    if (room.status === "waiting") {
      els.noticeLine.textContent = room.isHost ? "Start when enough players join." : "Waiting for host.";
      return;
    }
    if (room.status === "finished") {
      els.noticeLine.textContent = "Host can reset for another game.";
      return;
    }
    if (room.phase === "writing_clues") {
      els.noticeLine.textContent = room.isActivePlayer
        ? "Waiting for clues."
        : room.cluesPerPlayer > 1
          ? "Write two separate clues."
          : "Write one clue.";
      return;
    }
    if (room.phase === "selecting_word") {
      els.noticeLine.textContent = room.isActivePlayer ? "Choose a number from 1 to 5." : "Keep the card visible.";
      return;
    }
    if (room.phase === "guessing") {
      els.noticeLine.textContent = room.isActivePlayer ? "Enter one guess or pass." : "Waiting for the guess.";
      return;
    }
    if (room.phase === "checking_guess") {
      els.noticeLine.textContent = room.isActivePlayer ? "Waiting for teammates to check it." : "Check the guess.";
    }
  }

  function scoreLine(score, total) {
    if (score === total) return "Perfect score";
    if (score >= 10) return "Excellent";
    if (score >= 7) return "Solid";
    return "Keep trying";
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    els.createRoomButton.disabled = isBusy || Boolean(state.room);
    els.copyShareButton.disabled = isBusy || !els.shareUrl.value;
  }

  function setStatus(message) {
    if (!message) return;
    state.notice = message;
    els.noticeLine.textContent = message;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
