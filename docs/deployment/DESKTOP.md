# Desktop development and installers

## Prerequisites

All systems: Node 22.13+, npm, stable Rust via rustup, Git, and the Tauri 2 platform toolchain. Network access to npm, Rust distribution servers, and crates.io is required on the build machine. The original sandbox had npm access but **no Rust compiler or Cargo**, and its network restrictions prevent provisioning the normal Rust toolchain.

- **Windows:** Visual Studio C++ Build Tools (Desktop development with C++), Windows SDK, Microsoft Edge WebView2 runtime. Build MSI/NSIS on Windows. Secret storage uses Windows credentials.
- **macOS:** Xcode command-line tools. Build `.app`/DMG on macOS. Code signing and notarization require the owner's Apple Developer credentials. The current macOS CI runner builds its native architecture; separate Intel and Apple Silicon targets are needed for complete coverage.
- **Linux (Debian/Ubuntu):** compiler/linker tooling, WebKitGTK 4.1, GTK development headers, OpenSSL/DBus, AppIndicator, librsvg. Ubuntu example:

```bash
sudo apt-get update
sudo apt-get install -y build-essential libwebkit2gtk-4.1-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev
```

An active/unlocked Secret Service is required for Linux keyring operations. AppImage packaging may also require FUSE-related tools depending on the distribution.

## Exact commands (repository root)

```bash
npm ci
npm run desktop

# TypeScript and frontend production build only:
npm run build
# Native executable and target-OS installers:
npm run desktop:build
```

The Tauri hook builds the frontend from the monorepo root; artifacts go to `apps/desktop/src-tauri/target/release/bundle/`. The frontend-only `apps/desktop/dist` output requires the native bridge or development bridge for execution; serving it as a static website is not a standalone API client.

Before a release:

```bash
cd apps/desktop/src-tauri
cargo generate-lockfile
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo install cargo-audit --locked
cargo audit
```

Review and commit the generated Cargo.lock after a successful trusted build. It could not be generated here because Cargo/crates.io were unavailable. Rust dependency reproducibility remains a release gate.

Icons and metadata are present. To regenerate icons after an intentional branding change, from root:

```bash
npx tauri icon docs/icon.svg -o apps/desktop/src-tauri/icons
```

The manual GitHub artifact workflow targets Windows, Linux, and macOS and labels outputs **unsigned**. It has not run in this session. It does not publish a GitHub release or claim that signing credentials exist. The owner must configure platform signing/notarization, verify installers on clean machines, and decide how updates are distributed. Do not enable an updater without key management and signed update metadata.
