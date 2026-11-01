import { FlaskConical, HardDrive, Search } from "lucide-react";
export function Titlebar({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="titlebar">
      <a className="brand" href="#workspace">
        <div className="brand-mark">
          <FlaskConical size={19} />
        </div>
        <strong>RequestLab</strong>
        <span className="version-pill">BETA</span>
      </a>
      <div className="titlebar-center">
        <HardDrive size={12} />
        <span>Local workspace</span>
        <span className="titlebar-slash">/</span>
        <span>Personal</span>
      </div>
      <button className="command-trigger" onClick={onSearch}>
        <Search size={13} />
        <span>Search anything…</span>
        <kbd>⌘ K</kbd>
      </button>
    </header>
  );
}
