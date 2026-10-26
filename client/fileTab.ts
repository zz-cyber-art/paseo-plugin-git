import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";

export type FileDiffKind = "tracked" | "untracked" | "conflict";

export interface FileTabRequest {
  workspaceId: string;
  cwd: string;
  path: string;
  staged: boolean;
  kind: FileDiffKind;
}

let client: PluginClientContext | null = null;
let request: FileTabRequest | null = null;
const listeners = new Set<() => void>();

export function bindFileTabClient(c: PluginClientContext | null): void {
  client = c;
}

export function openFileTab(req: FileTabRequest): void {
  request = req;
  listeners.forEach((l) => l());
  client?.openPanel("git-file-diff", { workspaceId: req.workspaceId });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getRequest(): FileTabRequest | null {
  return request;
}

export function useFileTabRequest(): FileTabRequest | null {
  return useSyncExternalStore(subscribe, getRequest);
}
