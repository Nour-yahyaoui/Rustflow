import type { Request, Workspace } from "@requestlab/shared";
import {
  Menu,
  PanelLeftClose,
  Plus,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
export function RequestTabs({
  workspace,
  setWorkspace,
  openTabs,
  active,
  sidebar,
  setSidebar,
  selectRequest,
  closeTab,
  createRequest,
  navigate,
}: {
  workspace: Workspace;
  setWorkspace: Dispatch<SetStateAction<Workspace>>;
  openTabs: string[];
  active?: Request;
  sidebar: boolean;
  setSidebar: Dispatch<SetStateAction<boolean>>;
  selectRequest: (id: string) => void;
  closeTab: (id: string) => void;
  createRequest: () => unknown;
  navigate: (view: string) => void;
}) {
  return (
    <div className="request-tabbar">
      <button
        className="icon-button sidebar-toggle"
        aria-label="Toggle sidebar"
        onClick={() => setSidebar(!sidebar)}
      >
        {sidebar ? <PanelLeftClose size={15} /> : <Menu size={15} />}
      </button>
      <div className="request-tabs">
        {openTabs
          .map((id) => workspace.requests.find((r) => r.id === id))
          .filter((r): r is Request => !!r)
          .map((r) => (
            <div
              className={`request-tab ${active?.id === r.id ? "active" : ""}`}
              key={r.id}
            >
              <button onClick={() => selectRequest(r.id)}>
                <span className={`method method-${r.method}`}>{r.method}</span>
                <span>{r.name}</span>
              </button>
              <button
                className="icon-button close-tab"
                aria-label={`Close ${r.name}`}
                onClick={() => closeTab(r.id)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
      </div>
      <button
        className="icon-button add-tab"
        aria-label="New request"
        onClick={() => createRequest()}
      >
        <Plus size={16} />
      </button>
      <div className="environment-select">
        <span className="env-dot" />
        <select
          aria-label="Active environment"
          value={workspace.preferences.activeEnvironment}
          onChange={(e) =>
            setWorkspace((w) => ({
              ...w,
              preferences: {
                ...w.preferences,
                activeEnvironment: e.target.value,
              },
            }))
          }
        >
          <option value="">No environment</option>
          {workspace.environments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          title="Manage environments"
          aria-label="Manage environments"
          onClick={() => navigate("environments")}
        >
          <SettingsIcon size={13} />
        </button>
      </div>
    </div>
  );
}
