import type { HttpResponse } from "@requestlab/shared";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Braces,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Loader2,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { TestResult } from "../lib/tests";
import { download } from "./Primitives";
function JsonNode({
  name,
  value,
  path = "$",
  depth = 0,
  onNotify,
}: {
  name: string;
  value: unknown;
  path?: string;
  depth?: number;
  onNotify: (message: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    return (
      <div className="json-node">
        <button className="json-toggle" onClick={() => setOpen(!open)}>
          <ChevronRight size={12} className={open ? "rotate" : ""} />
          <span className="json-key">{name}</span>
          <span className="muted">
            {Array.isArray(value)
              ? `[${entries.length}]`
              : `{${entries.length}}`}
          </span>
        </button>
        {open &&
          entries.slice(0, 200).map(([k, v]) => (
            <div className="json-child" key={k}>
              <JsonNode
                name={k}
                value={v}
                path={`${path}.${k}`}
                depth={depth + 1}
                onNotify={onNotify}
              />
            </div>
          ))}
        {open && entries.length > 200 && (
          <span className="muted">
            Showing first 200 keys. Download for complete data.
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="json-leaf">
      <span className="json-key">{name}: </span>
      <span
        className={typeof value === "string" ? "json-string" : "json-number"}
      >
        {JSON.stringify(value)}
      </span>
      <button
        className="icon-button"
        title={`Copy path: ${path}`}
        aria-label={`Copy path ${path}`}
        onClick={() =>
          void navigator.clipboard
            .writeText(path)
            .then(() => onNotify("JSON path copied"))
            .catch(() => onNotify("Clipboard access denied"))
        }
      >
        <Copy size={11} />
      </button>
    </div>
  );
}
export function ResponsePanel({
  response,
  loading,
  error,
  results,
  onNotify,
}: {
  response: HttpResponse | null;
  loading: boolean;
  error: string | null;
  results: TestResult[];
  onNotify: (message: string) => void;
}) {
  const [tab, setTab] = useState("Body");
  const [mode, setMode] = useState("Pretty");
  const [search, setSearch] = useState("");
  const parsed = useMemo(() => {
    if (!response || response.body.length > 1_000_000) return undefined;
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      return undefined;
    }
  }, [response]);
  const pretty = useMemo(
    () =>
      parsed !== undefined
        ? JSON.stringify(parsed, null, 2)
        : (response?.body ?? ""),
    [parsed, response],
  );
  const text = mode === "Raw" ? (response?.body ?? "") : pretty;
  const lines = useMemo(() => text.split("\n").slice(0, 5000), [text]);
  const matches = search
    ? lines.filter((line) => line.toLowerCase().includes(search.toLowerCase()))
        .length
    : 0;
  const cookies =
    response?.headers.filter(([name]) => name.toLowerCase() === "set-cookie") ??
    [];
  return (
    <section className="response-panel" aria-label="Response inspector">
      <div className="response-heading">
        <span>Response</span>
        {response && (
          <div className="response-metrics">
            <span
              className={
                response.status < 400 ? "status-success" : "status-error"
              }
            >
              <span className="status-dot" />
              {response.status} {response.statusText}
            </span>
            <span>
              <b>{response.durationMs}</b> ms
            </span>
            <span>
              <b>{(response.size / 1024).toFixed(2)}</b> KB
            </span>
          </div>
        )}
        {loading && (
          <span className="loading-label">
            <Loader2 size={12} className="spin" />
            Sending request…
          </span>
        )}
      </div>
      {!response && !loading && !error ? (
        <div className="response-empty">
          <div className="empty-icon">
            <ArrowUpRight size={27} />
          </div>
          <h3>Ready when you are</h3>
          <p>Send a request to see the response here.</p>
          <span>
            Send request <kbd>⌘</kbd>
            <kbd>↵</kbd>
          </span>
        </div>
      ) : error ? (
        <div className="error-state">
          <CircleAlert size={25} />
          <h3>Couldn’t complete the request</h3>
          <p>{error}</p>
          <span>Check the URL, network connection, and request settings.</span>
        </div>
      ) : loading && !response ? (
        <div className="response-empty">
          <Loader2 className="spin" size={26} />
          <h3>Waiting for response…</h3>
          <p>You can cancel this request at any time.</p>
        </div>
      ) : (
        response && (
          <>
            <div className="response-tabs">
              <div role="tablist" aria-label="Response views">
                {["Body", "Headers", "Cookies", "Tests"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                    {t === "Headers" && (
                      <span className="count">{response.headers.length}</span>
                    )}
                    {t === "Tests" && results.length > 0 && (
                      <span
                        className={
                          results.every((r) => r.passed)
                            ? "test-badge"
                            : "test-badge failed"
                        }
                      >
                        {results.filter((r) => r.passed).length}/
                        {results.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="response-actions">
                <button
                  className="icon-button"
                  aria-label="Copy response"
                  title="Copy response"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(text)
                      .then(() => onNotify("Response copied"))
                      .catch(() => onNotify("Clipboard access denied"));
                  }}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Download response"
                  title="Download response"
                  onClick={() => {
                    if (response.base64) {
                      const bytes = Uint8Array.from(
                        atob(response.base64),
                        (c) => c.charCodeAt(0),
                      );
                      const url = URL.createObjectURL(new Blob([bytes]));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download =
                        parsed === undefined ? "response.bin" : "response.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } else
                      download("response.txt", response.body, "text/plain");
                  }}
                >
                  <ArrowDownToLine size={15} />
                </button>
              </div>
            </div>
            {response.truncated && (
              <div className="warning-banner">
                Response limited to 5 MB. The received data is incomplete.
              </div>
            )}
            {tab === "Body" && (
              <>
                <div className="response-toolbar">
                  <div className="segmented">
                    {["Pretty", "Raw", "Tree"].map((m) => (
                      <button
                        className={mode === m ? "active" : ""}
                        key={m}
                        onClick={() => setMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <span className="content-type">
                    <Braces size={13} />
                    {parsed !== undefined ? "JSON" : "Text"}
                  </span>
                  <div className="response-search">
                    <Search size={13} />
                    <input
                      aria-label="Search response"
                      placeholder="Search response…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && <span>{matches} lines</span>}
                  </div>
                </div>
                <div className="response-code">
                  {mode === "Tree" && parsed !== undefined ? (
                    <JsonNode name="$" value={parsed} onNotify={onNotify} />
                  ) : (
                    <pre>
                      {lines.map((line, i) => (
                        <div
                          className={
                            search &&
                            line.toLowerCase().includes(search.toLowerCase())
                              ? "matched code-line"
                              : "code-line"
                          }
                          key={i}
                        >
                          <span className="line-number">{i + 1}</span>
                          <code>{line || " "}</code>
                        </div>
                      ))}
                    </pre>
                  )}
                  {text.split("\n").length > 5000 && (
                    <p className="warning-banner">
                      Rendering first 5,000 lines. Download to inspect the
                      complete response.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === "Headers" && (
              <div className="response-table">
                {response.headers.map(([k, v], i) => (
                  <div key={i}>
                    <code>{k}</code>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === "Cookies" && (
              <div className="response-table">
                {cookies.length ? (
                  cookies.map(([k, v], i) => (
                    <div key={i}>
                      <code>{k}</code>
                      <span>{v}</span>
                    </div>
                  ))
                ) : (
                  <div className="small-empty">
                    No Set-Cookie headers in this response.
                  </div>
                )}
              </div>
            )}
            {tab === "Tests" && (
              <div className="test-results">
                {results.length ? (
                  results.map((r, i) => (
                    <div className={r.passed ? "passed" : "failed"} key={i}>
                      {r.passed ? (
                        <Check size={16} />
                      ) : (
                        <CircleAlert size={16} />
                      )}
                      <div>
                        <strong>{r.name}</strong>
                        {r.error && <p>{r.error}</p>}
                      </div>
                      <span>{r.passed ? "PASS" : "FAIL"}</span>
                    </div>
                  ))
                ) : (
                  <div className="small-empty">
                    Add a script in the Tests tab, then send the request.
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
