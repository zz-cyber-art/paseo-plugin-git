import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { FileDiffView } from "./FileDiffView";
import { useFileTabRequest } from "./fileTab";
import { makeStyles } from "./styles";

export function FileDiffPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const colors = theme.colors;
  const compact = layout.compact;
  const req = useFileTabRequest();
  const styles = makeStyles(colors, compact);

  if (!req || req.workspaceId !== workspaceId) {
    return (
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.muted}>Open a file from the Git panel to view its diff.</Text>
      </View>
    );
  }

  return <FileDiffView theme={theme} compact={compact} req={req} />;
}
