const MAX_ROOM_CREATE_ATTEMPTS = 6;

export async function onRequestPost(context) {
  const player = await readJson(context.request);

  for (let attempt = 0; attempt < MAX_ROOM_CREATE_ATTEMPTS; attempt += 1) {
    const roomCode = createRoomCode();
    const id = context.env.CODENAME_ROOMS.idFromName(roomCode);
    const stub = context.env.CODENAME_ROOMS.get(id);
    const response = await stub.fetch(
      new Request(new URL(`/rooms/${roomCode}/create`, context.request.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...player, roomCode }),
      }),
    );

    if (response.status !== 409) {
      return response;
    }
  }

  return json({ error: "No room code is available." }, 503);
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

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function json(body, status = 200) {
  return Response.json(body, { status });
}
