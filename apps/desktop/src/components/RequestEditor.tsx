import type { Request } from "@requestlab/shared";
import {
  AlignLeft,
  ChevronDown,
  Code2,
  CornerDownLeft,
  Info,
  Play,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { PairTable } from "./Primitives";
const tabs = [
  "Params",
  "Headers",
  "Body",
  "Auth",
  "Tests",
  "Settings",
  "Docs",
] as const;
export function RequestEditor({
  request,
  onChange,
  onSend,
  onCancel,
  loading,
}: {
  request: Request;
  onChange: (request: Request) => void;
  onSend: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Params");
  const update = (patch: Partial<Request>) =>
    onChange({ ...request, ...patch });
  return (
    <section className="request-editor" aria-label="Request editor">
      <div className="request-heading">
        <div className="breadcrumb">
          <span>Workspace</span>
          <ChevronDown size={12} />
          <span>{request.collectionId ? "Collection" : "Scratchpad"}</span>
          <span>/</span>
          <input
            aria-label="Request name"
            value={request.name}
            onChange={(e) =>
              update({ name: e.target.value || "Untitled request" })
            }
          />
        </div>
        <span className="saved-indicator">
          <span />
          Local request
        </span>
      </div>
      <div className="url-bar">
        <select
          aria-label="HTTP method"
          className={`method-select method-${request.method}`}
          value={request.method}
          onChange={(e) => update({ method: e.target.value })}
        >
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
            (m) => (
              <option key={m}>{m}</option>
            ),
          )}
          {![
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "HEAD",
            "OPTIONS",
          ].includes(request.method) && <option>{request.method}</option>}
        </select>
        <span className="url-divider" />
        <input
          className="url-input"
          aria-label="Request URL"
          placeholder="https://api.example.com/v1/resource"
          value={request.url}
          onChange={(e) => update({ url: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          spellCheck={false}
        />
        <button
          className={`send-button ${loading ? "cancel" : ""}`}
          onClick={loading ? onCancel : onSend}
        >
          {loading ? (
            <Square size={14} />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          {loading ? "Cancel" : "Send"}
          <kbd>⌘ ↵</kbd>
        </button>
      </div>
      <div
        className="editor-tabs"
        role="tablist"
        aria-label="Request configuration"
      >
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === tab}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Params" && request.params.length > 0 && (
              <span className="count">{request.params.length}</span>
            )}
            {t === "Headers" && request.headers.length > 0 && (
              <span className="count">{request.headers.length}</span>
            )}
            {t === "Body" && request.body && <span className="dot" />}
          </button>
        ))}
        <div className="tab-spacer" />
        <span className="protocol-label">HTTP</span>
      </div>
      <div className="editor-content" role="tabpanel">
        {tab === "Params" && (
          <>
            <div className="section-intro">
              <h3>Query parameters</h3>
              <span>Parameters are appended to the request URL.</span>
            </div>
            <PairTable
              items={request.params}
              onChange={(params) => update({ params })}
            />
            <div className="editor-tip">
              <Info size={13} />
              <span>
                Use <code>{"{{variable}}"}</code> to reference your active
                environment.
              </span>
            </div>
          </>
        )}
        {tab === "Headers" && (
          <>
            <div className="section-intro">
              <h3>Request headers</h3>
              <span>
                Authentication and content-type headers are added automatically.
              </span>
            </div>
            <PairTable
              items={request.headers}
              onChange={(headers) => update({ headers })}
              secrets
            />
          </>
        )}
        {tab === "Body" && (
          <>
            <div className="body-toolbar">
              <select
                aria-label="Body type"
                value={request.bodyType}
                onChange={(e) =>
                  update({ bodyType: e.target.value as Request["bodyType"] })
                }
              >
                <option value="none">No body</option>
                <option value="json">JSON</option>
                <option value="text">Plain text</option>
                <option value="xml">XML</option>
                <option value="urlencoded">URL encoded</option>
              </select>
              <span>
                <Code2 size={13} /> Request body
              </span>
            </div>
            {request.bodyType === "none" ? (
              <div className="small-empty">
                <AlignLeft size={24} />
                <p>This request doesn’t have a body.</p>
                <span>Select a body type to add content.</span>
              </div>
            ) : (
              <CodeEditor
                label="Request body"
                language={
                  request.bodyType === "json"
                    ? "json"
                    : request.bodyType === "xml"
                      ? "xml"
                      : "plaintext"
                }
                value={request.body}
                onChange={(body) => update({ body })}
              />
            )}
          </>
        )}
        {tab === "Auth" && (
          <div className="auth-panel">
            <div>
              <h3>Authentication</h3>
              <p>Credentials are applied when sending, not added to the URL.</p>
              <label>
                Type
                <select
                  aria-label="Authentication type"
                  value={request.auth.type}
                  onChange={(e) =>
                    update({
                      auth: {
                        ...request.auth,
                        type: e.target.value as Request["auth"]["type"],
                      },
                    })
                  }
                >
                  <option value="none">No authentication</option>
                  <option value="bearer">Bearer token</option>
                  <option value="basic">Basic authentication</option>
                  <option value="apikey">API key header</option>
                </select>
              </label>
            </div>
            <div>
              {request.auth.type === "none" ? (
                <div className="auth-note">
                  <ShieldCheck size={22} />
                  <p>This request doesn’t use authentication.</p>
                </div>
              ) : (
                (request.auth.type === "bearer"
                  ? ["token"]
                  : request.auth.type === "basic"
                    ? ["username", "password"]
                    : ["key", "value"]
                ).map((key) => (
                  <label key={key}>
                    {key}
                    <input
                      aria-label={`Auth ${key}`}
                      type={
                        ["token", "password", "value"].includes(key)
                          ? "password"
                          : "text"
                      }
                      value={request.auth[key as keyof Request["auth"]]}
                      onChange={(e) =>
                        update({
                          auth: { ...request.auth, [key]: e.target.value },
                        })
                      }
                      placeholder={"{{" + key.toUpperCase() + "}}"}
                    />
                  </label>
                ))
              )}
            </div>
          </div>
        )}
        {tab === "Tests" && (
          <>
            <div className="section-intro">
              <h3>Post-response tests</h3>
              <span>
                Isolated QuickJS · 16 MB memory · 500 ms execution limit · no
                I/O
              </span>
            </div>
            <CodeEditor
              label="Test script"
              language="javascript"
              value={request.tests}
              onChange={(tests) => update({ tests })}
            />
            <div className="editor-tip">
              <CornerDownLeft size={13} />
              Tests run automatically after every response. Available: test(),
              expect(), response.
            </div>
          </>
        )}
        {tab === "Settings" && (
          <div className="request-settings">
            <label>
              Timeout (milliseconds)
              <input
                type="number"
                min="100"
                max="300000"
                value={request.timeoutMs}
                onChange={(e) =>
                  update({
                    timeoutMs: Math.min(
                      300000,
                      Math.max(100, Number(e.target.value)),
                    ),
                  })
                }
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={request.followRedirects}
                onChange={(e) => update({ followRedirects: e.target.checked })}
              />
              Follow redirects (maximum 10)
            </label>
            <label>
              Custom HTTP method
              <input
                aria-label="Custom HTTP method"
                value={request.method}
                onChange={(e) =>
                  update({
                    method: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z!#$%&'*+.^_`|~-]/g, ""),
                  })
                }
              />
            </label>
            <p className="muted">
              TLS certificate verification is always enabled. HTTPS-to-HTTP
              redirects are blocked.
            </p>
          </div>
        )}
        {tab === "Docs" && (
          <textarea
            className="code-editor"
            aria-label="Request documentation"
            placeholder="Describe this endpoint, its parameters, and expected behavior…"
            value={request.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        )}
      </div>
    </section>
  );
}
