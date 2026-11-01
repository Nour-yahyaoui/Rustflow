import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import AxeBuilder from "@axe-core/playwright";
import { emptyWorkspace, newRequest, pair } from "../../packages/shared/src";
let server: Server;
let port: number;
test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/slow") {
      setTimeout(() => {
        if (!response.destroyed) response.end("late");
      }, 2000);
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/json",
      "X-Test-Engine": "real-http-server",
    });
    response.end(
      JSON.stringify({
        message: "Hello from a real HTTP server",
        method: request.method,
        received: request.url,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});
test.afterAll(() => {
  server.closeAllConnections();
  server.close();
});
test.beforeEach(async ({ request }) => {
  await request.put("/__native/state", {
    headers: { "X-RequestLab-Client": "preview" },
    data: emptyWorkspace(),
  });
});
test("empty workspace, keyboard creation, actual request, assertions, persistence, export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Less friction. More flow." }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/workspace.png" });
  await page.getByRole("button", { name: "Create a request" }).click();
  await page
    .getByRole("textbox", { name: "Request name", exact: true })
    .fill("Real HTTP integration");
  await page
    .getByRole("textbox", { name: "Request URL", exact: true })
    .fill(`http://127.0.0.1:${port}/users`);
  await page.getByRole("button", { name: /^Send/ }).click();
  await expect(page.getByText("200 OK", { exact: false })).toBeVisible();
  await expect(
    page.getByText("Hello from a real HTTP server", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Response inspector" })
    .getByRole("tab", { name: /^Tests/ })
    .click();
  await expect(
    page.getByText("Status is successful", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PASS", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Body", exact: true }).last().click();
  await page.screenshot({ path: "docs/screenshots/request.png" });
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Request name", exact: true }),
  ).toHaveValue("Real HTTP integration");
  await expect(
    page.getByRole("textbox", { name: "Request URL", exact: true }),
  ).toHaveValue(`http://127.0.0.1:${port}/users`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("requestlab-workspace.json");
  expect(errors).toEqual([]);
});
test("collections, variables, navigation, themes, and accessible initial workspace", async ({
  page,
}) => {
  await page.goto("/");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await page.getByPlaceholder("e.g. Payments API").fill("Payments");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Payments", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Environments", exact: true }).click();
  await page
    .getByRole("button", { name: "Local", exact: false })
    .filter({ hasText: "Active" })
    .first()
    .click();
  await page.getByRole("button", { name: "Add variable" }).click();
  await page
    .getByRole("textbox", { name: "Key 1", exact: true })
    .fill("BASE_URL");
  await page
    .getByRole("textbox", { name: "Value 1", exact: true })
    .fill(`http://127.0.0.1:${port}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Daylight" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Midnight" }).click();
  for (const route of [
    "WebSocket",
    "API documentation",
    "Test runner",
    "History",
    "Cloud workspaces",
  ]) {
    await page
      .getByRole("button", { name: new RegExp("^" + route), exact: false })
      .click();
    await expect(page.locator("h1")).toBeVisible();
  }
});
test("request cancellation and real engine headers", async ({
  request,
  page,
}) => {
  const r = {
    ...newRequest(),
    url: `http://127.0.0.1:${port}/headers`,
    headers: [pair("X-Test", "true")],
  };
  const result = await request.post("/__native/execute", {
    headers: { "X-RequestLab-Client": "preview" },
    data: r,
  });
  expect(result.status()).toBe(200);
  expect((await result.json()).headers).toContainEqual([
    "x-test-engine",
    "real-http-server",
  ]);
  const workspace = emptyWorkspace();
  workspace.requests = [{ ...r, url: `http://127.0.0.1:${port}/slow` }];
  workspace.preferences.activeRequest = r.id;
  await request.put("/__native/state", {
    headers: { "X-RequestLab-Client": "preview" },
    data: workspace,
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: /^Send/ }).click();
  await page.getByRole("button", { name: /^Cancel/ }).click();
  await expect(
    page.getByText("Request cancelled", { exact: true }),
  ).toBeVisible();
});

test("Monaco request body editor loads offline assets and a collection run executes", async ({
  page,
  request,
}) => {
  const workspace = emptyWorkspace();
  const r = {
    ...newRequest(),
    name: "Collection smoke",
    url: `http://127.0.0.1:${port}/collection`,
  };
  workspace.requests = [r];
  workspace.preferences.activeRequest = r.id;
  await request.put("/__native/state", {
    headers: { "X-RequestLab-Client": "preview" },
    data: workspace,
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await page
    .getByRole("region", { name: "Request editor" })
    .getByRole("tab", { name: "Body", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Body type" }).selectOption("json");
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("textbox", { name: "Request body", exact: true })
    .focus();
  await page.keyboard.insertText('{"real":true}');
  await page.getByRole("button", { name: /^Test runner/ }).click();
  await page
    .getByRole("button", { name: "Run collection", exact: true })
    .click();
  await expect(
    page.getByText("Status is successful", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run collection", exact: true }),
  ).toBeEnabled();
});

test("real WebSocket sends and receives messages", async ({ page }) => {
  const { WebSocketServer } = await import("ws");
  const wsServer = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => wsServer.on("listening", resolve));
  wsServer.on("connection", (socket) =>
    socket.on("message", (data) => socket.send(`Echo: ${data.toString()}`)),
  );
  try {
    const wsPort = (wsServer.address() as { port: number }).port;
    await page.goto("/#websocket");
    await page
      .getByRole("textbox", { name: "WebSocket URL" })
      .fill(`ws://127.0.0.1:${wsPort}`);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByText("● Connected", { exact: true })).toBeVisible();
    await page
      .getByRole("textbox", { name: "WebSocket message" })
      .fill("hello-websocket");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText("Echo: hello-websocket", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(
      page.getByText("● Disconnected", { exact: true }),
    ).toBeVisible();
  } finally {
    for (const client of wsServer.clients) client.terminate();
    await new Promise<void>((resolve, reject) =>
      wsServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("OpenAPI imports actual endpoints and exports JSON", async ({ page }) => {
  await page.goto("/#docs");
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import OpenAPI", exact: true })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "api.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Imported specification", version: "1.0.0" },
        servers: [{ url: "https://example.com" }],
        paths: {
          "/users": {
            get: {
              summary: "List users",
              description: "Real imported documentation",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "List users", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Real imported documentation", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export OpenAPI", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe("openapi.json");
});
