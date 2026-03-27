import { useState, useEffect } from "react";

interface AgentForm {
  name: string;
  directory: string;
  system_prompt: string;
  model: string;
  permission_mode: string;
  allowed_tools: string;
}

interface RoomForm {
  name: string;
  mode: string;
  max_turns_per_round: number;
  cooldown_seconds: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid #444",
  background: "#111",
  color: "#ddd",
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#999",
  marginBottom: 2,
  display: "block",
};

const emptyAgent = (): AgentForm => ({
  name: "",
  directory: "",
  system_prompt: "",
  model: "",
  permission_mode: "default",
  allowed_tools: "",
});

function parseYaml(content: string): { room: RoomForm; agents: AgentForm[] } {
  // Simple YAML parser for our known structure — relies on the API for real validation
  const lines = content.split("\n");
  const room: RoomForm = { name: "", mode: "free", max_turns_per_round: 3, cooldown_seconds: 2 };
  const agents: AgentForm[] = [];
  let section = "";
  let currentAgent: AgentForm | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "room:") { section = "room"; continue; }
    if (trimmed === "agents:" || trimmed === "agents: []") { section = "agents"; continue; }

    if (section === "room") {
      const m = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/);
      if (m) {
        const [, key, val] = m;
        if (key === "name") room.name = val;
        if (key === "mode") room.mode = val;
        if (key === "max_turns_per_round") room.max_turns_per_round = parseInt(val) || 3;
        if (key === "cooldown_seconds") room.cooldown_seconds = parseInt(val) || 2;
      }
    }

    if (section === "agents") {
      if (trimmed.startsWith("- name:")) {
        if (currentAgent) agents.push(currentAgent);
        currentAgent = emptyAgent();
        currentAgent.name = trimmed.replace("- name:", "").trim().replace(/"/g, "");
      } else if (currentAgent) {
        if (trimmed.startsWith("- ") && !trimmed.startsWith("- name:")) {
          // allowed_tools list item
          currentAgent.allowed_tools += (currentAgent.allowed_tools ? ", " : "") + trimmed.slice(2).trim().replace(/"/g, "");
        } else {
          const m = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/);
          if (m) {
            const [, key, val] = m;
            if (key === "directory") currentAgent.directory = val;
            if (key === "system_prompt") currentAgent.system_prompt = val;
            if (key === "model") currentAgent.model = val;
            if (key === "permission_mode") currentAgent.permission_mode = val;
          }
          // allowed_tools as inline array
          const arrMatch = trimmed.match(/^allowed_tools:\s*\[([^\]]*)\]/);
          if (arrMatch) {
            currentAgent.allowed_tools = arrMatch[1].replace(/"/g, "").trim();
          }
        }
      }
    }
  }
  if (currentAgent) agents.push(currentAgent);
  return { room, agents };
}

function toYaml(room: RoomForm, agents: AgentForm[]): string {
  let s = `room:\n`;
  s += `  name: "${room.name}"\n`;
  s += `  mode: "${room.mode}"\n`;
  s += `  max_turns_per_round: ${room.max_turns_per_round}\n`;
  s += `  cooldown_seconds: ${room.cooldown_seconds}\n`;
  s += `\n`;
  if (agents.length === 0) {
    s += `agents: []\n`;
  } else {
    s += `agents:\n`;
    for (const a of agents) {
      s += `  - name: "${a.name}"\n`;
      s += `    directory: "${a.directory}"\n`;
      if (a.system_prompt) s += `    system_prompt: "${a.system_prompt}"\n`;
      if (a.model) s += `    model: "${a.model}"\n`;
      if (a.permission_mode && a.permission_mode !== "default") s += `    permission_mode: "${a.permission_mode}"\n`;
      if (a.allowed_tools) {
        const tools = a.allowed_tools.split(",").map((t) => `"${t.trim()}"`).join(", ");
        s += `    allowed_tools: [${tools}]\n`;
      }
    }
  }
  return s;
}

export function ConfigEditor({ open, onClose }: Props) {
  const [tab, setTab] = useState<"form" | "yaml">("form");
  const [room, setRoom] = useState<RoomForm>({ name: "", mode: "free", max_turns_per_round: 3, cooldown_seconds: 2 });
  const [agents, setAgents] = useState<AgentForm[]>([]);
  const [yamlContent, setYamlContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/config")
        .then((r) => r.json())
        .then((data) => {
          setYamlContent(data.content);
          const parsed = parseYaml(data.content);
          setRoom(parsed.room);
          setAgents(parsed.agents);
          setError(null);
          setSaved(false);
        });
    }
  }, [open]);

  const syncToYaml = (r: RoomForm, a: AgentForm[]) => {
    setYamlContent(toYaml(r, a));
  };

  const updateRoom = (patch: Partial<RoomForm>) => {
    const updated = { ...room, ...patch };
    setRoom(updated);
    syncToYaml(updated, agents);
    setSaved(false);
  };

  const updateAgent = (idx: number, patch: Partial<AgentForm>) => {
    const updated = agents.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    setAgents(updated);
    syncToYaml(room, updated);
    setSaved(false);
  };

  const addAgent = () => {
    const updated = [...agents, emptyAgent()];
    setAgents(updated);
    syncToYaml(room, updated);
    setSaved(false);
  };

  const removeAgent = (idx: number) => {
    const updated = agents.filter((_, i) => i !== idx);
    setAgents(updated);
    syncToYaml(room, updated);
    setSaved(false);
  };

  const onYamlEdit = (content: string) => {
    setYamlContent(content);
    try {
      const parsed = parseYaml(content);
      setRoom(parsed.room);
      setAgents(parsed.agents);
    } catch {
      // ignore parse errors during editing
    }
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const content = tab === "yaml" ? yamlContent : toYaml(room, agents);
    try {
      const resp = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        setError(data.detail || "Save failed");
      } else {
        setSaved(true);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 8,
          width: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["form", "yaml"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: tab === t ? "#333" : "transparent",
                  color: tab === t ? "#fff" : "#888",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {t === "form" ? "Form" : "YAML"}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#999", fontSize: 18, cursor: "pointer" }}
          >
            x
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "form" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Room Settings */}
              <fieldset style={{ border: "1px solid #333", borderRadius: 6, padding: 12 }}>
                <legend style={{ color: "#999", fontSize: 13, padding: "0 6px" }}>Room</legend>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input style={inputStyle} value={room.name} onChange={(e) => updateRoom({ name: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Mode</label>
                    <select
                      style={{ ...inputStyle, appearance: "auto" }}
                      value={room.mode}
                      onChange={(e) => updateRoom({ mode: e.target.value })}
                    >
                      <option value="free">free</option>
                      <option value="at-only">at-only</option>
                      <option value="topic">topic</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Max turns / round</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      value={room.max_turns_per_round}
                      onChange={(e) => updateRoom({ max_turns_per_round: parseInt(e.target.value) || 3 })}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Cooldown (seconds)</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min={0}
                      value={room.cooldown_seconds}
                      onChange={(e) => updateRoom({ cooldown_seconds: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Agents */}
              <fieldset style={{ border: "1px solid #333", borderRadius: 6, padding: 12 }}>
                <legend style={{ color: "#999", fontSize: 13, padding: "0 6px" }}>
                  Agents ({agents.length})
                </legend>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {agents.map((agent, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: "#111",
                        border: "1px solid #333",
                        borderRadius: 6,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>
                          Agent {idx + 1}
                        </span>
                        <button
                          onClick={() => removeAgent(idx)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#FF6B6B",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={labelStyle}>Name *</label>
                          <input
                            style={inputStyle}
                            value={agent.name}
                            onChange={(e) => updateAgent(idx, { name: e.target.value })}
                            placeholder="cdp-agent"
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Model</label>
                          <input
                            style={inputStyle}
                            value={agent.model}
                            onChange={(e) => updateAgent(idx, { model: e.target.value })}
                            placeholder="sonnet (optional)"
                          />
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <label style={labelStyle}>Directory *</label>
                          <input
                            style={inputStyle}
                            value={agent.directory}
                            onChange={(e) => updateAgent(idx, { directory: e.target.value })}
                            placeholder="/path/to/project"
                          />
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <label style={labelStyle}>System Prompt</label>
                          <input
                            style={inputStyle}
                            value={agent.system_prompt}
                            onChange={(e) => updateAgent(idx, { system_prompt: e.target.value })}
                            placeholder="Optional role description"
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Permission Mode</label>
                          <select
                            style={{ ...inputStyle, appearance: "auto" }}
                            value={agent.permission_mode}
                            onChange={(e) => updateAgent(idx, { permission_mode: e.target.value })}
                          >
                            <option value="default">default</option>
                            <option value="acceptEdits">acceptEdits</option>
                            <option value="bypassPermissions">bypassPermissions</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Allowed Tools</label>
                          <input
                            style={inputStyle}
                            value={agent.allowed_tools}
                            onChange={(e) => updateAgent(idx, { allowed_tools: e.target.value })}
                            placeholder="Read, Glob, Grep"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addAgent}
                    style={{
                      padding: "6px 0",
                      borderRadius: 4,
                      border: "1px dashed #444",
                      background: "transparent",
                      color: "#888",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    + Add Agent
                  </button>
                </div>
              </fieldset>
            </div>
          ) : (
            <textarea
              value={yamlContent}
              onChange={(e) => onYamlEdit(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 300,
                background: "#111",
                color: "#ddd",
                border: "1px solid #333",
                borderRadius: 4,
                padding: 12,
                fontFamily: "monospace",
                fontSize: 13,
                lineHeight: 1.5,
                resize: "vertical",
              }}
            />
          )}
        </div>

        {/* Footer */}
        {error && (
          <div style={{ color: "#FF6B6B", fontSize: 13, marginTop: 8 }}>{error}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          {saved && (
            <span style={{ color: "#51CF66", fontSize: 13, alignSelf: "center" }}>
              Saved! Restart server to apply.
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "transparent",
              color: "#ccc",
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "none",
              background: "#4A9EFF",
              color: "#fff",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
