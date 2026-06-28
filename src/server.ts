import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getDataRoot, getDbPath, getRunsDir } from "./paths.js";
import { createV1Routes } from "./routes/v1.js";
import { createRunService } from "./services/run-service.js";
import { initializeSecrets } from "./security/secrets.js";

export function createApp() {
  const secrets = initializeSecrets();
  const app = new Hono();
  const runService = createRunService(secrets);
  app.route("/v1", createV1Routes(runService, secrets.remoteAgentToken));
  app.get("/health", (c) => c.json({ ok: true }));
  return app;
}

export function startServer() {
  fs.mkdirSync(getRunsDir(), { recursive: true });
  fs.mkdirSync(path.dirname(getDbPath()), { recursive: true });

  const port = Number(process.env.PORT ?? 8080);
  const app = createApp();

  console.log(`Remote agent API listening on :${port} (data: ${getDataRoot()})`);
  serve({ fetch: app.fetch, port });
}
