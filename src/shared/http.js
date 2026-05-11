export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function json(body, status = 200) {
  return Response.json(body, { status });
}

export function methodNotAllowed() {
  return json({ error: "Method not allowed." }, 405);
}
