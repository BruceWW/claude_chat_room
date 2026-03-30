# server/routes.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

import yaml

from server.models import AgentConfig, AppConfig, ChatMessage

class PostMessageRequest(BaseModel):
    content: str
    from_name: str = "user"
    to: str = "all"


class AddAgentRequest(BaseModel):
    name: str
    directory: str
    system_prompt: Optional[str] = None
    model: Optional[str] = None


class SaveConfigRequest(BaseModel):
    content: str


def setup_routes(app_state):
    router = APIRouter(prefix="/api")

    @router.get("/rooms")
    async def list_rooms():
        return [{"name": app_state.room_config.name, "id": "default"}]

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

    @router.get("/config")
    async def get_config():
        with open(app_state.config_path) as f:
            return {"content": f.read()}

    @router.put("/config")
    async def save_config(req: SaveConfigRequest):
        # Validate YAML and schema
        try:
            raw = yaml.safe_load(req.content)
            AppConfig(**raw)
        except Exception as e:
            raise HTTPException(400, f"Invalid config: {e}")

        with open(app_state.config_path, "w") as f:
            f.write(req.content)
        return {"status": "saved"}

    @router.delete("/rooms/{room_id}/messages")
    async def clear_messages(room_id: str):
        await app_state.db.clear_all(room_id)
        await app_state.agent_manager.stop_all()
        for state in app_state.agent_manager.agents.values():
            state.session_id = None
        await app_state.agent_manager.start_all()
        event = ChatMessage(
            room_id=room_id,
            from_type="system",
            from_name="system",
            content="messages_cleared",
            metadata={"event": "messages_cleared"},
        )
        await app_state.bus.publish(event)
        return {"ok": True}

    @router.post("/restart")
    async def restart_service():
        try:
            with open(app_state.config_path) as f:
                raw = yaml.safe_load(f.read())
            new_config = AppConfig(**raw)
        except Exception as e:
            raise HTTPException(400, f"Config error: {e}")

        # Stop and remove all existing agents
        await app_state.agent_manager.stop_all()
        for name in list(app_state.agent_manager.agents):
            app_state.agent_manager.remove_agent(name)

        # Apply new room config
        app_state.room_config = new_config.room
        app_state.control.config = new_config.room
        app_state.control._turn_counts.clear()

        # Re-register and start agents from new config
        for agent_config in new_config.agents:
            app_state.agent_manager.add_agent(agent_config)
        await app_state.agent_manager.start_all()

        return {"status": "restarted"}

    return router
