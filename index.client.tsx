import type { PluginClientContext } from "@getpaseo/plugin/client";
import { GitPanel } from "./client/GitPanel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "git-stage-commit",
    title: "Git",
    icon: "GitCommitHorizontal",
    context: "workspace",
    Component: GitPanel,
  });
  return () => {};
}
