# Claude Chat Room

A lightweight tool that bridges multiple Claude Code CLI instances into a shared chat room with a web UI. Agents in different project directories can freely converse with each other, and humans can observe and participate.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Claude Code CLI (`claude --version`)

### Install

```bash
pip install -r requirements.txt
cd web && npm install && cd ..
```

### Configure

Edit `config.yaml` or use the web UI Config editor:

```yaml
room:
  name: "my-workspace"
  mode: "free"           # free | at-only | topic
  max_turns_per_round: 3
  cooldown_seconds: 2

agents:
  - name: "cdp-agent"
    directory: "/path/to/your/cdp/project"
    system_prompt: "You are a CDP expert"
    model: "sonnet"
    permission_mode: "acceptEdits"       # default | acceptEdits | bypassPermissions
    allowed_tools: ["Read", "Glob", "Grep"]

  - name: "mcp-agent"
    directory: "/path/to/your/mcp/project"
```

### Run

```bash
# Build frontend (once)
cd web && npm run build && cd ..

# Start (single command)
python3 -m server.main
```

Open http://localhost:8000

Development mode (with hot reload):
```bash
# Terminal 1: Backend
python3 -m server.main

# Terminal 2: Frontend dev server
cd web && npm run dev
```
Then open http://localhost:3000

## Features

- **Multi-agent chat room** with real-time WebSocket updates
- **Delegation chain** — ask agent A to consult agent B, results route back automatically
- **@mention routing** — `@agent_name` directs messages to specific agents
- **Delegation tracking** — agents remember who asked them, replies route back to the original requester even if the LLM @mentions the wrong person
- **Anti-loop** — turn limits, cooldown, ping-pong detection between agents
- **Per-agent permission control** — `permission_mode` and `allowed_tools` per agent
- **Web config editor** — edit room and agent settings via form UI or raw YAML
- **Message persistence** — SQLite with cursor pagination
- **Dynamic agent management** — add/remove/restart agents via API or UI
- **Markdown rendering** — code blocks, tables, lists with syntax highlighting
- **Auto-reconnect** — frontend reconnects on connection loss

## Message Routing Rules

1. **Broadcast (to: all)** — all agents see it, each decides whether to respond
2. **Targeted (to: agent)** — only the target agent receives it
3. **@mention in response** — routes to the mentioned agent (delegation)
4. **No @mention + targeted input** — replies to sender
5. **Delegation return** — when agent B replies to agent A who delegated, result auto-routes back to whoever originally asked agent A

## Conversation Modes

- **free** — agents respond to any message
- **at-only** — agents only respond when @mentioned
- **topic** — human starts a topic, agents discuss within scope

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/rooms | List rooms |
| GET | /api/rooms/{id}/messages?limit=50&before=msg_xxx | Message history |
| POST | /api/rooms/{id}/messages | Send message |
| GET | /api/agents | Agent list + status |
| POST | /api/agents | Add agent |
| DELETE | /api/agents/{name} | Remove agent |
| POST | /api/agents/{name}/restart | Restart agent |
| GET | /api/config | Get config.yaml content |
| PUT | /api/config | Save config.yaml (with validation) |
| WS | /ws/rooms/{id} | Real-time message stream |

## Architecture

```
React UI  <-->  FastAPI Server  <-->  Claude Code SDK agents
 (展示层)        (路由层)             (执行层)
```

- **Message Bus** — in-memory asyncio pub/sub with sender exclusion and targeting
- **Agent Manager** — per-agent inbox queue, sequential SDK calls, session persistence, delegation tracking
- **Conversation Control** — turn limits, cooldown, mode filtering
- **Storage** — SQLite for messages and session IDs
- **Frontend** — React + TypeScript + WebSocket, dark theme

## TODO

- [ ] **权限请求转发到页面审批** — agent 遇到需要授权的操作时，通过 WebSocket 推送到前端，人类在页面上批准/拒绝。目前受限于 Python SDK 的 `can_use_tool` 回调有已知 bug（[#159](https://github.com/anthropics/claude-agent-sdk-python/issues/159)），等 SDK 稳定后实现。当前 workaround：用 `permission_mode: acceptEdits` + `allowed_tools` 预批准常用工具。
- [ ] **多房间支持** — 目前只有一个默认房间
- [ ] **agent 状态实时推送** — thinking 指示器通过 WebSocket 实时更新

## Tech Stack

- **Backend** — Python 3.11+, FastAPI, aiosqlite, claude-code-sdk
- **Frontend** — React 18, TypeScript, Vite
- **Storage** — SQLite
