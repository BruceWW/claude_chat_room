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
                if msg.from_type == "system":
                    await websocket.send_json(
                        {"type": "system_event", "data": msg.metadata}
                    )
                else:
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
                    raw_to = data.get("to")
                    if isinstance(raw_to, list) and raw_to:
                        to = raw_to
                    elif isinstance(raw_to, str) and raw_to and raw_to != "all":
                        to = [raw_to]
                    else:
                        to = None
                    msg = ChatMessage(
                        room_id=room_id,
                        from_type="human",
                        from_name=data.get("from_name", "user"),
                        to=to,
                        content=data["content"],
                    )
                    await state.db.save_message(msg)
                    state.control.on_human_message()
                    await state.bus.publish(msg)

        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected: {client_id}")
        finally:
            state.bus.unsubscribe(client_id)
