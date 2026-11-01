import type { Pair, Workspace } from "@requestlab/shared";
import { uid } from "@requestlab/shared";
import { Globe, Plus, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { isNative } from "../lib/bridge";
import { PairTable } from "./Primitives";
export function Environments({
  workspace,
  onChange,
  onNotify,
}: {
  workspace: Workspace;
  onChange: (workspace: Workspace) => void;
  onNotify: (message: string) => void;
}) {
  const [selected, setSelected] = useState(
    workspace.preferences.activeEnvironment,
  );
  const environment = workspace.environments.find((e) => e.id === selected);
  const global = selected === "global";
  const variables = global
    ? workspace.globalVariables
    : (environment?.variables ?? []);
  const update = (variables: Pair[]) =>
    onChange(
      global
        ? { ...workspace, globalVariables: variables }
        : {
            ...workspace,
            environments: workspace.environments.map((e) =>
              e.id === selected ? { ...e, variables } : e,
            ),
          },
    );
  return (
    <div className="tool-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONFIGURATION</span>
          <h1>Environments</h1>
          <p>The right values, in the right context.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            const name = prompt("Environment name");
            if (name?.trim()) {
              const id = uid();
              onChange({
                ...workspace,
                environments: [
                  ...workspace.environments,
                  { id, name: name.trim(), variables: [] },
                ],
              });
              setSelected(id);
            }
          }}
        >
          <Plus size={15} />
          New environment
        </button>
      </div>
      <div className="environment-layout">
        <div className="environment-list">
          <button
            className={global ? "selected" : ""}
            onClick={() => setSelected("global")}
          >
            <Globe size={15} />
            Global variables
          </button>
          {workspace.environments.map((e) => (
            <button
              className={selected === e.id ? "selected" : ""}
              onClick={() => setSelected(e.id)}
              key={e.id}
            >
              <span className="env-dot" />
              {e.name}
              {e.id === workspace.preferences.activeEnvironment && (
                <span className="active-pill">Active</span>
              )}
            </button>
          ))}
        </div>
        <div className="environment-detail">
          <div className="detail-heading">
            <div>
              <h2>
                {global
                  ? "Global variables"
                  : (environment?.name ?? "Select an environment")}
              </h2>
              <p>
                {global
                  ? "Available in every environment."
                  : "Environment variables override global values."}
              </p>
            </div>
            {environment && (
              <>
                <button
                  className="subtle-button"
                  onClick={() => {
                    const name = prompt("Rename environment", environment.name);
                    if (name?.trim())
                      onChange({
                        ...workspace,
                        environments: workspace.environments.map((e) =>
                          e.id === selected ? { ...e, name: name.trim() } : e,
                        ),
                      });
                  }}
                >
                  Rename
                </button>
                <button
                  className="icon-button danger-hover"
                  aria-label="Delete environment"
                  onClick={() => {
                    if (confirm(`Delete ${environment.name}?`)) {
                      const environments = workspace.environments.filter(
                        (e) => e.id !== selected,
                      );
                      const active =
                        workspace.preferences.activeEnvironment === selected
                          ? (environments[0]?.id ?? "")
                          : workspace.preferences.activeEnvironment;
                      onChange({
                        ...workspace,
                        environments,
                        preferences: {
                          ...workspace.preferences,
                          activeEnvironment: active,
                        },
                      });
                      setSelected("global");
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
          <PairTable items={variables} onChange={update} secrets />
          <div className="security-note">
            <Shield size={17} />
            <div>
              <strong>Secrets stay on your device</strong>
              <p>
                {isNative
                  ? "Secret variable values are stored in the operating-system credential vault."
                  : "Browser preview stores values in local development SQLite, not an OS vault. Do not enter production secrets here."}{" "}
                Secret-marked variables are excluded from exports and cloud
                sync.
              </p>
            </div>
          </div>
          <button
            className="subtle-button"
            onClick={() => {
              onChange({
                ...workspace,
                preferences: {
                  ...workspace.preferences,
                  activeEnvironment: selected === "global" ? "" : selected,
                },
              });
              onNotify("Active environment updated");
            }}
          >
            Use this environment
          </button>
        </div>
      </div>
    </div>
  );
}
