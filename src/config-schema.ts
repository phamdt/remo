import { z } from "zod";

export const repoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  defaultBranch: z.string().min(1),
  enabled: z.boolean(),
});

export const workspaceRepoSchema = z.object({
  repoId: z.string().min(1),
  role: z.string().min(1),
  path: z.string().min(1),
});

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  repos: z.array(workspaceRepoSchema).min(1),
  defaultPromptContext: z.string().optional(),
});

export const reposConfigSchema = z.array(repoSchema).min(1);
export const workspacesConfigSchema = z.array(workspaceSchema).min(1);

export type Repo = z.infer<typeof repoSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
