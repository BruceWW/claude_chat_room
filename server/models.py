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
    permission_mode: str = "default"  # default | acceptEdits | bypassPermissions
    allowed_tools: list[str] = Field(default_factory=list)  # e.g. ["Read", "Glob", "Grep"]


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
