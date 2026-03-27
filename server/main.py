# server/main.py
from __future__ import annotations

import os
import yaml
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server.models import AppConfig
from server.database import Database
from server.message_bus import MessageBus
from server.conversation_control import ConversationControl
from server.agent_manager import AgentManager
from server.routes import setup_routes
from server.websocket import setup_websocket


class AppState:
    def __init__(self, config: AppConfig, db_path: str, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.room_config = config.room
        self.db = Database(db_path)
        self.bus = MessageBus()
        self.control = ConversationControl(config.room)
        self.agent_manager = AgentManager(
            bus=self.bus, db=self.db, control=self.control
        )
        for agent_config in config.agents:
            self.agent_manager.add_agent(agent_config)


def load_config(path: str) -> AppConfig:
    with open(path) as f:
        raw = yaml.safe_load(f)
    return AppConfig(**raw)


def create_app(config_path: str = "config.yaml", db_path: str = "chatroom.db") -> FastAPI:
    config = load_config(config_path)
    state = AppState(config, db_path, config_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await state.db.init()
        await state.agent_manager.start_all()
        yield
        await state.agent_manager.stop_all()
        await state.db.close()

    app = FastAPI(title="Claude Chat Room", lifespan=lifespan)
    app.state_obj = state  # expose state for testing
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    router = setup_routes(state)
    app.include_router(router)
    setup_websocket(app, state)

    # Serve frontend static files if built
    static_dir = Path(__file__).parent.parent / "web" / "dist"
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")

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
