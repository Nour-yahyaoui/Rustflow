import { describe, it, expect } from "vitest";
import {
  pair,
  newRequest,
  emptyWorkspace,
  resolveVariables,
  prepareRequest,
  safeExport,
  requestSchema,
} from "../packages/shared/src";
import { importOpenAPI, exportOpenAPI } from "../apps/desktop/src/lib/openapi";
import { evaluateTests as evaluate } from "../apps/desktop/src/lib/isolation";
import { getQuickJS } from "quickjs-emscripten";
const evaluateTests = async (
  script: string,
  response: Parameters<typeof evaluate>[1],
) => evaluate(script, response, await getQuickJS());
const response = {
  status: 200,
  statusText: "OK",
  headers: [["content-type", "application/json"]] as [string, string][],
  body: '{"access_token":"test-value"}',
  durationMs: 12,
  size: 29,
  truncated: false,
  url: "http://localhost/",
};
describe("variable resolution and request validation", () => {
  it("resolves scope precedence and nested references", () =>
    expect(
      resolveVariables("{{BASE}}/{{ID}}", [
        [
          pair("BASE", "{{HOST}}/v1"),
          pair("HOST", "https://example.com"),
          pair("ID", "1"),
        ],
        [pair("ID", "2")],
      ]),
    ).toBe("https://example.com/v1/2"));
  it("rejects unresolved variables", () =>
    expect(() => resolveVariables("{{MISSING}}", [])).toThrow("Unresolved"));
  it("detects cycles", () =>
    expect(() =>
      resolveVariables("{{A}}", [[pair("A", "{{B}}"), pair("B", "{{A}}")]]),
    ).toThrow("Circular"));
  it("keeps disabled values out of resolution", () =>
    expect(() =>
      resolveVariables("{{A}}", [[{ ...pair("A", "x"), enabled: false }]]),
    ).toThrow());
  it("prepares URL parameters and bearer credentials", () => {
    const r = newRequest();
    r.url = "https://example.com/";
    r.params = [pair("q", "{{Q}}")];
    r.auth.type = "bearer";
    r.auth.token = "{{TOKEN}}";
    const result = prepareRequest(r, [
      [pair("Q", "a b"), pair("TOKEN", "secret")],
    ]);
    expect(result.url).toContain("q=a+b");
    expect(
      result.headers.some(
        (h) => h.key === "Authorization" && h.value === "Bearer secret",
      ),
    ).toBe(true);
    expect(result.auth.type).toBe("none");
  });
  it("blocks unsafe schemes and URL credentials", () => {
    for (const url of ["file:///etc/passwd", "https://x:y@example.com"])
      expect(() => prepareRequest({ ...newRequest(), url }, [])).toThrow();
  });
  it("rejects unbounded timeouts and invalid methods", () => {
    expect(
      requestSchema.safeParse({ ...newRequest(), timeoutMs: 0 }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...newRequest(), method: "GET\r\nX: test" })
        .success,
    ).toBe(false);
  });
  it("excludes secret-marked variables and known credentials from exports", () => {
    const workspace = emptyWorkspace();
    workspace.globalVariables = [
      { ...pair("TOKEN", "secret"), secret: true },
      pair("PUBLIC", "ok"),
    ];
    const r = newRequest();
    r.auth.password = "secret";
    r.headers = [
      pair("Authorization", "secret"),
      pair("Accept", "application/json"),
    ];
    workspace.requests = [r];
    const output = safeExport(workspace);
    expect(JSON.stringify(output)).not.toContain("secret");
    expect(output.requests[0].headers).toHaveLength(1);
  });
});
describe("OpenAPI supported JSON subset", () => {
  it("imports operations and query parameters", () => {
    const result = importOpenAPI(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1" },
        servers: [{ url: "https://example.com" }],
        paths: {
          "/users": {
            get: {
              summary: "List users",
              parameters: [
                { in: "query", name: "page", schema: { default: 1 } },
              ],
            },
          },
        },
      }),
    );
    expect(result.requests[0].url).toBe("https://example.com/users");
    expect(result.requests[0].params[0].value).toBe("1");
    expect(
      exportOpenAPI("Test", result.requests).paths["/users"].get.summary,
    ).toBe("List users");
  });
  it("rejects unimplemented Swagger 2", () =>
    expect(() => importOpenAPI('{"swagger":"2.0"}')).toThrow("OpenAPI"));
});
describe("QuickJS isolation (same engine used by worker)", () => {
  it("executes real assertions and reports failures", async () => {
    const result = await evaluateTests(
      'test("status",()=>expect(response.status).toBe(200));test("token",()=>expect(response.body.access_token).toBeDefined());test("fails",()=>expect(response.status).toBe(404));',
      response,
    );
    expect(result.map((r) => r.passed)).toEqual([true, true, false]);
  });
  it("exposes no network, filesystem, Node, or host globals", async () => {
    const results = await evaluateTests(
      'test("isolated",()=>{expect(typeof fetch).toBe("undefined");expect(typeof process).toBe("undefined");expect(typeof require).toBe("undefined");expect(typeof window).toBe("undefined");});',
      response,
    );
    expect(results[0].passed).toBe(true);
  });
  it("interrupts infinite loops", async () => {
    await expect(evaluateTests("while(true){}", response)).rejects.toThrow();
  });
});

it("never silently passes unsupported async assertions", async () => {
  const results = await evaluateTests(
    'test("async", async()=>expect(response.status).toBe(404));',
    response,
  );
  expect(results[0].passed).toBe(false);
  expect(results[0].error).toContain("Async tests");
});
