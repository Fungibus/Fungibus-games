# Fungibus.github.io

## Development

Use the Node version pinned in `.nvmrc`, then install dependencies:

```sh
nvm use
npm install
```

Run the Cloudflare Worker API locally:

```sh
npm run dev
```

Serve the static frontend from the repo root in another terminal:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/codenames/`.

Validate the Cloudflare deploy config without deploying:

```sh
npm run check
```

Deploy manually:

```sh
npm run deploy
```

## Frontend deploys

GitHub Pages serves the frontend from the repository root. The root `_config.yml`
excludes backend and project files from the published site.

Before publishing, replace the placeholder `fungibus-api-origin` meta value in
`codenames/index.html` with the deployed Cloudflare Worker origin, for example:

```txt
https://fungibus-games.<workers-dev-subdomain>.workers.dev
```

## Cloudflare deploys

Cloudflare deploys only the backend Worker and Durable Object. Cloudflare Git
builds can use the default deploy command:

```sh
npx wrangler deploy
```

## Cloudflare layout

- Root HTML/CSS/JS files are the GitHub Pages frontend.
- `src/index.js` contains `/api/codenames/*` routes, CORS handling, and the
  SQLite-backed Durable Object.

The Codename Grid backend uses `new_sqlite_classes` so it remains compatible
with the Workers Free plan.
