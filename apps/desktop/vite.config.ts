import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { previewBridge } from "../../tools/preview-bridge";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), previewBridge()],
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", "localhost"],
    port: 5173,
    fs: { allow: ["../.."] },
  },
  build: { outDir: "dist", emptyOutDir: true },
  optimizeDeps: {
    include: ["quickjs-emscripten-core", "@jitl/quickjs-wasmfile-release-sync"],
  },
  worker: { format: "es" },
});
