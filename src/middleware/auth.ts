import type { Context, Next } from "hono";

export function bearerAuth(expectedToken: string) {
  return async (c: Context, next: Next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token || token !== expectedToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}
