import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import {
  type FileChange,
  gitAbortRpc,
  gitApplyHunkRpc,
  gitBranchesRpc,
  gitCommitRpc,
  gitConflictSidesRpc,
  gitCreateBranchRpc,
  gitDiffRpc,
  gitDiscardRpc,
  gitHunksRpc,
  gitMessageRpc,
  gitProvidersRpc,
  gitPullRpc,
  gitPushRpc,
  gitResolveRpc,
  gitStageRpc,
  gitStashListRpc,
  gitStashPopRpc,
  gitStashRpc,
  gitStatusRpc,
  gitSwitchBranchRpc,
  gitUnstageRpc,
} from "../shared/git";

const execFileAsync = promisify(execFile);

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: unknown; stdout?: unknown; stderr?: unknown };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: typeof e.stdout === "string" ? e.stdout : "",
      stderr: typeof e.stderr === "string" ? e.stderr : String(err),
    };
  }
}

function isUnmerged(x: string, y: string): boolean {
  if (x === "U" || y === "U") return true;
  const pair = x + y;
  return (
    pair === "AA" ||
    pair === "DD" ||
    pair === "AU" ||
    pair === "UA" ||
    pair === "DU" ||
    pair === "UD"
  );
}

/**
 * Parse `git status --porcelain=v1 -z` output.
 * Entries are NUL-terminated: `XY <path>\0`, and for renames/copies an
 * extra `<orig-path>\0` token follows.
 */
function parseStatus(raw: string): {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  conflicts: FileChange[];
} {
  const staged: FileChange[] = [];
  const unstaged: FileChange[] = [];
  const untracked: FileChange[] = [];
  const conflicts: FileChange[] = [];
  if (!raw) return { staged, unstaged, untracked, conflicts };

  const tokens = raw.split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry || entry.length < 3) continue;
    const x = entry[0];
    const y = entry[1];
    const path = entry.slice(3);
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      // Skip the rename/copy source path token that follows.
      i += 1;
    }
    if (x === "?" && y === "?") {
      untracked.push({ path, status: "?" });
      continue;
    }
    if (isUnmerged(x, y)) {
      conflicts.push({ path, status: `${x}${y}` });
      continue;
    }
    if (x !== " " && x !== "?") staged.push({ path, status: x });
    if (y !== " " && y !== "?") unstaged.push({ path, status: y });
  }
  return { staged, unstaged, untracked, conflicts };
}

type GitOperation = "merge" | "rebase" | "cherry-pick" | "revert" | "bisect";

/** Detect an in-progress git operation from git-dir marker files. */
async function detectOperation(cwd: string): Promise<GitOperation | undefined> {
  const gitDirRes = await runGit(cwd, ["rev-parse", "--git-dir"]);
  if (gitDirRes.code !== 0 || !gitDirRes.stdout.trim()) return undefined;
  const gitDir = resolve(cwd, gitDirRes.stdout.trim());
  const markers: Array<[string, GitOperation]> = [
    ["MERGE_HEAD", "merge"],
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
    ["BISECT_LOG", "bisect"],
  ];
  for (const [marker, op] of markers) {
    try {
      const s = await stat(join(gitDir, marker));
      if (s.isFile() || s.isDirectory()) return op;
    } catch {
      // marker absent — keep checking
    }
  }
  return undefined;
}

export async function getStatus({ cwd }: RpcInput<typeof gitStatusRpc>) {
  const inside = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.stdout.trim() !== "true") {
    return {
      ok: true,
      isRepo: false,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
      operation: undefined,
    };
  }

  const status = await runGit(cwd, ["status", "--porcelain=v1", "-z"]);
  const { staged, unstaged, untracked, conflicts } = parseStatus(status.stdout);
  const operation = await detectOperation(cwd);

  const branchRes = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  let ahead: number | undefined;
  let behind: number | undefined;
  const upstream = await runGit(cwd, [
    "rev-list",
    "--left-right",
    "--count",
    "HEAD...@{upstream}",
  ]);
  if (upstream.code === 0 && upstream.stdout.trim()) {
    const parts = upstream.stdout.trim().split(/\s+/).map(Number);
    ahead = parts[0];
    behind = parts[1];
  }

  const last = await runGit(cwd, ["log", "-1", "--oneline", "--no-decorate"]);

  return {
    ok: true,
    isRepo: true,
    branch: branchRes.stdout.trim() || undefined,
    ahead,
    behind,
    lastCommit: last.stdout.trim() || undefined,
    staged,
    unstaged,
    untracked,
    conflicts,
    operation,
  };
}

export async function stage({ cwd, paths }: RpcInput<typeof gitStageRpc>) {
  const args = paths.length > 0 ? ["add", "--", ...paths] : ["add", "-A"];
  const { code, stderr } = await runGit(cwd, args);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git add failed" };
  return { ok: true };
}

export async function unstage({ cwd, paths }: RpcInput<typeof gitUnstageRpc>) {
  const args =
    paths.length > 0 ? ["restore", "--staged", "--", ...paths] : ["restore", "--staged", "."];
  const { code, stderr } = await runGit(cwd, args);
  if (code !== 0) {
    const resetArgs =
      paths.length > 0 ? ["reset", "-q", "HEAD", "--", ...paths] : ["reset", "-q", "HEAD"];
    const reset = await runGit(cwd, resetArgs);
    if (reset.code !== 0) {
      return {
        ok: false,
        error: (stderr || reset.stderr).trim() || "git restore --staged failed",
      };
    }
  }
  return { ok: true };
}

export async function getDiff({ cwd, path, staged }: RpcInput<typeof gitDiffRpc>) {
  if (staged) {
    const { code, stdout, stderr } = await runGit(cwd, ["diff", "--cached", "--", path]);
    if (code !== 0) return { ok: false, error: stderr.trim() || "git diff failed" };
    return { ok: true, diff: stdout || "(no diff)" };
  }

  // Untracked files have no diff; show their content instead.
  const others = await runGit(cwd, ["ls-files", "--others", "--exclude-standard", "--", path]);
  if (others.stdout.trim()) {
    try {
      const target = resolve(cwd, path);
      if (!target.startsWith(resolve(cwd))) {
        return { ok: false, error: "Path escapes the repository" };
      }
      const content = await readFile(join(cwd, path), "utf8");
      const capped =
        content.length > 200_000 ? content.slice(0, 200_000) + "\n… (truncated)" : content;
      return { ok: true, diff: `Untracked file: ${path}\n\n${capped}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const { code, stdout, stderr } = await runGit(cwd, ["diff", "--", path]);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git diff failed" };
  return { ok: true, diff: stdout || "(no changes)" };
}

/** Split a single-file unified diff into per-hunk patches (header + hunk). */
function splitHunks(diff: string): string[] {
  const lines = diff.split("\n");
  const header: string[] = [];
  const hunks: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (current) hunks.push(current.join("\n"));
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      header.push(line);
    }
  }
  if (current) hunks.push(current.join("\n"));

  const prefix = header.join("\n");
  return hunks.map((hunk) => (prefix ? prefix + "\n" + hunk : hunk));
}

export async function getHunks({ cwd, path, staged }: RpcInput<typeof gitHunksRpc>) {
  const args = staged ? ["diff", "--cached", "--", path] : ["diff", "--", path];
  const { code, stdout, stderr } = await runGit(cwd, args);
  if (code !== 0) return { ok: false, hunks: [], error: stderr.trim() || "git diff failed" };
  if (!stdout.trim()) return { ok: true, hunks: [] };
  const hunks = splitHunks(stdout).filter((h) => h.includes("\n@@") || h.startsWith("@@"));
  return { ok: true, hunks };
}

async function applyPatch(cwd: string, patch: string, reverse: boolean): Promise<GitResult> {
  const dir = await mkdtemp(join(tmpdir(), "paseo-git-"));
  const patchPath = join(dir, "hunk.patch");
  await writeFile(patchPath, patch, "utf8");
  try {
    const args = ["apply", "--cached", "--whitespace=nowarn"];
    if (reverse) args.push("--reverse");
    args.push(patchPath);
    return await runGit(cwd, args);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function applyHunk({ cwd, patch, staged }: RpcInput<typeof gitApplyHunkRpc>) {
  if (!patch.trim()) return { ok: false, error: "Empty patch" };
  // staged=true means the hunk is currently in the index; reverse removes it.
  const { code, stderr } = await applyPatch(cwd, patch, staged);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git apply failed" };
  return { ok: true };
}

export async function resolveConflict({
  cwd,
  path,
  strategy,
}: RpcInput<typeof gitResolveRpc>) {
  if (strategy === "mark") {
    const add = await runGit(cwd, ["add", "--", path]);
    if (add.code !== 0) return { ok: false, error: add.stderr.trim() || "git add failed" };
    return { ok: true };
  }
  const flag = strategy === "ours" ? "--ours" : "--theirs";
  const { code, stderr } = await runGit(cwd, ["checkout", flag, "--", path]);
  if (code !== 0) {
    return { ok: false, error: stderr.trim() || `git checkout ${flag} failed` };
  }
  const add = await runGit(cwd, ["add", "--", path]);
  if (add.code !== 0) return { ok: false, error: add.stderr.trim() || "git add failed" };
  return { ok: true };
}

export async function discard({ cwd, path, untracked }: RpcInput<typeof gitDiscardRpc>) {
  if (untracked) {
    try {
      const target = resolve(cwd, path);
      if (!target.startsWith(resolve(cwd))) return { ok: false, error: "Path escapes the repository" };
      await rm(target, { force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const { code, stderr } = await runGit(cwd, ["checkout", "--", path]);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git checkout failed" };
  return { ok: true };
}

export async function abortOperation({ cwd }: RpcInput<typeof gitAbortRpc>) {
  const op = await detectOperation(cwd);
  if (!op) return { ok: false, error: "No merge/rebase/cherry-pick/revert in progress." };
  const args: Record<string, string[]> = {
    merge: ["merge", "--abort"],
    rebase: ["rebase", "--abort"],
    "cherry-pick": ["cherry-pick", "--abort"],
    revert: ["revert", "--abort"],
    bisect: ["bisect", "reset"],
  };
  const { code, stderr } = await runGit(cwd, args[op]);
  if (code !== 0) return { ok: false, error: stderr.trim() || `git ${op} --abort failed` };
  return { ok: true };
}

export async function getConflictSides({
  cwd,
  path,
}: RpcInput<typeof gitConflictSidesRpc>) {
  const ours = await runGit(cwd, ["show", `:2:${path}`]);
  const theirs = await runGit(cwd, ["show", `:3:${path}`]);
  const base = await runGit(cwd, ["show", `:1:${path}`]);
  if (ours.code !== 0 && theirs.code !== 0) {
    return {
      ok: false,
      error: (ours.stderr || theirs.stderr).trim() || "Not a conflicted file",
    };
  }
  return {
    ok: true,
    ours: ours.code === 0 ? ours.stdout : undefined,
    theirs: theirs.code === 0 ? theirs.stdout : undefined,
    base: base.code === 0 ? base.stdout : undefined,
  };
}

export async function listProviders(
  _input: RpcInput<typeof gitProvidersRpc>,
  { paseo }: PluginHandlerContext,
) {
  try {
    const snap = await paseo.providers.snapshot();
    const options: { value: string; label: string }[] = [];
    for (const entry of snap.entries ?? []) {
      if (entry.enabled === false) continue;
      if (entry.status === "unavailable") continue;
      const providerLabel = entry.label ?? entry.provider;
      for (const m of entry.models ?? []) {
        options.push({
          value: `${entry.provider}/${m.id}`,
          label: `${providerLabel} · ${m.id}`,
        });
      }
    }
    if (options.length === 0) {
      return { ok: false, options: [], error: "No enabled providers with models found." };
    }
    return { ok: true, options, default: options[0].value };
  } catch (err) {
    return {
      ok: false,
      options: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const BRANCH_NAME_RE = /^[A-Za-z0-9._/-]+$/;

export async function listBranches({ cwd }: RpcInput<typeof gitBranchesRpc>) {
  const current = await runGit(cwd, ["branch", "--show-current"]);
  const list = await runGit(cwd, ["branch", "--format=%(refname:short)"]);
  const branches = list.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ok: true, current: current.stdout.trim() || undefined, branches };
}

export async function switchBranch({
  cwd,
  name,
}: RpcInput<typeof gitSwitchBranchRpc>) {
  const { code, stderr } = await runGit(cwd, ["switch", name]);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git switch failed" };
  return { ok: true };
}

export async function createBranch({
  cwd,
  name,
}: RpcInput<typeof gitCreateBranchRpc>) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Branch name is empty" };
  if (!BRANCH_NAME_RE.test(trimmed)) {
    return {
      ok: false,
      error: "Branch name may only contain letters, numbers, . _ - and /.",
    };
  }
  const { code, stderr } = await runGit(cwd, ["switch", "-c", trimmed]);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git switch -c failed" };
  return { ok: true };
}

export async function pushBranch({ cwd }: RpcInput<typeof gitPushRpc>) {
  const branch = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.code !== 0 || !branch.stdout.trim()) {
    return { ok: false, error: "Cannot determine the current branch" };
  }
  const bname = branch.stdout.trim();
  const upstream = await runGit(cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
  const args =
    upstream.code === 0 ? ["push"] : ["push", "--set-upstream", "origin", bname];
  const { code, stderr } = await runGit(cwd, args);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git push failed" };
  return { ok: true };
}

export async function pullBranch({ cwd }: RpcInput<typeof gitPullRpc>) {
  const { code, stderr } = await runGit(cwd, ["pull"]);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git pull failed" };
  return { ok: true };
}

export async function stash({ cwd }: RpcInput<typeof gitStashRpc>) {
  const { code, stderr } = await runGit(cwd, ["stash", "push"]);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git stash failed" };
  return { ok: true };
}

export async function stashPop({ cwd }: RpcInput<typeof gitStashPopRpc>) {
  const { code, stderr } = await runGit(cwd, ["stash", "pop"]);
  if (code !== 0) return { ok: false, error: stderr.trim() || "git stash pop failed" };
  return { ok: true };
}

export async function stashList({ cwd }: RpcInput<typeof gitStashListRpc>) {
  const { code, stdout, stderr } = await runGit(cwd, ["stash", "list"]);
  if (code !== 0) {
    if (stderr.includes("No stash") || (!stdout.trim() && !stderr.trim())) {
      return { ok: true, count: 0 };
    }
    return { ok: false, count: 0, error: stderr.trim() || "git stash list failed" };
  }
  const lines = stdout.trim().split("\n").filter(Boolean);
  return { ok: true, count: lines.length };
}

export async function commit({ cwd, message }: RpcInput<typeof gitCommitRpc>) {
  if (!message.trim()) return { ok: false, error: "Commit message is empty" };
  const { code, stderr } = await runGit(cwd, ["commit", "-m", message]);
  if (code !== 0) {
    if (stderr.includes("nothing to commit")) {
      return { ok: false, error: "Nothing to commit — no staged changes." };
    }
    return { ok: false, error: stderr.trim() || "git commit failed" };
  }
  const head = await runGit(cwd, ["rev-parse", "HEAD"]);
  return { ok: true, hash: head.stdout.trim() || undefined };
}

function cleanMessage(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  out = out.trim();
  out = out.replace(/^(commit message\s*:?\s*)/i, "").trim();
  return out;
}

export async function generateMessage(
  { cwd, workspaceId, provider }: RpcInput<typeof gitMessageRpc>,
  { paseo }: PluginHandlerContext,
) {
  const stagedDiff = await runGit(cwd, ["diff", "--cached"]);
  const stagedStat = await runGit(cwd, ["diff", "--cached", "--stat"]);
  const stagedNames = await runGit(cwd, ["diff", "--cached", "--name-status"]);
  const unstagedDiff = await runGit(cwd, ["diff"]);
  const untracked = await runGit(cwd, ["ls-files", "--others", "--exclude-standard"]);

  const diff = stagedDiff.stdout.trim()
    ? stagedDiff.stdout
    : unstagedDiff.stdout.trim()
      ? unstagedDiff.stdout
      : "";
  if (!diff && !untracked.stdout.trim()) {
    return { ok: false, error: "No changes to describe." };
  }

  const summaryParts: string[] = [];
  if (stagedNames.stdout.trim()) {
    summaryParts.push(`Changed files:\n${stagedNames.stdout.trim()}`);
  }
  if (stagedStat.stdout.trim()) summaryParts.push(stagedStat.stdout.trim());
  if (!stagedDiff.stdout.trim() && unstagedDiff.stdout.trim()) {
    summaryParts.push("(unstaged working-tree changes)");
  }
  if (untracked.stdout.trim()) {
    const names = untracked.stdout.trim().split("\n").slice(0, 100);
    summaryParts.push(`Untracked files:\n${names.join("\n")}`);
  }

  const diffCapped = diff.slice(0, 32000);
  const diffTruncated = diff.length > diffCapped.length;

  const prompt = [
    "Generate a git commit message for the change described below.",
    "",
    "Rules:",
    "- Conventional Commit format: <type>(<scope>): <subject>",
    "- type: feat | fix | refactor | perf | docs | test | chore | style | build | ci | revert",
    "- Subject uses imperative mood, at most 72 characters, no trailing period.",
    "- Always add a body when the change set has more than one file or one concern;",
    "  use one bullet per concern, wrapped at 72 characters.",
    "- Cover EVERY change listed in the summary, even if the diff below is truncated.",
    "- Output ONLY the commit message. No code fences, no explanations, no markdown.",
    "",
    "Changes summary:",
    summaryParts.join("\n\n").slice(0, 8000),
    "",
    "Diff:",
    diffCapped,
    diffTruncated
      ? "\n[Diff truncated; rely on the Changed files list above to cover all changes.]"
      : "",
  ].join("\n");

  const providerValue = (provider ?? "").trim() || "claude/claude-sonnet-5-5";
  // Reuse the current workspace instead of creating a fresh one per request.
  const agent = await paseo.workspaces.ref(workspaceId).agents.create({
    config: { provider: providerValue },
    title: "Commit message",
    prompt,
    autoArchive: true,
  });

  const result = await agent.waitForFinish(180_000);
  const text = result.lastMessage ?? "";
  console.log(
    `[git.message] status=${result.status} raw=${text.length} chars err=${result.error ?? "-"}`,
  );
  const message = cleanMessage(text);
  if (!message) {
    return {
      ok: false,
      error: result.error ?? `Could not generate a message (status: ${result.status})`,
    };
  }
  return { ok: true, message };
}
