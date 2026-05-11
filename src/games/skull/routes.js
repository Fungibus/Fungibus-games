import { json, methodNotAllowed, readJson } from "../../shared/http.js";
import { cleanRoomCode, createRoomCode } from "../../shared/rooms.js";

const MAX_ROOM_CREATE_ATTEMPTS = 6;

export async function handleSkullApiRequest(request, env, url) {
  if (url.pathname === "/api/skull/rooms" || url.pathname === "/api/skull/rooms/") {
    if (request.method !== "POST") return methodNotAllowed();
    return createApiRoom(request, env);
  }

  const joinMatch = url.pathname.match(/^\/api\/skull\/rooms\/([^/]+)\/join\/?$/);
  if (joinMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    return joinApiRoom(request, env, joinMatch[1]);
  }

  const socketMatch = url.pathname.match(/^\/api\/skull\/rooms\/([^/]+)\/socket\/?$/);
  if (socketMatch) {
    if (request.method !== "GET") return methodNotAllowed();
    return openApiRoomSocket(request, env, socketMatch[1]);
  }

  return null;
}

async function createApiRoom(request, env) {
  const player = await readJson(request);

  for (let attempt = 0; attempt < MAX_ROOM_CREATE_ATTEMPTS; attempt += 1) {
    const roomCode = createRoomCode();
    const response = await fetchRoom(env, roomCode, request.url, "create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...player, roomCode }),
    });

    if (response.status !== 409) {
      if (!response.ok) return response;
      const payload = await readJson(response);
      return json({
        ...payload,
        shareUrl: roomShareUrl(request.url, payload.roomCode || roomCode),
      });
    }
  }

  return json({ error: "No room code is available." }, 503);
}

async function joinApiRoom(request, env, value) {
  const roomCode = cleanRoomCode(value);
  if (!roomCode) return json({ error: "Invalid room code." }, 400);

  const player = await readJson(request);
  const response = await fetchRoom(env, roomCode, request.url, "join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...player, roomCode }),
  });
  if (!response.ok) return response;

  const payload = await readJson(response);
  return json({
    ...payload,
    shareUrl: roomShareUrl(request.url, payload.roomCode || roomCode),
  });
}

function openApiRoomSocket(request, env, value) {
  const roomCode = cleanRoomCode(value);
  if (!roomCode) return json({ error: "Invalid room code." }, 400);

  const url = new URL(request.url);
  url.pathname = `/rooms/${roomCode}/socket`;
  const stub = getRoomStub(env, roomCode);
  return stub.fetch(new Request(url, request));
}

function fetchRoom(env, roomCode, baseUrl, action, init) {
  const stub = getRoomStub(env, roomCode);
  return stub.fetch(new Request(new URL(`/rooms/${roomCode}/${action}`, baseUrl), init));
}

function getRoomStub(env, roomCode) {
  const id = env.SKULL_ROOMS.idFromName(roomCode);
  return env.SKULL_ROOMS.get(id);
}

function roomShareUrl(baseUrl, roomCode) {
  const url = new URL("/skull/", baseUrl);
  url.searchParams.set("room", roomCode);
  return url.toString();
}
