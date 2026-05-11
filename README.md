# Fungibus.github.io

## Development

Use the Node version pinned in `.nvmrc`, then install dependencies:

```sh
nvm use
npm install
```

Run the Durable Object Worker in one terminal:

```sh
npm run dev:rooms
```

Run the Cloudflare Pages site in another terminal:

```sh
npm run dev:pages
```

Validate the Cloudflare deploy config without deploying:

```sh
npm run check
```

## Cloudflare layout

- `public/` contains the static Pages site.
- `functions/` contains Pages Functions for `/api/codenames/*`.
- `workers/codename-rooms/` contains the SQLite-backed Durable Object Worker.

The Codename Grid backend uses `new_sqlite_classes` so it remains compatible
with the Workers Free plan.
