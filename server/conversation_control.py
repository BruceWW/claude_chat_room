from __future__ import annotations

import time
from server.models import RoomConfig


class ConversationControl:
    def __init__(self, config: RoomConfig):
        self.config = config
        self._turn_counts: dict[str, int] = {}
        self._last_response: dict[str, float] = {}

    def can_respond(self, agent_name: str) -> bool:
        turns = self._turn_counts.get(agent_name, 0)
        if turns >= self.config.max_turns_per_round:
            return False
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
        return True
