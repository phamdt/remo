import { z } from "zod";
import { gitRefSchema } from "./security/git-ref.js";

export const runModeSchema = z.enum(["plan_only", "apply"]);

export const createRunRequestSchema = z.object({
  workspaceId: z.string().min(1),
  mode: runModeSchema,
  prompt: z.string().min(1).max(100_000),
  baseRef: gitRefSchema.optional(),
});

export const continueRunRequestSchema = z.object({
  prompt: z.string().min(1).max(100_000),
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;
export type ContinueRunRequest = z.infer<typeof continueRunRequestSchema>;
