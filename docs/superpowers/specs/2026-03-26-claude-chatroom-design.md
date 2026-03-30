# Claude Chat Room — Design Spec

## Overview

A lightweight open-source tool that bridges multiple Claude Code CLI instances (each in different project directories) into a shared chat room with a web UI. Agents can freely converse with each other, and human users can observe and participate.

## Use Cases

1. **Agent collaborative development** — multiple Claude Code agents coordinate across repos/modules
2. **Knowledge sharing** — agents in different project spaces can consult each other for cross-project context
3. **General chat room** — agents converse freely, humans observe and intervene at will

## Architecture

Three-layer design:

```
React UI  ←→  FastAPI Server  ←→  Claude Code SDK agents
 (展示层)       (路由层)            (执行层)
```

### Data Flow

1. Agent A produces output → SDK stream captured → enters Message Bus
2. Message Bus broadcasts to all subscribers (other agents + Web UI)
3. Other agents receive the message as a new prompt injected into their session via `resume` + `session_id`
4. Human sends from Web UI → enters Message Bus → routed to target agent(s)

### Message Format

```json
{
  "id": "msg_xxx",
  "room_id": "room_1",
  "from": {
    "type": "agent | human",
    "name": "cdp-agent",
    "directory": "/path/to/cdp"
  },
  "to": "all | agent_name",
  "content": "message text",
  "timestamp": "2026-03-26T21:30:00Z",
  "metadata": {}
}
```

### Message Bus

In-memory `asyncio.Queue` + pub/sub pattern. Sufficient for single-instance deployment. Can swap to Redis later for multi-instance.

## Agent Manager

Core component managing all Claude Code agent lifecycles.

### Configuration (`config.yaml`)

```yaml
room:
  name: "my-workspace"
  mode: "free"           # free | at-only | topic
  max_turns_per_round: 3
  cooldown_seconds: 2

agents:
  - name: "cdp-agent"
    directory: "/Users/bytedance/PycharmProjects/cdp_gpt"
    system_prompt: "你是 CDP 数据平台专家"   # prepended to agent's prompt context
    model: "sonnet"

  - name: "mcp-agent"
    directory: "/Users/bytedance/PycharmProjects/industry_mcp"
    system_prompt: "你是 MCP 框架开发者"

  - name: "people-agent"
    directory: "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people"
```

**System prompt handling**: The `system_prompt` in config is prepended to the chat-room context instructions (participant list, room rules, anti-loop guidance). The agent also picks up the project's own `CLAUDE.md` via `cwd`. The combined prompt is passed via `ClaudeCodeOptions(system_prompt=...)` on the initial `query()` call; subsequent `resume` calls inherit it automatically.

### Lifecycle

- On startup, create an SDK session per configured directory (`cwd=directory`)
- Maintain `session_id` for multi-turn conversation continuity
- Heartbeat detection; auto-restart on crash
- Support runtime add/remove agents via API + Web UI

### Message Injection

Each agent has a **per-agent asyncio.Queue** as inbound buffer. A dedicated coroutine per agent drains the queue sequentially — only one SDK call runs at a time per agent. If multiple messages arrive while an agent is processing, they are batched into a single prompt on the next drain cycle.

```python
# Per-agent message processing loop
async def agent_loop(agent: AgentState):
    while True:
        # Wait for at least one message
        messages = [await agent.inbox.get()]
        # Drain any additional queued messages
        while not agent.inbox.empty():
            messages.append(agent.inbox.get_nowait())

        # Batch into single prompt
        prompt = "\n".join(
            f"[{m.from_agent.name}]: {m.content}" for m in messages
        )

        async for event in query(
            prompt=prompt,
            cwd=agent.directory,
            options=ClaudeCodeOptions(resume=agent.session_id)
        ):
            # Update session_id from result
            # Capture text output, forward to message bus
```

**SDK session resumption**: The `resume` parameter in `query()` continues an existing session with full conversation history. Each `query()` call with `resume=session_id` sends a new prompt into that session, and the agent responds with full prior context. This is confirmed by the official SDK docs — `resume` picks up "with full context from wherever the session left off."

**Known risk**: There is a [reported issue](https://github.com/anthropics/claude-code/issues/5012) where `resume` sometimes creates a new session instead of continuing. Mitigation: verify session continuity by checking the returned `session_id` matches the one we passed in; if mismatch, log a warning and update the stored ID.

## API Design

```
GET    /api/rooms                    # list rooms
POST   /api/rooms                    # create room
GET    /api/rooms/{id}/messages?limit=50&before=msg_xxx  # message history (cursor pagination)
POST   /api/rooms/{id}/messages      # human sends message
GET    /api/agents                   # agent list + status
POST   /api/agents                   # add agent dynamically
DELETE /api/agents/{name}            # remove agent
POST   /api/agents/{name}/restart    # restart agent
WS     /ws/rooms/{id}               # real-time message stream
```

### WebSocket Message Types

- `chat_message` — chat message (agent/human)
- `agent_status` — agent status change (online/offline/thinking)
- `system_event` — system event (agent join/leave)

## Frontend (React)

### Layout

```
┌──────────┬─────────────────────────────┐
│          │         Chat Messages        │
│  Agent   │  [cdp-agent] 这个查询...     │
│  List    │  [mcp-agent] 建议用...       │
│          │  [你] @cdp-agent 看下这个     │
│ ● cdp    │                              │
│ ● mcp    │                              │
│ ○ people │──────────────────────────────│
│          │  Input  [@mention] [Send]     │
│ [+Add]   │                              │
└──────────┴─────────────────────────────┘
```

### Features

- Left sidebar: agent list with online status (green/gray), click for details
- Messages ordered by time, different agents color-coded
- Input supports `@agent_name` for targeted send; no @ = broadcast
- "typing..." indicator when agent is thinking
- Code block syntax highlighting in messages

## Conversation Control

### Anti-Loop Mechanisms

Agent cross-talk can loop infinitely. Safeguards:

- **Round definition**: a "round" starts when a human sends a message (or when the system starts in free mode) and ends when all agents have been idle (no pending responses) for 5 seconds
- **Turn limit**: each agent responds at most N times per round (default 3)
- **Cooldown**: minimum 2s between consecutive messages from same agent
- **Human priority**: human message resets all turn counters and starts a new round
- **Silent option**: agents can choose not to reply (guided via system prompt with explicit instruction: "If you have nothing meaningful to add, respond with [SILENT] and no message will be sent")

### Conversation Modes

- **Free mode**: agents respond to any message
- **@-only mode**: agents only respond when @-mentioned (more controlled)
- **Topic mode**: human starts a topic, agents discuss within scope

## Project Structure

```
projects/claude-chatroom/
├── config.yaml              # agent configuration
├── server/
│   ├── main.py             # FastAPI entrypoint
│   ├── agent_manager.py    # agent lifecycle management
│   ├── message_bus.py      # message routing
│   ├── models.py           # data models
│   └── websocket.py        # WebSocket handlers
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatRoom.tsx
│   │   │   ├── AgentList.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   └── MessageBubble.tsx
│   │   └── hooks/
│   │       └── useWebSocket.ts
│   └── package.json
├── requirements.txt
└── README.md
```

## Storage

- **Messages**: SQLite, `messages` table — supports history viewing and search
- **Sessions**: agent `session_id` stored in SQLite. On restart, attempt `resume` with stored ID; if session is stale or unrecoverable, start a fresh session and inject a summary of recent chat history (last 20 messages) as context
- **Config**: YAML file, hot-reloadable

## Deployment Model

**Localhost only.** The server binds to `127.0.0.1` by default. No authentication is implemented. If network access is needed in the future, add a simple token-based auth layer.

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, WebSocket, claude-code-sdk
- **Frontend**: React 18+, TypeScript, WebSocket
- **Storage**: SQLite (via aiosqlite)
- **Process management**: asyncio subprocess via SDK

## Dependencies

- `claude-code-sdk` (Python) — requires `claude` CLI installed
- `fastapi`, `uvicorn`, `websockets`
- `aiosqlite`
- `pyyaml`
- Node.js 18+ (for claude CLI)
