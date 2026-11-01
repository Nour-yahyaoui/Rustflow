import { Check, ChevronRight, Circle, HardDrive, Terminal } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { isNative } from "../lib/bridge";
export function Statusbar({
  consoleOpen,
  setConsoleOpen,
  logs,
  saveStatus,
  navigate,
}: {
  consoleOpen: boolean;
  setConsoleOpen: Dispatch<SetStateAction<boolean>>;
  logs: string[];
  saveStatus: string;
  navigate: (view: string) => void;
}) {
  return (
    <footer className="statusbar">
      <button onClick={() => setConsoleOpen(!consoleOpen)}>
        <Terminal size={13} />
        Console{logs.length > 0 && <span>{logs.length}</span>}
        <ChevronRight className={consoleOpen ? "rotate" : ""} size={11} />
      </button>
      <span className="statusbar-divider" />
      <span>
        <span className="online-dot" />
        {isNative ? "Native engine" : "Browser preview"}
      </span>
      <div />
      <span className={saveStatus === "Save failed" ? "status-error" : ""}>
        {saveStatus === "Saved locally" ? (
          <Check size={11} />
        ) : (
          <Circle size={9} />
        )}{" "}
        {saveStatus}
      </span>
      <span className="statusbar-divider" />
      <button onClick={() => navigate("cloud")}>
        <HardDrive size={12} />
        Local workspace
      </button>
      <span className="statusbar-version">v0.1.0</span>
    </footer>
  );
}
