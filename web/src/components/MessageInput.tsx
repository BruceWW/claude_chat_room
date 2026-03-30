import { useState, useRef, type KeyboardEvent } from "react";
import type { AgentStatus } from "../types";

interface Props {
  agents: AgentStatus[];
  onSend: (content: string, to?: string[] | null) => void;
}

export function MessageInput({ agents, onSend }: Props) {
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredAgents = mentionQuery !== null
    ? agents.filter((a) => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  const handleSend = () => {
    if (!text.trim()) return;
    const recipients: string[] = [];
    let remaining = text;
    const mentionRe = /^@(\S+) /;
    while (true) {
      const m = remaining.match(mentionRe);
      if (!m) break;
      const name = m[1];
      if (agents.some((a) => a.name === name)) {
        recipients.push(name);
        remaining = remaining.slice(m[0].length);
      } else {
        break;
      }
    }
    const to = recipients.length > 0 ? recipients : null;
    const content = recipients.length > 0 ? remaining : text;
    if (!content.trim()) return;
    onSend(content, to);
    setText("");
    setMentionQuery(null);
  };

  const handleChange = (value: string) => {
    setText(value);
    const cursor = inputRef.current?.selectionStart ?? value.length;
    // Find the last @ before cursor
    const beforeCursor = value.slice(0, cursor);
    const atIdx = beforeCursor.lastIndexOf("@");
    if (atIdx !== -1) {
      const after = beforeCursor.slice(atIdx + 1);
      // Only show dropdown if no space after @
      if (!after.includes(" ")) {
        setMentionQuery(after);
        setMentionStart(atIdx);
        setSelectedIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  };

  const selectAgent = (agent: AgentStatus) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newText = `@${agent.name} ${after}`;
    setText(before + newText);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (mentionQuery !== null && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && mentionQuery !== null)) {
        e.preventDefault();
        selectAgent(filteredAgents[Math.min(selectedIndex, filteredAgents.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ padding: 12, borderTop: "1px solid #333", position: "relative" }}>
      {mentionQuery !== null && filteredAgents.length > 0 && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: 12,
          right: 12,
          background: "#222",
          border: "1px solid #444",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 4,
          zIndex: 100,
        }}>
          {filteredAgents.map((agent, i) => (
            <div
              key={agent.name}
              onMouseDown={(e) => { e.preventDefault(); selectAgent(agent); }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                background: i === selectedIndex ? "#333" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: agent.online ? (agent.thinking ? "#FFD43B" : "#51CF66") : "#666",
                flexShrink: 0,
              }} />
              <span style={{ color: "#eee", fontSize: 14 }}>{agent.name}</span>
              {agent.thinking && (
                <span style={{ color: "#888", fontSize: 12, marginLeft: "auto" }}>thinking...</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          ref={inputRef}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#1a1a1a",
            color: "#fff",
            fontSize: 14,
            resize: "none",
            minHeight: 68,
            fontFamily: "inherit",
          }}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message... (@agent to mention, Ctrl+Enter to send)"
          rows={3}
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
    </div>
  );
}
