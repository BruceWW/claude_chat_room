import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../types";

const AGENT_COLORS: Record<string, string> = {};
const PALETTE = ["#4A9EFF", "#FF6B6B", "#51CF66", "#FFD43B", "#CC5DE8", "#FF922B"];
let colorIdx = 0;

function getColor(name: string): string {
  if (!AGENT_COLORS[name]) {
    AGENT_COLORS[name] = PALETTE[colorIdx % PALETTE.length];
    colorIdx++;
  }
  return AGENT_COLORS[name];
}

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isHuman = msg.from_type === "human";
  const color = isHuman ? "#888" : getColor(msg.from_name);
  const time = new Date(msg.timestamp).toLocaleTimeString();

  return (
    <div style={{ marginBottom: 12, padding: "8px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color, fontWeight: 600 }}>
          {isHuman ? "You" : msg.from_name}
        </span>
        {msg.to !== "all" && (
          <span style={{ color: "#999", fontSize: 12 }}>→ @{msg.to}</span>
        )}
        <span style={{ color: "#999", fontSize: 12, marginLeft: "auto" }}>
          {time}
        </span>
      </div>
      <div className="msg-content" style={{ marginTop: 4 }}>
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </div>
    </div>
  );
}
