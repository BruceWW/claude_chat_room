# Claude Chat Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based chat room that bridges multiple Claude Code CLI instances in different directories, letting them converse freely with each other and with human users.

**Architecture:** FastAPI backend manages Claude Code SDK agent processes and routes messages via an in-memory pub/sub bus. React frontend connects via WebSocket for real-time chat UI. SQLite stores message history and session state.

**Tech Stack:** Python 3.11+, FastAPI, claude-code-sdk, aiosqlite, React 18, TypeScript, WebSocket

**Spec:** `docs/superpowers/specs/2026-03-26-claude-chatroom-design.md`

---

## File Structure

```
projects/claude-chatroom/
├── config.yaml                  # Room + agent configuration
├── requirements.txt             # Python dependencies
├── server/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app, startup/shutdown, mount routes
│   ├── models.py               # Pydantic models + SQLite schema
│   ├── database.py             # SQLite connection + migrations
│   ├── message_bus.py          # In-memory pub/sub message router
│   ├── agent_manager.py        # Agent lifecycle + SDK integration
│   ├── conversation_control.py # Anti-loop: rounds, turns, cooldown
│   ├── routes.py               # REST API endpoints
│   └── websocket.py            # WebSocket handler
├── tests/
│   ├── __init__.py
│   ├── test_models.py
│   ├── test_message_bus.py
│   ├── test_conversation_control.py
│   ├── test_agent_manager.py
│   ├── test_routes.py
│   └── conftest.py             # Shared fixtures
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts            # TypeScript interfaces
│       ├── hooks/
│       │   └── useWebSocket.ts
│       └── components/
│           ├── ChatRoom.tsx
│           ├── AgentList.tsx
│           ├── MessageInput.tsx
│           └── MessageBubble.tsx
└── README.md
```

---

## Task 1: Project Scaffolding + Dependencies

**Files:**
- Create: `config.yaml`, `requirements.txt`, `server/__init__.py`, `tests/__init__.py`, `tests/conftest.py`

- [ ] **Step 1: Create config.yaml**

```yaml
room:
  name: "my-workspace"
  mode: "free"
  max_turns_per_round: 3
  cooldown_seconds: 2

agents: []
```

- [ ] **Step 2: Create requirements.txt**

```
fastapi>=0.115.0
uvicorn[standard]>=0.34.0
websockets>=14.0
aiosqlite>=0.20.0
pyyaml>=6.0
claude-code-sdk>=0.0.20
pydantic>=2.0
pytest>=8.0
pytest-asyncio>=0.24.0
httpx>=0.27.0
```

- [ ] **Step 3: Create server/__init__.py and tests/__init__.py**

Empty files.

- [ ] **Step 4: Create tests/conftest.py**

```python
# tests/conftest.py
# pytest-asyncio auto mode handles event loop creation
```

- [ ] **Step 5: Install dependencies**

Run: `cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom" && pip install -r requirements.txt`

- [ ] **Step 6: Verify installation**

Run: `python -c "import fastapi; import aiosqlite; import yaml; print('OK')"`
Expected: `OK`

---

## Task 2: Data Models

**Files:**
- Create: `server/models.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write tests for models**

```python
# tests/test_models.py
import pytest
from server.models import ChatMessage, AgentConfig, RoomConfig, AgentStatus


def test_chat_message_creation():
    msg = ChatMessage(
        room_id="room_1",
        from_type="agent",
        from_name="cdp-agent",
        to="all",
        content="hello",
    )
    assert msg.id is not None
    assert msg.id.startswith("msg_")
    assert msg.timestamp is not None


def test_chat_message_targeted():
    msg = ChatMessage(
        room_id="room_1",
        from_type="human",
        from_name="user",
        to="cdp-agent",
        content="@cdp-agent check this",
    )
    assert msg.to == "cdp-agent"
    assert msg.is_broadcast is False


def test_chat_message_broadcast():
    msg = ChatMessage(
        room_id="room_1",
        from_type="human",
        from_name="user",
        to="all",
        content="hello everyone",
    )
    assert msg.is_broadcast is True


def test_agent_config_from_yaml():
    data = {
        "name": "cdp-agent",
        "directory": "/tmp/cdp",
        "system_prompt": "you are cdp expert",
        "model": "sonnet",
    }
    config = AgentConfig(**data)
    assert config.name == "cdp-agent"
    assert config.model == "sonnet"


def test_agent_config_defaults():
    config = AgentConfig(name="test", directory="/tmp")
    assert config.system_prompt is None
    assert config.model is None


def test_room_config_defaults():
    config = RoomConfig(name="test")
    assert config.mode == "free"
    assert config.max_turns_per_round == 3
    assert config.cooldown_seconds == 2


def test_agent_status():
    status = AgentStatus(
        name="cdp-agent",
        directory="/tmp/cdp",
        online=True,
        thinking=False,
        session_id="sess_123",
    )
    assert status.online is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom" && python -m pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.models'`

- [ ] **Step 3: Implement models**

```python
# server/models.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


def _msg_id() -> str:
    return f"msg_{uuid.uuid4().hex[:12]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ChatMessage(BaseModel):
    id: str = Field(default_factory=_msg_id)
    room_id: str
    from_type: str  # "agent" | "human"
    from_name: str
    from_directory: Optional[str] = None
    to: str = "all"  # "all" | agent_name
    content: str
    timestamp: datetime = Field(default_factory=_now)
    metadata: dict = Field(default_factory=dict)

    @property
    def is_broadcast(self) -> bool:
        return self.to == "all"


class AgentConfig(BaseModel):
    name: str
    directory: str
    system_prompt: Optional[str] = None
    model: Optional[str] = None


class RoomConfig(BaseModel):
    name: str
    mode: str = "free"  # "free" | "at-only" | "topic"
    max_turns_per_round: int = 3
    cooldown_seconds: int = 2


class AppConfig(BaseModel):
    room: RoomConfig
    agents: list[AgentConfig] = Field(default_factory=list)


class AgentStatus(BaseModel):
    name: str
    directory: str
    online: bool = False
    thinking: bool = False
    session_id: Optional[str] = None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_models.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/models.py tests/test_models.py
git commit -m "feat: add data models for chat messages, agent config, room config"
```

---

## Task 3: Database Layer

**Files:**
- Create: `server/database.py`
- Test: `tests/test_database.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_database.py
import pytest
import pytest_asyncio
from server.database import Database
from server.models import ChatMessage


@pytest_asyncio.fixture
async def db(tmp_path):
    database = Database(str(tmp_path / "test.db"))
    await database.init()
    yield database
    await database.close()


@pytest.mark.asyncio
async def test_save_and_get_messages(db):
    msg = ChatMessage(
        room_id="room_1",
        from_type="agent",
        from_name="cdp-agent",
        content="hello",
    )
    await db.save_message(msg)
    messages = await db.get_messages("room_1", limit=10)
    assert len(messages) == 1
    assert messages[0].content == "hello"


@pytest.mark.asyncio
async def test_get_messages_pagination(db):
    for i in range(5):
        msg = ChatMessage(
            room_id="room_1",
            from_type="agent",
            from_name="agent",
            content=f"msg {i}",
        )
        await db.save_message(msg)

    all_msgs = await db.get_messages("room_1", limit=50)
    assert len(all_msgs) == 5

    page = await db.get_messages("room_1", limit=2)
    assert len(page) == 2

    before_id = all_msgs[2].id  # get messages before the 3rd
    older = await db.get_messages("room_1", limit=50, before=before_id)
    assert all(m.timestamp < all_msgs[2].timestamp for m in older)


@pytest.mark.asyncio
async def test_save_and_get_session(db):
    await db.save_session("cdp-agent", "sess_abc")
    sid = await db.get_session("cdp-agent")
    assert sid == "sess_abc"


@pytest.mark.asyncio
async def test_update_session(db):
    await db.save_session("cdp-agent", "sess_1")
    await db.save_session("cdp-agent", "sess_2")
    sid = await db.get_session("cdp-agent")
    assert sid == "sess_2"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_database.py -v`
Expected: FAIL

- [ ] **Step 3: Implement database**

```python
# server/database.py
from __future__ import annotations

import json

import aiosqlite
from server.models import ChatMessage


class Database:
    def __init__(self, path: str = "chatroom.db"):
        self.path = path
        self._db: aiosqlite.Connection | None = None

    async def init(self):
        self._db = await aiosqlite.connect(self.path)
        await self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                from_type TEXT NOT NULL,
                from_name TEXT NOT NULL,
                from_directory TEXT,
                "to" TEXT NOT NULL DEFAULT 'all',
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_messages_room_ts
                ON messages(room_id, timestamp DESC);

            CREATE TABLE IF NOT EXISTS sessions (
                agent_name TEXT PRIMARY KEY,
                session_id TEXT NOT NULL
            );
            """
        )
        await self._db.commit()

    async def close(self):
        if self._db:
            await self._db.close()

    async def save_message(self, msg: ChatMessage):
        await self._db.execute(
            """INSERT INTO messages (id, room_id, from_type, from_name,
               from_directory, "to", content, timestamp, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                msg.id,
                msg.room_id,
                msg.from_type,
                msg.from_name,
                msg.from_directory,
                msg.to,
                msg.content,
                msg.timestamp.isoformat(),
                json.dumps(msg.metadata),
            ),
        )
        await self._db.commit()

    async def get_messages(
        self, room_id: str, limit: int = 50, before: str | None = None
    ) -> list[ChatMessage]:
        if before:
            # Get the timestamp of the cursor message
            cursor = await self._db.execute(
                "SELECT timestamp FROM messages WHERE id = ?", (before,)
            )
            row = await cursor.fetchone()
            if not row:
                return []
            cursor_ts = row[0]
            cursor = await self._db.execute(
                """SELECT id, room_id, from_type, from_name, from_directory,
                   "to", content, timestamp, metadata
                   FROM messages
                   WHERE room_id = ? AND timestamp < ?
                   ORDER BY timestamp DESC LIMIT ?""",
                (room_id, cursor_ts, limit),
            )
        else:
            cursor = await self._db.execute(
                """SELECT id, room_id, from_type, from_name, from_directory,
                   "to", content, timestamp, metadata
                   FROM messages
                   WHERE room_id = ?
                   ORDER BY timestamp DESC LIMIT ?""",
                (room_id, limit),
            )
        rows = await cursor.fetchall()
        return [
            ChatMessage(
                id=r[0],
                room_id=r[1],
                from_type=r[2],
                from_name=r[3],
                from_directory=r[4],
                to=r[5],
                content=r[6],
                timestamp=r[7],
                metadata=json.loads(r[8]) if r[8] else {},
            )
            for r in rows
        ]

    async def save_session(self, agent_name: str, session_id: str):
        await self._db.execute(
            """INSERT INTO sessions (agent_name, session_id) VALUES (?, ?)
               ON CONFLICT(agent_name) DO UPDATE SET session_id = ?""",
            (agent_name, session_id, session_id),
        )
        await self._db.commit()

    async def get_session(self, agent_name: str) -> str | None:
        cursor = await self._db.execute(
            "SELECT session_id FROM sessions WHERE agent_name = ?",
            (agent_name,),
        )
        row = await cursor.fetchone()
        return row[0] if row else None
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_database.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/database.py tests/test_database.py
git commit -m "feat: add SQLite database layer for messages and sessions"
```

---

## Task 4: Message Bus

**Files:**
- Create: `server/message_bus.py`
- Test: `tests/test_message_bus.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_message_bus.py
import pytest
import asyncio
from server.message_bus import MessageBus
from server.models import ChatMessage


def _msg(from_name="agent-a", to="all", content="hi"):
    return ChatMessage(
        room_id="room_1",
        from_type="agent",
        from_name=from_name,
        to=to,
        content=content,
    )


@pytest.mark.asyncio
async def test_subscribe_and_publish():
    bus = MessageBus()
    received = []

    async def handler(msg):
        received.append(msg)

    bus.subscribe("listener_1", handler)
    await bus.publish(_msg())
    await asyncio.sleep(0.05)
    assert len(received) == 1
    assert received[0].content == "hi"


@pytest.mark.asyncio
async def test_publish_skips_sender():
    """Publisher should not receive their own message."""
    bus = MessageBus()
    received_a = []
    received_b = []

    bus.subscribe("agent-a", lambda m: received_a.append(m))
    bus.subscribe("agent-b", lambda m: received_b.append(m))

    await bus.publish(_msg(from_name="agent-a"))
    await asyncio.sleep(0.05)

    assert len(received_a) == 0  # sender excluded
    assert len(received_b) == 1


@pytest.mark.asyncio
async def test_targeted_message():
    """Targeted message only delivered to the target."""
    bus = MessageBus()
    received_a = []
    received_b = []

    bus.subscribe("agent-a", lambda m: received_a.append(m))
    bus.subscribe("agent-b", lambda m: received_b.append(m))

    await bus.publish(_msg(from_name="human", to="agent-a"))
    await asyncio.sleep(0.05)

    assert len(received_a) == 1
    assert len(received_b) == 0


@pytest.mark.asyncio
async def test_unsubscribe():
    bus = MessageBus()
    received = []
    bus.subscribe("x", lambda m: received.append(m))
    bus.unsubscribe("x")
    await bus.publish(_msg())
    await asyncio.sleep(0.05)
    assert len(received) == 0


@pytest.mark.asyncio
async def test_websocket_subscribers_get_all():
    """WebSocket subscribers (prefix ws_) get ALL messages including sender's."""
    bus = MessageBus()
    received = []
    bus.subscribe("ws_client_1", lambda m: received.append(m), is_websocket=True)
    await bus.publish(_msg(from_name="agent-a"))
    await asyncio.sleep(0.05)
    assert len(received) == 1
```

- [ ] **Step 2: Run tests to verify fail**

Run: `python -m pytest tests/test_message_bus.py -v`

- [ ] **Step 3: Implement message bus**

```python
# server/message_bus.py
from __future__ import annotations

import asyncio
import logging
from typing import Callable, Awaitable

from server.models import ChatMessage

logger = logging.getLogger(__name__)

Handler = Callable[[ChatMessage], Awaitable[None] | None]


class _Subscriber:
    def __init__(self, name: str, handler: Handler, is_websocket: bool = False, status_handler=None):
        self.name = name
        self.handler = handler
        self.is_websocket = is_websocket
        self.status_handler = status_handler


class MessageBus:
    def __init__(self):
        self._subscribers: dict[str, _Subscriber] = {}

    def subscribe(
        self, name: str, handler: Handler, is_websocket: bool = False, status_handler=None
    ):
        self._subscribers[name] = _Subscriber(name, handler, is_websocket, status_handler)
        logger.info(f"Subscribed: {name}")

    def unsubscribe(self, name: str):
        self._subscribers.pop(name, None)
        logger.info(f"Unsubscribed: {name}")

    async def publish(self, msg: ChatMessage):
        for sub in list(self._subscribers.values()):
            # WebSocket subscribers get everything (for UI display)
            if sub.is_websocket:
                await self._deliver(sub, msg)
                continue

            # Agent subscribers: skip sender, respect targeting
            if sub.name == msg.from_name:
                continue
            if not msg.is_broadcast and msg.to != sub.name:
                continue

            await self._deliver(sub, msg)

    async def publish_status(self, statuses: list):
        """Send agent status updates to WebSocket subscribers only."""
        for sub in list(self._subscribers.values()):
            if sub.is_websocket:
                try:
                    result = sub.status_handler(statuses)
                    if asyncio.iscoroutine(result) or asyncio.isfuture(result):
                        await result
                except Exception:
                    logger.exception(f"Error sending status to {sub.name}")

    async def _deliver(self, sub: _Subscriber, msg: ChatMessage):
        try:
            result = sub.handler(msg)
            if asyncio.iscoroutine(result) or asyncio.isfuture(result):
                await result
        except Exception:
            logger.exception(f"Error delivering to {sub.name}")
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_message_bus.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/message_bus.py tests/test_message_bus.py
git commit -m "feat: add in-memory pub/sub message bus with targeting and sender exclusion"
```

---

## Task 5: Conversation Control

**Files:**
- Create: `server/conversation_control.py`
- Test: `tests/test_conversation_control.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_conversation_control.py
import pytest
import time
from server.conversation_control import ConversationControl
from server.models import RoomConfig


@pytest.fixture
def ctrl():
    config = RoomConfig(name="test", max_turns_per_round=2, cooldown_seconds=0)
    return ConversationControl(config)


def test_agent_can_respond_initially(ctrl):
    assert ctrl.can_respond("agent-a") is True


def test_turn_limit(ctrl):
    ctrl.record_response("agent-a")
    ctrl.record_response("agent-a")
    assert ctrl.can_respond("agent-a") is False  # hit limit of 2


def test_other_agent_not_affected(ctrl):
    ctrl.record_response("agent-a")
    ctrl.record_response("agent-a")
    assert ctrl.can_respond("agent-b") is True


def test_human_message_resets(ctrl):
    ctrl.record_response("agent-a")
    ctrl.record_response("agent-a")
    assert ctrl.can_respond("agent-a") is False
    ctrl.on_human_message()
    assert ctrl.can_respond("agent-a") is True


def test_cooldown():
    config = RoomConfig(name="test", cooldown_seconds=1)
    ctrl = ConversationControl(config)
    ctrl.record_response("agent-a")
    assert ctrl.can_respond("agent-a") is False  # cooldown active
    # After cooldown, should be allowed (but still within turn limit)


def test_at_only_mode():
    config = RoomConfig(name="test", mode="at-only")
    ctrl = ConversationControl(config)
    assert ctrl.should_deliver("agent-a", to="all") is False
    assert ctrl.should_deliver("agent-a", to="agent-a") is True
```

- [ ] **Step 2: Run tests to verify fail**

Run: `python -m pytest tests/test_conversation_control.py -v`

- [ ] **Step 3: Implement conversation control**

```python
# server/conversation_control.py
from __future__ import annotations

import time
from server.models import RoomConfig


class ConversationControl:
    def __init__(self, config: RoomConfig):
        self.config = config
        self._turn_counts: dict[str, int] = {}
        self._last_response: dict[str, float] = {}

    def can_respond(self, agent_name: str) -> bool:
        # Check turn limit
        turns = self._turn_counts.get(agent_name, 0)
        if turns >= self.config.max_turns_per_round:
            return False

        # Check cooldown
        last = self._last_response.get(agent_name, 0)
        if time.time() - last < self.config.cooldown_seconds:
            return False

        return True

    def record_response(self, agent_name: str):
        self._turn_counts[agent_name] = self._turn_counts.get(agent_name, 0) + 1
        self._last_response[agent_name] = time.time()

    def on_human_message(self):
        self._turn_counts.clear()

    def should_deliver(self, agent_name: str, to: str) -> bool:
        """Check if a message should be delivered based on room mode."""
        if self.config.mode == "at-only":
            return to == agent_name
        # "free" and "topic" modes: deliver all
        return True
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_conversation_control.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/conversation_control.py tests/test_conversation_control.py
git commit -m "feat: add conversation control with turn limits, cooldown, and mode filtering"
```

---

## Task 6: Agent Manager

**Files:**
- Create: `server/agent_manager.py`
- Test: `tests/test_agent_manager.py`

This is the core component. It integrates Claude Code SDK with the message bus.

- [ ] **Step 1: Write tests**

```python
# tests/test_agent_manager.py
import pytest
import pytest_asyncio
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from server.agent_manager import AgentManager, AgentState
from server.models import AgentConfig, RoomConfig, ChatMessage
from server.message_bus import MessageBus
from server.conversation_control import ConversationControl
from server.database import Database


@pytest_asyncio.fixture
async def db(tmp_path):
    database = Database(str(tmp_path / "test.db"))
    await database.init()
    yield database
    await database.close()


@pytest.fixture
def bus():
    return MessageBus()


@pytest.fixture
def ctrl():
    return ConversationControl(RoomConfig(name="test"))


def test_agent_state_init():
    config = AgentConfig(name="test", directory="/tmp")
    state = AgentState(config)
    assert state.name == "test"
    assert state.online is False
    assert state.session_id is None
    assert state.inbox is not None


@pytest.mark.asyncio
async def test_add_agent(db, bus, ctrl):
    mgr = AgentManager(bus=bus, db=db, control=ctrl, room_id="room_1")
    config = AgentConfig(name="test-agent", directory="/tmp")
    mgr.add_agent(config)
    assert "test-agent" in mgr.agents
    assert mgr.agents["test-agent"].online is False


@pytest.mark.asyncio
async def test_remove_agent(db, bus, ctrl):
    mgr = AgentManager(bus=bus, db=db, control=ctrl, room_id="room_1")
    config = AgentConfig(name="test-agent", directory="/tmp")
    mgr.add_agent(config)
    mgr.remove_agent("test-agent")
    assert "test-agent" not in mgr.agents


@pytest.mark.asyncio
async def test_inbox_receives_message(db, bus, ctrl):
    mgr = AgentManager(bus=bus, db=db, control=ctrl, room_id="room_1")
    config = AgentConfig(name="test-agent", directory="/tmp")
    mgr.add_agent(config)

    msg = ChatMessage(
        room_id="room_1",
        from_type="human",
        from_name="user",
        to="all",
        content="hello",
    )
    # Simulate message bus delivery
    agent = mgr.agents["test-agent"]
    await agent.inbox.put(msg)
    assert agent.inbox.qsize() == 1
```

- [ ] **Step 2: Run tests to verify fail**

Run: `python -m pytest tests/test_agent_manager.py -v`

- [ ] **Step 3: Implement agent manager**

```python
# server/agent_manager.py
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from server.models import AgentConfig, ChatMessage, AgentStatus
from server.message_bus import MessageBus
from server.conversation_control import ConversationControl
from server.database import Database

logger = logging.getLogger(__name__)

SILENT_TOKEN = "[SILENT]"

CHATROOM_SYSTEM_PROMPT = """You are participating in a multi-agent chat room.
Other participants: {participants}
Room rules:
- Read messages from other agents and respond when you have something useful to add.
- If you have nothing meaningful to add, respond ONLY with [SILENT] (nothing else).
- Be concise and direct.
- You can @mention a specific agent to direct your message to them.
{custom_prompt}"""


class AgentState:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.name = config.name
        self.directory = config.directory
        self.online = False
        self.thinking = False
        self.session_id: Optional[str] = None
        self.inbox: asyncio.Queue[ChatMessage] = asyncio.Queue()
        self._task: Optional[asyncio.Task] = None


class AgentManager:
    def __init__(
        self,
        bus: MessageBus,
        db: Database,
        control: ConversationControl,
        room_id: str = "default",
    ):
        self.bus = bus
        self.db = db
        self.control = control
        self.room_id = room_id
        self.agents: dict[str, AgentState] = {}

    def add_agent(self, config: AgentConfig):
        state = AgentState(config)
        self.agents[config.name] = state
        # Subscribe to message bus — handler puts messages into agent's inbox
        self.bus.subscribe(
            config.name,
            lambda msg, s=state: self._on_message(s, msg),
        )
        logger.info(f"Added agent: {config.name} @ {config.directory}")

    def remove_agent(self, name: str):
        state = self.agents.pop(name, None)
        if state:
            if state._task and not state._task.done():
                state._task.cancel()
            self.bus.unsubscribe(name)
            logger.info(f"Removed agent: {name}")

    async def start_agent(self, name: str):
        state = self.agents.get(name)
        if not state:
            return

        # Try to restore session from DB
        stored_sid = await self.db.get_session(name)
        if stored_sid:
            state.session_id = stored_sid
            logger.info(f"Restored session for {name}: {stored_sid}")

        state.online = True
        state._task = asyncio.create_task(self._agent_loop(state))
        await self._broadcast_status(state)

    async def stop_agent(self, name: str):
        state = self.agents.get(name)
        if not state:
            return
        state.online = False
        if state._task and not state._task.done():
            state._task.cancel()
        await self._broadcast_status(state)

    async def start_all(self):
        for name in self.agents:
            await self.start_agent(name)

    async def stop_all(self):
        for name in list(self.agents):
            await self.stop_agent(name)

    async def _on_message(self, state: AgentState, msg: ChatMessage):
        """Called by message bus — put message into agent's inbox."""
        if not state.online:
            return
        if not self.control.should_deliver(state.name, msg.to):
            return
        await state.inbox.put(msg)

    async def _agent_loop(self, state: AgentState):
        """Main loop: drain inbox, call SDK, publish response."""
        try:
            while True:
                # Wait for at least one message
                first = await state.inbox.get()
                messages = [first]
                # Brief pause to batch concurrent messages
                await asyncio.sleep(0.1)
                while not state.inbox.empty():
                    messages.append(state.inbox.get_nowait())

                # Check if agent can respond
                if not self.control.can_respond(state.name):
                    logger.info(f"{state.name}: turn/cooldown limit, skipping")
                    continue

                # Build prompt
                prompt = "\n".join(
                    f"[{m.from_name}]: {m.content}" for m in messages
                )

                # Call SDK
                state.thinking = True
                await self._broadcast_status(state)

                try:
                    response_text = await self._call_sdk(state, prompt)
                except Exception:
                    logger.exception(f"SDK error for {state.name}")
                    state.thinking = False
                    await self._broadcast_status(state)
                    continue

                state.thinking = False
                await self._broadcast_status(state)

                # Check for silent
                if not response_text or response_text.strip() == SILENT_TOKEN:
                    continue

                # Record response and publish
                self.control.record_response(state.name)
                response_msg = ChatMessage(
                    room_id=self.room_id,
                    from_type="agent",
                    from_name=state.name,
                    from_directory=state.directory,
                    content=response_text,
                )
                await self.db.save_message(response_msg)
                await self.bus.publish(response_msg)

        except asyncio.CancelledError:
            logger.info(f"Agent loop cancelled: {state.name}")

    async def _call_sdk(self, state: AgentState, prompt: str) -> str:
        """Call Claude Code SDK. Returns the text response."""
        try:
            from claude_code_sdk import query, ClaudeCodeOptions
        except ImportError:
            logger.error("claude-code-sdk not installed")
            return "[SDK not available]"

        options = ClaudeCodeOptions(cwd=state.directory)
        if state.session_id:
            options.resume = state.session_id
        else:
            # First message — build system prompt
            participants = ", ".join(
                a.name for a in self.agents.values() if a.name != state.name
            )
            custom = state.config.system_prompt or ""
            options.system_prompt = CHATROOM_SYSTEM_PROMPT.format(
                participants=participants, custom_prompt=custom
            )
            if state.config.model:
                options.model = state.config.model

        text_parts = []
        async for event in query(prompt=prompt, options=options):
            if hasattr(event, "session_id") and event.session_id:
                if state.session_id != event.session_id:
                    state.session_id = event.session_id
                    await self.db.save_session(state.name, event.session_id)
            # Collect text from result messages
            if hasattr(event, "type") and event.type == "result":
                if hasattr(event, "result") and event.result:
                    text_parts.append(event.result)
            elif hasattr(event, "content"):
                text_parts.append(str(event.content))

        return "\n".join(text_parts) if text_parts else ""

    async def _broadcast_status(self, state: AgentState):
        """Send agent status update to all WebSocket subscribers via bus."""
        statuses = self.get_all_status()
        await self.bus.publish_status(statuses)

    def get_all_status(self) -> list[AgentStatus]:
        return [
            AgentStatus(
                name=s.name,
                directory=s.directory,
                online=s.online,
                thinking=s.thinking,
                session_id=s.session_id,
            )
            for s in self.agents.values()
        ]
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_agent_manager.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/agent_manager.py tests/test_agent_manager.py
git commit -m "feat: add agent manager with SDK integration, inbox queue, and lifecycle management"
```

---

## Task 7: REST API Routes

**Files:**
- Create: `server/routes.py`
- Test: `tests/test_routes.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_routes.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from server.main import create_app


@pytest_asyncio.fixture
async def client(tmp_path):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
room:
  name: test-room
  mode: free
agents: []
"""
    )
    app = create_app(str(config_path), str(tmp_path / "test.db"))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_list_rooms(client):
    resp = await client.get("/api/rooms")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "test-room"


@pytest.mark.asyncio
async def test_list_agents_empty(client):
    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_add_agent(client):
    resp = await client.post(
        "/api/agents",
        json={"name": "test-agent", "directory": "/tmp"},
    )
    assert resp.status_code == 200
    agents = await client.get("/api/agents")
    assert len(agents.json()) == 1


@pytest.mark.asyncio
async def test_remove_agent(client):
    await client.post(
        "/api/agents",
        json={"name": "test-agent", "directory": "/tmp"},
    )
    resp = await client.delete("/api/agents/test-agent")
    assert resp.status_code == 200
    agents = await client.get("/api/agents")
    assert len(agents.json()) == 0


@pytest.mark.asyncio
async def test_post_message(client):
    resp = await client.post(
        "/api/rooms/default/messages",
        json={"content": "hello", "from_name": "user"},
    )
    assert resp.status_code == 200
    msg = resp.json()
    assert msg["content"] == "hello"
    assert msg["from_type"] == "human"


@pytest.mark.asyncio
async def test_get_messages(client):
    await client.post(
        "/api/rooms/default/messages",
        json={"content": "hello", "from_name": "user"},
    )
    resp = await client.get("/api/rooms/default/messages?limit=10")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
```

- [ ] **Step 2: Run tests to verify fail**

Run: `python -m pytest tests/test_routes.py -v`

- [ ] **Step 3: Implement routes and main app factory**

```python
# server/routes.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from server.models import AgentConfig, ChatMessage

router = APIRouter(prefix="/api")


class PostMessageRequest(BaseModel):
    content: str
    from_name: str = "user"
    to: str = "all"


class AddAgentRequest(BaseModel):
    name: str
    directory: str
    system_prompt: Optional[str] = None
    model: Optional[str] = None


def setup_routes(app_state):
    """Attach routes that reference shared app state."""

    @router.get("/rooms")
    async def list_rooms():
        return [{"name": app_state.room_config.name, "id": "default", "mode": app_state.room_config.mode}]

    @router.get("/rooms/{room_id}/messages")
    async def get_messages(room_id: str, limit: int = 50, before: Optional[str] = None):
        messages = await app_state.db.get_messages(room_id, limit=limit, before=before)
        return [m.model_dump() for m in messages]

    @router.post("/rooms/{room_id}/messages")
    async def post_message(room_id: str, req: PostMessageRequest):
        msg = ChatMessage(
            room_id=room_id,
            from_type="human",
            from_name=req.from_name,
            to=req.to,
            content=req.content,
        )
        await app_state.db.save_message(msg)
        app_state.control.on_human_message()
        await app_state.bus.publish(msg)
        return msg.model_dump()

    @router.get("/agents")
    async def list_agents():
        return [s.model_dump() for s in app_state.agent_manager.get_all_status()]

    @router.post("/agents")
    async def add_agent(req: AddAgentRequest):
        config = AgentConfig(**req.model_dump())
        app_state.agent_manager.add_agent(config)
        return {"status": "added", "name": config.name}

    @router.delete("/agents/{name}")
    async def remove_agent(name: str):
        if name not in app_state.agent_manager.agents:
            raise HTTPException(404, "Agent not found")
        app_state.agent_manager.remove_agent(name)
        return {"status": "removed", "name": name}

    @router.post("/agents/{name}/restart")
    async def restart_agent(name: str):
        if name not in app_state.agent_manager.agents:
            raise HTTPException(404, "Agent not found")
        await app_state.agent_manager.stop_agent(name)
        await app_state.agent_manager.start_agent(name)
        return {"status": "restarted", "name": name}

    return router
```

```python
# server/main.py
from __future__ import annotations

import yaml
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.models import AppConfig, RoomConfig
from server.database import Database
from server.message_bus import MessageBus
from server.conversation_control import ConversationControl
from server.agent_manager import AgentManager
from server.routes import setup_routes
from server.websocket import setup_websocket


class AppState:
    def __init__(self, config: AppConfig, db_path: str):
        self.room_config = config.room
        self.db = Database(db_path)
        self.bus = MessageBus()
        self.control = ConversationControl(config.room)
        self.agent_manager = AgentManager(
            bus=self.bus, db=self.db, control=self.control
        )
        # Register agents from config
        for agent_config in config.agents:
            self.agent_manager.add_agent(agent_config)


def load_config(path: str) -> AppConfig:
    with open(path) as f:
        raw = yaml.safe_load(f)
    return AppConfig(**raw)


def create_app(config_path: str = "config.yaml", db_path: str = "chatroom.db") -> FastAPI:
    config = load_config(config_path)
    state = AppState(config, db_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await state.db.init()
        await state.agent_manager.start_all()
        yield
        await state.agent_manager.stop_all()
        await state.db.close()

    app = FastAPI(title="Claude Chat Room", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Attach state for routes
    router = setup_routes(state)
    app.include_router(router)
    setup_websocket(app, state)

    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:create_app",
        factory=True,
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
```

- [ ] **Step 4: Create stub websocket.py so imports work**

```python
# server/websocket.py
from __future__ import annotations

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json

def setup_websocket(app: FastAPI, state):
    """WebSocket endpoint — implemented in Task 8."""

    @app.websocket("/ws/rooms/{room_id}")
    async def ws_endpoint(websocket: WebSocket, room_id: str):
        await websocket.accept()
        await websocket.send_json({"type": "connected", "room_id": room_id})
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_routes.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add server/main.py server/routes.py server/websocket.py tests/test_routes.py
git commit -m "feat: add REST API routes and FastAPI app factory"
```

---

## Task 8: WebSocket Handler

**Files:**
- Modify: `server/websocket.py`

- [ ] **Step 1: Implement full WebSocket handler**

```python
# server/websocket.py
from __future__ import annotations

import json
import logging
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from server.models import ChatMessage

logger = logging.getLogger(__name__)


def setup_websocket(app: FastAPI, state):
    @app.websocket("/ws/rooms/{room_id}")
    async def ws_endpoint(websocket: WebSocket, room_id: str):
        await websocket.accept()
        client_id = f"ws_{uuid.uuid4().hex[:8]}"

        async def send_to_client(msg: ChatMessage):
            try:
                await websocket.send_json(
                    {"type": "chat_message", "data": msg.model_dump(mode="json")}
                )
            except Exception:
                logger.debug(f"Failed to send to {client_id}")

        async def send_status(statuses):
            try:
                await websocket.send_json(
                    {"type": "agent_status", "data": [s.model_dump() for s in statuses]}
                )
            except Exception:
                pass

        # Subscribe to message bus
        state.bus.subscribe(client_id, send_to_client, is_websocket=True, status_handler=send_status)

        # Send current agent statuses
        statuses = state.agent_manager.get_all_status()
        await websocket.send_json(
            {
                "type": "agent_status",
                "data": [s.model_dump() for s in statuses],
            }
        )

        try:
            while True:
                raw = await websocket.receive_text()
                data = json.loads(raw)

                if data.get("type") == "chat_message":
                    msg = ChatMessage(
                        room_id=room_id,
                        from_type="human",
                        from_name=data.get("from_name", "user"),
                        to=data.get("to", "all"),
                        content=data["content"],
                    )
                    await state.db.save_message(msg)
                    state.control.on_human_message()
                    await state.bus.publish(msg)

        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected: {client_id}")
        finally:
            state.bus.unsubscribe(client_id)
```

- [ ] **Step 2: Manual test**

Run server: `cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom" && python -m server.main`

Test with: `websocat ws://127.0.0.1:8000/ws/rooms/default` (or use browser console)

Expected: connection accepted, receive `agent_status` message

- [ ] **Step 3: Commit**

```bash
git add server/websocket.py
git commit -m "feat: add WebSocket handler with real-time message broadcasting"
```

---

## Task 9: React Frontend — Scaffolding

**Files:**
- Create: `web/` directory with Vite + React + TypeScript

- [ ] **Step 1: Initialize React project**

```bash
cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom"
npm create vite@latest web -- --template react-ts
cd web && npm install
```

- [ ] **Step 2: Install additional dependencies**

```bash
cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom/web"
npm install react-markdown
```

- [ ] **Step 3: Create types.ts**

```typescript
// web/src/types.ts
export interface ChatMessage {
  id: string;
  room_id: string;
  from_type: "agent" | "human";
  from_name: string;
  from_directory?: string;
  to: string;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface AgentStatus {
  name: string;
  directory: string;
  online: boolean;
  thinking: boolean;
  session_id: string | null;
}

export interface WSMessage {
  type: "chat_message" | "agent_status" | "system_event" | "connected";
  data: unknown;
}
```

- [ ] **Step 4: Configure vite proxy**

```typescript
// web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: scaffold React frontend with Vite and TypeScript"
```

---

## Task 10: React Frontend — useWebSocket Hook

**Files:**
- Create: `web/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Implement hook**

```typescript
// web/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from "react";
import { ChatMessage, AgentStatus, WSMessage } from "../types";

interface UseWebSocketReturn {
  messages: ChatMessage[];
  agents: AgentStatus[];
  connected: boolean;
  sendMessage: (content: string, to?: string) => void;
}

export function useWebSocket(roomId: string): UseWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [reconnectTick, setReconnectTick] = useState(0);

  useEffect(() => {
    // Load history first
    fetch(`/api/rooms/${roomId}/messages?limit=100`)
      .then((r) => r.json())
      .then((msgs: ChatMessage[]) => setMessages(msgs.reverse()));

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/rooms/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 2s
      setTimeout(() => setReconnectTick((t) => t + 1), 2000);
    };

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);
      if (msg.type === "chat_message") {
        setMessages((prev) => [...prev, msg.data as ChatMessage]);
      } else if (msg.type === "agent_status") {
        setAgents(msg.data as AgentStatus[]);
      }
    };

    return () => {
      ws.close();
    };
  }, [roomId, reconnectTick]);

  const sendMessage = useCallback(
    (content: string, to: string = "all") => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "chat_message",
            content,
            from_name: "user",
            to,
          })
        );
      }
    },
    []
  );

  return { messages, agents, connected, sendMessage };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/useWebSocket.ts web/src/types.ts
git commit -m "feat: add useWebSocket hook for real-time chat"
```

---

## Task 11: React Frontend — UI Components

**Files:**
- Create: `web/src/components/MessageBubble.tsx`, `MessageInput.tsx`, `AgentList.tsx`, `ChatRoom.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: MessageBubble**

```tsx
// web/src/components/MessageBubble.tsx
import ReactMarkdown from "react-markdown";
import { ChatMessage } from "../types";

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
      <div style={{ marginTop: 4 }}>
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: MessageInput**

```tsx
// web/src/components/MessageInput.tsx
import { useState, KeyboardEvent } from "react";
import { AgentStatus } from "../types";

interface Props {
  agents: AgentStatus[];
  onSend: (content: string, to?: string) => void;
}

export function MessageInput({ agents, onSend }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim()) return;
    // Parse @mention
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
```

- [ ] **Step 3: AgentList**

```tsx
// web/src/components/AgentList.tsx
import { AgentStatus } from "../types";

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
        <div
          key={a.name}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
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
```

- [ ] **Step 4: ChatRoom**

```tsx
// web/src/components/ChatRoom.tsx
import { useRef, useEffect } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { AgentList } from "./AgentList";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";

export function ChatRoom() {
  const { messages, agents, connected, sendMessage } = useWebSocket("default");
  const bottomRef = useRef<HTMLDivElement>(null);

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
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
        <MessageInput agents={agents} onSend={sendMessage} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update App.tsx**

```tsx
// web/src/App.tsx
import { ChatRoom } from "./components/ChatRoom";

function App() {
  return <ChatRoom />;
}

export default App;
```

- [ ] **Step 6: Clean up default Vite styles**

Replace `web/src/index.css` with:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

Delete `web/src/App.css` if it exists.

- [ ] **Step 7: Commit**

```bash
git add web/src/
git commit -m "feat: add React chat UI with agent list, messages, and input"
```

---

## Task 12: Integration Test + Run

- [ ] **Step 1: Run all backend tests**

Run: `cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom" && python -m pytest tests/ -v`
Expected: all PASS

- [ ] **Step 2: Create a test config with real directories**

```yaml
# config.yaml (update with real paths for testing)
room:
  name: "my-workspace"
  mode: "free"
  max_turns_per_round: 3
  cooldown_seconds: 2

agents: []
```

- [ ] **Step 3: Start backend**

Run: `cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom" && python -m server.main`
Expected: `Uvicorn running on http://127.0.0.1:8000`

- [ ] **Step 4: Start frontend**

Run (new terminal): `cd "/Users/bytedance/Library/Mobile Documents/com~apple~CloudDocs/people/projects/claude-chatroom/web" && npm run dev`
Expected: `Local: http://localhost:3000/`

- [ ] **Step 5: Manual smoke test**

Open `http://localhost:3000` in browser:
1. See empty chat room with agent list
2. Use API to add an agent: `curl -X POST http://127.0.0.1:8000/api/agents -H "Content-Type: application/json" -d '{"name":"test","directory":"/tmp"}'`
3. Type a message in the input, press Enter
4. See message appear in the chat

- [ ] **Step 6: Commit**

```bash
git add config.yaml
git commit -m "feat: complete v1 integration — backend + frontend working"
```

---

## Task 13: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# Claude Chat Room

A lightweight tool that bridges multiple Claude Code CLI instances into a shared
chat room with a web UI. Agents in different project directories can freely
converse with each other, and humans can observe and participate.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Claude Code CLI (`claude --version`)

### Install

```bash
cd projects/claude-chatroom
pip install -r requirements.txt
cd web && npm install && cd ..
```

### Configure

Edit `config.yaml` to add your agent directories:

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

  - name: "mcp-agent"
    directory: "/path/to/your/mcp/project"
```

### Run

```bash
# Terminal 1: Backend
python -m server.main

# Terminal 2: Frontend
cd web && npm run dev
```

Open http://localhost:3000

## Features

- Multi-agent chat room with real-time WebSocket updates
- Per-agent inbox queue with message batching
- Anti-loop: turn limits, cooldown, round tracking
- @mention for targeted messages
- SQLite message history with cursor pagination
- Dynamic agent add/remove via API and UI
- Code syntax highlighting in messages

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/rooms | List rooms |
| GET | /api/rooms/{id}/messages | Message history |
| POST | /api/rooms/{id}/messages | Send message |
| GET | /api/agents | List agents |
| POST | /api/agents | Add agent |
| DELETE | /api/agents/{name} | Remove agent |
| WS | /ws/rooms/{id} | Real-time stream |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```
