import { useState, type KeyboardEvent } from "react";
import type { AgentStatus } from "../types";

interface Props {
  agents: AgentStatus[];
  onSend: (content: string, to?: string) => void;
}

export function MessageInput({ agents, onSend }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim()) return;
    const mentionMatch = text.match(/^@(\S+)\s/);
    let to = "all";
    let content = text;
    if (mentionMatch) {
      const target = mentionMatch[1];
      if (agents.some((a) => a.name === target)) {
        to = target;
        content = text.slice(mentionMatch[0].length);
      }
    }
    onSend(content, to);
    setText("");
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #333" }}>
      <input
        style={{
          flex: 1,
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid #444",
          background: "#1a1a1a",
          color: "#fff",
          fontSize: 14,
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Type a message... (@agent to mention)"
      />
      <button
        onClick={handleSend}
        style={{
          padding: "8px 16px",
          borderRadius: 6,
          border: "none",
          background: "#4A9EFF",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Send
      </button>
    </div>
  );
}
