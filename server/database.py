from __future__ import annotations

import json

import aiosqlite


def _parse_to(raw: str | None) -> list[str] | None:
    """Robustly parse the 'to' DB column regardless of legacy format."""
    if raw is None:
        return None
    try:
        val = json.loads(raw)
        if isinstance(val, list):
            return val or None
        if isinstance(val, str):
            return None if val in ("all", "") else [val]
    except Exception:
        pass
    # plain string fallback (not valid JSON)
    return None if raw in ("all", "") else [raw]
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
                "to" TEXT,
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
        # Migrate old string values to JSON array format
        # "all" or NULL → NULL (broadcast)
        await self._db.execute(
            'UPDATE messages SET "to" = NULL WHERE "to" = \'all\''
        )
        # plain string "pm" → '["pm"]'
        await self._db.execute(
            """UPDATE messages SET "to" = '["' || "to" || '"]'
               WHERE "to" IS NOT NULL
               AND substr("to", 1, 1) != '['
               AND substr("to", 1, 1) != '"'"""
        )
        # JSON-encoded string '"pm"' → '["pm"]'
        await self._db.execute(
            """UPDATE messages SET "to" = '[' || "to" || ']'
               WHERE "to" IS NOT NULL
               AND substr("to", 1, 1) = '"'
               AND substr("to", length("to"), 1) = '"'"""
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
                json.dumps(msg.to) if msg.to is not None else None,
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
                to=_parse_to(r[5]),
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

    async def clear_all(self, room_id: str) -> None:
        await self._db.execute("DELETE FROM messages WHERE room_id = ?", (room_id,))
        await self._db.execute("DELETE FROM sessions")
        await self._db.commit()
