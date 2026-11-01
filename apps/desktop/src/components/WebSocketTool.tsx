import type { Pair } from "@requestlab/shared";
import { uid } from "@requestlab/shared";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Play, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isNative } from "../lib/bridge";
import { PairTable, errorMessage } from "./Primitives";
interface WsMessage {
  direction: "sent" | "received" | "system";
  text: string;
  time: string;
}
export function WebSocketTool() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("Disconnected");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [headers, setHeaders] = useState<Pair[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const session = useRef(uid());
  const unlisten = useRef<(() => void) | null>(null);
  const append = (direction: WsMessage["direction"], text: string) =>
    setMessages((prev) => [
      ...prev.slice(-499),
      {
        direction,
        text: text.slice(0, 100_000),
        time: new Date().toLocaleTimeString(),
      },
    ]);
  useEffect(
    () => () => {
      socket.current?.close();
      unlisten.current?.();
      if (isNative)
        void invoke("ws_disconnect", { id: session.current }).catch(
          console.error,
        );
    },
    [],
  );
  async function disconnect() {
    if (isNative) {
      await invoke("ws_disconnect", { id: session.current });
      unlisten.current?.();
      unlisten.current = null;
      setStatus("Disconnected");
    } else socket.current?.close();
  }
  async function connect() {
    try {
      const target = new URL(url);
      if (!["ws:", "wss:"].includes(target.protocol))
        throw new Error("Use ws:// or wss://");
      setStatus("Connecting");
      if (isNative) {
        unlisten.current?.();
        unlisten.current = await listen<{
          id: string;
          text: string;
          kind: string;
        }>("ws-message", (event) => {
          if (event.payload.id !== session.current) return;
          if (event.payload.kind === "closed") setStatus("Disconnected");
          else if (event.payload.kind === "error") {
            append("system", event.payload.text);
            setStatus("Disconnected");
          } else append("received", event.payload.text);
        });
        await invoke("ws_connect", { id: session.current, url, headers });
        setStatus("Connected");
      } else {
        const ws = new WebSocket(url);
        socket.current = ws;
        ws.onopen = () => setStatus("Connected");
        ws.onclose = () => setStatus("Disconnected");
        ws.onerror = () => {
          append(
            "system",
            "WebSocket connection failed. Check the destination and TLS configuration.",
          );
          setStatus("Disconnected");
        };
        ws.onmessage = (event) =>
          append(
            "received",
            typeof event.data === "string" ? event.data : "[Binary message]",
          );
      }
    } catch (error) {
      append("system", errorMessage(error));
      setStatus("Disconnected");
    }
  }
  return (
    <div className="tool-page websocket-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">REAL TIME</span>
          <h1>WebSocket client</h1>
          <p>Inspect persistent connections, one message at a time.</p>
        </div>
        <span className={status === "Connected" ? "status-success" : "muted"}>
          ● {status}
        </span>
      </div>
      <div className="ws-url">
        <input
          aria-label="WebSocket URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="wss://your-server.example/socket"
        />
        <button
          className="primary-button"
          disabled={status === "Connecting"}
          onClick={() =>
            void (status === "Connected" ? disconnect() : connect()).catch(
              (error) => append("system", errorMessage(error)),
            )
          }
        >
          <Wifi size={14} />
          {status === "Connected" ? "Disconnect" : "Connect"}
        </button>
      </div>
      {isNative ? (
        <PairTable items={headers} onChange={setHeaders} />
      ) : (
        <p className="muted">
          Browser preview uses the browser WebSocket API. Custom handshake
          headers require the native desktop build.
        </p>
      )}
      <div className="ws-messages">
        {messages.length ? (
          messages.map((m, i) => (
            <div key={i}>
              <span className={`ws-direction ${m.direction}`}>
                {m.direction === "sent" ? "↑" : "↓"} {m.direction}
              </span>
              <pre>{m.text}</pre>
              <time>{m.time}</time>
            </div>
          ))
        ) : (
          <div className="small-empty">
            Connect to a WebSocket server to begin.
          </div>
        )}
      </div>
      <div className="ws-compose">
        <textarea
          aria-label="WebSocket message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter a message…"
        />
        <button
          className="primary-button"
          disabled={status !== "Connected" || !message}
          onClick={() => {
            void (async () => {
              if (isNative)
                await invoke("ws_send", { id: session.current, message });
              else socket.current?.send(message);
              append("sent", message);
              setMessage("");
            })().catch((error) => append("system", errorMessage(error)));
          }}
        >
          <Play size={14} />
          Send
        </button>
      </div>
    </div>
  );
}
