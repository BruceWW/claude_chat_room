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
