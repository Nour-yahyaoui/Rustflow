import type { Workspace } from "@requestlab/shared";
import { Check, Download, Upload } from "lucide-react";
import { isNative } from "../lib/bridge";
export function Settings({
  workspace,
  onChange,
  onExport,
  onImport,
  onNotify,
}: {
  workspace: Workspace;
  onChange: (workspace: Workspace) => void;
  onExport: () => void;
  onImport: () => void;
  onNotify: (message: string) => void;
}) {
  return (
    <div className="tool-page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h1>Make it your workspace</h1>
          <p>Small details. A better daily workflow.</p>
        </div>
      </div>
      <section>
        <h2>Appearance</h2>
        <p>Choose the theme that works for you.</p>
        <div className="theme-choices">
          {(["dark", "light"] as const).map((theme) => (
            <button
              className={
                workspace.preferences.theme === theme ? "selected" : ""
              }
              key={theme}
              onClick={() =>
                onChange({
                  ...workspace,
                  preferences: { ...workspace.preferences, theme },
                })
              }
            >
              <div className={`theme-preview ${theme}`}>
                <i />
                <i />
                <i />
              </div>
              <span>
                {theme === "dark" ? "Midnight" : "Daylight"}{" "}
                {workspace.preferences.theme === theme && <Check size={14} />}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Data & portability</h2>
        <p>
          Exports omit secret-marked variables and known credential fields.
          Review request URLs, bodies, and documentation yourself before
          sharing.
        </p>
        <div className="button-row">
          <button className="subtle-button" onClick={onExport}>
            <Download size={14} />
            Export workspace
          </button>
          <button className="subtle-button" onClick={onImport}>
            <Upload size={14} />
            Import workspace
          </button>
        </div>
      </section>
      <section>
        <h2>Runtime</h2>
        <p>
          {isNative
            ? "Tauri 2 · Rust HTTP engine · SQLite · OS credential vault"
            : "Development browser preview · Node HTTP bridge · local SQLite. This is not the native runtime."}
        </p>
        <p>Version 0.1.0 · Core functionality does not require an account.</p>
        <button
          className="subtle-button"
          onClick={() =>
            onNotify(
              "Keyboard shortcuts: ⌘/Ctrl+Enter send · ⌘/Ctrl+K command palette · ⌘/Ctrl+N new request",
            )
          }
        >
          Keyboard shortcuts
        </button>
      </section>
    </div>
  );
}
