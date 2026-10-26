import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  gitApplyHunkRpc,
  gitConflictSidesRpc,
  gitDiffRpc,
  gitHunksRpc,
  gitResolveRpc,
} from "../shared/git";
import type { FileTabRequest } from "./fileTab";
import { DiffText } from "./DiffText";
import { makeStyles } from "./styles";

function hunkTitle(patch: string): string {
  const header = patch.split("\n").find((l) => l.startsWith("@@"));
  return header ?? patch.split("\n")[0] ?? "hunk";
}

export function FileDiffView({
  theme,
  compact,
  req,
}: {
  theme: PluginTheme;
  compact: boolean;
  req: FileTabRequest;
}) {
  const colors = theme.colors;
  const { cwd, path, staged, kind } = req;
  const styles = useMemo(() => makeStyles(colors, compact), [colors, compact]);

  const hunksRpc = useRpc(gitHunksRpc);
  const diffRpc = useRpc(gitDiffRpc);
  const sidesRpc = useRpc(gitConflictSidesRpc);
  const applyHunkRpc = useRpc(gitApplyHunkRpc);
  const resolveRpc = useRpc(gitResolveRpc);
  const queryClient = useQueryClient();

  const hunksQuery = useQuery({
    queryKey: ["git.hunks", cwd, path, staged],
    queryFn: () => hunksRpc({ cwd, path, staged }),
    enabled: kind === "tracked",
  });
  const diffQuery = useQuery({
    queryKey: ["git.diff", cwd, path, false],
    queryFn: () => diffRpc({ cwd, path, staged: false }),
    enabled: kind === "untracked",
  });
  const sidesQuery = useQuery({
    queryKey: ["git.conflict-sides", cwd, path],
    queryFn: () => sidesRpc({ cwd, path }),
    enabled: kind === "conflict",
  });

  const invalidateStatus = () =>
    void queryClient.invalidateQueries({ queryKey: ["git.status", cwd] });
  const invalidateHunks = () =>
    void queryClient.invalidateQueries({ queryKey: ["git.hunks", cwd] });

  const applyHunkMutation = useMutation({
    mutationFn: (patch: string) => applyHunkRpc({ cwd, patch, staged }),
    onSettled: () => {
      invalidateStatus();
      invalidateHunks();
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (strategy: "ours" | "theirs" | "mark") =>
      resolveRpc({ cwd, path, strategy }),
    onSettled: invalidateStatus,
  });

  return (
    <View style={styles.screen}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {path}
        </Text>
        <View style={{ flex: 1 }} />
        {kind === "conflict" && (
          <>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
              onPress={() => resolveMutation.mutate("ours")}
            >
              <Text style={styles.smallButtonText}>Ours</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
              onPress={() => resolveMutation.mutate("theirs")}
            >
              <Text style={styles.smallButtonText}>Theirs</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
              onPress={() => resolveMutation.mutate("mark")}
            >
              <Text style={styles.smallButtonText}>Mark</Text>
            </Pressable>
          </>
        )}
      </View>

      {resolveMutation.data?.error && (
        <Text style={styles.error}>{resolveMutation.data.error}</Text>
      )}
      {applyHunkMutation.data?.error && (
        <Text style={styles.error}>{applyHunkMutation.data.error}</Text>
      )}

      {kind === "conflict" ? (
        sidesQuery.isLoading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : sidesQuery.data?.error ? (
          <Text style={styles.error}>{sidesQuery.data.error}</Text>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            <View style={{ flexDirection: compact ? "column" : "row", gap: 8 }}>
              {[
                { title: "Ours", text: sidesQuery.data?.ours ?? "" },
                { title: "Theirs", text: sidesQuery.data?.theirs ?? "" },
              ].map((side) => (
                <View key={side.title} style={{ flex: 1 }}>
                  <Text style={styles.fileStatus}>{side.title}</Text>
                  <ScrollView style={styles.diffBox} nestedScrollEnabled>
                    <DiffText
                      text={side.text || "(empty)"}
                      colors={colors}
                      fontSize={compact ? 10 : 11}
                      colored={false}
                    />
                  </ScrollView>
                </View>
              ))}
            </View>
            {sidesQuery.data?.base != null && (
              <View>
                <Text style={styles.fileStatus}>Base</Text>
                <ScrollView style={styles.diffBox} nestedScrollEnabled>
                  <DiffText
                    text={sidesQuery.data.base || "(empty)"}
                    colors={colors}
                    fontSize={compact ? 10 : 11}
                    colored={false}
                  />
                </ScrollView>
              </View>
            )}
          </ScrollView>
        )
      ) : kind === "untracked" ? (
        diffQuery.isLoading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : diffQuery.data?.error ? (
          <Text style={styles.error}>{diffQuery.data.error}</Text>
        ) : (
          <ScrollView style={styles.diffBox} nestedScrollEnabled>
            <DiffText
              text={diffQuery.data?.diff ?? ""}
              colors={colors}
              fontSize={compact ? 10 : 11}
              colored={false}
            />
          </ScrollView>
        )
      ) : hunksQuery.isLoading ? (
        <Text style={styles.muted}>Loading hunks…</Text>
      ) : hunksQuery.data?.error ? (
        <Text style={styles.error}>{hunksQuery.data.error}</Text>
      ) : (hunksQuery.data?.hunks ?? []).length === 0 ? (
        <Text style={styles.muted}>No hunks.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 8 }}>
          {hunksQuery.data?.hunks.map((patch, i) => (
            <View key={`h-${i}`} style={styles.hunkBox}>
              <View style={styles.row}>
                <Text style={styles.fileStatus} numberOfLines={1}>
                  {hunkTitle(patch)}
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
                  onPress={() => applyHunkMutation.mutate(patch)}
                >
                  <Text style={styles.smallButtonText}>
                    {staged ? "Unstage hunk" : "Stage hunk"}
                  </Text>
                </Pressable>
              </View>
              <ScrollView style={styles.diffBox} nestedScrollEnabled>
                <DiffText
                  text={patch}
                  colors={colors}
                  fontSize={compact ? 10 : 11}
                />
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
