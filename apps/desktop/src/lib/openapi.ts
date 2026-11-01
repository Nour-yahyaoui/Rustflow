import {
  newRequest,
  pair,
  uid,
  type Collection,
  type Request,
} from "@requestlab/shared";
interface Operation {
  summary?: string;
  description?: string;
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    schema?: { default?: unknown };
  }[];
  requestBody?: {
    content?: Record<string, { example?: unknown; schema?: unknown }>;
  };
  responses?: Record<string, unknown>;
}
interface OpenAPI {
  openapi: string;
  info: { title: string; version: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
}
export function importOpenAPI(text: string): {
  collection: Collection;
  requests: Request[];
} {
  const doc = JSON.parse(text) as OpenAPI;
  if (
    !/^3\.(0|1)\.\d+$/.test(doc.openapi ?? "") ||
    !doc.paths ||
    !doc.info?.title
  )
    throw new Error("Expected an OpenAPI 3.0 or 3.1 JSON document");
  if (Object.keys(doc.paths).length > 5000)
    throw new Error("Specification is too large");
  const collection = {
    id: uid(),
    name: doc.info.title,
    description: `Imported OpenAPI ${doc.openapi} · ${doc.info.version}`,
  };
  const requests: Request[] = [];
  for (const [path, methods] of Object.entries(doc.paths))
    for (const [method, op] of Object.entries(methods))
      if (
        [
          "get",
          "post",
          "put",
          "patch",
          "delete",
          "head",
          "options",
          "trace",
        ].includes(method)
      ) {
        const r = newRequest(collection.id);
        r.name = op.summary || `${method.toUpperCase()} ${path}`;
        r.method = method.toUpperCase();
        r.url =
          (doc.servers?.[0]?.url || "{{BASE_URL}}") +
          path.replace(/\{([^}]+)\}/g, "{{$1}}");
        r.description = op.description ?? "";
        for (const p of op.parameters ?? [])
          if (p.in === "query")
            r.params.push(pair(p.name, String(p.schema?.default ?? "")));
          else if (p.in === "header")
            r.headers.push(pair(p.name, String(p.schema?.default ?? "")));
        const json = op.requestBody?.content?.["application/json"];
        if (json) {
          r.bodyType = "json";
          r.body = JSON.stringify(json.example ?? {}, null, 2);
        }
        requests.push(r);
      }
  return { collection, requests };
}
export function exportOpenAPI(name: string, requests: Request[]): OpenAPI {
  const paths: OpenAPI["paths"] = {};
  let server = "";
  for (const r of requests) {
    let path = r.url;
    try {
      const u = new URL(r.url);
      server ||= u.origin;
      path = u.pathname;
    } catch {
      /* Preserve templated paths. */
    }
    path = path.replace(/\{\{([^}]+)\}\}/g, "{$1}");
    paths[path] ??= {};
    paths[path][r.method.toLowerCase()] = {
      summary: r.name,
      description: r.description,
      parameters: r.params
        .filter((p) => p.enabled && p.key)
        .map((p) => ({
          name: p.key,
          in: "query",
          schema: { default: p.value },
        })),
      ...(r.bodyType === "json"
        ? {
            requestBody: {
              content: { "application/json": { example: parseJson(r.body) } },
            },
          }
        : {}),
      responses: { default: { description: "Response (schema not inferred)" } },
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: name, version: "1.0.0" },
    servers: server ? [{ url: server }] : [],
    paths,
  };
}
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
