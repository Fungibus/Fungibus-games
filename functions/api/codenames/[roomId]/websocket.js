const ROOM_PATTERN = /^[A-Z0-9]{6,12}$/;

export async function onRequest(context) {
  const roomId = String(context.params.roomId || "").toUpperCase();

  if (!ROOM_PATTERN.test(roomId)) {
    return new Response("Invalid room id", { status: 400 });
  }

  if (context.request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  if (!context.env.CODENAMES_ROOMS) {
    return new Response("Missing CODENAMES_ROOMS binding", { status: 500 });
  }

  const id = context.env.CODENAMES_ROOMS.idFromName(roomId);
  const room = context.env.CODENAMES_ROOMS.get(id);
  const url = new URL(context.request.url);
  url.pathname = `/rooms/${roomId}/websocket`;

  return room.fetch(new Request(url, context.request));
}
