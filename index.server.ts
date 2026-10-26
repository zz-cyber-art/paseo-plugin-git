import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  abortOperation,
  applyHunk,
  commit,
  discard,
  generateMessage,
  getConflictSides,
  getDiff,
  getHunks,
  getStatus,
  resolveConflict,
  stage,
  unstage,
} from "./server/git";
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
} from "./shared/git";

export default function contribute(server: PluginServerContext) {
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
  server.handle(gitCommitRpc, commit);
  server.handle(gitMessageRpc, generateMessage);
  return () => {};
}
