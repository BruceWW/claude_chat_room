import pytest
import pytest_asyncio
from server.database import Database
from server.models import ChatMessage


@pytest_asyncio.fixture
async def db(tmp_path):
    database = Database(str(tmp_path / "test.db"))
    await database.init()
    yield database
    await database.close()


@pytest.mark.asyncio
async def test_save_and_get_messages(db):
    msg = ChatMessage(
        room_id="room_1",
        from_type="agent",
        from_name="cdp-agent",
        content="hello",
    )
    await db.save_message(msg)
    messages = await db.get_messages("room_1", limit=10)
    assert len(messages) == 1
    assert messages[0].content == "hello"


@pytest.mark.asyncio
async def test_get_messages_pagination(db):
    for i in range(5):
        msg = ChatMessage(
            room_id="room_1",
            from_type="agent",
            from_name="agent",
            content=f"msg {i}",
        )
        await db.save_message(msg)

    all_msgs = await db.get_messages("room_1", limit=50)
    assert len(all_msgs) == 5

    page = await db.get_messages("room_1", limit=2)
    assert len(page) == 2

    before_id = all_msgs[2].id
    older = await db.get_messages("room_1", limit=50, before=before_id)
    assert all(m.timestamp < all_msgs[2].timestamp for m in older)


@pytest.mark.asyncio
async def test_save_and_get_session(db):
    await db.save_session("cdp-agent", "sess_abc")
    sid = await db.get_session("cdp-agent")
    assert sid == "sess_abc"


@pytest.mark.asyncio
async def test_update_session(db):
    await db.save_session("cdp-agent", "sess_1")
    await db.save_session("cdp-agent", "sess_2")
    sid = await db.get_session("cdp-agent")
    assert sid == "sess_2"
