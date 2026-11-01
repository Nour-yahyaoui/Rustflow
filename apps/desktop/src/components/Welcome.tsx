import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCode2,
  FlaskConical,
  Plus,
  Upload,
} from "lucide-react";
import { Button } from "./ui/button";
export function Welcome({
  createRequest,
  startImport,
}: {
  createRequest: () => void;
  startImport: (mode: "workspace" | "openapi") => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-content">
        <div className="welcome-topline">
          <span className="welcome-line" />
          YOUR NEXT GREAT API STARTS HERE
        </div>
        <div className="welcome-mark">
          <FlaskConical size={40} />
          <span className="orbit-dot" />
        </div>
        <h1>
          Less friction.
          <br />
          <span>More flow.</span>
        </h1>
        <p>
          Your local-first space to build, test, and understand APIs.
          <br />
          No account. No distractions. Just you and your next request.
        </p>
        <Button className="welcome-cta" onClick={() => createRequest()}>
          <Plus size={16} />
          Create a request
          <ArrowRight size={16} />
        </Button>
        <div className="welcome-shortcuts">
          <span>
            <kbd>⌘ N</kbd>New request
          </span>
          <span>
            <kbd>⌘ K</kbd>All commands
          </span>
        </div>
        <div className="welcome-divider" />
        <div className="welcome-actions">
          <button onClick={() => startImport("workspace")}>
            <div>
              <Upload size={17} />
            </div>
            <span>
              <strong>Bring your workspace</strong>
              <small>Import a RequestLab export</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
          <button onClick={() => startImport("openapi")}>
            <div>
              <FileCode2 size={17} />
            </div>
            <span>
              <strong>Start from a specification</strong>
              <small>Import OpenAPI 3.x JSON</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      <div className="welcome-footer">
        <Check size={12} />
        Private by default. Your work stays on your machine.
      </div>
    </div>
  );
}
