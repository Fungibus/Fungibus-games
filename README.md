# Fungibus Games

A small Cloudflare Worker site for browser-based mini games.

Visit the site at https://fungibus-games.fungibus.workers.dev.

## Local Development

```sh
npm install
npm run dev
```

Useful scripts:

- `npm run dev` starts Wrangler locally.
- `npm run check` runs a Wrangler deploy dry run.
- `npm run deploy` deploys the Worker and static assets.

## Project Structure

```text
public/
  index.html                 Site homepage and game directory
  styles.css                 Backward-compatible homepage stylesheet import
  shared/                    Shared browser styles and game registry
  codenames/                 Stable public route for /codenames/
  games/codenames/           Codenames frontend assets

src/
  index.js                   Worker entrypoint and top-level API dispatch
  shared/                    Worker helpers shared across games
  games/codenames/           Codenames API routes, rules, words, and room Durable Object
```

## Adding a Game

1. Add the frontend under `public/games/<slug>/`.
2. Add or preserve the public route under `public/<slug>/` if the game needs a short stable URL.
3. Add the game card to `public/shared/games.js`.
4. If the game needs backend state, add `src/games/<slug>/routes.js` and dispatch it from `src/index.js`.
5. If the game needs Durable Objects, add the class export in `src/index.js` and bind it in `wrangler.jsonc`.

Keep shared CSS in `public/shared/styles.css`; put game-specific layout and controls in the game folder.
