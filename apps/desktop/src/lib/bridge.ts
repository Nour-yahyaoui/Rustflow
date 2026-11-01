import type { HttpResponse, Request, Workspace } from "@requestlab/shared";
import { invoke } from "@tauri-apps/api/core";
export const isNative = "__TAURI_INTERNALS__" in window;
async function preview<T>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/__native/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-RequestLab-Client": "preview",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      (result as { error?: string }).error ?? "Native bridge failed",
    );
  return result as T;
}
export const loadWorkspace = () =>
  isNative
    ? invoke<Workspace | null>("load_workspace")
    : preview<Workspace | null>("state");
export const saveWorkspace = (workspace: Workspace) =>
  isNative
    ? invoke<void>("save_workspace", { workspace })
    : preview<void>("state", "PUT", workspace);
export async function executeRequest(
  request: Request,
  signal: AbortSignal,
): Promise<HttpResponse> {
  if (!isNative)
    return preview<HttpResponse>("execute", "POST", request, signal);
  const id = crypto.randomUUID();
  const cancel = () => {
    void invoke("cancel_request", { id }).catch(console.error);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await invoke<HttpResponse>("execute_request", { id, request });
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
