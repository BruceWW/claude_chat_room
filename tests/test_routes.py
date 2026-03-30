# tests/test_routes.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from server.main import create_app, AppState, load_config


@pytest_asyncio.fixture
async def client(tmp_path):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
room:
  name: test-room
agents: []
"""
    )
    db_path = str(tmp_path / "test.db")
    app = create_app(str(config_path), db_path)

    # Get the state from the app and init DB directly
    state = app.state_obj
    await state.db.init()

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    finally:
        await state.db.close()


@pytest.mark.asyncio
async def test_list_rooms(client):
    resp = await client.get("/api/rooms")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "test-room"


@pytest.mark.asyncio
async def test_list_agents_empty(client):
    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_add_agent(client):
    resp = await client.post(
        "/api/agents",
        json={"name": "test-agent", "directory": "/tmp"},
    )
    assert resp.status_code == 200
    agents = await client.get("/api/agents")
    assert len(agents.json()) == 1


@pytest.mark.asyncio
async def test_remove_agent(client):
    await client.post(
        "/api/agents",
        json={"name": "test-agent", "directory": "/tmp"},
    )
    resp = await client.delete("/api/agents/test-agent")
    assert resp.status_code == 200
    agents = await client.get("/api/agents")
    assert len(agents.json()) == 0


@pytest.mark.asyncio
async def test_post_message(client):
    resp = await client.post(
        "/api/rooms/default/messages",
        json={"content": "hello", "from_name": "user"},
    )
    assert resp.status_code == 200
    msg = resp.json()
    assert msg["content"] == "hello"
    assert msg["from_type"] == "human"


@pytest.mark.asyncio
async def test_get_messages(client):
    await client.post(
        "/api/rooms/default/messages",
        json={"content": "hello", "from_name": "user"},
    )
    resp = await client.get("/api/rooms/default/messages?limit=10")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
