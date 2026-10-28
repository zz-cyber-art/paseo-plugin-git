import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  abortOperation,
  applyHunk,
  commit,
  createBranch,
  deleteFile,
  deletePaths,
  discard,
  generateMessage,
  getConflictSides,
  getDiff,
  getHunks,
  getStatus,
  listBranches,
  listProviders,
  pullBranch,
  pushBranch,
  resolveConflict,
  revertPaths,
  stage,
  stash,
  stashList,
  stashPop,
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
  gitDeletePathsRpc,
  gitDeleteRpc,
  gitDiffRpc,
  gitDiscardRpc,
  gitHunksRpc,
  gitMessageRpc,
  gitProvidersRpc,
  gitPullRpc,
  gitPushRpc,
  gitResolveRpc,
  gitRevertPathsRpc,
  gitStageRpc,
  gitStashListRpc,
  gitStashPopRpc,
  gitStashRpc,
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
  server.handle(gitDeleteRpc, deleteFile);
  server.handle(gitRevertPathsRpc, revertPaths);
  server.handle(gitDeletePathsRpc, deletePaths);
  server.handle(gitAbortRpc, abortOperation);
  server.handle(gitConflictSidesRpc, getConflictSides);
  server.handle(gitProvidersRpc, listProviders);
  server.handle(gitBranchesRpc, listBranches);
  server.handle(gitSwitchBranchRpc, switchBranch);
  server.handle(gitCreateBranchRpc, createBranch);
  server.handle(gitPushRpc, pushBranch);
  server.handle(gitPullRpc, pullBranch);
  server.handle(gitStashRpc, stash);
  server.handle(gitStashPopRpc, stashPop);
  server.handle(gitStashListRpc, stashList);
  server.handle(gitCommitRpc, commit);
  server.handle(gitMessageRpc, generateMessage);
  return () => {};
}
