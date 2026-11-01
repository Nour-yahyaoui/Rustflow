import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Globe, Shield } from "lucide-react";
import { useState } from "react";
import { isNative } from "../lib/bridge";
export function Cloud() {
  const [error, setError] = useState("");
  const [portal, setPortal] = useState(
    localStorage.getItem("requestlab.portal") ??
      import.meta.env.VITE_CLOUD_PORTAL_URL ??
      "",
  );
  return (
    <div className="tool-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPTIONAL CLOUD</span>
          <h1>Better, together</h1>
          <p>
            Your local workspace is yours. Cloud services are a separate, opt-in
            deployment.
          </p>
        </div>
      </div>
      <div className="cloud-card">
        <div className="cloud-icon">
          <Globe size={30} />
        </div>
        <h2>Connect your RequestLab portal</h2>
        <p>
          Manage your account, team workspaces, and manual billing through your
          deployed SaaS portal. Desktop synchronization is not yet wired to the
          cloud change API.
        </p>
        <label>
          Portal URL
          <input
            aria-label="Portal URL"
            placeholder="Enter your deployed portal URL"
            value={portal}
            onChange={(e) => setPortal(e.target.value)}
          />
        </label>
        <a
          className="primary-button"
          href={/^https?:\/\//.test(portal) ? portal : undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (!/^https?:\/\//.test(portal)) {
              event.preventDefault();
              setError("Configure a valid HTTP(S) portal URL first.");
              return;
            }
            setError("");
            localStorage.setItem("requestlab.portal", portal);
            if (isNative) {
              event.preventDefault();
              if (/^https?:\/\//.test(portal))
                void openUrl(portal).catch(() =>
                  setError(
                    "Could not open your browser. Copy the portal URL and open it manually.",
                  ),
                );
            }
          }}
        >
          Open cloud portal
          <ExternalLink size={14} />
        </a>
        {error && (
          <p role="alert" className="status-error">
            {error}
          </p>
        )}
        <div className="security-note">
          <Shield size={17} />
          <p>
            Basic HTTP requests, collections, environments, and tests always
            work without an account. No local data is uploaded automatically.
          </p>
        </div>
        <div className="manual-payment">
          <strong>Manual payment contact</strong>
          <a href="tel:56668672">56668672</a>
          <p>
            Payment references are reviewed by an administrator. Submission is
            not confirmation.
          </p>
        </div>
      </div>
    </div>
  );
}
