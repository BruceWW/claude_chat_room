import { useState, useEffect } from "react";

interface Template {
  id: string;
  name: string;
  description: string;
  room: { name: string; max_turns_per_round: number; cooldown_seconds: number };
  agents: Array<{
    name: string;
    system_prompt: string;
    model: string;
    permission_mode: string;
    allowed_tools: string;
  }>;
}

const TEMPLATES: Template[] = [
  {
    id: "dev-team",
    name: "开发团队",
    description: "PM + 架构师 + 前端 + 后端 + QA，完整研发团队",
    room: { name: "dev-team", max_turns_per_round: 5, cooldown_seconds: 3 },
    agents: [
      {
        name: "pm",
        system_prompt: "You are the Product Manager (pm) in a 5-person dev team chatroom. Your teammates: architect (technical design and system architecture), frontend (React/TypeScript UI implementation), backend (Python/FastAPI server implementation), qa (test cases, edge cases, and quality sign-off). Your responsibilities: Own the requirements. Clarify ambiguity before anyone writes code. Write user stories with clear acceptance criteria. Prioritize ruthlessly. Say no to scope creep. Mediate when frontend/backend disagree on product behavior. Give final sign-off on whether a feature is ready to ship (after qa approves). Address teammates by name when delegating or asking questions. IMPORTANT CONSTRAINTS: You cannot write, edit, or implement code yourself. You have no coding ability. All implementation tasks MUST be delegated via @mention to the appropriate teammate (architect for design, frontend for UI code, backend for server code, qa for testing). If you find yourself about to write code or edit files, stop and @mention the right person instead.",
        model: "claude-opus-4-6",
        permission_mode: "default",
        allowed_tools: "Read, Glob, Grep",
      },
      {
        name: "architect",
        system_prompt: "You are the Software Architect (architect) in a 5-person dev team chatroom. Your teammates: pm (product requirements and prioritization), frontend (React/TypeScript UI implementation), backend (Python/FastAPI server implementation), qa (test cases, edge cases, and quality sign-off). Your responsibilities: Translate pm's requirements into technical designs before implementation starts. Define API contracts between frontend and backend. Set coding standards, patterns, and tech stack decisions. Identify technical risks and propose mitigations. Unblock frontend and backend when they hit architectural decisions. Address teammates by name. Be decisive — avoid analysis paralysis.",
        model: "claude-opus-4-6",
        permission_mode: "default",
        allowed_tools: "Read, Glob, Grep",
      },
      {
        name: "frontend",
        system_prompt: "You are the Frontend Developer (frontend) in a 5-person dev team chatroom. Your teammates: pm (product requirements and prioritization), architect (technical designs and API contracts), backend (Python/FastAPI server implementation), qa (test cases, edge cases, and quality sign-off). Your responsibilities: Implement UI components in React/TypeScript based on architect's design. Consume API contracts defined by architect, coordinate with backend on integration. Own UX quality: loading states, error handling, responsiveness. Flag UI/UX concerns to pm before implementation, not after. Scope: web layer only. Do not touch server code. Address teammates by name when you need API changes or requirements clarification.",
        model: "claude-sonnet-4-6",
        permission_mode: "acceptEdits",
        allowed_tools: "",
      },
      {
        name: "backend",
        system_prompt: "You are the Backend Developer (backend) in a 5-person dev team chatroom. Your teammates: pm (product requirements and prioritization), architect (technical designs and API contracts), frontend (React/TypeScript UI implementation), qa (test cases, edge cases, and quality sign-off). Your responsibilities: Implement API endpoints and business logic in Python/FastAPI. Own data models, database interactions, and service-layer logic. Implement the API contracts defined by architect. Raise feasibility concerns to architect before committing to an approach. Scope: server layer only. Do not touch frontend code. Address teammates by name when API contracts need negotiation or requirements are unclear.",
        model: "claude-sonnet-4-6",
        permission_mode: "acceptEdits",
        allowed_tools: "",
      },
      {
        name: "qa",
        system_prompt: "You are the QA Engineer (qa) in a 5-person dev team chatroom. Your teammates: pm (product requirements and acceptance criteria), architect (technical design and system boundaries), frontend (React/TypeScript UI implementation), backend (Python/FastAPI server implementation). Your responsibilities: Write test cases covering happy path, edge cases, and failure scenarios. Think like an adversarial user — try to break things. Verify that implementation matches pm's acceptance criteria. Catch integration issues between frontend and backend. Block sign-off if critical issues are unresolved. Be explicit about what must be fixed vs. what can be tracked as debt. Address teammates by name when filing issues. Be specific: what you tested, what you expected, what actually happened.",
        model: "claude-sonnet-4-6",
        permission_mode: "default",
        allowed_tools: "Read, Glob, Grep",
      },
    ],
  },
  {
    id: "code-review",
    name: "代码审查",
    description: "作者 + 审查员，适合 PR review 和代码质量把关",
    room: { name: "code-review", max_turns_per_round: 4, cooldown_seconds: 2 },
    agents: [
      {
        name: "author",
        system_prompt: "You are the code author. Explain your implementation choices, defend design decisions when challenged, and revise code based on valid feedback. Be open but not a pushover.",
        model: "claude-sonnet-4-6",
        permission_mode: "acceptEdits",
        allowed_tools: "",
      },
      {
        name: "reviewer",
        system_prompt: "You are a senior code reviewer. Check for bugs, security issues, performance problems, and maintainability. Be constructive but thorough. Focus on what matters most.",
        model: "claude-opus-4-6",
        permission_mode: "default",
        allowed_tools: "Read, Glob, Grep",
      },
    ],
  },
  {
    id: "research-team",
    name: "研究助手",
    description: "研究员 + 批评者，适合技术调研和方案评估",
    room: { name: "research", max_turns_per_round: 4, cooldown_seconds: 2 },
    agents: [
      {
        name: "researcher",
        system_prompt: "You are a technical researcher. Investigate topics deeply, gather evidence, and propose solutions with pros/cons analysis. Be thorough and cite your reasoning.",
        model: "claude-sonnet-4-6",
        permission_mode: "default",
        allowed_tools: "Read, Glob, Grep",
      },
      {
        name: "critic",
        system_prompt: "You are a constructive critic. Challenge assumptions, identify blind spots, ask hard questions, and stress-test proposals. Your goal is to make ideas stronger, not kill them.",
        model: "claude-sonnet-4-6",
        permission_mode: "default",
        allowed_tools: "Read, Glob, Grep",
      },
    ],
  },
  {
    id: "data-team",
    name: "数据分析团队",
    description: "数据工程师 + 分析师，适合数据管道和洞察挖掘",
    room: { name: "data-team", max_turns_per_round: 4, cooldown_seconds: 2 },
    agents: [
      {
        name: "data-engineer",
        system_prompt: "You are a data engineer. Design and build data pipelines, optimize SQL/PySpark queries, manage data quality and schemas. Focus on reliability and performance.",
        model: "claude-sonnet-4-6",
        permission_mode: "acceptEdits",
        allowed_tools: "",
      },
      {
        name: "analyst",
        system_prompt: "You are a data analyst. Explore datasets, identify patterns, generate insights, and communicate findings clearly. Turn raw data into actionable conclusions.",
        model: "claude-sonnet-4-6",
        permission_mode: "default",
        allowed_tools: "Read, Glob, Grep",
      },
    ],
  },
  {
    id: "solo-debug",
    name: "单 Agent 调试",
    description: "全权限单 Agent，适合快速调试和原型验证",
    room: { name: "debug", max_turns_per_round: 10, cooldown_seconds: 1 },
    agents: [
      {
        name: "debugger",
        system_prompt: "You are an expert debugger. Diagnose issues systematically, read error messages carefully, form hypotheses, test them, and fix root causes rather than symptoms.",
        model: "claude-sonnet-4-6",
        permission_mode: "bypassPermissions",
        allowed_tools: "",
      },
    ],
  },
];

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
  max_turns_per_round: number;
  cooldown_seconds: number;
  global_system_prompt: string;
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
  const room: RoomForm = { name: "", max_turns_per_round: 3, cooldown_seconds: 2, global_system_prompt: "" };
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
        if (key === "max_turns_per_round") room.max_turns_per_round = parseInt(val) || 3;
        if (key === "cooldown_seconds") room.cooldown_seconds = parseInt(val) || 2;
        if (key === "global_system_prompt") room.global_system_prompt = val;
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
  s += `  max_turns_per_round: ${room.max_turns_per_round}\n`;
  s += `  cooldown_seconds: ${room.cooldown_seconds}\n`;
  if (room.global_system_prompt) s += `  global_system_prompt: "${room.global_system_prompt}"\n`;
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
  const [room, setRoom] = useState<RoomForm>({ name: "", max_turns_per_round: 3, cooldown_seconds: 2, global_system_prompt: "" });
  const [agents, setAgents] = useState<AgentForm[]>([]);
  const [yamlContent, setYamlContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartDone, setRestartDone] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  useEffect(() => {
    if (!showTemplates) return;
    const handler = () => setShowTemplates(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showTemplates]);

  const applyTemplate = (tpl: Template) => {
    const newRoom = { ...tpl.room, global_system_prompt: "" };
    const newAgents: AgentForm[] = tpl.agents.map((a) => ({
      ...emptyAgent(),
      name: a.name,
      system_prompt: a.system_prompt,
      model: a.model,
      permission_mode: a.permission_mode,
      allowed_tools: a.allowed_tools,
    }));
    setRoom(newRoom);
    setAgents(newAgents);
    setYamlContent(toYaml(newRoom, newAgents));
    setSaved(false);
    setShowTemplates(false);
  };

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
    setRestartDone(false);
    setRestartError(null);
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

  const handleRestart = async () => {
    setRestarting(true);
    setRestartError(null);
    setRestartDone(false);
    try {
      const resp = await fetch("/api/restart", { method: "POST" });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setRestartError(data.detail || "Restart failed");
      } else {
        setRestartDone(true);
      }
    } catch {
      setRestartError("Network error");
    } finally {
      setRestarting(false);
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
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
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
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowTemplates((v) => !v); }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #4A9EFF44",
                  background: showTemplates ? "#1a3a5c" : "transparent",
                  color: "#4A9EFF",
                  fontSize: 13,
                  cursor: "pointer",
                  marginLeft: 4,
                }}
              >
                Templates ▾
              </button>
              {showTemplates && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    background: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: 6,
                    width: 280,
                    zIndex: 200,
                    overflow: "hidden",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                  }}
                >
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px 14px",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid #2a2a2a",
                        color: "#ddd",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#252525")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{tpl.name}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{tpl.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>Global System Prompt (prepended to all agents)</label>
                  <textarea
                    style={{ ...inputStyle, height: 72, resize: "vertical", fontFamily: "monospace" }}
                    value={room.global_system_prompt}
                    onChange={(e) => updateRoom({ global_system_prompt: e.target.value })}
                    placeholder="Optional. Applied before each agent's own system prompt."
                  />
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center" }}>
          {restartDone && (
            <span style={{ color: "#51CF66", fontSize: 13 }}>Service restarted!</span>
          )}
          {restartError && !restartDone && (
            <span style={{ color: "#FF6B6B", fontSize: 13 }}>{restartError}</span>
          )}
          {saved && !restartDone && (
            <span style={{ color: "#aaa", fontSize: 13 }}>Saved!</span>
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
            onClick={handleRestart}
            disabled={restarting}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "1px solid #4A9EFF",
              background: restarting ? "#1a3a5c" : "transparent",
              color: restartDone ? "#51CF66" : "#4A9EFF",
              cursor: restarting ? "wait" : "pointer",
              opacity: restarting ? 0.7 : 1,
            }}
          >
            {restarting ? "Restarting..." : restartDone ? "Restarted!" : "Restart Service"}
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
