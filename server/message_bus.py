from __future__ import annotations

import asyncio
import logging
from typing import Callable, Awaitable

from server.models import ChatMessage

logger = logging.getLogger(__name__)

Handler = Callable[[ChatMessage], Awaitable[None] | None]


class _Subscriber:
    def __init__(self, name: str, handler: Handler, is_websocket: bool = False,
                 status_handler=None, raw_handler=None):
        self.name = name
        self.handler = handler
        self.is_websocket = is_websocket
        self.status_handler = status_handler
        self.raw_handler = raw_handler  # sends arbitrary JSON to WS clients


class MessageBus:
    def __init__(self):
        self._subscribers: dict[str, _Subscriber] = {}

    def subscribe(
        self, name: str, handler: Handler, is_websocket: bool = False,
        status_handler=None, raw_handler=None,
    ):
        self._subscribers[name] = _Subscriber(name, handler, is_websocket, status_handler, raw_handler)
        logger.info(f"Subscribed: {name}")

    def unsubscribe(self, name: str):
        self._subscribers.pop(name, None)
        logger.info(f"Unsubscribed: {name}")

    async def publish(self, msg: ChatMessage):
        for sub in list(self._subscribers.values()):
            if sub.is_websocket:
                await self._deliver(sub, msg)
                continue
            if sub.name == msg.from_name:
                continue
            if not msg.is_broadcast and sub.name not in msg.to:
                continue
            await self._deliver(sub, msg)

    async def publish_status(self, statuses: list):
        for sub in list(self._subscribers.values()):
            if sub.is_websocket and sub.status_handler:
                try:
                    result = sub.status_handler(statuses)
                    if asyncio.iscoroutine(result) or asyncio.isfuture(result):
                        await result
                except Exception:
                    logger.exception(f"Error sending status to {sub.name}")

    async def publish_raw(self, data: dict):
        """Send arbitrary JSON to all WebSocket clients."""
        for sub in list(self._subscribers.values()):
            if sub.is_websocket and sub.raw_handler:
                try:
                    result = sub.raw_handler(data)
                    if asyncio.iscoroutine(result) or asyncio.isfuture(result):
                        await result
                except Exception:
                    logger.exception(f"Error sending raw data to {sub.name}")

    async def _deliver(self, sub: _Subscriber, msg: ChatMessage):
        try:
            result = sub.handler(msg)
            if asyncio.iscoroutine(result) or asyncio.isfuture(result):
                await result
        except Exception:
            logger.exception(f"Error delivering to {sub.name}")
