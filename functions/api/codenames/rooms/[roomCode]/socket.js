export function onRequestGet(context) {
  if (context.request.headers.get("Upgrade") !== "websocket") {
    return json({ error: "Expected a WebSocket upgrade request." }, 426);
  }

  const roomCode = cleanRoomCode(context.params.roomCode);
  if (!roomCode) {
    return json({ error: "Invalid room code." }, 400);
  }

  const url = new URL(context.request.url);
  url.pathname = `/rooms/${roomCode}/socket`;
  const id = context.env.CODENAME_ROOMS.idFromName(roomCode);
  const stub = context.env.CODENAME_ROOMS.get(id);
  return stub.fetch(new Request(url, context.request));
}

export function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}

function cleanRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function json(body, status = 200) {
  return Response.json(body, { status });
}
