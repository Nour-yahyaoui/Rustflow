import type { Workspace } from "@requestlab/shared";
import { prepareRequest } from "@requestlab/shared";
import { Check, CircleAlert, Download, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { executeRequest } from "../lib/bridge";
import { runTests, type TestResult } from "../lib/tests";
import { download, errorMessage } from "./Primitives";
export function TestRunner({
  workspace,
  onNotify,
}: {
  workspace: Workspace;
  onNotify: (message: string) => void;
}) {
  const [collection, setCollection] = useState("all");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<
    { name: string; results: TestResult[]; duration: number; error?: string }[]
  >([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    const requests = workspace.requests.filter(
      (r) => collection === "all" || r.collectionId === collection,
    );
    if (!requests.length) {
      onNotify("Add requests before running a collection");
      return;
    }
    if (
      requests.some((r) => /^http:/.test(r.url)) &&
      !confirm("This run includes unencrypted HTTP URLs. Continue?")
    )
      return;
    setResults([]);
    setRunning(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      for (const request of requests) {
        if (abort.signal.aborted) break;
        try {
          const env = workspace.environments.find(
            (e) => e.id === workspace.preferences.activeEnvironment,
          );
          const prepared = prepareRequest(request, [
            workspace.globalVariables,
            env?.variables ?? [],
          ]);
          if (
            prepared.url.startsWith("http:") &&
            prepared.headers.some((h) =>
              /authorization|cookie|key|token/i.test(h.key),
            )
          )
            throw new Error(
              "Credential-bearing HTTP requests must be sent individually with confirmation",
            );
          const response = await executeRequest(prepared, abort.signal);
          const result = await runTests(request.tests, response);
          setResults((prev) => [
            ...prev,
            {
              name: request.name,
              results: result,
              duration: response.durationMs,
            },
          ]);
        } catch (error) {
          setResults((prev) => [
            ...prev,
            {
              name: request.name,
              results: [],
              duration: 0,
              error: errorMessage(error),
            },
          ]);
        }
      }
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="tool-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">QUALITY</span>
          <h1>Collection runner</h1>
          <p>Real requests. Sequential execution. Isolated assertions.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            if (running) controller.current?.abort();
            else void run();
          }}
        >
          {running ? <Square size={14} /> : <Play size={14} />}{" "}
          {running ? "Stop run" : "Run collection"}
        </button>
      </div>
      <div className="runner-toolbar">
        <select
          aria-label="Run collection"
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
        >
          <option value="all">All requests</option>
          {workspace.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span>
          {
            workspace.requests.filter(
              (r) => collection === "all" || r.collectionId === collection,
            ).length
          }{" "}
          requests
        </span>
        <button
          disabled={!results.length}
          className="subtle-button"
          onClick={() =>
            download(
              "test-report.json",
              JSON.stringify(
                { timestamp: new Date().toISOString(), results },
                null,
                2,
              ),
            )
          }
        >
          <Download size={14} />
          Export results
        </button>
      </div>
      {results.length ? (
        results.map((r, i) => (
          <div className="runner-result" key={i}>
            <div>
              <strong>{r.name}</strong>
              <span>{r.duration} ms</span>
            </div>
            {r.error ? (
              <p className="status-error">{r.error}</p>
            ) : r.results.length ? (
              r.results.map((test, i) => (
                <p
                  key={i}
                  className={test.passed ? "status-success" : "status-error"}
                >
                  {test.passed ? (
                    <Check size={14} />
                  ) : (
                    <CircleAlert size={14} />
                  )}{" "}
                  {test.name}
                  {test.error && ` — ${test.error}`}
                </p>
              ))
            ) : (
              <p>No assertions configured.</p>
            )}
          </div>
        ))
      ) : (
        <div className="large-empty">
          <Play size={32} />
          <h2>Confidence, one request at a time</h2>
          <p>Select a collection and run it against your active environment.</p>
        </div>
      )}
    </div>
  );
}
