import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { SseEvent } from "../types.js";

export class RunEventBus {
  private readonly emitters = new Map<string, EventEmitter>();

  private getEmitter(runId: string): EventEmitter {
    let emitter = this.emitters.get(runId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(100);
      this.emitters.set(runId, emitter);
    }
    return emitter;
  }

  publish(runId: string, event: SseEvent, eventsPath?: string): void {
    if (eventsPath) {
      fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
    }
    this.getEmitter(runId).emit("event", event);
  }

  subscribe(
    runId: string,
    listener: (event: SseEvent) => void,
  ): () => void {
    const emitter = this.getEmitter(runId);
    emitter.on("event", listener);
    return () => emitter.off("event", listener);
  }

  dispose(runId: string): void {
    const emitter = this.emitters.get(runId);
    if (emitter) {
      emitter.removeAllListeners();
      this.emitters.delete(runId);
    }
  }
}

export const runEventBus = new RunEventBus();
