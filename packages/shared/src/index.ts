import { z } from "zod";
export const pairSchema = z.object({
  id: z.string(),
  key: z.string().max(1000),
  value: z.string().max(100_000),
  enabled: z.boolean(),
  secret: z.boolean().optional(),
});
export type Pair = z.infer<typeof pairSchema>;
export const requestSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(200),
  collectionId: z.string().nullable(),
  method: z.string().regex(/^[A-Z!#$%&'*+.^_`|~-]{1,30}$/),
  url: z.string().max(16000),
  headers: z.array(pairSchema).max(200),
  params: z.array(pairSchema).max(200),
  body: z.string().max(5_000_000),
  bodyType: z.enum(["none", "json", "text", "xml", "urlencoded"]),
  auth: z.object({
    type: z.enum(["none", "bearer", "basic", "apikey"]),
    token: z.string(),
    username: z.string(),
    password: z.string(),
    key: z.string(),
    value: z.string(),
  }),
  timeoutMs: z.number().int().min(100).max(300_000),
  followRedirects: z.boolean(),
  tests: z.string().max(100_000),
  description: z.string().max(100_000),
});
export type Request = z.infer<typeof requestSchema>;
export interface Collection {
  id: string;
  name: string;
  description: string;
  parentId?: string | null;
}
export interface Environment {
  id: string;
  name: string;
  variables: Pair[];
}
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  durationMs: number;
  size: number;
  truncated: boolean;
  url: string;
  base64?: string;
}
export interface HistoryEntry {
  id: string;
  request: Request;
  response: HttpResponse | null;
  error?: string;
  timestamp: string;
}
export interface Preferences {
  theme: "dark" | "light";
  sidebarWidth: number;
  responseHeight: number;
  activeEnvironment: string;
  activeRequest: string | null;
}
export interface Workspace {
  version: 1;
  collections: Collection[];
  requests: Request[];
  environments: Environment[];
  globalVariables: Pair[];
  history: HistoryEntry[];
  preferences: Preferences;
}
export const workspaceSchema = z.object({
  version: z.literal(1),
  collections: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        parentId: z.string().nullable().optional(),
      }),
    )
    .max(1000),
  requests: z.array(requestSchema).max(10000),
  environments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        variables: z.array(pairSchema),
      }),
    )
    .max(100),
  globalVariables: z.array(pairSchema),
  history: z.array(z.unknown()),
  preferences: z.object({
    theme: z.enum(["dark", "light"]),
    sidebarWidth: z.number().min(190).max(500),
    responseHeight: z.number().min(160).max(1000),
    activeEnvironment: z.string(),
    activeRequest: z.string().nullable(),
  }),
});
export const uid = () => crypto.randomUUID();
export const pair = (key = "", value = ""): Pair => ({
  id: uid(),
  key,
  value,
  enabled: true,
});
export function newRequest(collectionId: string | null = null): Request {
  return {
    id: uid(),
    name: "Untitled request",
    collectionId,
    method: "GET",
    url: "",
    headers: [],
    params: [],
    body: "",
    bodyType: "none",
    auth: {
      type: "none",
      token: "",
      username: "",
      password: "",
      key: "X-API-Key",
      value: "",
    },
    timeoutMs: 30000,
    followRedirects: true,
    tests:
      'test("Status is successful", () => {\n  expect(response.status).toBe(200);\n});',
    description: "",
  };
}
export function emptyWorkspace(): Workspace {
  return {
    version: 1,
    collections: [],
    requests: [],
    environments: [{ id: "local", name: "Local", variables: [] }],
    globalVariables: [],
    history: [],
    preferences: {
      theme: "dark",
      sidebarWidth: 260,
      responseHeight: 340,
      activeEnvironment: "local",
      activeRequest: null,
    },
  };
}
export function resolveVariables(text: string, scopes: Pair[][]): string {
  const values = new Map<string, string>();
  for (const scope of scopes)
    for (const item of scope)
      if (item.enabled) values.set(item.key, item.value);
  let result = text;
  const seen = new Set<string>();
  for (let depth = 0; depth < 10; depth++) {
    if (seen.has(result)) throw new Error("Circular variable reference");
    seen.add(result);
    let changed = false;
    result = result.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
      const value = values.get(key);
      if (value === undefined) throw new Error(`Unresolved variable: ${key}`);
      changed = true;
      return value;
    });
    if (!changed) return result;
  }
  throw new Error("Variable resolution exceeded 10 levels");
}
export function prepareRequest(request: Request, scopes: Pair[][]): Request {
  const resolve = (value: string) => resolveVariables(value, scopes);
  const url = new URL(resolve(request.url));
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Only HTTP and HTTPS URLs are supported");
  if (url.username || url.password)
    throw new Error(
      "Use the Authentication tab instead of credentials in URLs",
    );
  for (const p of request.params)
    if (p.enabled && p.key)
      url.searchParams.append(resolve(p.key), resolve(p.value));
  const headers = request.headers
    .filter((p) => p.enabled && p.key)
    .map((p) => ({ ...p, key: resolve(p.key), value: resolve(p.value) }));
  const auth = request.auth;
  if (auth.type === "bearer")
    headers.push(pair("Authorization", `Bearer ${resolve(auth.token)}`));
  if (auth.type === "basic")
    headers.push(
      pair(
        "Authorization",
        `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${resolve(auth.username)}:${resolve(auth.password)}`)))}`,
      ),
    );
  if (auth.type === "apikey")
    headers.push(pair(resolve(auth.key), resolve(auth.value)));
  const contentTypes = {
    json: "application/json",
    xml: "application/xml",
    text: "text/plain",
    urlencoded: "application/x-www-form-urlencoded",
    none: "",
  };
  if (
    request.bodyType !== "none" &&
    !headers.some((h) => h.key.toLowerCase() === "content-type")
  )
    headers.push(pair("Content-Type", contentTypes[request.bodyType]));
  return {
    ...request,
    url: url.toString(),
    headers,
    params: [],
    body: resolve(request.body),
    auth: { ...auth, type: "none" },
  };
}
export function safeExport(workspace: Workspace): Workspace {
  return {
    ...workspace,
    history: [],
    globalVariables: workspace.globalVariables.filter(
      (v) => !v.secret && !/token|password|secret|api[-_]?key/i.test(v.key),
    ),
    environments: workspace.environments.map((e) => ({
      ...e,
      variables: e.variables.filter(
        (v) => !v.secret && !/token|password|secret|api[-_]?key/i.test(v.key),
      ),
    })),
    requests: workspace.requests.map((r) => ({
      ...r,
      auth: { ...r.auth, token: "", password: "", value: "" },
      headers: r.headers.filter(
        (h) =>
          !h.secret && !/authorization|cookie|api[-_]?key|token/i.test(h.key),
      ),
      params: r.params.filter(
        (p) => !p.secret && !/token|key|password|secret/i.test(p.key),
      ),
    })),
  };
}
