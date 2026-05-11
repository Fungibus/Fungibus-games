import { json } from "./shared/http.js";
import { handleCodenamesApiRequest } from "./games/codenames/routes.js";

export { CodenameRoom } from "./games/codenames/room.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/codenames/")) {
      const response = await handleCodenamesApiRequest(request, env, url);
      return response ?? json({ error: "Not found." }, 404);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
