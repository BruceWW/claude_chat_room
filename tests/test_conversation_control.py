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
    assert ctrl.can_respond("agent-a") is False


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
    assert ctrl.can_respond("agent-a") is False


def test_should_deliver_always_true():
    config = RoomConfig(name="test")
    ctrl = ConversationControl(config)
    assert ctrl.should_deliver("agent-a", to="all") is True
    assert ctrl.should_deliver("agent-a", to="agent-a") is True
