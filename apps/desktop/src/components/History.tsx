import type { Request, Workspace } from "@requestlab/shared";
import { Globe, Trash2 } from "lucide-react";
export function History({
  workspace,
  onOpen,
  onClear,
}: {
  workspace: Workspace;
  onOpen: (request: Request) => void;
  onClear: () => void;
}) {
  return (
    <div className="tool-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR ACTIVITY</span>
          <h1>Request history</h1>
          <p>Your last 100 requests, stored on this device.</p>
        </div>
        <button className="subtle-button" onClick={onClear}>
          <Trash2 size={14} />
          Clear history
        </button>
      </div>
      {!workspace.history.length ? (
        <div className="large-empty">
          <Globe size={32} />
          <h2>A clean slate</h2>
          <p>
            Requests you send will appear here. Your history never leaves this
            device.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {workspace.history.map((h) => (
            <button key={h.id} onClick={() => onOpen(h.request)}>
              <span className={`method method-${h.request.method}`}>
                {h.request.method}
              </span>
              <div>
                <strong>{h.request.name}</strong>
                <code>{h.request.url}</code>
              </div>
              <span className={h.error ? "status-error" : "status-success"}>
                {h.response?.status ?? "Error"}
              </span>
              <span>{h.response?.durationMs ?? "—"} ms</span>
              <time>{new Date(h.timestamp).toLocaleString()}</time>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
