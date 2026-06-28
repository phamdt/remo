import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getDataRoot, getDbPath, getRunsDir } from "./paths.js";
import { createV1Routes } from "./routes/v1.js";
import { createRunService } from "./services/run-service.js";

export function createApp(token: string) {
  const app = new Hono();
  const runService = createRunService();
  app.route("/v1", createV1Routes(runService, token));
  app.get("/health", (c) => c.json({ ok: true }));
  return app;
}

export function startServer() {
  const token = process.env.REMOTE_AGENT_TOKEN;
  if (!token) {
    throw new Error("REMOTE_AGENT_TOKEN is required");
  }

  fs.mkdirSync(getRunsDir(), { recursive: true });
  fs.mkdirSync(path.dirname(getDbPath()), { recursive: true });

  const port = Number(process.env.PORT ?? 8080);
  const app = createApp(token);

  console.log(`Remote agent API listening on :${port} (data: ${getDataRoot()})`);
  serve({ fetch: app.fetch, port });
}
