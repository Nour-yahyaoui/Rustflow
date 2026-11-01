import { lazy, Suspense } from "react";
const Editor = lazy(() => import("./MonacoEditor"));
export function CodeEditor({
  value,
  onChange,
  language = "json",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  label: string;
}) {
  return (
    <div className="advanced-editor">
      <Suspense
        fallback={
          <textarea
            className="code-editor"
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        }
      >
        <Editor
          value={value}
          onChange={onChange}
          language={language}
          label={label}
        />
      </Suspense>
    </div>
  );
}
