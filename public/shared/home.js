import { games } from "/shared/games.js";

const gameGrid = document.querySelector("#gameGrid");

if (gameGrid) {
  gameGrid.replaceChildren(...games.map(renderGameCard));
}

function renderGameCard(game) {
  const card = game.route ? document.createElement("a") : document.createElement("article");
  card.className = game.route ? "project-card project-card-link" : "project-card";
  if (game.route) {
    card.href = game.route;
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
