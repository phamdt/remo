import fs from "node:fs";
import {
  Agent,
  Cursor,
  JsonlLocalAgentStore,
  type SDKAgent,
  type Run as SdkRun,
} from "@cursor/sdk";
import { runAgentMetaPath } from "../paths.js";
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

export class AgentRunner {
  async run(options: AgentRunnerOptions): Promise<AgentRunnerResult> {
    const store = new JsonlLocalAgentStore(options.cursorStatePath);
    Cursor.configure({ local: { store } });

    const metaPath = runAgentMetaPath(options.runId);
    let agent: SDKAgent;
    const fullPrompt = options.promptContext
      ? `${options.promptContext}\n\n${options.prompt}`
      : options.prompt;

    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as AgentMeta;
      agent = await Agent.resume(meta.agentId, {
        apiKey: options.apiKey,
        model: { id: options.modelId },
        local: { cwd: options.workspaceRoot, store },
        mode: mapMode(options.mode),
      });
    } else {
      agent = await Agent.create({
        apiKey: options.apiKey,
        model: { id: options.modelId },
        name: `run-${options.runId}`,
        mode: mapMode(options.mode),
        local: { cwd: options.workspaceRoot, store },
      });
      const meta: AgentMeta = { agentId: agent.agentId };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    }

    const timeout = setTimeout(() => {
      // cancellation handled by caller via AbortSignal
    }, options.timeoutMs);

    try {
      if (options.signal.aborted) {
        return { ok: false, error: "cancelled" };
      }

      const sdkRun: SdkRun = await agent.send(fullPrompt, {
        mode: mapMode(options.mode),
        onDelta: ({ update }) => {
          if (update.type === "text-delta") {
            runEventBus.publish(
              options.runId,
              { type: "log", message: update.text },
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
        if (options.signal.aborted) {
          reject(new Error("cancelled"));
        }
        options.signal.addEventListener("abort", () => {
          void sdkRun.cancel();
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
      const message = error instanceof Error ? error.message : "agent failed";
      return { ok: false, error: message };
    } finally {
      clearTimeout(timeout);
      agent.close();
    }
  }
}

export const agentRunner = new AgentRunner();
