import type { Workspace } from "@requestlab/shared";
import { Download, Globe, Upload } from "lucide-react";
import { useState } from "react";
import { exportOpenAPI } from "../lib/openapi";
import { download } from "./Primitives";
export function Documentation({
  workspace,
  onImport,
}: {
  workspace: Workspace;
  onImport: () => void;
}) {
  const [selected, setSelected] = useState("all");
  const requests = workspace.requests.filter(
    (r) => selected === "all" || r.collectionId === selected,
  );
  return (
    <div className="tool-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">REFERENCE</span>
          <h1>API documentation</h1>
          <p>
            Your collections, documented. OpenAPI 3.x JSON import and basic
            export.
          </p>
        </div>
        <div className="button-row">
          <button className="subtle-button" onClick={onImport}>
            <Upload size={14} />
            Import OpenAPI
          </button>
          <button
            className="primary-button"
            onClick={() =>
              download(
                "openapi.json",
                JSON.stringify(
                  exportOpenAPI("RequestLab API", requests),
                  null,
                  2,
                ),
              )
            }
          >
            <Download size={14} />
            Export OpenAPI
          </button>
        </div>
      </div>
      <select
        aria-label="Documentation collection"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="all">All requests</option>
        {workspace.collections.map((c) => (
          <option value={c.id} key={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {requests.length ? (
        requests.map((r) => (
          <article className="endpoint-doc" key={r.id}>
            <div>
              <span className={`method method-${r.method}`}>{r.method}</span>
              <code>{r.url || "No URL configured"}</code>
            </div>
            <h2>{r.name}</h2>
            <p>
              {r.description ||
                "No description yet. Add documentation in the request’s Docs tab."}
            </p>
            {r.body && <pre>{r.body}</pre>}
          </article>
        ))
      ) : (
        <div className="large-empty">
          <Globe size={32} />
          <h2>Documentation starts with a request</h2>
          <p>Create requests or import an OpenAPI JSON specification.</p>
        </div>
      )}
    </div>
  );
}
