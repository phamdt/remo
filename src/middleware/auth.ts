import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";

export function safeEqualToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function bearerAuth(expectedToken: string) {
  return async (c: Context, next: Next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token || !safeEqualToken(token, expectedToken)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}

export function extractBearerToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim() || null;
}
