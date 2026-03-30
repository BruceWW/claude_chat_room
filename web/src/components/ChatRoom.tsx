import { useRef, useEffect, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { AgentList } from "./AgentList";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { ConfigEditor } from "./ConfigEditor";

export function ChatRoom() {
  const { messages, agents, connected, sendMessage } = useWebSocket("default");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#111",
        color: "#eee",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <AgentList agents={agents} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #333",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Claude Chat Room</h2>
          <span
            style={{
              fontSize: 12,
              color: connected ? "#51CF66" : "#FF6B6B",
            }}
          >
            {connected ? "connected" : "disconnected"}
          </span>
          <button
            onClick={() => setConfigOpen(true)}
            style={{
              marginLeft: "auto",
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "transparent",
              color: "#999",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Config
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
        <MessageInput agents={agents} onSend={sendMessage} />
      </div>
      <ConfigEditor open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
