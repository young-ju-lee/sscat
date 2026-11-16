import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";

if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;

const { server } = await import("../Back-end/server/index.js");

export default httpServerHandler(server);
