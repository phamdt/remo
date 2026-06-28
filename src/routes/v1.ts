import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  continueRunRequestSchema,
  createRunRequestSchema,
} from "../api-schema.js";
import { bearerAuth, extractBearerToken } from "../middleware/auth.js";
import type { RunService } from "../services/run-service.js";
import { runEventBus } from "../services/event-bus.js";
import type { SseEvent } from "../types.js";

export function createV1Routes(runService: RunService, token: string) {
  const app = new Hono();

  app.use("*", bearerAuth(token));

  app.get("/workspaces", (c) => {
    return c.json({ workspaces: runService.listWorkspaces() });
  });

  app.post("/runs", async (c) => {
    const body = createRunRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "Invalid request", details: body.error.flatten() }, 400);
    }
    const bearerToken = extractBearerToken(c);
    if (!bearerToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const result = runService.createRun(body.data, bearerToken);
      return c.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create run";
      const status = message.includes("Apply mode") ? 403 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.get("/runs/:id", (c) => {
    const summary = runService.getSummary(c.req.param("id"));
    if (!summary) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(summary);
  });

  app.get("/runs/:id/events", (c) => {
    const runId = c.req.param("id");
    const summary = runService.getSummary(runId);
    if (!summary) {
      return c.json({ error: "Not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      const send = async (event: SseEvent) => {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      };

      await send({ type: "status", status: summary.status });

      const unsubscribe = runEventBus.subscribe(runId, (event) => {
        void send(event);
      });

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          const current = runService.getSummary(runId);
          if (
            current &&
            ["completed", "failed", "cancelled"].includes(current.status)
          ) {
            clearInterval(timer);
            resolve();
          }
        }, 500);
      });

      unsubscribe();
    });
  });

  app.post("/runs/:id/continue", async (c) => {
    const runId = c.req.param("id");
    const body = continueRunRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "Invalid request", details: body.error.flatten() }, 400);
    }
    try {
      runService.continueRun(runId, body.data.prompt);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to continue run";
      const status = message.includes("not found") ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post("/runs/:id/cancel", (c) => {
    const runId = c.req.param("id");
    const summary = runService.getSummary(runId);
    if (!summary) {
      return c.json({ error: "Not found" }, 404);
    }
    runService.cancelRun(runId);
    return c.json({ ok: true });
  });

  return app;
}
