import type { PluginClientContext } from "@getpaseo/plugin/client";
import { FileDiffPanel } from "./client/FileDiffPanel";
import { GitPanel } from "./client/GitPanel";
import { bindFileTabClient } from "./client/fileTab";

export default function contribute(client: PluginClientContext) {
  bindFileTabClient(client);
  client.addWorkspacePanel({
    id: "git-stage-commit",
    title: "Git",
    icon: "GitCommitHorizontal",
    context: "workspace",
    Component: GitPanel,
  });
  client.addWorkspacePanel({
    id: "git-file-diff",
    title: "File diff",
    icon: "FileDiff",
    context: "workspace",
    Component: FileDiffPanel,
  });
  return () => {
    bindFileTabClient(null);
  };
}
