import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings, useWorkspace } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  gitAbortRpc,
  gitBranchesRpc,
  gitCommitRpc,
  gitCreateBranchRpc,
  gitDiscardRpc,
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
  type FileChange,
} from "../shared/git";
import { openFileTab } from "./fileTab";
import { gitSettings } from "../shared/settings";
import { makeStyles } from "./styles";

const STATUS_LABELS: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  T: "Type change",
  U: "Conflict",
  UU: "Conflict",
  AA: "Conflict",
  DD: "Conflict",
  AU: "Conflict",
  UA: "Conflict",
  DU: "Conflict",
  UD: "Conflict",
  "?": "Untracked",
};

const OP_LABELS: Record<string, string> = {
  merge: "Merge",
  rebase: "Rebase",
  "cherry-pick": "Cherry-pick",
  revert: "Revert",
  bisect: "Bisect",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusColor(status: string, colors: PluginTheme["colors"]): string {
  switch (status[0]) {
    case "A":
      return colors.statusSuccess;
    case "D":
      return colors.statusDanger;
    case "R":
    case "C":
      return colors.accent;
    case "?":
      return colors.foregroundMuted;
    case "U":
      return colors.statusDanger;
    default:
      return colors.statusWarning;
  }
}

export function GitPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const colors = theme.colors;
  const compact = layout.compact;
  const ws = useWorkspace(workspaceId, (s) => ({
    directory: s.directory,
    projectKind: s.projectKind,
  }));
  const cwd = ws?.directory ?? "";
  const isGit = ws?.projectKind === "git";

  const statusRpc = useRpc(gitStatusRpc);
  const stageRpc = useRpc(gitStageRpc);
  const unstageRpc = useRpc(gitUnstageRpc);
  const discardRpc = useRpc(gitDiscardRpc);
  const resolveRpc = useRpc(gitResolveRpc);
  const commitRpc = useRpc(gitCommitRpc);
  const messageRpc = useRpc(gitMessageRpc);
  const abortRpc = useRpc(gitAbortRpc);
  const providersRpc = useRpc(gitProvidersRpc);
  const branchesRpc = useRpc(gitBranchesRpc);
  const switchBranchRpc = useRpc(gitSwitchBranchRpc);
  const createBranchRpc = useRpc(gitCreateBranchRpc);
  const pushRpc = useRpc(gitPushRpc);
  const pullRpc = useRpc(gitPullRpc);
  const stashRpc = useRpc(gitStashRpc);
  const stashPopRpc = useRpc(gitStashPopRpc);
  const stashListRpc = useRpc(gitStashListRpc);
  const queryClient = useQueryClient();

  const [message, setMessage] = useState("");
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const settings = useSettings(gitSettings);

  const statusQuery = useQuery({
    queryKey: ["git.status", cwd],
    queryFn: () => statusRpc({ cwd }),
    enabled: isGit && cwd.length > 0,
    refetchInterval: 5000,
  });

  const stashListQuery = useQuery({
    queryKey: ["git.stash-list", cwd],
    queryFn: () => stashListRpc({ cwd }),
    enabled: isGit && cwd.length > 0,
    refetchInterval: 15000,
  });

  const providersQuery = useQuery({
    queryKey: ["git.providers"],
    queryFn: () => providersRpc({}),
    staleTime: 5 * 60 * 1000,
  });

  const branchesQuery = useQuery({
    queryKey: ["git.branches", cwd],
    queryFn: () => branchesRpc({ cwd }),
    enabled: isGit && cwd.length > 0 && branchPickerOpen,
  });

  const invalidateStatus = () =>
    void queryClient.invalidateQueries({ queryKey: ["git.status", cwd] });

  const stageMutation = useMutation({
    mutationFn: (paths: string[]) => stageRpc({ cwd, paths }),
    onSettled: invalidateStatus,
  });
  const unstageMutation = useMutation({
    mutationFn: (paths: string[]) => unstageRpc({ cwd, paths }),
    onSettled: invalidateStatus,
  });
  const discardMutation = useMutation({
    mutationFn: (input: { path: string; untracked: boolean }) =>
      discardRpc({ cwd, path: input.path, untracked: input.untracked }),
    onSettled: invalidateStatus,
  });
  const resolveMutation = useMutation({
    mutationFn: (input: { path: string; strategy: "ours" | "theirs" | "mark" }) =>
      resolveRpc({ cwd, path: input.path, strategy: input.strategy }),
    onSettled: invalidateStatus,
  });
  const abortMutation = useMutation({
    mutationFn: () => abortRpc({ cwd }),
    onSettled: invalidateStatus,
  });
  const switchBranchMutation = useMutation({
    mutationFn: (name: string) => switchBranchRpc({ cwd, name }),
    onSuccess: (res) => {
      if (res.ok) setBranchPickerOpen(false);
    },
    onSettled: () => {
      invalidateStatus();
      void queryClient.invalidateQueries({ queryKey: ["git.branches", cwd] });
    },
  });
  const createBranchMutation = useMutation({
    mutationFn: (name: string) => createBranchRpc({ cwd, name }),
    onSuccess: (res) => {
      if (res.ok) {
        setNewBranchName("");
        setBranchPickerOpen(false);
      }
    },
    onSettled: () => {
      invalidateStatus();
      void queryClient.invalidateQueries({ queryKey: ["git.branches", cwd] });
    },
  });
  const pushMutation = useMutation({
    mutationFn: () => pushRpc({ cwd }),
    onSettled: invalidateStatus,
  });
  const pullMutation = useMutation({
    mutationFn: () => pullRpc({ cwd }),
    onSettled: invalidateStatus,
  });
  const stashMutation = useMutation({
    mutationFn: () => stashRpc({ cwd }),
    onSettled: () => {
      invalidateStatus();
      void queryClient.invalidateQueries({ queryKey: ["git.stash-list", cwd] });
    },
  });
  const stashPopMutation = useMutation({
    mutationFn: () => stashPopRpc({ cwd }),
    onSettled: () => {
      invalidateStatus();
      void queryClient.invalidateQueries({ queryKey: ["git.stash-list", cwd] });
    },
  });
  const commitMutation = useMutation({
    mutationFn: () => commitRpc({ cwd, message }),
    onSuccess: (res) => {
      if (res.ok) setMessage("");
    },
    onSettled: invalidateStatus,
  });
  const messageMutation = useMutation({
    mutationFn: () => messageRpc({ cwd, workspaceId, provider: effectiveProvider || undefined }),
    onSuccess: (res) => {
      if (res.ok && res.message) setMessage(res.message);
    },
  });

  const styles = useMemo(() => makeStyles(colors, compact), [colors, compact]);

  const data = statusQuery.data;

  const settingsProvider =
    settings.status === "ready" ? settings.values.provider : undefined;
  const effectiveProvider = settingsProvider || providersQuery.data?.default || "";
  const providerLabel =
    providersQuery.data?.options.find((o) => o.value === effectiveProvider)?.label ??
    effectiveProvider ??
    "Select provider…";

  const renderBadge = (status: string) => (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: colors.surface2,
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 1,
      }}
    >
      <Text
        style={{
          color: statusColor(status, colors),
          fontSize: compact ? 9 : 10,
          fontWeight: "600" as const,
        }}
      >
        {statusLabel(status)}
      </Text>
    </View>
  );

  if (!isGit) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>This workspace is not a git repository.</Text>
      </View>
    );
  }

  const staged = data?.staged ?? [];
  const unstaged = data?.unstaged ?? [];
  const untracked = data?.untracked ?? [];
  const conflicts = data?.conflicts ?? [];
  const hasStaged = staged.length > 0;
  const canCommit = hasStaged && message.trim().length > 0;
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const toggleDir = (path: string) =>
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const basename = (path: string) => {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(i + 1) : path;
  };

  interface FileEntry { kind: "file"; file: FileChange }
  interface DirEntry { kind: "dir"; name: string; path: string; count: number; children: (DirEntry | FileEntry)[] }
  function buildTree(files: FileChange[]): DirEntry {
    const root: DirEntry = { kind: "dir", name: "", path: "", count: files.length, children: [] };
    for (const f of files) {
      const parts = f.path.split("/");
      let dir = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const name = parts[i];
        let child = dir.children.find((c): c is DirEntry => c.kind === "dir" && c.name === name);
        if (!child) {
          child = { kind: "dir", name, path: parts.slice(0, i + 1).join("/"), count: 0, children: [] };
          dir.children.push(child);
        }
        child.count++;
        dir = child;
      }
      dir.children.push({ kind: "file", file: f });
    }
    return root;
  }

  function collectFiles(node: DirEntry): FileChange[] {
    const out: FileChange[] = [];
    for (const c of node.children) {
      if (c.kind === "file") out.push(c.file);
      else out.push(...collectFiles(c));
    }
    return out;
  }

  const renderFileRow = (file: FileChange, isStaged: boolean, isUntracked: boolean, indent = 0) => (
    <View key={`${isStaged ? "s" : "u"}-${file.path}`} style={[styles.row, { paddingLeft: indent * 14 }]}>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.fileButton, pressed && { opacity: 0.6 }]}
        onPress={() =>
          openFileTab({
            workspaceId,
            cwd,
            path: file.path,
            staged: isStaged,
            kind: isUntracked ? "untracked" : "tracked",
          })
        }
      >
        <Text style={styles.fileName} numberOfLines={1}>
          {basename(file.path)}
        </Text>
        {renderBadge(file.status)}
      </Pressable>
      {isStaged ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unstage ${file.path}`}
          style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
          onPress={() => unstageMutation.mutate([file.path])}
        >
          <Text style={styles.smallButtonText}>Unstage</Text>
        </Pressable>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Stage ${file.path}`}
            style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
            onPress={() => stageMutation.mutate([file.path])}
          >
            <Text style={styles.smallButtonText}>Stage</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Discard changes to ${file.path}`}
            style={({ pressed }) => [styles.dangerButton, pressed && { opacity: 0.6 }]}
            onPress={() => discardMutation.mutate({ path: file.path, untracked: isUntracked })}
          >
            <Text style={styles.dangerButtonText}>Discard</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  function renderDir(dir: DirEntry, isStaged: boolean, indent: number) {
    const isExpanded = expandedDirs.has(dir.path);
    const paths = collectFiles(dir).map((f) => f.path);
    return (
      <View key={`dir-${dir.path}`}>
        <View style={[styles.row, { paddingLeft: indent * 14 }]}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.fileButton,
              { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => toggleDir(dir.path)}
          >
            <Text style={styles.fileName}>{isExpanded ? "▾" : "▸"}</Text>
            <Text style={styles.fileName} numberOfLines={1}>
              {dir.name}/
            </Text>
            <Text style={styles.fileStatus}>{dir.count}</Text>
          </Pressable>
          {isStaged ? (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
              onPress={() => unstageMutation.mutate(paths)}
            >
              <Text style={styles.smallButtonText}>Unstage</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
              onPress={() => stageMutation.mutate(paths)}
            >
              <Text style={styles.smallButtonText}>Stage</Text>
            </Pressable>
          )}
        </View>
        {isExpanded && renderTree(dir, isStaged, indent + 1)}
      </View>
    );
  }

  function renderTree(node: DirEntry, isStaged: boolean, indent: number) {
    return (
      <>
        {node.children.map((child) =>
          child.kind === "file"
            ? renderFileRow(child.file, isStaged, child.file.status === "?", indent)
            : renderDir(child, isStaged, indent),
        )}
      </>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: styles.screen.gap }}>
      {statusQuery.isLoading && <Text style={styles.muted}>Loading git status…</Text>}
      {(statusQuery.data?.error || statusQuery.error) && (
        <Text style={styles.error}>
          {statusQuery.data?.error ??
            (statusQuery.error instanceof Error
              ? statusQuery.error.message
              : String(statusQuery.error))}
        </Text>
      )}

      {data?.isRepo && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => setBranchPickerOpen(true)}
            >
              <Text style={styles.title}>{data.branch || "Detached HEAD"}</Text>
              <Text style={styles.subtitle}>▾</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Text style={styles.subtitle}>
              {typeof data.ahead === "number" && data.ahead > 0 ? `↑${data.ahead}` : ""}
              {typeof data.behind === "number" && data.behind > 0 ? ` ↓${data.behind}` : ""}
            </Text>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryButton,
                { paddingHorizontal: 10, paddingVertical: 4 },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => pushMutation.mutate()}
              disabled={pushMutation.isPending}
            >
              <Text style={styles.primaryButtonText}>
                {pushMutation.isPending ? "Pushing…" : "Push"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.smallButton,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => pullMutation.mutate()}
              disabled={pullMutation.isPending}
            >
              <Text style={styles.smallButtonText}>
                {pullMutation.isPending ? "Pulling…" : "Pull"}
              </Text>
            </Pressable>
          </View>
          {pushMutation.data?.error && (
            <Text style={styles.error}>{pushMutation.data.error}</Text>
          )}
          {pullMutation.data?.error && (
            <Text style={styles.error}>{pullMutation.data.error}</Text>
          )}
          {data.lastCommit ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              Last commit: {data.lastCommit}
            </Text>
          ) : (
            <Text style={styles.subtitle}>No commits yet.</Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>Commit</Text>
        <View>
          <Text style={styles.muted}>Generator provider</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.select, pressed && { opacity: 0.6 }]}
            onPress={() => setProviderPickerOpen(true)}
          >
            <Text style={styles.smallButtonText} numberOfLines={1}>
              {providerLabel}
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryButton,
            messageMutation.isPending ? styles.disabledButton : undefined,
            pressed && { opacity: 0.7 },
          ]}
          disabled={messageMutation.isPending}
          onPress={() => messageMutation.mutate()}
        >
          <Text style={styles.primaryButtonText}>
            {messageMutation.isPending ? "Generating…" : "Generate commit message"}
          </Text>
        </Pressable>
        {messageMutation.data?.error && (
          <Text style={styles.error}>{messageMutation.data.error}</Text>
        )}
        <TextInput
          style={[styles.input, { minHeight: compact ? 52 : 64, textAlignVertical: "top" }]}
          value={message}
          onChangeText={setMessage}
          placeholder="Commit message"
          placeholderTextColor={colors.foregroundMuted}
          multiline
        />
        {commitMutation.data?.error && (
          <Text style={styles.error}>{commitMutation.data.error}</Text>
        )}
        {commitMutation.data?.ok && commitMutation.data.hash && (
          <Text style={styles.subtitle}>Committed {commitMutation.data.hash.slice(0, 8)}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryButton,
            !canCommit ? styles.disabledButton : undefined,
            pressed && { opacity: 0.7 },
          ]}
          disabled={!canCommit || commitMutation.isPending}
          onPress={() => commitMutation.mutate()}
        >
          <Text style={styles.primaryButtonText}>
            {commitMutation.isPending ? "Committing…" : "Commit"}
          </Text>
        </Pressable>
      </View>

      {data?.operation && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.warning}>
              In progress: {OP_LABELS[data.operation] ?? data.operation}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.dangerButton, pressed && { opacity: 0.6 }]}
              onPress={() => abortMutation.mutate()}
            >
              <Text style={styles.dangerButtonText}>
                {abortMutation.isPending ? "Aborting…" : "Abort"}
              </Text>
            </Pressable>
          </View>
          {abortMutation.data?.error && (
            <Text style={styles.error}>{abortMutation.data.error}</Text>
          )}
        </View>
      )}

      {conflicts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.warning}>Conflicts ({conflicts.length})</Text>
          {conflicts.map((file) => (
            <View key={`c-${file.path}`} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.fileButton, pressed && { opacity: 0.6 }]}
                onPress={() =>
                  openFileTab({
                    workspaceId,
                    cwd,
                    path: file.path,
                    staged: false,
                    kind: "conflict",
                  })
                }
              >
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.path}
                </Text>
                {renderBadge(file.status)}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
                onPress={() => resolveMutation.mutate({ path: file.path, strategy: "ours" })}
              >
                <Text style={styles.smallButtonText}>Ours</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
                onPress={() => resolveMutation.mutate({ path: file.path, strategy: "theirs" })}
              >
                <Text style={styles.smallButtonText}>Theirs</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
                onPress={() => resolveMutation.mutate({ path: file.path, strategy: "mark" })}
              >
                <Text style={styles.smallButtonText}>Mark</Text>
              </Pressable>
            </View>
          ))}
          {resolveMutation.data?.error && (
            <Text style={styles.error}>{resolveMutation.data.error}</Text>
          )}
        </View>
      )}

      {hasStaged && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.title}>Staged ({staged.length})</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
              onPress={() => unstageMutation.mutate([])}
            >
              <Text style={styles.smallButtonText}>Unstage all</Text>
            </Pressable>
          </View>
          {renderTree(buildTree(staged), true, 0)}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>Changes ({unstaged.length + untracked.length})</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
            onPress={() => stageMutation.mutate([])}
          >
            <Text style={styles.smallButtonText}>Stage all</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
            onPress={() => stashMutation.mutate()}
            disabled={stashMutation.isPending || (unstaged.length === 0 && untracked.length === 0)}
          >
            <Text style={styles.smallButtonText}>
              {stashMutation.isPending ? "Stashing…" : "Stash"}
            </Text>
          </Pressable>
          {(stashListQuery.data?.count ?? 0) > 0 && (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
              onPress={() => stashPopMutation.mutate()}
              disabled={stashPopMutation.isPending}
            >
              <Text style={styles.smallButtonText}>
                {stashPopMutation.isPending ? "Popping…" : `Pop stash (${stashListQuery.data?.count})`}
              </Text>
            </Pressable>
          )}
        </View>
        {stashMutation.data?.error && (
          <Text style={styles.error}>{stashMutation.data.error}</Text>
        )}
        {stashPopMutation.data?.error && (
          <Text style={styles.error}>{stashPopMutation.data.error}</Text>
        )}
        {unstaged.length === 0 && untracked.length === 0 && (
          <Text style={styles.muted}>Working tree clean.</Text>
        )}
        {renderTree(buildTree([...unstaged, ...untracked]), false, 0)}
      </View>

      <Modal
        open={providerPickerOpen}
        onOpenChange={setProviderPickerOpen}
        title="Select provider"
      >
        <Modal.Content>
          <View style={{ gap: 2 }}>
            {providersQuery.isLoading && <Text style={styles.muted}>Loading providers…</Text>}
            {providersQuery.data?.error && (
              <Text style={styles.error}>{providersQuery.data.error}</Text>
            )}
            {(providersQuery.data?.options ?? []).map((opt) => (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                style={({ pressed }) => [styles.optionRow, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  if (settings.status === "ready") {
                    void settings.save({ provider: opt.value }, settings.revision);
                  }
                  setProviderPickerOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.fileName,
                    effectiveProvider === opt.value ? { color: colors.accent } : undefined,
                  ]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
            {!providersQuery.isLoading &&
              !providersQuery.data?.error &&
              (providersQuery.data?.options ?? []).length === 0 && (
                <Text style={styles.muted}>No providers found.</Text>
              )}
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={branchPickerOpen}
        onOpenChange={setBranchPickerOpen}
        title="Switch branch"
      >
        <Modal.Content>
          <View style={{ gap: 6 }}>
            {branchesQuery.isLoading && <Text style={styles.muted}>Loading branches…</Text>}
            {branchesQuery.data?.error && (
              <Text style={styles.error}>{branchesQuery.data.error}</Text>
            )}
            {(branchesQuery.data?.branches ?? []).map((name) => {
              const isCurrent = name === branchesQuery.data?.current;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.optionRow, pressed && { opacity: 0.6 }]}
                  onPress={() => switchBranchMutation.mutate(name)}
                >
                  <Text
                    style={[
                      styles.fileName,
                      isCurrent
                        ? { color: colors.accent, fontWeight: "600" as const }
                        : undefined,
                    ]}
                  >
                    {name}
                    {isCurrent ? "  (current)" : ""}
                  </Text>
                </Pressable>
              );
            })}
            {switchBranchMutation.data?.error && (
              <Text style={styles.error}>{switchBranchMutation.data.error}</Text>
            )}

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newBranchName}
                onChangeText={setNewBranchName}
                placeholder="New branch name"
                placeholderTextColor={colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  !newBranchName.trim() ? styles.disabledButton : undefined,
                  pressed && { opacity: 0.7 },
                ]}
                disabled={!newBranchName.trim() || createBranchMutation.isPending}
                onPress={() => createBranchMutation.mutate(newBranchName)}
              >
                <Text style={styles.primaryButtonText}>
                  {createBranchMutation.isPending ? "Creating…" : "Create"}
                </Text>
              </Pressable>
            </View>
            {createBranchMutation.data?.error && (
              <Text style={styles.error}>{createBranchMutation.data.error}</Text>
            )}
          </View>
        </Modal.Content>
      </Modal>
    </ScrollView>
  );
}
