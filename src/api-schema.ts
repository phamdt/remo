import { z } from "zod";

export const runModeSchema = z.enum(["plan_only", "apply"]);

export const createRunRequestSchema = z.object({
  workspaceId: z.string().min(1),
  mode: runModeSchema,
  prompt: z.string().min(1),
  baseRef: z.string().min(1).optional(),
});

export const continueRunRequestSchema = z.object({
  prompt: z.string().min(1),
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;
export type ContinueRunRequest = z.infer<typeof continueRunRequestSchema>;
