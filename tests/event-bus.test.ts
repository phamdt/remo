import { describe, expect, it } from "vitest";
import { runEventBus } from "../src/services/event-bus.js";

describe("RunEventBus", () => {
  it("publishes events to subscribers", () => {
    const events: string[] = [];
    const unsubscribe = runEventBus.subscribe("run_x", (event) => {
      if (event.type === "log") {
        events.push(event.message);
      }
    });

    runEventBus.publish("run_x", { type: "log", message: "hello" });
    unsubscribe();
    expect(events).toEqual(["hello"]);
  });
});
