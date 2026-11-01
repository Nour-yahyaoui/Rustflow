import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { Request, Workspace } from "@requestlab/shared";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud as CloudIcon,
  Copy,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  History as HistoryIcon,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { routes } from "../lib/navigation";
interface Props {
  workspace: Workspace;
  view: string;
  active?: Request;
  setWorkspace: Dispatch<SetStateAction<Workspace>>;
  setOpenTabs: Dispatch<SetStateAction<string[]>>;
  navigate: (id: string) => void;
  notify: (message: string) => void;
  createRequest: (collectionId?: string | null) => unknown;
  setNewCollection: (open: boolean) => void;
  startImport: (mode: "workspace" | "openapi") => void;
  exportWorkspace: () => void;
  selectRequest: (id: string) => void;
  duplicate: (request: Request) => void;
  updateRequest: (request: Request) => void;
  removeRequest: (id: string) => void;
}
export function Sidebar({
  workspace,
  view,
  active,
  setWorkspace,
  setOpenTabs,
  navigate,
  notify,
  createRequest,
  setNewCollection,
  startImport,
  exportWorkspace,
  selectRequest,
  duplicate,
  updateRequest,
  removeRequest,
}: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const filteredRequests = workspace.requests.filter((r) =>
    `${r.name} ${r.url}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <aside
      className="sidebar"
      style={{ width: workspace.preferences.sidebarWidth }}
    >
      <div className="workspace-switch">
        <div className="workspace-avatar">P</div>
        <div>
          <strong>Personal workspace</strong>
          <span>Local · only on this device</span>
        </div>
        <button
          className="icon-button"
          title="Workspace settings"
          aria-label="Workspace settings"
          onClick={() => navigate("settings")}
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <div className="sidebar-nav">
        <button
          className={view === "workspace" ? "selected" : ""}
          onClick={() => navigate("workspace")}
        >
          <Layers size={16} />
          <span>Workspace</span>
          <kbd>⌘ 1</kbd>
        </button>
        <button
          className={view === "history" ? "selected" : ""}
          onClick={() => navigate("history")}
        >
          <HistoryIcon size={16} />
          <span>History</span>
          {workspace.history.length > 0 && (
            <span className="nav-count">{workspace.history.length}</span>
          )}
        </button>
      </div>
      <div className="explorer-heading">
        <span>COLLECTIONS</span>
        <div>
          <Dropdown.Root>
            <Dropdown.Trigger
              className="icon-button"
              aria-label="Collection actions"
            >
              <MoreHorizontal size={16} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content className="dropdown" sideOffset={5}>
                <Dropdown.Item onSelect={() => startImport("workspace")}>
                  <Upload size={14} />
                  Import workspace
                </Dropdown.Item>
                <Dropdown.Item onSelect={() => startImport("openapi")}>
                  <FileCode2 size={14} />
                  Import OpenAPI
                </Dropdown.Item>
                <Dropdown.Item onSelect={exportWorkspace}>
                  <Download size={14} />
                  Export workspace
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
          <button
            className="icon-button"
            title="New collection"
            aria-label="New collection"
            onClick={() => setNewCollection(true)}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div className="explorer-search">
        <Search size={13} />
        <input
          aria-label="Filter collections"
          placeholder="Filter collections…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>/</span>
      </div>
      <div className="explorer">
        {workspace.collections.map((collection) => (
          <div className="collection" key={collection.id}>
            <div className="collection-heading">
              <button
                className="collection-toggle"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(collection.id)) next.delete(collection.id);
                    else next.add(collection.id);
                    return next;
                  })
                }
              >
                <ChevronRight
                  size={12}
                  className={!collapsed.has(collection.id) ? "rotate" : ""}
                />
                {collapsed.has(collection.id) ? (
                  <Folder size={15} />
                ) : (
                  <FolderOpen size={15} />
                )}
                <span>{collection.name}</span>
              </button>
              <Dropdown.Root>
                <Dropdown.Trigger
                  className="icon-button collection-menu"
                  aria-label={`Actions for ${collection.name}`}
                >
                  <MoreHorizontal size={14} />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content className="dropdown" sideOffset={4}>
                    <Dropdown.Item
                      onSelect={() => createRequest(collection.id)}
                    >
                      <Plus size={14} />
                      New request
                    </Dropdown.Item>
                    <Dropdown.Item
                      onSelect={() => {
                        const name = prompt(
                          "Rename collection",
                          collection.name,
                        );
                        if (name?.trim())
                          setWorkspace((w) => ({
                            ...w,
                            collections: w.collections.map((c) =>
                              c.id === collection.id
                                ? { ...c, name: name.trim() }
                                : c,
                            ),
                          }));
                      }}
                    >
                      <Pencil size={14} />
                      Rename
                    </Dropdown.Item>
                    <Dropdown.Item
                      onSelect={() => {
                        if (
                          confirm(
                            `Delete “${collection.name}” and its requests?`,
                          )
                        ) {
                          setWorkspace((w) => ({
                            ...w,
                            collections: w.collections.filter(
                              (c) => c.id !== collection.id,
                            ),
                            requests: w.requests.filter(
                              (r) => r.collectionId !== collection.id,
                            ),
                          }));
                          setOpenTabs((t) =>
                            t.filter(
                              (id) =>
                                !workspace.requests.some(
                                  (r) =>
                                    r.id === id &&
                                    r.collectionId === collection.id,
                                ),
                            ),
                          );
                        }
                      }}
                    >
                      <Trash2 size={14} />
                      Delete collection
                    </Dropdown.Item>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            </div>
            {!collapsed.has(collection.id) && (
              <div className="collection-requests">
                {filteredRequests
                  .filter((r) => r.collectionId === collection.id)
                  .map(renderRequest)}
                {!workspace.requests.some(
                  (r) => r.collectionId === collection.id,
                ) && (
                  <button
                    className="add-request-empty"
                    onClick={() => createRequest(collection.id)}
                  >
                    <Plus size={12} />
                    Add a request
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {filteredRequests
          .filter(
            (r) =>
              r.collectionId === null ||
              !workspace.collections.some((c) => c.id === r.collectionId),
          )
          .map(renderRequest)}
        {workspace.requests.length === 0 &&
          workspace.collections.length === 0 && (
            <div className="explorer-empty">
              <FolderOpen size={24} />
              <p>A place for your APIs</p>
              <span>Organize requests into collections.</span>
              <button onClick={() => setNewCollection(true)}>
                <Plus size={12} />
                Create collection
              </button>
            </div>
          )}
        <button className="new-request-sidebar" onClick={() => createRequest()}>
          <Plus size={14} />
          New request<kbd>⌘ N</kbd>
        </button>
      </div>
      <div className="sidebar-tools">
        <span className="sidebar-section-label">TOOLS</span>
        {routes
          .filter(
            (r) =>
              !["workspace", "history", "settings", "cloud"].includes(r.id),
          )
          .map((route) => (
            <button
              key={route.id}
              className={view === route.id ? "selected" : ""}
              onClick={() => navigate(route.id)}
            >
              <route.icon size={16} />
              <span>{route.label}</span>
              {route.id === "runner" && <span className="new-tag">NEW</span>}
            </button>
          ))}
      </div>
      <div className="sidebar-bottom">
        <button
          className={view === "cloud" ? "selected" : ""}
          onClick={() => navigate("cloud")}
        >
          <CloudIcon size={16} />
          <span>Cloud workspaces</span>
          <ArrowUpRight size={13} />
        </button>
        <div>
          <button
            onClick={() => navigate("settings")}
            className="icon-button"
            aria-label="Settings"
          >
            <SettingsIcon size={16} />
          </button>
          <button
            onClick={() =>
              notify(
                "Use ⌘/Ctrl+K to find commands. ⌘/Ctrl+Enter sends a request; ⌘/Ctrl+N creates one.",
              )
            }
            className="icon-button"
            aria-label="Keyboard help"
          >
            <CircleHelp size={16} />
          </button>
          <span className="local-first">
            <span />
            Local-first. Always.
          </span>
        </div>
      </div>
    </aside>
  );
  function renderRequest(request: Request) {
    return (
      <div
        className={`explorer-request ${active?.id === request.id && view === "workspace" ? "active" : ""}`}
        key={request.id}
        draggable
        onDragStart={(event) =>
          event.dataTransfer.setData("text/requestlab", request.id)
        }
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const source = event.dataTransfer.getData("text/requestlab");
          setWorkspace((w) => {
            const requests = [...w.requests];
            const index = requests.findIndex((r) => r.id === source);
            if (index < 0) return w;
            const [moved] = requests.splice(index, 1);
            requests.splice(
              requests.findIndex((r) => r.id === request.id),
              0,
              { ...moved, collectionId: request.collectionId },
            );
            return { ...w, requests };
          });
        }}
      >
        <button
          className="request-select"
          onClick={() => selectRequest(request.id)}
        >
          <span className={`method method-${request.method}`}>
            {request.method}
          </span>
          <span>{request.name}</span>
        </button>
        <Dropdown.Root>
          <Dropdown.Trigger
            className="icon-button"
            aria-label={`Actions for ${request.name}`}
          >
            <MoreHorizontal size={13} />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="dropdown" sideOffset={4}>
              <Dropdown.Item onSelect={() => duplicate(request)}>
                <Copy size={14} />
                Duplicate
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={() => {
                  const name = prompt("Rename request", request.name);
                  if (name?.trim())
                    updateRequest({ ...request, name: name.trim() });
                }}
              >
                <Pencil size={14} />
                Rename
              </Dropdown.Item>
              <Dropdown.Label>Move to collection</Dropdown.Label>
              <Dropdown.Item
                onSelect={() =>
                  updateRequest({ ...request, collectionId: null })
                }
              >
                Scratchpad
              </Dropdown.Item>
              {workspace.collections.map((c) => (
                <Dropdown.Item
                  key={c.id}
                  onSelect={() =>
                    updateRequest({ ...request, collectionId: c.id })
                  }
                >
                  {c.name}
                </Dropdown.Item>
              ))}
              <Dropdown.Separator />
              <Dropdown.Item onSelect={() => removeRequest(request.id)}>
                <Trash2 size={14} />
                Delete
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    );
  }
}
