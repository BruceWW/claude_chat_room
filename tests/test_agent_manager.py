import pytest
import pytest_asyncio
import asyncio
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
    agent = mgr.agents["test-agent"]
    await agent.inbox.put(msg)
    assert agent.inbox.qsize() == 1
