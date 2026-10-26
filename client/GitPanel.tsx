import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  gitAbortRpc,
  gitCommitRpc,
  gitDiscardRpc,
  gitMessageRpc,
  gitProvidersRpc,
  gitResolveRpc,
  gitStageRpc,
  gitStatusRpc,
  gitUnstageRpc,
  type FileChange,
} from "../shared/git";
import { openFileTab } from "./fileTab";
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
  const queryClient = useQueryClient();

  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("");
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["git.status", cwd],
    queryFn: () => statusRpc({ cwd }),
    enabled: isGit && cwd.length > 0,
    refetchInterval: 5000,
  });

  const providersQuery = useQuery({
    queryKey: ["git.providers"],
    queryFn: () => providersRpc({}),
    staleTime: 5 * 60 * 1000,
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
  const commitMutation = useMutation({
    mutationFn: () => commitRpc({ cwd, message }),
    onSuccess: (res) => {
      if (res.ok) setMessage("");
    },
    onSettled: invalidateStatus,
  });
  const messageMutation = useMutation({
    mutationFn: () => messageRpc({ cwd, provider: effectiveProvider || undefined }),
    onSuccess: (res) => {
      if (res.ok && res.message) setMessage(res.message);
    },
  });

  const styles = useMemo(() => makeStyles(colors, compact), [colors, compact]);

  const data = statusQuery.data;

  const effectiveProvider = provider || providersQuery.data?.default || "";
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
        paddingHorizontal: 6,
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

  const renderFileRow = (file: FileChange, isStaged: boolean, isUntracked: boolean) => (
    <View key={`${isStaged ? "s" : "u"}-${file.path}`} style={styles.row}>
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
          {file.path}
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
          {staged.map((f) => renderFileRow(f, true, false))}
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
        </View>
        {unstaged.length === 0 && untracked.length === 0 && (
          <Text style={styles.muted}>Working tree clean.</Text>
        )}
        {unstaged.map((f) => renderFileRow(f, false, false))}
        {untracked.map((f) => renderFileRow(f, false, true))}
      </View>

      <Modal
        open={providerPickerOpen}
        onOpenChange={setProviderPickerOpen}
        title="Select provider"
      >
        <Modal.Content>
          <View style={{ gap: 4 }}>
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
                  setProvider(opt.value);
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
    </ScrollView>
  );
}
