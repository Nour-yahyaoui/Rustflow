import { defineConfig } from "@playwright/test";
import { sandboxBrowser } from "./tools/browser";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1440, height: 950 },
    launchOptions:
      process.env.REQUESTLAB_SANDBOX_BROWSER === "1"
        ? await sandboxBrowser()
        : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
