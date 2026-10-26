import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  abortOperation,
  applyHunk,
  commit,
  createBranch,
  discard,
  generateMessage,
  getConflictSides,
  getDiff,
  getHunks,
  getStatus,
  listBranches,
  listProviders,
  pushBranch,
  resolveConflict,
  stage,
  switchBranch,
  unstage,
} from "./server/git";
import {
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
  gitPushRpc,
  gitResolveRpc,
  gitStageRpc,
  gitStatusRpc,
  gitSwitchBranchRpc,
  gitUnstageRpc,
} from "./shared/git";
import { gitSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(gitSettings);
  server.handle(gitStatusRpc, getStatus);
  server.handle(gitStageRpc, stage);
  server.handle(gitUnstageRpc, unstage);
  server.handle(gitDiffRpc, getDiff);
  server.handle(gitHunksRpc, getHunks);
  server.handle(gitApplyHunkRpc, applyHunk);
  server.handle(gitResolveRpc, resolveConflict);
  server.handle(gitDiscardRpc, discard);
  server.handle(gitAbortRpc, abortOperation);
  server.handle(gitConflictSidesRpc, getConflictSides);
  server.handle(gitProvidersRpc, listProviders);
  server.handle(gitBranchesRpc, listBranches);
  server.handle(gitSwitchBranchRpc, switchBranch);
  server.handle(gitCreateBranchRpc, createBranch);
  server.handle(gitPushRpc, pushBranch);
  server.handle(gitCommitRpc, commit);
  server.handle(gitMessageRpc, generateMessage);
  return () => {};
}
