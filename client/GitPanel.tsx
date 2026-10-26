import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  gitAbortRpc,
  gitApplyHunkRpc,
  gitCommitRpc,
  gitConflictSidesRpc,
  gitDiffRpc,
  gitDiscardRpc,
  gitHunksRpc,
  gitMessageRpc,
  gitResolveRpc,
  gitStageRpc,
  gitStatusRpc,
  gitUnstageRpc,
  type FileChange,
} from "../shared/git";

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

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const OP_LABELS: Record<string, string> = {
  merge: "Merge",
  rebase: "Rebase",
  "cherry-pick": "Cherry-pick",
  revert: "Revert",
  bisect: "Bisect",
};

function hunkTitle(patch: string): string {
  const header = patch.split("\n").find((l) => l.startsWith("@@"));
  return header ?? patch.split("\n")[0] ?? "hunk";
}

type Viewing = { path: string; staged: boolean };

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
  const diffRpc = useRpc(gitDiffRpc);
  const hunksRpc = useRpc(gitHunksRpc);
  const applyHunkRpc = useRpc(gitApplyHunkRpc);
  const resolveRpc = useRpc(gitResolveRpc);
  const discardRpc = useRpc(gitDiscardRpc);
  const commitRpc = useRpc(gitCommitRpc);
  const messageRpc = useRpc(gitMessageRpc);
  const abortRpc = useRpc(gitAbortRpc);
  const conflictSidesRpc = useRpc(gitConflictSidesRpc);
  const queryClient = useQueryClient();

  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("claude/claude-sonnet-5-5");
  const [viewing, setViewing] = useState<Viewing | null>(null);

  const statusQuery = useQuery({
    queryKey: ["git.status", cwd],
    queryFn: () => statusRpc({ cwd }),
    enabled: isGit && cwd.length > 0,
    refetchInterval: 5000,
  });

  const hunksQuery = useQuery({
    queryKey: ["git.hunks", cwd, viewing?.path ?? "", viewing?.staged ?? false],
    queryFn: () => hunksRpc({ cwd, path: viewing!.path, staged: viewing!.staged }),
    enabled: isGit && !!viewing,
  });

  const diffQuery = useQuery({
    queryKey: ["git.diff", cwd, viewing?.path ?? "", viewing?.staged ?? false],
    queryFn: () => diffRpc({ cwd, path: viewing!.path, staged: viewing!.staged }),
    enabled: isGit && !!viewing,
  });

  const conflictSidesQuery = useQuery({
    queryKey: ["git.conflict-sides", cwd, viewing?.path ?? ""],
    queryFn: () => conflictSidesRpc({ cwd, path: viewing!.path }),
    enabled: isGit && !!viewing,
  });

  const invalidateStatus = () =>
    void queryClient.invalidateQueries({ queryKey: ["git.status", cwd] });
  const invalidateHunks = () =>
    void queryClient.invalidateQueries({ queryKey: ["git.hunks", cwd] });

  const stageMutation = useMutation({
    mutationFn: (paths: string[]) => stageRpc({ cwd, paths }),
    onSettled: invalidateStatus,
  });
  const unstageMutation = useMutation({
    mutationFn: (paths: string[]) => unstageRpc({ cwd, paths }),
    onSettled: invalidateStatus,
  });
  const applyHunkMutation = useMutation({
    mutationFn: (patch: string) =>
      applyHunkRpc({ cwd, patch, staged: viewing?.staged ?? false }),
    onSettled: () => {
      invalidateStatus();
      invalidateHunks();
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (strategy: "ours" | "theirs" | "mark") =>
      resolveRpc({ cwd, path: viewing?.path ?? "", strategy }),
    onSettled: invalidateStatus,
  });
  const discardMutation = useMutation({
    mutationFn: (input: { path: string; untracked: boolean }) =>
      discardRpc({ cwd, path: input.path, untracked: input.untracked }),
    onSettled: invalidateStatus,
  });
  const abortMutation = useMutation({
    mutationFn: () => abortRpc({ cwd }),
    onSettled: invalidateStatus,
  });
  const commitMutation = useMutation({
    mutationFn: () => commitRpc({ cwd, message }),
    onSuccess: (res) => {
      if (res.ok) {
        setMessage("");
        setViewing(null);
      }
    },
    onSettled: invalidateStatus,
  });
  const messageMutation = useMutation({
    mutationFn: () => messageRpc({ cwd, provider: provider.trim() || undefined }),
    onSuccess: (res) => {
      if (res.ok && res.message) setMessage(res.message);
    },
  });

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: colors.surface0,
        padding: compact ? 12 : 20,
        gap: compact ? 10 : 14,
      },
      card: {
        backgroundColor: colors.surface1,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: compact ? 10 : 14,
        gap: 6,
      },
      title: { color: colors.foreground, fontSize: compact ? 14 : 16, fontWeight: "700" as const },
      subtitle: { color: colors.foregroundMuted, fontSize: compact ? 11 : 12 },
      muted: { color: colors.foregroundMuted, fontSize: compact ? 12 : 13 },
      error: { color: colors.statusDanger, fontSize: compact ? 12 : 13 },
      warning: { color: colors.statusWarning, fontSize: compact ? 12 : 13 },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingVertical: 6,
      },
      fileButton: { flex: 1 },
      fileName: { color: colors.foreground, fontSize: compact ? 12 : 13 },
      fileStatus: { color: colors.foregroundMuted, fontSize: compact ? 10 : 11 },
      smallButton: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: colors.surface2,
        borderColor: colors.border,
        borderWidth: 1,
      },
      smallButtonText: { color: colors.foreground, fontSize: compact ? 11 : 12 },
      dangerButton: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: colors.surface2,
        borderColor: colors.statusDanger,
        borderWidth: 1,
      },
      dangerButtonText: { color: colors.statusDanger, fontSize: compact ? 11 : 12 },
      primaryButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: colors.accent,
        alignItems: "center" as const,
      },
      primaryButtonText: {
        color: colors.accentForeground,
        fontSize: compact ? 12 : 13,
        fontWeight: "600" as const,
      },
      disabledButton: { opacity: 0.4 },
      input: {
        backgroundColor: colors.surface1,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        color: colors.foreground,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: compact ? 12 : 13,
      },
      hunkBox: {
        backgroundColor: colors.surface0,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        padding: 8,
        gap: 8,
      },
      diffBox: {
        backgroundColor: colors.surface0,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        maxHeight: 320,
      },
      diffText: { color: colors.foregroundMuted, fontSize: compact ? 10 : 11 },
    }),
    [colors, compact],
  );

  const data = statusQuery.data;

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

  const viewingUntracked =
    !!viewing && !viewing.staged && untracked.some((f) => f.path === viewing.path);
  const viewingConflict =
    !!viewing && conflicts.some((f) => f.path === viewing.path);

  const renderFileRow = (file: FileChange, isStaged: boolean, isUntracked: boolean) => (
    <View key={`${isStaged ? "s" : "u"}-${file.path}`} style={styles.row}>
      <Pressable
        accessibilityRole="button"
        style={styles.fileButton}
        onPress={() =>
          setViewing((v) =>
            v?.path === file.path && v.staged === isStaged
              ? null
              : { path: file.path, staged: isStaged },
          )
        }
      >
        <Text style={styles.fileName} numberOfLines={1}>
          {file.path}
        </Text>
        <Text style={styles.fileStatus}>{statusLabel(file.status)}</Text>
      </Pressable>
      {isStaged ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unstage ${file.path}`}
          style={styles.smallButton}
          onPress={() => unstageMutation.mutate([file.path])}
        >
          <Text style={styles.smallButtonText}>Unstage</Text>
        </Pressable>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Stage ${file.path}`}
            style={styles.smallButton}
            onPress={() => stageMutation.mutate([file.path])}
          >
            <Text style={styles.smallButtonText}>Stage</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Discard changes to ${file.path}`}
            style={styles.dangerButton}
            onPress={() => discardMutation.mutate({ path: file.path, untracked: isUntracked })}
          >
            <Text style={styles.dangerButtonText}>Discard</Text>
          </Pressable>
        </>
      )}
    </View>
  );

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
          <Text style={styles.title}>
            {data.branch ? `Branch: ${data.branch}` : "Detached HEAD"}
            {typeof data.ahead === "number" && data.ahead > 0 ? ` ↑${data.ahead}` : ""}
            {typeof data.behind === "number" && data.behind > 0 ? ` ↓${data.behind}` : ""}
          </Text>
          {data.lastCommit ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              Last commit: {data.lastCommit}
            </Text>
          ) : (
            <Text style={styles.subtitle}>No commits yet.</Text>
          )}
        </View>
      )}

      {data?.operation && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.warning}>
              In progress: {OP_LABELS[data.operation] ?? data.operation}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              style={styles.dangerButton}
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
                style={styles.fileButton}
                onPress={() =>
                  setViewing((v) =>
                    v?.path === file.path && !v.staged ? null : { path: file.path, staged: false },
                  )
                }
              >
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.path}
                </Text>
                <Text style={styles.fileStatus}>{statusLabel(file.status)}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.smallButton}
                onPress={() => {
                  setViewing({ path: file.path, staged: false });
                  resolveMutation.mutate("ours");
                }}
              >
                <Text style={styles.smallButtonText}>Ours</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.smallButton}
                onPress={() => {
                  setViewing({ path: file.path, staged: false });
                  resolveMutation.mutate("theirs");
                }}
              >
                <Text style={styles.smallButtonText}>Theirs</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.smallButton}
                onPress={() => resolveMutation.mutate("mark")}
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
              style={styles.smallButton}
              onPress={() => unstageMutation.mutate([])}
            >
              <Text style={styles.smallButtonText}>Unstage all</Text>
            </Pressable>
          </View>
          {staged.map((f) => renderFileRow(f, true, false))}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>Changes ({unstaged.length + untracked.length})</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            style={styles.smallButton}
            onPress={() => stageMutation.mutate([])}
          >
            <Text style={styles.smallButtonText}>Stage all</Text>
          </Pressable>
        </View>
        {unstaged.length === 0 && untracked.length === 0 && (
          <Text style={styles.muted}>Working tree clean.</Text>
        )}
        {unstaged.map((f) => renderFileRow(f, false, false))}
        {untracked.map((f) => renderFileRow(f, false, true))}
      </View>

      {viewing && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.title} numberOfLines={1}>
              {viewing.staged ? "Staged: " : "Diff: "}
              {viewing.path}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              style={styles.smallButton}
              onPress={() => setViewing(null)}
            >
              <Text style={styles.smallButtonText}>Close</Text>
            </Pressable>
          </View>

          {viewingConflict ? (
            <Text style={styles.warning}>
              Resolve with Ours / Theirs above, or edit the file and choose Mark.
            </Text>
          ) : null}

          {viewingConflict ? (
            conflictSidesQuery.isLoading ? (
              <Text style={styles.muted}>Loading…</Text>
            ) : conflictSidesQuery.data?.error ? (
              <Text style={styles.error}>{conflictSidesQuery.data.error}</Text>
            ) : (
              <View>
                <View style={{ flexDirection: compact ? "column" : "row", gap: 8 }}>
                  {[
                    { title: "Ours", text: conflictSidesQuery.data?.ours ?? "" },
                    { title: "Theirs", text: conflictSidesQuery.data?.theirs ?? "" },
                  ].map((side) => (
                    <View key={side.title} style={{ flex: 1 }}>
                      <Text style={styles.fileStatus}>{side.title}</Text>
                      <ScrollView style={styles.diffBox} nestedScrollEnabled>
                        <Text style={styles.diffText}>{side.text || "(empty)"}</Text>
                      </ScrollView>
                    </View>
                  ))}
                </View>
                {conflictSidesQuery.data?.base != null && (
                  <View>
                    <Text style={styles.fileStatus}>Base</Text>
                    <ScrollView style={styles.diffBox} nestedScrollEnabled>
                      <Text style={styles.diffText}>
                        {conflictSidesQuery.data.base || "(empty)"}
                      </Text>
                    </ScrollView>
                  </View>
                )}
              </View>
            )
          ) : viewingUntracked ? (
            diffQuery.isLoading ? (
              <Text style={styles.muted}>Loading…</Text>
            ) : diffQuery.data?.error ? (
              <Text style={styles.error}>{diffQuery.data.error}</Text>
            ) : (
              <ScrollView style={styles.diffBox} nestedScrollEnabled>
                <Text style={styles.diffText}>{diffQuery.data?.diff ?? ""}</Text>
              </ScrollView>
            )
          ) : hunksQuery.isLoading ? (
            <Text style={styles.muted}>Loading hunks…</Text>
          ) : hunksQuery.data?.error ? (
            <Text style={styles.error}>{hunksQuery.data.error}</Text>
          ) : (hunksQuery.data?.hunks ?? []).length === 0 ? (
            <Text style={styles.muted}>No hunks.</Text>
          ) : (
            hunksQuery.data?.hunks.map((patch, i) => (
              <View key={`h-${i}`} style={styles.hunkBox}>
                <View style={styles.row}>
                  <Text style={styles.fileStatus} numberOfLines={1}>
                    {hunkTitle(patch)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    accessibilityRole="button"
                    style={styles.smallButton}
                    onPress={() => applyHunkMutation.mutate(patch)}
                  >
                    <Text style={styles.smallButtonText}>
                      {viewing.staged ? "Unstage hunk" : "Stage hunk"}
                    </Text>
                  </Pressable>
                </View>
                <ScrollView style={styles.diffBox} nestedScrollEnabled>
                  <Text style={styles.diffText}>{patch}</Text>
                </ScrollView>
              </View>
            ))
          )}

          {applyHunkMutation.data?.error && (
            <Text style={styles.error}>{applyHunkMutation.data.error}</Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>Commit</Text>
        <View style={styles.row}>
          <Text style={styles.muted}>Generator provider</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={provider}
            onChangeText={setProvider}
            placeholder="claude/claude-sonnet-5-5"
            placeholderTextColor={colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          style={[styles.primaryButton, messageMutation.isPending ? styles.disabledButton : undefined]}
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
          style={[styles.input, { minHeight: compact ? 64 : 88, textAlignVertical: "top" }]}
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
          style={[styles.primaryButton, !canCommit ? styles.disabledButton : undefined]}
          disabled={!canCommit || commitMutation.isPending}
          onPress={() => commitMutation.mutate()}
        >
          <Text style={styles.primaryButtonText}>
            {commitMutation.isPending ? "Committing…" : "Commit"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
