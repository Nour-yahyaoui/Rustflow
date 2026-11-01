import {
  emptyWorkspace,
  newRequest,
  prepareRequest,
  safeExport,
  uid,
  workspaceSchema,
  type HttpResponse,
  type Request,
  type Workspace,
} from "@requestlab/shared";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronRight,
  CircleHelp,
  Command,
  FlaskConical,
  PanelLeftClose,
  Plus,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, download, errorMessage } from "./components/Primitives";
import { RequestEditor } from "./components/RequestEditor";
import { RequestTabs } from "./components/RequestTabs";
import { ResponsePanel } from "./components/ResponsePanel";
import { Sidebar } from "./components/Sidebar";
import { Statusbar } from "./components/Statusbar";
import { Titlebar } from "./components/Titlebar";
import {
  Cloud,
  Documentation,
  Environments,
  History,
  Settings,
  TestRunner,
  WebSocketTool,
} from "./components/Tools";
import { Welcome } from "./components/Welcome";
import {
  executeRequest,
  isNative,
  loadWorkspace,
  saveWorkspace,
} from "./lib/bridge";
import { routes } from "./lib/navigation";
import { importOpenAPI } from "./lib/openapi";
import { runTests, type TestResult } from "./lib/tests";
type View = (typeof routes)[number]["id"];
interface RequestState {
  response: HttpResponse | null;
  error: string | null;
  results: TestResult[];
}
const emptyResponse: RequestState = {
  response: null,
  error: null,
  results: [],
};
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Loading");
  const [fatal, setFatal] = useState(false);
  const [view, setView] = useState<View>(location.hash.slice(1) || "workspace");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, RequestState>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [toast, setToast] = useState("");
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [newCollection, setNewCollection] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [consoleHeight] = useState(150);
  const fileInput = useRef<HTMLInputElement>(null);
  const importMode = useRef<"workspace" | "openapi">("workspace");
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    let alive = true;
    loadWorkspace()
      .then((saved) => {
        if (!alive) return;
        const state = saved ?? emptyWorkspace();
        setWorkspace(state);
        if (state.preferences.activeRequest)
          setOpenTabs([state.preferences.activeRequest]);
        setReady(true);
        setSaveStatus("Saved locally");
      })
      .catch((error) => {
        if (alive) {
          setFatal(true);
          setSaveStatus("Storage error");
          notify(
            `Storage could not be loaded: ${errorMessage(error)}. Reload to retry; existing data has not been overwritten.`,
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [notify]);
  useEffect(() => {
    if (!ready) return;
    setSaveStatus("Saving…");
    const timer = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => undefined)
        .then(() => saveWorkspace(workspace))
        .then(() => setSaveStatus("Saved locally"))
        .catch((error) => {
          setSaveStatus("Save failed");
          notify(`Could not save: ${errorMessage(error)}`);
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [workspace, ready, notify]);
  useEffect(() => {
    document.documentElement.dataset.theme = workspace.preferences.theme;
  }, [workspace.preferences.theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const listener = () => setView(location.hash.slice(1) || "workspace");
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  const latestWorkspace = useRef(workspace);
  latestWorkspace.current = workspace;
  useEffect(() => {
    if (!ready || !isNative) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await saveChain.current;
          await saveWorkspace(latestWorkspace.current);
          await getCurrentWindow().destroy();
        } catch (error) {
          notify(`Could not save before closing: ${errorMessage(error)}`);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) =>
        notify(`Window close handler failed: ${errorMessage(error)}`),
      );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [ready, notify]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (ready && saveStatus !== "Saved locally") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [ready, saveStatus]);
  const navigate = (id: View) => {
    location.hash = id;
    setView(id);
  };
  const active = workspace.requests.find(
    (r) => r.id === workspace.preferences.activeRequest,
  );
  const activeState = active
    ? (responses[active.id] ?? emptyResponse)
    : emptyResponse;
  const selectRequest = (id: string) => {
    setWorkspace((w) => ({
      ...w,
      preferences: { ...w.preferences, activeRequest: id },
    }));
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    navigate("workspace");
  };
  const createRequest = (collectionId: string | null = null) => {
    const request = newRequest(collectionId);
    setWorkspace((w) => ({
      ...w,
      requests: [...w.requests, request],
      preferences: { ...w.preferences, activeRequest: request.id },
    }));
    setOpenTabs((prev) => [...prev, request.id]);
    navigate("workspace");
    return request;
  };
  const updateRequest = (request: Request) =>
    setWorkspace((w) => ({
      ...w,
      requests: w.requests.map((r) => (r.id === request.id ? request : r)),
    }));
  const closeTab = (id: string) => {
    const next = openTabs.filter((t) => t !== id);
    setOpenTabs(next);
    if (active?.id === id)
      setWorkspace((w) => ({
        ...w,
        preferences: { ...w.preferences, activeRequest: next.at(-1) ?? null },
      }));
  };
  const removeRequest = (id: string) => {
    if (!confirm("Delete this request? This cannot be undone.")) return;
    closeTab(id);
    setWorkspace((w) => ({
      ...w,
      requests: w.requests.filter((r) => r.id !== id),
    }));
    notify("Request deleted");
  };
  const duplicate = (r: Request) => {
    const copy = { ...r, id: uid(), name: `${r.name} (copy)` };
    setWorkspace((w) => ({ ...w, requests: [...w.requests, copy] }));
    selectRequest(copy.id);
  };
  const send = async () => {
    if (!active || loadingId) return;
    const request = active;
    const controller = new AbortController();
    abort.current = controller;
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
        !confirm(
          "This request uses unencrypted HTTP. Headers, credentials, and body can be read in transit. Send anyway?",
        )
      )
        return;
      const host = new URL(prepared.url).hostname;
      if (
        (host === "localhost" ||
          host === "[::1]" ||
          /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
            host,
          )) &&
        !confirm(
          "This destination is on your local or private network. Only continue if you trust it.",
        )
      )
        return;
      setLoadingId(request.id);
      setResponses((prev) => ({ ...prev, [request.id]: emptyResponse }));
      const response = await executeRequest(prepared, controller.signal);
      setResponses((prev) => ({
        ...prev,
        [request.id]: { response, error: null, results: [] },
      }));
      let results: TestResult[] = [];
      if (request.tests.trim())
        try {
          results = await runTests(request.tests, response);
        } catch (error) {
          results = [
            {
              name: "Script execution",
              passed: false,
              error: errorMessage(error),
            },
          ];
        }
      setResponses((prev) => ({
        ...prev,
        [request.id]: { response, error: null, results },
      }));
      // Response bodies and credential-bearing request values never enter persisted history.
      const safeRequest = safeExport({
        ...emptyWorkspace(),
        requests: [request],
      }).requests[0];
      setWorkspace((w) => ({
        ...w,
        history: [
          {
            id: uid(),
            request: {
              ...safeRequest,
              body: "",
              url: request.url.split("?")[0],
            },
            response: {
              ...response,
              body: "",
              base64: undefined,
              headers: response.headers.filter(
                ([k]) =>
                  !["set-cookie", "authorization"].includes(k.toLowerCase()),
              ),
            },
            timestamp: new Date().toISOString(),
          },
          ...w.history,
        ].slice(0, 100),
      }));
      setLogs((prev) => [
        ...prev.slice(-99),
        `${new Date().toLocaleTimeString()}  ${request.method}  ${response.status}  ${response.durationMs} ms  ${response.size} bytes`,
      ]);
    } catch (error) {
      const message = controller.signal.aborted
        ? "Request cancelled"
        : errorMessage(error);
      setResponses((prev) => ({
        ...prev,
        [request.id]: { response: null, error: message, results: [] },
      }));
      setLogs((prev) => [
        ...prev.slice(-99),
        `${new Date().toLocaleTimeString()}  ${request.method}  Request failed`,
      ]);
    } finally {
      setLoadingId(null);
    }
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  const createRef = useRef(createRequest);
  createRef.current = createRequest;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === "Enter") {
          event.preventDefault();
          void sendRef.current();
        }
        if (event.key.toLowerCase() === "k") {
          event.preventDefault();
          setPalette((p) => !p);
        }
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          createRef.current();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);
  const exportWorkspace = () => {
    download(
      "requestlab-workspace.json",
      JSON.stringify(safeExport(workspace), null, 2),
    );
    notify(
      "Exported. Review URLs, bodies, and descriptions for embedded credentials before sharing.",
    );
  };
  const startImport = (mode: "workspace" | "openapi") => {
    importMode.current = mode;
    fileInput.current?.click();
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 10_000_000) throw new Error("Import is limited to 10 MB");
      const text = await file.text();
      if (importMode.current === "openapi") {
        const { collection, requests } = importOpenAPI(text);
        setWorkspace((w) => ({
          ...w,
          collections: [...w.collections, collection],
          requests: [...w.requests, ...requests],
        }));
        notify(`Imported ${requests.length} endpoints`);
      } else {
        const parsed = workspaceSchema.parse(JSON.parse(text));
        if (
          !confirm(
            "Replace the current workspace with this import? Export a backup first.",
          )
        )
          return;
        setWorkspace({ ...parsed, history: [] });
        setOpenTabs([]);
        notify("Workspace imported");
      }
    } catch (error) {
      notify(`Import failed: ${errorMessage(error)}`);
    }
  };
  const resize = (event: React.PointerEvent, kind: "sidebar" | "response") => {
    event.preventDefault();
    const startX = event.clientX,
      startY = event.clientY;
    const width = workspace.preferences.sidebarWidth,
      height = workspace.preferences.responseHeight;
    const move = (e: PointerEvent) =>
      setWorkspace((w) => ({
        ...w,
        preferences: {
          ...w.preferences,
          ...(kind === "sidebar"
            ? {
                sidebarWidth: Math.min(
                  400,
                  Math.max(210, width + e.clientX - startX),
                ),
              }
            : {
                responseHeight: Math.min(
                  750,
                  Math.max(180, height + startY - e.clientY),
                ),
              }),
        },
      }));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };
  const commandItems = [
    { name: "New HTTP request", action: () => createRequest(), hint: "⌘ N" },
    { name: "New collection", action: () => setNewCollection(true), hint: "" },
    {
      name: "Import workspace",
      action: () => startImport("workspace"),
      hint: "",
    },
    { name: "Export workspace", action: exportWorkspace, hint: "" },
    ...routes.map((route) => ({
      name: `Open ${route.label}`,
      action: () => navigate(route.id),
      hint: "",
    })),
    ...workspace.requests.map((r) => ({
      name: `${r.method} ${r.name}`,
      action: () => selectRequest(r.id),
      hint: "",
    })),
  ].filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  if (!ready)
    return (
      <div className="startup">
        <FlaskConical size={32} />
        <h1>RequestLab</h1>
        <p>
          {fatal
            ? "Storage could not be loaded. Your existing data has not been overwritten."
            : "Opening your workspace…"}
        </p>
        {fatal && (
          <button className="primary-button" onClick={() => location.reload()}>
            Retry
          </button>
        )}
        {toast && <p className="status-error">{toast}</p>}
      </div>
    );
  return (
    <div className="app-shell">
      <Titlebar
        onSearch={() => {
          setQuery("");
          setPalette(true);
        }}
      />
      <div className="app-body">
        {sidebar && (
          <Sidebar
            workspace={workspace}
            view={view}
            active={active}
            setWorkspace={setWorkspace}
            setOpenTabs={setOpenTabs}
            navigate={navigate}
            notify={notify}
            createRequest={createRequest}
            setNewCollection={setNewCollection}
            startImport={startImport}
            exportWorkspace={exportWorkspace}
            selectRequest={selectRequest}
            duplicate={duplicate}
            updateRequest={updateRequest}
            removeRequest={removeRequest}
          />
        )}
        {sidebar && (
          <div
            className="sidebar-resize"
            onPointerDown={(e) => resize(e, "sidebar")}
            role="separator"
            aria-label="Resize sidebar"
          />
        )}
        <main className="main-workspace">
          {view === "workspace" ? (
            <>
              <RequestTabs
                workspace={workspace}
                setWorkspace={setWorkspace}
                openTabs={openTabs}
                active={active}
                sidebar={sidebar}
                setSidebar={setSidebar}
                selectRequest={selectRequest}
                closeTab={closeTab}
                createRequest={() => createRequest()}
                navigate={navigate}
              />
              {active ? (
                <div className="request-workspace">
                  <RequestEditor
                    request={active}
                    onChange={updateRequest}
                    onSend={() => void send()}
                    onCancel={() => abort.current?.abort()}
                    loading={loadingId === active.id}
                  />
                  <div
                    className="response-resize"
                    onPointerDown={(e) => resize(e, "response")}
                    role="separator"
                    aria-label="Resize response panel"
                  >
                    <span />
                  </div>
                  <div
                    className="response-container"
                    style={{ height: workspace.preferences.responseHeight }}
                  >
                    <ResponsePanel
                      {...activeState}
                      loading={loadingId === active.id}
                      onNotify={notify}
                    />
                  </div>
                </div>
              ) : (
                <Welcome
                  createRequest={() => createRequest()}
                  startImport={startImport}
                />
              )}
            </>
          ) : (
            <>
              <div className="tool-topbar">
                <button
                  className="icon-button"
                  aria-label="Toggle sidebar"
                  onClick={() => setSidebar(!sidebar)}
                >
                  <PanelLeftClose size={16} />
                </button>
                <span>Personal workspace</span>
                <ChevronRight size={12} />
                <strong>
                  {routes.find((r) => r.id === view)?.label ?? "Workspace"}
                </strong>
                <div />
                <span className="env-label">
                  <span className="env-dot" />
                  {workspace.environments.find(
                    (e) => e.id === workspace.preferences.activeEnvironment,
                  )?.name ?? "No environment"}
                </span>
              </div>
              {view === "history" ? (
                <History
                  workspace={workspace}
                  onOpen={(r) => {
                    const existing = workspace.requests.find(
                      (item) => item.id === r.id,
                    );
                    if (existing) selectRequest(existing.id);
                    else {
                      const copy = { ...r, id: uid() };
                      setWorkspace((w) => ({
                        ...w,
                        requests: [...w.requests, copy],
                      }));
                      selectRequest(copy.id);
                    }
                  }}
                  onClear={() => {
                    if (confirm("Clear all local history?"))
                      setWorkspace((w) => ({ ...w, history: [] }));
                  }}
                />
              ) : view === "environments" ? (
                <Environments
                  workspace={workspace}
                  onChange={setWorkspace}
                  onNotify={notify}
                />
              ) : view === "websocket" ? (
                <WebSocketTool />
              ) : view === "docs" ? (
                <Documentation
                  workspace={workspace}
                  onImport={() => startImport("openapi")}
                />
              ) : view === "runner" ? (
                <TestRunner workspace={workspace} onNotify={notify} />
              ) : view === "cloud" ? (
                <Cloud />
              ) : (
                <Settings
                  workspace={workspace}
                  onChange={setWorkspace}
                  onExport={exportWorkspace}
                  onImport={() => startImport("workspace")}
                  onNotify={notify}
                />
              )}
            </>
          )}
          {consoleOpen && (
            <div className="console-panel" style={{ height: consoleHeight }}>
              <div>
                <strong>Request console</strong>
                <span>Secrets and response bodies are not logged.</span>
                <button className="text-button" onClick={() => setLogs([])}>
                  Clear
                </button>
                <button
                  className="icon-button"
                  aria-label="Close console"
                  onClick={() => setConsoleOpen(false)}
                >
                  <X size={13} />
                </button>
              </div>
              <pre>{logs.length ? logs.join("\n") : "No requests yet."}</pre>
            </div>
          )}
        </main>
      </div>
      <Statusbar
        consoleOpen={consoleOpen}
        setConsoleOpen={setConsoleOpen}
        logs={logs}
        saveStatus={saveStatus}
        navigate={navigate}
      />
      {newCollection && (
        <Modal
          title="Create a collection"
          onClose={() => setNewCollection(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!collectionName.trim()) return;
              setWorkspace((w) => ({
                ...w,
                collections: [
                  ...w.collections,
                  { id: uid(), name: collectionName.trim(), description: "" },
                ],
              }));
              setNewCollection(false);
              setCollectionName("");
              notify("Collection created");
            }}
          >
            <p className="modal-description">
              Keep related requests together in a local collection.
            </p>
            <label>
              Collection name
              <input
                autoFocus
                placeholder="e.g. Payments API"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                maxLength={200}
                required
              />
            </label>
            <div className="modal-footer">
              <button
                type="button"
                className="subtle-button"
                onClick={() => setNewCollection(false)}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit">
                <Plus size={14} />
                Create collection
              </button>
            </div>
          </form>
        </Modal>
      )}
      {palette && (
        <Modal title="Command palette" onClose={() => setPalette(false)} wide>
          <div className="palette-search">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Search commands"
              placeholder="What would you like to do?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && commandItems[0]) {
                  commandItems[0].action();
                  setPalette(false);
                }
              }}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="command-list">
            {commandItems.slice(0, 30).map((item, i) => (
              <button
                key={i}
                onClick={() => {
                  item.action();
                  setPalette(false);
                }}
              >
                <Command size={14} />
                <span>{item.name}</span>
                <kbd>{item.hint}</kbd>
              </button>
            ))}
          </div>
        </Modal>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <CircleHelp size={16} />
            <span>{toast}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <input
        hidden
        type="file"
        accept=".json,application/json"
        ref={fileInput}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
