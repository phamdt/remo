import fs from "node:fs";
import {
  Agent,
  Cursor,
  JsonlLocalAgentStore,
  type SDKAgent,
  type Run as SdkRun,
} from "@cursor/sdk";
import { runAgentMetaPath } from "../paths.js";
import { buildAgentHostEnv } from "../security/env.js";
import { clientAgentErrorMessage } from "../security/errors.js";
import { sanitizeLogMessage } from "../security/log-sanitize.js";
import type { RunMode } from "../types.js";
import { runEventBus } from "../services/event-bus.js";

export type AgentMeta = {
  agentId: string;
};

export type AgentRunnerOptions = {
  runId: string;
  workspaceRoot: string;
  cursorStatePath: string;
  mode: RunMode;
  prompt: string;
  promptContext?: string;
  eventsPath: string;
  modelId: string;
  apiKey: string;
  timeoutMs: number;
  signal: AbortSignal;
};

export type AgentRunnerResult = {
  ok: boolean;
  resultText?: string;
  error?: string;
};

function mapMode(mode: RunMode): "plan" | "agent" {
  return mode === "plan_only" ? "plan" : "agent";
}

function withAgentHostEnv<T>(fn: () => Promise<T>): Promise<T> {
  const previous = { ...process.env };
  const safe = buildAgentHostEnv();
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, safe);
  return fn().finally(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, previous);
  });
}

export class AgentRunner {
  private agentRunQueue: Promise<unknown> = Promise.resolve();

  async run(options: AgentRunnerOptions): Promise<AgentRunnerResult> {
    let release!: () => void;
    const slot = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.agentRunQueue;
    this.agentRunQueue = previous.then(() => slot);
    await previous;
    try {
      return await withAgentHostEnv(async () => this.runWithSafeEnv(options));
    } finally {
      release();
    }
  }

  private async runWithSafeEnv(
    options: AgentRunnerOptions,
  ): Promise<AgentRunnerResult> {
    const store = new JsonlLocalAgentStore(options.cursorStatePath);
    Cursor.configure({ local: { store } });

    const metaPath = runAgentMetaPath(options.runId);
    let agent: SDKAgent;
    const fullPrompt = options.promptContext
      ? `${options.promptContext}\n\n${options.prompt}`
      : options.prompt;

    const localOptions = {
      cwd: options.workspaceRoot,
      store,
      sandboxOptions: { enabled: true },
    };

    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as AgentMeta;
      agent = await Agent.resume(meta.agentId, {
        apiKey: options.apiKey,
        model: { id: options.modelId },
        local: localOptions,
        mode: mapMode(options.mode),
      });
    } else {
      agent = await Agent.create({
        apiKey: options.apiKey,
        model: { id: options.modelId },
        name: `run-${options.runId}`,
        mode: mapMode(options.mode),
        local: localOptions,
      });
      const meta: AgentMeta = { agentId: agent.agentId };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    }

    const combined = new AbortController();
    const onParentAbort = () => combined.abort();
    options.signal.addEventListener("abort", onParentAbort);

    let sdkRun: SdkRun | undefined;
    const timeout = setTimeout(() => {
      void sdkRun?.cancel();
      combined.abort();
    }, options.timeoutMs);

    try {
      if (combined.signal.aborted) {
        return { ok: false, error: "cancelled" };
      }

      sdkRun = await agent.send(fullPrompt, {
        mode: mapMode(options.mode),
        onDelta: ({ update }) => {
          if (update.type === "text-delta") {
            runEventBus.publish(
              options.runId,
              { type: "log", message: sanitizeLogMessage(update.text) },
              options.eventsPath,
            );
          }
          if (update.type === "tool-call-started") {
            runEventBus.publish(
              options.runId,
              {
                type: "tool",
                name: update.toolCall.type,
                summary: "started",
              },
              options.eventsPath,
            );
          }
          if (update.type === "tool-call-completed") {
            runEventBus.publish(
              options.runId,
              {
                type: "tool",
                name: update.toolCall.type,
                summary: "completed",
              },
              options.eventsPath,
            );
          }
        },
      });

      const abortPromise = new Promise<never>((_, reject) => {
        if (combined.signal.aborted) {
          reject(new Error("cancelled"));
        }
        combined.signal.addEventListener("abort", () => {
          void sdkRun?.cancel();
          reject(new Error("cancelled"));
        });
      });

      const result = await Promise.race([sdkRun.wait(), abortPromise]);
      return {
        ok: result.status === "finished",
        resultText: result.result,
        error: result.status === "error" ? "agent error" : undefined,
      };
    } catch (error) {
      return { ok: false, error: clientAgentErrorMessage(error) };
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener("abort", onParentAbort);
      agent.close();
    }
  }
}

export const agentRunner = new AgentRunner();
