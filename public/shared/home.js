import { games } from "/shared/games.js";

const gameGrid = document.querySelector("#gameGrid");
const loadingDelayMs = 720;
let pendingNavigation = false;

if (gameGrid) {
  gameGrid.replaceChildren(...games.map(renderGameCard));
}

function renderGameCard(game) {
  const card = game.route ? document.createElement("a") : document.createElement("article");
  card.className = game.route ? "project-card project-card-link" : "project-card";
  if (game.route) {
    card.href = game.route;
    card.dataset.gameTitle = game.title;
    card.addEventListener("click", handleGameClick);
  }

  const topLine = document.createElement("div");
  topLine.className = "card-topline";

  const title = document.createElement("h3");
  title.textContent = game.title;

  const status = document.createElement("span");
  status.className = "status";
  status.textContent = game.status;

  const description = document.createElement("p");
  description.textContent = game.description;

  topLine.append(title, status);
  card.append(topLine, description);
  return card;
}

function handleGameClick(event) {
  if (shouldLetBrowserHandle(event) || pendingNavigation) {
    return;
  }

  const card = event.currentTarget;
  event.preventDefault();
  pendingNavigation = true;
  card.setAttribute("aria-busy", "true");
  showLoadingOverlay(card.dataset.gameTitle || "Game");

  window.setTimeout(() => {
    window.location.href = card.href;
  }, loadingDelayMs);
}

function shouldLetBrowserHandle(event) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function showLoadingOverlay(gameTitle) {
  const overlay = document.createElement("div");
  overlay.className = "game-loading";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");

  const loadingCard = document.createElement("div");
  loadingCard.className = "game-loading-card";

  const spinner = document.createElement("span");
  spinner.className = "game-loading-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.textContent = `Loading ${gameTitle}`;

  loadingCard.append(spinner, label);
  overlay.append(loadingCard);
  document.body.append(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
  });
}

window.addEventListener("pageshow", () => {
  pendingNavigation = false;
  document.querySelector(".game-loading")?.remove();
  document.querySelectorAll("[aria-busy='true']").forEach((element) => {
    element.removeAttribute("aria-busy");
  });
});
