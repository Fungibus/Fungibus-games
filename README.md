# Fungibus.github.io

## Development

Use the Node version pinned in `.nvmrc`, then install dependencies:

```sh
nvm use
npm install
```

Run the Worker locally:

```sh
npm run dev
```

Validate the Cloudflare deploy config without deploying:

```sh
npm run check
```

Deploy manually:

```sh
npm run deploy
```

## Cloudflare deploys

This repo deploys as one Cloudflare Worker with Workers Static Assets. Cloudflare
Git builds can use the default deploy command:

```sh
npx wrangler deploy
```

## Cloudflare layout

- `public/` contains static assets served through the Worker assets binding.
- `src/index.js` contains `/api/codenames/*` routes and the SQLite-backed
  Durable Object.

The Codename Grid backend uses `new_sqlite_classes` so it remains compatible
with the Workers Free plan.
