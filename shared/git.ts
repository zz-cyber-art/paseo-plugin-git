import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const fileChangeSchema = z.object({
  path: z.string(),
  // Porcelain status letter: M/A/D/R/C/T/?/U, or a pair like "UU"/"AA".
  status: z.string(),
});

export type FileChange = z.infer<typeof fileChangeSchema>;

export const gitStatusRpc = defineRpc({
  name: "git.status",
  input: z.object({ cwd: z.string() }),
  output: z.object({
    ok: z.boolean(),
    isRepo: z.boolean(),
    branch: z.string().optional(),
    ahead: z.number().optional(),
    behind: z.number().optional(),
    lastCommit: z.string().optional(),
    staged: z.array(fileChangeSchema),
    unstaged: z.array(fileChangeSchema),
    untracked: z.array(fileChangeSchema),
    conflicts: z.array(fileChangeSchema),
    operation: z.enum(["merge", "rebase", "cherry-pick", "revert", "bisect"]).optional(),
    error: z.string().optional(),
  }),
});

export const gitStageRpc = defineRpc({
  name: "git.stage",
  input: z.object({ cwd: z.string(), paths: z.array(z.string()) }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const gitUnstageRpc = defineRpc({
  name: "git.unstage",
  input: z.object({ cwd: z.string(), paths: z.array(z.string()) }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const gitDiffRpc = defineRpc({
  name: "git.diff",
  input: z.object({ cwd: z.string(), path: z.string(), staged: z.boolean() }),
  output: z.object({
    ok: z.boolean(),
    diff: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const gitCommitRpc = defineRpc({
  name: "git.commit",
  input: z.object({ cwd: z.string(), message: z.string() }),
  output: z.object({
    ok: z.boolean(),
    hash: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const gitMessageRpc = defineRpc({
  name: "git.message",
  input: z.object({
    cwd: z.string(),
    workspaceId: z.string(),
    provider: z.string().optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
});

// Each hunk is a complete standalone patch (diff header + one @@ hunk),
// so it can be applied directly with `git apply --cached [--reverse]`.
export const gitHunksRpc = defineRpc({
  name: "git.hunks",
  input: z.object({ cwd: z.string(), path: z.string(), staged: z.boolean() }),
  output: z.object({
    ok: z.boolean(),
    hunks: z.array(z.string()),
    error: z.string().optional(),
  }),
});

export const gitApplyHunkRpc = defineRpc({
  name: "git.apply-hunk",
  input: z.object({
    cwd: z.string(),
    patch: z.string(),
    // true = the patch came from the staged diff, so applying un-stages it.
    staged: z.boolean(),
  }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const gitResolveRpc = defineRpc({
  name: "git.resolve",
  input: z.object({
    cwd: z.string(),
    path: z.string(),
    strategy: z.enum(["ours", "theirs", "mark"]),
  }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const gitDiscardRpc = defineRpc({
  name: "git.discard",
  input: z.object({ cwd: z.string(), path: z.string(), untracked: z.boolean() }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const gitAbortRpc = defineRpc({
  name: "git.abort",
  input: z.object({ cwd: z.string() }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const gitConflictSidesRpc = defineRpc({
  name: "git.conflict-sides",
  input: z.object({ cwd: z.string(), path: z.string() }),
  output: z.object({
    ok: z.boolean(),
    ours: z.string().optional(),
    theirs: z.string().optional(),
    base: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const providerOptionSchema = z.object({
  value: z.string(), // "provider/model"
  label: z.string(),
});

export const gitProvidersRpc = defineRpc({
  name: "git.providers",
  input: z.object({}),
  output: z.object({
    ok: z.boolean(),
    options: z.array(providerOptionSchema),
    default: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const gitBranchesRpc = defineRpc({
  name: "git.branches",
  input: z.object({ cwd: z.string() }),
  output: z.object({
    ok: z.boolean(),
    current: z.string().optional(),
    branches: z.array(z.string()),
    error: z.string().optional(),
  }),
});

export const gitSwitchBranchRpc = defineRpc({
  name: "git.switch-branch",
  input: z.object({ cwd: z.string(), name: z.string() }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const gitCreateBranchRpc = defineRpc({
  name: "git.create-branch",
  input: z.object({ cwd: z.string(), name: z.string() }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});
