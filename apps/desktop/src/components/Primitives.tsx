import * as Dialog from "@radix-ui/react-dialog";
import type { Pair } from "@requestlab/shared";
import { pair } from "@requestlab/shared";
import { Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "wide" : ""}`}>
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {title} controls
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function PairTable({
  items,
  onChange,
  secrets = false,
}: {
  items: Pair[];
  onChange: (items: Pair[]) => void;
  secrets?: boolean;
}) {
  const [revealed, setRevealed] = useState(new Set<string>());
  return (
    <div className="pair-table">
      <div className="pair-head">
        <span />
        <span>KEY</span>
        <span>VALUE</span>
        <span />
      </div>
      {items.map((item, index) => (
        <div className="pair-row" key={item.id}>
          <input
            type="checkbox"
            checked={item.enabled}
            aria-label={`Enable row ${index + 1}`}
            onChange={(e) =>
              onChange(
                items.map((p) =>
                  p.id === item.id ? { ...p, enabled: e.target.checked } : p,
                ),
              )
            }
          />
          <input
            aria-label={`Key ${index + 1}`}
            placeholder="Key"
            value={item.key}
            onChange={(e) =>
              onChange(
                items.map((p) =>
                  p.id === item.id ? { ...p, key: e.target.value } : p,
                ),
              )
            }
          />
          <div className="pair-value">
            <input
              aria-label={`Value ${index + 1}`}
              type={item.secret && !revealed.has(item.id) ? "password" : "text"}
              placeholder="Value"
              value={item.value}
              onChange={(e) =>
                onChange(
                  items.map((p) =>
                    p.id === item.id ? { ...p, value: e.target.value } : p,
                  ),
                )
              }
            />
            {secrets && (
              <>
                <label className="secret-toggle" title="Store as secret">
                  <input
                    type="checkbox"
                    checked={!!item.secret}
                    onChange={(e) =>
                      onChange(
                        items.map((p) =>
                          p.id === item.id
                            ? { ...p, secret: e.target.checked }
                            : p,
                        ),
                      )
                    }
                  />
                  Secret
                </label>
                {item.secret && (
                  <button
                    className="icon-button"
                    aria-label="Toggle secret visibility"
                    onClick={() =>
                      setRevealed((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    {revealed.has(item.id) ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                )}
              </>
            )}
          </div>
          <button
            className="icon-button danger-hover"
            aria-label={`Delete row ${index + 1}`}
            onClick={() => onChange(items.filter((p) => p.id !== item.id))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        className="text-button add-row"
        onClick={() => onChange([...items, pair()])}
      >
        <Plus size={14} />
        Add {secrets ? "variable" : "row"}
      </button>
    </div>
  );
}
export function download(
  name: string,
  value: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
