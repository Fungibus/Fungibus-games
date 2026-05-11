# Fungibus.github.io

Static mini-game site deployed with Cloudflare Pages.

## Codenames multiplayer

The `/codenames/` page uses Cloudflare Pages for the frontend and a separate
Cloudflare Worker Durable Object for realtime room state.

### Cloudflare Pages

Keep the existing Pages GitHub project pointed at the repo root:

- Build command: none
- Output directory: `/`
- Pages Function binding: `CODENAMES_ROOMS`
- Durable Object namespace: the `CodenamesRoom` namespace from the Worker below

The Pages Function proxy lives at:

```text
functions/api/codenames/[roomId]/websocket.js
```

### Cloudflare Worker

Create a separate Worker project connected to the same GitHub repo:

- Root directory: `workers/codenames`
- Deploy command: `npx wrangler deploy`
- Config file: `workers/codenames/wrangler.jsonc`

For manual deploys:

```sh
cd workers/codenames
npm install
npx wrangler deploy
```

The Worker defines a SQLite-backed Durable Object class named
`CodenamesRoom`, which is compatible with the Workers Free plan.

### Local development

Run the Worker:

```sh
cd workers/codenames
npm install
npx wrangler dev
```

In another terminal, run Pages with the Durable Object binding:

```sh
npx wrangler pages dev . --do CODENAMES_ROOMS=CodenamesRoom@codenames-multiplayer
```

Then open `/codenames/?room=ABC123` from the Pages dev URL in multiple browser
windows.
