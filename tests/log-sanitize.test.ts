import { describe, expect, it } from "vitest";
import { sanitizeLogMessage } from "../src/security/log-sanitize.js";

describe("sanitizeLogMessage", () => {
  it("redacts and truncates long log output", () => {
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const message = `${"x".repeat(9000)} ${secret}`;
    const sanitized = sanitizeLogMessage(message);
    expect(sanitized).not.toContain("ghp_");
    expect(sanitized.length).toBeLessThanOrEqual(8_193);
  });
});
