import { json } from "./shared/http.js";
import { handleCodenamesApiRequest } from "./games/codenames/routes.js";
import { handleDecryptoApiRequest } from "./games/decrypto/routes.js";

export { CodenameRoom } from "./games/codenames/room.js";
export { DecryptoRoom } from "./games/decrypto/room.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/codenames/")) {
      const response = await handleCodenamesApiRequest(request, env, url);
      return response ?? json({ error: "Not found." }, 404);
    }

    if (url.pathname.startsWith("/api/decrypto/")) {
      const response = await handleDecryptoApiRequest(request, env, url);
      return response ?? json({ error: "Not found." }, 404);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
