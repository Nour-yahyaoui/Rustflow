import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import "monaco-editor/language/json/monaco.contribution";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/xml/register";
self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === "json" ? new JsonWorker() : new EditorWorker(),
};
loader.config({ monaco });
export default function MonacoEditor({
  value,
  onChange,
  language,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  language: string;
  label: string;
}) {
  return (
    <Editor
      height="210px"
      language={language}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      theme={
        document.documentElement.dataset.theme === "light" ? "vs" : "vs-dark"
      }
      options={{
        ariaLabel: label,
        editContext: false,
        minimap: { enabled: false },
        fontSize: 11,
        lineHeight: 20,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: "on",
        tabSize: 2,
        padding: { top: 12 },
        renderLineHighlight: "none",
        contextmenu: true,
        accessibilitySupport: "on",
      }}
    />
  );
}
