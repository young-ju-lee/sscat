import { httpServerHandler } from "cloudflare:node";
import { setDatabaseUrl } from "./server/db.js";

const { server } = await import("./server/index.js");
const handler = httpServerHandler(server);

export default {
  async fetch(request, env, ctx) {
    setDatabaseUrl(env.DATABASE_URL);
    return handler.fetch(request, env, ctx);
  },
};
