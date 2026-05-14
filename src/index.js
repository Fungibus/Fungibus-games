import { json } from "./shared/http.js";
import { handleCodenamesApiRequest } from "./games/codenames/routes.js";
import { handleDecryptoApiRequest } from "./games/decrypto/routes.js";
import { handleJustOneApiRequest } from "./games/just-one/routes.js";
import { handleSkullApiRequest } from "./games/skull/routes.js";

export { CodenameRoom } from "./games/codenames/room.js";
export { DecryptoRoom } from "./games/decrypto/room.js";
export { JustOneRoom } from "./games/just-one/room.js";
export { SkullRoom } from "./games/skull/room.js";

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

    if (url.pathname.startsWith("/api/just-one/")) {
      const response = await handleJustOneApiRequest(request, env, url);
      return response ?? json({ error: "Not found." }, 404);
    }

    if (url.pathname.startsWith("/api/skull/")) {
      const response = await handleSkullApiRequest(request, env, url);
      return response ?? json({ error: "Not found." }, 404);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
