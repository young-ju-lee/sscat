import net from "node:net";
import { spawn } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

const API_PORT = 8787;

function waitForPort(port, timeout = 8000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeout) reject(new Error("API 서버가 시작되지 않았습니다."));
        else setTimeout(attempt, 50);
      });
    };
    attempt();
  });
}

function apiPlugin(databaseUrl) {
  let child;
  const stop = () => {
    if (child && !child.killed) child.kill();
  };
  const start = async () => {
    if (child && !child.killed) return;
    child = spawn(process.execPath, ["server/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl || process.env.DATABASE_URL || "",
        API_PORT: String(API_PORT),
      },
      stdio: "inherit",
    });
    await waitForPort(API_PORT);
  };
  return {
    name: "sscat-api",
    async configureServer(server) {
      await start();
      server.httpServer?.on("close", stop);
    },
    async configurePreviewServer(server) {
      await start();
      server.httpServer?.on("close", stop);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [vue(), apiPlugin(env.DATABASE_URL)],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${API_PORT}` },
    },
    preview: {
      proxy: { "/api": `http://127.0.0.1:${API_PORT}` },
    },
  };
});
