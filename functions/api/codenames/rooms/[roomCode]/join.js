export async function onRequestPost(context) {
  const roomCode = cleanRoomCode(context.params.roomCode);
  if (!roomCode) {
    return json({ error: "Invalid room code." }, 400);
  }

  const id = context.env.CODENAME_ROOMS.idFromName(roomCode);
  const stub = context.env.CODENAME_ROOMS.get(id);
  const player = await readJson(context.request);

  return stub.fetch(
    new Request(new URL(`/rooms/${roomCode}/join`, context.request.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...player, roomCode }),
    }),
  );
}

export function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
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
