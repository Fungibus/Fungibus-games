(() => {
  const TOKEN_KEY = "decrypto-player-token";
  const NAME_KEY = "decrypto-player-name";
  const TEAMS = ["white", "black"];

  const state = {
    socket: null,
    room: null,
    playerToken: getToken(),
    connected: false,
    logEntries: ["Create a room or open a shared link."],
    formTurnKey: "",
  };

  const els = {
    roomForm: document.querySelector("#roomForm"),
    createRoomButton: document.querySelector("#createRoomButton"),
    playerName: document.querySelector("#playerName"),
    shareBlock: document.querySelector("#shareBlock"),
    shareUrl: document.querySelector("#shareUrl"),
    copyShareButton: document.querySelector("#copyShareButton"),
    teamButtons: [...document.querySelectorAll("[data-team-button]")],
    connectionLabel: document.querySelector("#connectionLabel"),
    roomLabel: document.querySelector("#roomLabel"),
    turnBadge: document.querySelector("#turnBadge"),
    actionTitle: document.querySelector("#actionTitle"),
    actionCopy: document.querySelector("#actionCopy"),
    whiteScore: document.querySelector("#whiteScore"),
    blackScore: document.querySelector("#blackScore"),
    actionLog: document.querySelector("#actionLog"),
    gameControlBlock: document.querySelector("#gameControlBlock"),
    newGameButton: document.querySelector("#newGameButton"),
    teamsList: document.querySelector("#teamsList"),
    keywordGrid: document.querySelector("#keywordGrid"),
    turnTitle: document.querySelector("#turn-title"),
    codeDisplay: document.querySelector("#codeDisplay"),
    clueDisplay: document.querySelector("#clueDisplay"),
    clueForm: document.querySelector("#clueForm"),
    clueInputs: [...document.querySelectorAll("[data-clue-input]")],
    guessForm: document.querySelector("#guessForm"),
    guessInputs: [...document.querySelectorAll("[data-guess-input]")],
    guessButton: document.querySelector("#guessButton"),
    revealButton: document.querySelector("#revealButton"),
    guessHint: document.querySelector("#guessHint"),
    historyList: document.querySelector("#historyList"),
  };

  boot();

  function boot() {
    els.playerName.value =
      localStorage.getItem(NAME_KEY) || `Player ${state.playerToken.slice(0, 4)}`;

    const params = new URLSearchParams(window.location.search);
    const roomParam = cleanRoomCode(params.get("room") || "");

    els.guessInputs.forEach((select) => populateCodeSelect(select));
    els.guessInputs.forEach((select) => {
      select.addEventListener("change", renderGuessHint);
    });
    els.roomForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createRoom();
    });
    els.copyShareButton.addEventListener("click", copyShareUrl);
    els.teamButtons.forEach((button) => {
      button.addEventListener("click", () => setPlayerTeam(button.dataset.teamButton));
    });
    els.playerName.addEventListener("change", updatePlayer);
    els.newGameButton.addEventListener("click", () => {
      send({ type: state.room?.status === "waiting" ? "start_game" : "reset_game" });
    });
    els.clueForm.addEventListener("submit", submitClues);
    els.guessForm.addEventListener("submit", submitGuess);
    els.revealButton.addEventListener("click", () => {
      send({ type: "reveal_turn", targetTeam: state.room?.activeTeam });
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
      team: state.room?.you?.team || null,
    };
  }

  function registrationPayload() {
    const name = els.playerName.value.trim().slice(0, 24) || "Player";
    localStorage.setItem(NAME_KEY, name);
    return {
      playerToken: state.playerToken,
      name,
      team: null,
    };
  }

  async function createRoom() {
    setBusy(true);
    setStatus("Creating room.");
    try {
      const response = await fetch("/api/decrypto/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registrationPayload()),
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
      const response = await fetch(`/api/decrypto/rooms/${roomCode}/join`, {
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
    if (state.socket) {
      state.socket.close(1000, "reconnect");
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/decrypto/rooms/${roomCode}/socket?playerToken=${encodeURIComponent(
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

    const url = new URL("/decrypto/", window.location.origin);
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
    const payload = playerPayload();
    if (state.room?.you && state.socket?.readyState === WebSocket.OPEN) {
      send({ type: "set_player", ...payload });
    }
  }

  function setPlayerTeam(team) {
    if (!isTeam(team)) return;
    const name = els.playerName.value.trim().slice(0, 24) || "Player";
    localStorage.setItem(NAME_KEY, name);
    if (state.socket?.readyState === WebSocket.OPEN) {
      send({ type: "set_player", name, team });
      return;
    }
    setStatus("Create or join a room before choosing a team.");
  }

  function submitClues(event) {
    event.preventDefault();
    const clues = els.clueInputs.map((input) => input.value.trim());
    send({ type: "submit_clues", clues });
  }

  function submitGuess(event) {
    event.preventDefault();
    const room = state.room;
    if (!room) return;
    const guess = els.guessInputs.map((select) => Number.parseInt(select.value, 10));
    if (new Set(guess).size !== 3) {
      setStatus("Code numbers cannot repeat.");
      return;
    }
    send({ type: "submit_guess", targetTeam: room.activeTeam, guess });
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
    renderRoomInfo();
    renderActionLog();
    renderTeamControls();
    renderTeams();
    renderKeywords();
    renderCurrentTurn();
    renderHistory();
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
  }

  function renderRoomInfo() {
    const room = state.room;

    if (!room) {
      els.turnBadge.textContent = "No game";
      delete els.turnBadge.dataset.team;
      setAction("Create a room", "Invite players, choose teams, then start the first code.");
      renderScoreCard(els.whiteScore, "white", null, false, false);
      renderScoreCard(els.blackScore, "black", null, false, false);
      els.newGameButton.textContent = "Start game";
      els.newGameButton.disabled = true;
      return;
    }

    const hasActiveTurn = room.status !== "waiting";
    const action = currentAction(room);
    els.turnBadge.textContent =
      room.status === "finished"
        ? winnerTitle(room.winner)
        : hasActiveTurn
          ? room.phase === "clues"
            ? `Round ${room.round} - Clues`
            : `Round ${room.round} - ${capitalize(room.activeTeam)}`
          : "Waiting to start";

    if (hasActiveTurn && room.phase !== "clues" && room.status !== "finished") {
      els.turnBadge.dataset.team = room.activeTeam;
    } else {
      delete els.turnBadge.dataset.team;
    }

    setAction(action.title, action.copy);
    renderScoreCard(
      els.whiteScore,
      "white",
      room.teams.white,
      room.activeTeam === "white" && room.status === "playing" && room.phase !== "clues",
      room.you?.team === "white",
    );
    renderScoreCard(
      els.blackScore,
      "black",
      room.teams.black,
      room.activeTeam === "black" && room.status === "playing" && room.phase !== "clues",
      room.you?.team === "black",
    );
    els.newGameButton.textContent = room.status === "waiting" ? "Start game" : "Reset game";
    els.newGameButton.disabled = !state.connected || !room.isHost;
  }

  function setAction(title, copy) {
    els.actionTitle.textContent = title;
    els.actionCopy.textContent = copy;
  }

  function currentAction(room) {
    if (room.status === "waiting") {
      return room.isHost
        ? {
            title: "Set teams, then start",
            copy: "Players can choose White or Black before the host starts the first code.",
          }
        : {
            title: "Choose a team",
            copy: "Join White or Black. The host can start when the table is ready.",
          };
    }

    if (room.status === "finished") {
      return {
        title: winnerTitle(room.winner),
        copy: "Reset the room, then players can switch teams before the next game.",
      };
    }

    const turn = room.turns?.[room.activeTeam];
    const youTeam = room.you?.team;
    const activeTeam = room.activeTeam;

    if (!youTeam) {
      return {
        title: "Watching game",
        copy: "Teams are locked for this game. You can watch the codes resolve.",
      };
    }

    if (room.phase === "clues") {
      const ownTurn = room.turns?.[youTeam];
      if (room.you?.isEncryptor) {
        return ownTurn?.cluesSubmitted
          ? {
              title: "Clues locked",
              copy: "Wait for the other Encryptor. Both clue sets resolve after they are ready.",
            }
          : {
              title: "Write three clues",
              copy: `You are the ${capitalize(youTeam)} Encryptor for code ${visibleCode(
                ownTurn?.code,
              )}.`,
            };
      }

      return {
        title: "Encryptors writing",
        copy: `${encryptorName(room, "white")} and ${encryptorName(
          room,
          "black",
        )} are preparing this round's clues.`,
      };
    }

    if (youTeam === activeTeam && room.you?.isEncryptor) {
      return {
        title: "Your team decodes",
        copy: "Stay out of the discussion while your teammates decode your clues.",
      };
    }

    if (!turn?.homeGuess && youTeam === activeTeam) {
      return {
        title: "Decode your clues",
        copy: `Enter the code from ${encryptorName(room, activeTeam)}'s clues.`,
      };
    }

    if (youTeam !== activeTeam && room.round === 1) {
      return {
        title: "Read and remember",
        copy: "Interceptions begin in round 2. Use this clue set to learn their patterns.",
      };
    }

    if (youTeam !== activeTeam && !turn?.interceptGuess) {
      return {
        title: "Try to intercept",
        copy: `Guess ${capitalize(activeTeam)}'s code before it is revealed.`,
      };
    }

    if (turn?.homeGuess && !turn.revealed) {
      return youTeam === activeTeam
        ? {
            title: "Decode locked",
            copy: "Waiting for the opposing team before the code is revealed.",
          }
        : {
            title: "Waiting for reveal",
            copy: "The active code will reveal after guesses are locked.",
          };
    }

    return {
      title: "Next code",
      copy: "The table will advance when this code is complete.",
    };
  }

  function renderScoreCard(element, team, score, isActive, isYou) {
    element.replaceChildren();
    element.dataset.team = team;
    element.classList.toggle("is-active", isActive);

    const title = document.createElement("div");
    title.className = "score-card-title";
    const name = document.createElement("span");
    name.textContent = `${capitalize(team)} team`;
    const meta = document.createElement("span");
    meta.textContent = isYou ? "Your team" : isActive ? "Active" : "Score";
    title.append(name, meta);

    element.append(
      title,
      renderScoreTrack("Intercepts", score?.intercepts || 0),
      renderScoreTrack("Miscommunications", score?.miscues || 0),
    );
  }

  function renderScoreTrack(label, value) {
    const track = document.createElement("div");
    track.className = "score-track";

    const line = document.createElement("div");
    line.className = "score-track-label";
    const text = document.createElement("span");
    text.textContent = label;
    const count = document.createElement("span");
    count.textContent = `${value}/2`;
    line.append(text, count);

    const dots = document.createElement("div");
    dots.className = "score-dots";
    dots.replaceChildren(
      ...[0, 1].map((index) => {
        const dot = document.createElement("span");
        dot.className = "score-dot";
        dot.classList.toggle("is-filled", index < value);
        return dot;
      }),
    );

    track.append(line, dots);
    return track;
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

  function logRoomChanges(previousRoom, room) {
    if (!room) return;

    if (!previousRoom) {
      if (room.status === "playing") {
        addLogEntry(`Joined active game. Round ${room.round}.`);
      }
      return;
    }

    if (room.status === "playing" && previousRoom.status === "waiting") {
      resetLog("Game started. Round 1.");
    }

    if (room.status === "waiting" && previousRoom.status !== "waiting") {
      resetLog("Game reset. Players can switch teams before the next game.");
    }

    const latest = room.history?.[0];
    if (latest && historySignature(latest) !== historySignature(previousRoom.history?.[0])) {
      const code = latest.code.join("-");
      addLogEntry(`${capitalize(latest.team)} revealed ${code}.`);
    }

    if (
      room.status === "playing" &&
      previousRoom.status === "playing" &&
      room.round !== previousRoom.round
    ) {
      addLogEntry(`Round ${room.round}.`);
    }

    if (room.winner && previousRoom.winner !== room.winner) {
      addLogEntry(winnerTitle(room.winner));
    }
  }

  function addLogEntry(message) {
    if (!message) return;
    const lastEntry = state.logEntries.at(-1);
    if (lastEntry === message) return;
    state.logEntries.push(message);
    if (state.logEntries.length > 80) {
      state.logEntries.splice(0, state.logEntries.length - 80);
    }
  }

  function resetLog(message) {
    state.logEntries = message ? [message] : [];
  }

  function historySignature(item) {
    return item ? `${item.round}:${item.team}:${item.code.join("")}` : "";
  }

  function renderTeamControls() {
    const you = state.room?.you;

    els.teamButtons.forEach((button) => {
      const team = button.dataset.teamButton;
      button.classList.toggle("is-active", you?.team === team);
      button.disabled = !state.connected || !state.room || state.room.status !== "waiting";
      button.setAttribute("aria-pressed", String(you?.team === team));
    });
  }

  function renderTeams() {
    const players = state.room?.players || [];
    const groups = [
      ["white", "White team"],
      ["black", "Black team"],
      [null, "Unassigned"],
    ];

    els.teamsList.replaceChildren(
      ...groups.map(([team, label]) => {
        const group = document.createElement("section");
        group.className = "team-group";
        if (team) group.dataset.team = team;

        const heading = document.createElement("h3");
        heading.textContent = label;

        const list = document.createElement("ul");
        list.className = "players-list";

        const teamPlayers = players.filter((player) =>
          team ? player.team === team : !player.team,
        );
        if (teamPlayers.length) {
          list.replaceChildren(...teamPlayers.map(renderPlayerItem));
        } else {
          const empty = document.createElement("li");
          empty.className = "player-item is-empty";
          empty.textContent = "No players";
          list.append(empty);
        }

        group.append(heading, list);
        return group;
      }),
    );
  }

  function renderPlayerItem(player) {
    const item = document.createElement("li");
    item.className = "player-item";
    item.dataset.team = player.team || "unassigned";
    const name = document.createElement("span");
    name.textContent = player.name;
    const meta = document.createElement("span");
    meta.textContent = player.isEncryptor
      ? `Encryptor${player.connected ? "" : " offline"}`
      : `${player.team || "unassigned"}${player.connected ? "" : " offline"}`;
    item.append(name, meta);
    return item;
  }

  function renderKeywords() {
    const room = state.room;
    const youTeam = room?.you?.team;
    const orderedTeams = youTeam ? [youTeam, ...TEAMS.filter((team) => team !== youTeam)] : TEAMS;
    els.keywordGrid.replaceChildren(...orderedTeams.map((team) => renderKeywordPanel(team, room)));
  }

  function renderKeywordPanel(team, room) {
    const panel = document.createElement("article");
    panel.className = "keyword-panel";
    panel.dataset.team = team;
    panel.classList.toggle("is-own", room?.you?.team === team);
    panel.classList.toggle("is-locked", room?.you?.team !== team);

    const head = document.createElement("div");
    head.className = "keyword-panel-head";

    const title = document.createElement("h3");
    title.textContent = `${capitalize(team)} team`;

    const status = document.createElement("span");
    status.className = "status";
    status.textContent = room?.you?.team === team ? "Private screen" : "Locked";

    const list = document.createElement("ol");
    list.className = "keyword-list";

    const words = room?.teams?.[team]?.words?.length
      ? room.teams[team].words
      : Array.from({ length: 4 }, () => null);
    list.replaceChildren(
      ...words.map((word, index) => {
        const item = document.createElement("li");
        item.className = "keyword-card";
        item.classList.toggle("is-hidden", !word);

        const number = document.createElement("span");
        number.className = "keyword-number";
        number.textContent = String(index + 1);

        const value = document.createElement("span");
        value.className = "keyword-word";
        value.textContent = word || "Locked";

        item.append(number, value);
        return item;
      }),
    );

    head.append(title, status);
    panel.append(head, list);
    return panel;
  }

  function renderCurrentTurn() {
    const room = state.room;
    const activeTeam = currentDisplayTeam(room);
    const turn = room?.turns?.[activeTeam];
    const youTeam = room?.you?.team;
    const turnKey =
      room && turn
        ? `${room.round}:${room.phase}:${activeTeam}:${turn.cluesSubmitted}:${turn.revealed}`
        : "";

    els.turnTitle.textContent =
      room?.status === "finished"
        ? winnerTitle(room.winner)
        : room?.status === "playing"
          ? room.phase === "clues"
            ? `${capitalize(activeTeam)} Encryptor`
            : `${capitalize(activeTeam)} code`
          : "Waiting";

    renderCode(turn?.code || [null, null, null]);
    renderClues(turn);

    if (turnKey !== state.formTurnKey) {
      state.formTurnKey = turnKey;
      els.clueInputs.forEach((input) => {
        input.value = "";
      });
      els.guessInputs.forEach((select, index) => {
        select.value = String(index + 1);
      });
    }

    const canSendClues =
      state.connected &&
      room?.status === "playing" &&
      !room.winner &&
      room.phase === "clues" &&
      youTeam === activeTeam &&
      room.you?.isEncryptor &&
      !turn?.cluesSubmitted;
    els.clueInputs.forEach((input) => {
      input.disabled = !canSendClues;
    });
    const clueButton = els.clueForm.querySelector("button");
    clueButton.disabled = !canSendClues;
    clueButton.classList.toggle("is-primary-action", canSendClues);

    const isHomeTeam = youTeam === room?.activeTeam;
    const hasOwnGuess = isHomeTeam ? turn?.homeGuess : turn?.interceptGuess;
    const canGuess =
      state.connected &&
      room?.status === "playing" &&
      !room.winner &&
      room.phase !== "clues" &&
      Boolean(youTeam) &&
      turn?.cluesSubmitted &&
      !turn.revealed &&
      !hasOwnGuess &&
      ((isHomeTeam && !room.you?.isEncryptor) || (!isHomeTeam && room.round > 1));

    els.guessInputs.forEach((select) => {
      select.disabled = !canGuess;
    });
    els.guessButton.disabled = !canGuess;
    els.guessButton.textContent = isHomeTeam ? "Decode" : "Intercept";
    els.guessButton.classList.toggle("is-primary-action", canGuess);

    const canReveal =
      state.connected &&
      room?.status === "playing" &&
      !room.winner &&
      room.phase !== "clues" &&
      turn?.cluesSubmitted &&
      turn?.homeGuess &&
      (room.round === 1 || turn.interceptGuess) &&
      !turn.revealed &&
      (isHomeTeam || room.isHost);
    els.revealButton.disabled = !canReveal;
    els.revealButton.classList.toggle("is-primary-action", canReveal);
    renderGuessHint();
  }

  function renderCode(code) {
    els.codeDisplay.replaceChildren(
      ...code.map((digit) => {
        const tile = document.createElement("span");
        tile.className = "code-tile";
        tile.classList.toggle("is-hidden", !digit);
        tile.textContent = digit || "?";
        return tile;
      }),
    );
  }

  function renderClues(turn) {
    const children = [];
    const clues = turn?.cluesSubmitted ? turn.clues : ["", "", ""];
    clues.forEach((clue, index) => {
      const chip = document.createElement("span");
      chip.className = "clue-chip";
      chip.classList.toggle("is-empty", !clue);
      chip.textContent = clue || `Clue ${index + 1}`;
      children.push(chip);
    });

    if (turn?.homeGuess) {
      children.push(renderGuessPill("Home", turn.homeGuess, turn.results?.homeCorrect));
    }
    if (turn?.interceptGuess) {
      children.push(
        renderGuessPill("Intercept", turn.interceptGuess, turn.results?.interceptCorrect),
      );
    }

    els.clueDisplay.replaceChildren(...children);
  }

  function renderGuessPill(label, guess, result) {
    const pill = document.createElement("span");
    pill.className = "guess-pill";
    if (result === true) pill.classList.add("is-correct");
    if (result === false) pill.classList.add("is-wrong");
    pill.textContent = `${label}: ${guess.join("-")}`;
    return pill;
  }

  function renderGuessHint() {
    const guess = els.guessInputs.map((select) => Number.parseInt(select.value, 10));
    const hasDuplicate = new Set(guess).size !== guess.length;
    const enabled = !els.guessButton.disabled;

    els.guessHint.classList.toggle("is-warning", hasDuplicate && enabled);
    if (hasDuplicate && enabled) {
      els.guessHint.textContent = "Use three different numbers.";
      return;
    }
    if (enabled) {
      els.guessHint.textContent = "Choose three different numbers, then submit.";
      return;
    }
    const room = state.room;
    if (room?.phase === "clues") {
      els.guessHint.textContent = "Guessing opens after both Encryptors send clues.";
      return;
    }
    if (room?.you?.isEncryptor && room.you.team === room.activeTeam) {
      els.guessHint.textContent = "The Encryptor cannot decode their own clues.";
      return;
    }
    els.guessHint.textContent = "Guessing opens when the active clues are ready.";
  }

  function renderHistory() {
    const history = state.room?.history || [];
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "muted-line";
      empty.textContent = "No revealed codes.";
      els.historyList.replaceChildren(empty);
      return;
    }

    els.historyList.replaceChildren(...history.map(renderHistoryItem));
  }

  function renderHistoryItem(entry) {
    const item = document.createElement("article");
    item.className = "history-item";
    item.dataset.team = entry.team;

    const meta = document.createElement("div");
    meta.className = "history-meta";
    const round = document.createElement("span");
    round.textContent = `Round ${entry.round}`;
    const team = document.createElement("span");
    team.textContent = capitalize(entry.team);
    const code = document.createElement("span");
    code.className = "history-code";
    code.textContent = entry.code.join("-");
    meta.append(round, team, code);

    const clues = document.createElement("ol");
    clues.className = "history-clues";
    clues.replaceChildren(
      ...entry.clues.map((clue) => {
        const clueItem = document.createElement("li");
        clueItem.textContent = clue;
        return clueItem;
      }),
    );

    const summary = document.createElement("div");
    summary.className = "guess-summary";
    summary.append(renderGuessPill("Home", entry.homeGuess, entry.results.homeCorrect));
    if (entry.interceptGuess) {
      summary.append(
        renderGuessPill("Intercept", entry.interceptGuess, entry.results.interceptCorrect),
      );
    }

    item.append(meta, clues, summary);
    return item;
  }

  function populateCodeSelect(select) {
    select.replaceChildren(
      ...[1, 2, 3, 4].map((digit) => {
        const option = document.createElement("option");
        option.value = String(digit);
        option.textContent = String(digit);
        return option;
      }),
    );
  }

  function setStatus(message) {
    if (!shouldLogStatus(message)) return;
    addLogEntry(message);
    renderActionLog();
  }

  function shouldLogStatus(message) {
    return !["Connected.", "Disconnected."].includes(message);
  }

  function setBusy(isBusy) {
    els.createRoomButton.disabled = isBusy;
    els.copyShareButton.disabled = isBusy || !els.shareUrl.value;
  }

  function isTeam(team) {
    return team === "white" || team === "black";
  }

  function visibleCode(code = []) {
    return code.map((digit) => digit || "?").join("-");
  }

  function currentDisplayTeam(room) {
    if (!room) return null;
    if (room.phase === "clues" && room.you?.team) return room.you.team;
    return room.activeTeam;
  }

  function encryptorName(room, team) {
    return room?.encryptors?.[team]?.name || `${capitalize(team)} Encryptor`;
  }

  function winnerTitle(winner) {
    return winner === "tie" ? "Tie game" : `${capitalize(winner)} wins`;
  }

  function capitalize(value) {
    return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
  }
})();
