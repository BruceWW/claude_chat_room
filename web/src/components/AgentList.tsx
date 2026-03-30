import type { AgentStatus } from "../types";

interface Props {
  agents: AgentStatus[];
}

export function AgentList({ agents }: Props) {
  return (
    <div
      style={{
        width: 200,
        borderRight: "1px solid #333",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, color: "#999" }}>Agents</h3>
      {agents.length === 0 && (
        <span style={{ color: "#666", fontSize: 13 }}>No agents configured</span>
      )}
      {agents.map((a) => (
        <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: a.online ? (a.thinking ? "#FFD43B" : "#51CF66") : "#666",
              display: "inline-block",
            }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
            {a.thinking && (
              <div style={{ fontSize: 11, color: "#FFD43B" }}>thinking...</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
