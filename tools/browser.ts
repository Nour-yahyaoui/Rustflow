// Optional Linux CI/sandbox fallback when browser downloads are unavailable.
import chromium from "@sparticuz/chromium";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
export async function sandboxBrowser() {
  const root = join(tmpdir(), "requestlab-browser");
  mkdirSync(root, { recursive: true });
  const require = createRequire(import.meta.url);
  const bin = join(
    dirname(require.resolve("@sparticuz/chromium")),
    "..",
    "bin",
  );
  const archive = join(root, "libraries.tar");
  writeFileSync(
    archive,
    brotliDecompressSync(readFileSync(join(bin, "al2023.tar.br"))),
  );
  execFileSync("tar", ["xf", archive, "-C", root]);
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter(
      (arg) =>
        ![
          "--single-process",
          "--disable-web-security",
          "--allow-running-insecure-content",
        ].includes(arg),
    ),
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${join(root, "lib")}:${process.env.LD_LIBRARY_PATH ?? ""}`,
    },
  };
}
