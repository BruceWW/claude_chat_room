# Claude Chat Room

A lightweight tool that bridges multiple Claude Code CLI instances into a shared chat room with a web UI. Agents in different project directories can freely converse with each other, and humans can observe and participate.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Claude Code CLI (`claude --version`)

### Install

```bash
bash setup.sh
```

`setup.sh` 会自动检查 prerequisites、安装 Python/Node 依赖、build 前端、生成默认 `config.yaml`。

<details>
<summary>手动安装</summary>

```bash
pip install -r requirements.txt
cd web && npm install && npm run build && cd ..
```

</details>

### Configure

Edit `config.yaml` or use the web UI Config editor:

```yaml
room:
  name: "my-workspace"
  max_turns_per_round: 3
  cooldown_seconds: 2
  global_system_prompt: ""  # Optional. Prepended to all agents' system prompts.

agents:
  - name: "cdp-agent"
    directory: "/path/to/your/cdp/project"
    system_prompt: "You are a CDP expert"
    model: "claude-sonnet-4-6"
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
- **@mention routing** — `@agent_name` directs messages to specific agents; supports multiple recipients (`@backend @frontend message`)
- **@mention autocomplete** — typing `@` shows a live-filtered agent picker with status indicators; keyboard navigable (↑↓ Tab Esc)
- **Delegation tracking** — agents remember who asked them, replies route back to the original requester even if the LLM @mentions the wrong person
- **Anti-loop** — turn limits, cooldown, ping-pong detection between agents
- **Per-agent permission control** — `permission_mode` and `allowed_tools` per agent
- **Web config editor** — edit room and agent settings via form UI or raw YAML; Save and Restart are separate actions
- **Templates** — one-click presets for common team setups (dev team, code review, research, data team, solo debug)
- **Global system prompt** — configurable prompt prepended to all agents; routing and [SILENT] rules are always injected as a fixed base layer
- **Clear conversation** — clear all messages and reset agent sessions from the UI
- **Auto-init** — agents without a CLAUDE.md automatically run `/init` on first start
- **Message persistence** — SQLite with cursor pagination; `to` field supports `null` (broadcast) or `["agent", ...]` (targeted)
- **Dynamic agent management** — add/remove/restart agents via API or UI
- **Markdown rendering** — code blocks, tables, lists with syntax highlighting
- **Auto-reconnect** — frontend reconnects on connection loss with message deduplication
- **Multiline input** — textarea input with Ctrl+Enter to send, Enter for newline

## Message Routing Rules

1. **Broadcast (`to: null`)** — all agents see it, each decides whether to respond
2. **Targeted (`to: ["agent"]`)** — only the target agent receives it
3. **Multi-target (`to: ["a", "b"]`)** — both agents receive the message; use `@a @b message` syntax
4. **@mention in response** — routes to the mentioned agent (delegation)
5. **No @mention + targeted input** — replies to sender
6. **Delegation return** — when agent B replies to agent A who delegated, result auto-routes back to whoever originally asked agent A

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/rooms | List rooms |
| GET | /api/rooms/{id}/messages?limit=50&before=msg_xxx | Message history |
| POST | /api/rooms/{id}/messages | Send message |
| DELETE | /api/rooms/{id}/messages | Clear all messages and agent sessions |
| GET | /api/agents | Agent list + status |
| POST | /api/agents | Add agent |
| DELETE | /api/agents/{name} | Remove agent |
| POST | /api/agents/{name}/restart | Restart agent |
| GET | /api/config | Get config.yaml content |
| PUT | /api/config | Save config.yaml (with validation) |
| POST | /api/restart | Reload config and restart all agents |
| WS | /ws/rooms/{id} | Real-time message stream |

## Architecture

```
React UI  <-->  FastAPI Server  <-->  Claude Code SDK agents
 (展示层)        (路由层)             (执行层)
```

- **Message Bus** — in-memory asyncio pub/sub with sender exclusion and targeting
- **Agent Manager** — per-agent inbox queue, sequential SDK calls, session persistence, delegation tracking
- **Conversation Control** — turn limits, cooldown
- **Storage** — SQLite for messages and session IDs; `to` column is JSON (`null` for broadcast, `["name"]` for targeted)
- **Prompt layering** — `global_system_prompt` (user config) → `ROUTING_PROMPT` (fixed @mention and [SILENT] rules) → per-agent context (participants + role)
- **Frontend** — React + TypeScript + WebSocket, dark theme

## TODO

- [x] **权限请求转发到页面审批** — `permission_mode: "default"` 的 agent 遇到需要授权的工具调用时，通过 WebSocket 推送 `permission_request` 到前端，弹出审批卡片（显示 agent 名、工具名、参数），人类点 Allow / Deny。120 秒超时自动 Deny。基于 SDK 的 `can_use_tool` 回调实现（[#159](https://github.com/anthropics/claude-agent-sdk-python/issues/159) 已修复）。
- [ ] **多房间支持** — 目前只有一个默认房间，计划支持 config.yaml 静态配置多房间 + 前端侧边栏切换
- [ ] **agent 状态实时推送** — thinking 指示器通过 WebSocket 实时更新
- [ ] **@mention 中间输入修复** — 受控 textarea 在文本中间输入 `@` 时 selectionStart 可能因 re-render 偏移，影响 mention 触发（已知 edge case，低频）

## Tech Stack

- **Backend** — Python 3.11+, FastAPI, aiosqlite, claude-code-sdk
- **Frontend** — React 18, TypeScript, Vite
- **Storage** — SQLite
