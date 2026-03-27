import pytest
import asyncio
from server.message_bus import MessageBus
from server.models import ChatMessage


def _msg(from_name="agent-a", to="all", content="hi"):
    return ChatMessage(
        room_id="room_1",
        from_type="agent",
        from_name=from_name,
        to=to,
        content=content,
    )


@pytest.mark.asyncio
async def test_subscribe_and_publish():
    bus = MessageBus()
    received = []

    async def handler(msg):
        received.append(msg)

    bus.subscribe("listener_1", handler)
    await bus.publish(_msg())
    await asyncio.sleep(0.05)
    assert len(received) == 1
    assert received[0].content == "hi"


@pytest.mark.asyncio
async def test_publish_skips_sender():
    bus = MessageBus()
    received_a = []
    received_b = []

    bus.subscribe("agent-a", lambda m: received_a.append(m))
    bus.subscribe("agent-b", lambda m: received_b.append(m))

    await bus.publish(_msg(from_name="agent-a"))
    await asyncio.sleep(0.05)

    assert len(received_a) == 0
    assert len(received_b) == 1


@pytest.mark.asyncio
async def test_targeted_message():
    bus = MessageBus()
    received_a = []
    received_b = []

    bus.subscribe("agent-a", lambda m: received_a.append(m))
    bus.subscribe("agent-b", lambda m: received_b.append(m))

    await bus.publish(_msg(from_name="human", to="agent-a"))
    await asyncio.sleep(0.05)

    assert len(received_a) == 1
    assert len(received_b) == 0


@pytest.mark.asyncio
async def test_unsubscribe():
    bus = MessageBus()
    received = []
    bus.subscribe("x", lambda m: received.append(m))
    bus.unsubscribe("x")
    await bus.publish(_msg())
    await asyncio.sleep(0.05)
    assert len(received) == 0


@pytest.mark.asyncio
async def test_websocket_subscribers_get_all():
    bus = MessageBus()
    received = []
    bus.subscribe("ws_client_1", lambda m: received.append(m), is_websocket=True)
    await bus.publish(_msg(from_name="agent-a"))
    await asyncio.sleep(0.05)
    assert len(received) == 1
