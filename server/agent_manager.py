from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from server.models import AgentConfig, ChatMessage, AgentStatus
from server.message_bus import MessageBus
from server.conversation_control import ConversationControl
from server.database import Database

logger = logging.getLogger(__name__)

SILENT_TOKEN = "[SILENT]"

CHATROOM_SYSTEM_PROMPT = """You are participating in a multi-agent chat room.
Other participants: {participants}
The human user's name is "user".

ROUTING RULES:
- @mention IS message routing. To talk to someone, @mention them.
  "@dcc what time?" → sends to dcc. "@user the answer is X" → sends to user.
- To delegate a task to another agent, @mention that agent.
- When reporting results back, @mention the person who asked you.

WHEN TO USE [SILENT] (respond ONLY with [SILENT], nothing else):
- After you have relayed information to the person who asked — task is done, stop.
- When someone says "thanks", "got it", "ok" — do NOT reply, use [SILENT].
- When you receive information that completes YOUR task and you've already reported back.
- When the conversation is clearly finished and no action is needed.
- When in doubt, prefer [SILENT] over small talk.

Be concise. Do not make small talk. Answer the question, relay the result, then stop.
{custom_prompt}"""



class AgentState:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.name = config.name
        self.directory = config.directory
        self.online = False
        self.thinking = False
        self.session_id: Optional[str] = None
        self.inbox: asyncio.Queue[ChatMessage] = asyncio.Queue()
        # Delegation tracking: when this agent delegates to another,
        # remember who originally asked so we can route the result back.
        # Key: delegated_to agent name, Value: original requester name
        self.pending_delegations: dict[str, str] = {}
        self._task: Optional[asyncio.Task] = None


class AgentManager:
    def __init__(
        self,
        bus: MessageBus,
        db: Database,
        control: ConversationControl,
        room_id: str = "default",
    ):
        self.bus = bus
        self.db = db
        self.control = control
        self.room_id = room_id
        self.agents: dict[str, AgentState] = {}

    def add_agent(self, config: AgentConfig):
        state = AgentState(config)
        self.agents[config.name] = state
        self.bus.subscribe(
            config.name,
            lambda msg, s=state: self._on_message(s, msg),
        )
        logger.info(f"Added agent: {config.name} @ {config.directory}")

    def remove_agent(self, name: str):
        state = self.agents.pop(name, None)
        if state:
            if state._task and not state._task.done():
                state._task.cancel()
            self.bus.unsubscribe(name)
            logger.info(f"Removed agent: {name}")

    async def start_agent(self, name: str):
        state = self.agents.get(name)
        if not state:
            return
        stored_sid = await self.db.get_session(name)
        if stored_sid:
            state.session_id = stored_sid
            logger.info(f"Restored session for {name}: {stored_sid}")
        state.online = True
        state._task = asyncio.create_task(self._agent_loop(state))
        await self._broadcast_status(state)

    async def stop_agent(self, name: str):
        state = self.agents.get(name)
        if not state:
            return
        state.online = False
        if state._task and not state._task.done():
            state._task.cancel()
        await self._broadcast_status(state)

    async def start_all(self):
        for name in self.agents:
            await self.start_agent(name)

    async def stop_all(self):
        for name in list(self.agents):
            await self.stop_agent(name)

    async def _on_message(self, state: AgentState, msg: ChatMessage):
        if not state.online:
            return
        if not self.control.should_deliver(state.name, msg.to):
            return
        await state.inbox.put(msg)

    async def _agent_loop(self, state: AgentState):
        try:
            while True:
                first = await state.inbox.get()
                messages = [first]
                await asyncio.sleep(0.1)
                while not state.inbox.empty():
                    messages.append(state.inbox.get_nowait())

                if not self.control.can_respond(state.name):
                    logger.info(f"{state.name}: turn/cooldown limit, skipping")
                    continue

                prompt = "\n".join(
                    f"[{m.from_name}]: {m.content}" for m in messages
                )

                state.thinking = True
                await self._broadcast_status(state)

                try:
                    response_text = await self._call_sdk(state, prompt)
                except Exception:
                    logger.exception(f"SDK error for {state.name}")
                    state.thinking = False
                    await self._broadcast_status(state)
                    continue

                state.thinking = False
                await self._broadcast_status(state)

                if not response_text or response_text.strip() == SILENT_TOKEN:
                    continue

                self.control.record_response(state.name)

                # === ROUTING LOGIC ===
                # Three cases:
                #
                # Case 1: Delegation return — we previously delegated to
                #   agent X, and now X replied. Route result back to whoever
                #   originally asked us.
                #
                # Case 2: New delegation — response @mentions another agent.
                #   Route to that agent. Remember who asked us (for case 1).
                #
                # Case 3: Normal reply — no delegation involved.
                #   Targeted input → reply to sender.
                #   Broadcast input → broadcast.

                reply_to = "all"
                skip_delivery = False
                sender = messages[0].from_name
                known_names = set(self.agents.keys()) | {"user"}

                # Case 1: check if this is a delegation return
                if sender in state.pending_delegations:
                    original_requester = state.pending_delegations.pop(sender)
                    reply_to = original_requester
                    logger.info(
                        f"{state.name}: delegation return from {sender}, "
                        f"routing to {original_requester}"
                    )
                else:
                    # Parse @mention for potential new delegation
                    mention_match = re.search(
                        r"@([a-zA-Z0-9_-]+)", response_text
                    )
                    mentioned = None
                    if mention_match:
                        m = mention_match.group(1)
                        if m in known_names and m != state.name and m != sender:
                            mentioned = m

                    if mentioned and mentioned in self.agents:
                        # Case 2: delegating to another agent
                        reply_to = mentioned
                        state.pending_delegations[mentioned] = sender
                        logger.info(
                            f"{state.name}: delegating to {mentioned}, "
                            f"will return result to {sender}"
                        )
                    else:
                        # Case 3: normal reply
                        targeted_msgs = [
                            m for m in messages if not m.is_broadcast
                        ]
                        if mentioned:
                            # @mention a known name (e.g. @user)
                            reply_to = mentioned
                        elif targeted_msgs:
                            reply_to = targeted_msgs[0].from_name
                        # else: broadcast (reply_to stays "all")

                        # Ping-pong detection: agent→agent with no
                        # delegation, no @mention, AND the target agent is
                        # NOT expecting our reply (no pending delegation
                        # from them to us) → likely small talk, skip.
                        if (
                            reply_to in self.agents
                            and not mentioned
                            and any(m.from_type == "agent" for m in messages)
                        ):
                            target_state = self.agents.get(reply_to)
                            target_expects_reply = (
                                target_state
                                and state.name in target_state.pending_delegations
                            )
                            if not target_expects_reply:
                                skip_delivery = True
                                logger.info(
                                    f"{state.name} → {reply_to}: no delegation/"
                                    f"@mention, skipping to prevent loop"
                                )

                response_msg = ChatMessage(
                    room_id=self.room_id,
                    from_type="agent",
                    from_name=state.name,
                    from_directory=state.directory,
                    to=reply_to,
                    content=response_text,
                )
                await self.db.save_message(response_msg)
                if skip_delivery:
                    for sub in list(self.bus._subscribers.values()):
                        if sub.is_websocket:
                            await self.bus._deliver(sub, response_msg)
                else:
                    await self.bus.publish(response_msg)

        except asyncio.CancelledError:
            logger.info(f"Agent loop cancelled: {state.name}")

    async def _call_sdk(self, state: AgentState, prompt: str) -> str:
        try:
            from claude_code_sdk import query, ClaudeCodeOptions
        except ImportError:
            logger.error("claude-code-sdk not installed")
            return "[SDK not available]"

        options = ClaudeCodeOptions(cwd=state.directory)

        # Permission settings
        if state.config.permission_mode == "bypassPermissions":
            options.permission_mode = "bypassPermissions"
        elif state.config.permission_mode == "acceptEdits":
            options.permission_mode = "acceptEdits"
        if state.config.allowed_tools:
            options.allowed_tools = state.config.allowed_tools

        if state.session_id:
            options.resume = state.session_id
        else:
            participants = ", ".join(
                a.name for a in self.agents.values() if a.name != state.name
            )
            custom = state.config.system_prompt or ""
            options.system_prompt = CHATROOM_SYSTEM_PROMPT.format(
                participants=participants, custom_prompt=custom
            )
            if state.config.model:
                options.model = state.config.model

        text_parts = []
        async for event in query(prompt=prompt, options=options):
            if hasattr(event, "session_id") and event.session_id:
                if state.session_id != event.session_id:
                    state.session_id = event.session_id
                    await self.db.save_session(state.name, event.session_id)
            if hasattr(event, "type") and event.type == "result":
                if hasattr(event, "result") and event.result:
                    text_parts.append(event.result)
            elif hasattr(event, "content"):
                content = event.content
                # content can be a list of TextBlock objects or a string
                if isinstance(content, list):
                    for block in content:
                        block_type = getattr(block, "type", None)
                        # Only collect text blocks, skip thinking/tool_use etc.
                        if block_type == "text" and hasattr(block, "text"):
                            text_parts.append(block.text)
                        elif block_type is None and hasattr(block, "text"):
                            # Fallback for blocks without type attr
                            text_parts.append(block.text)
                elif isinstance(content, str):
                    text_parts.append(content)
                else:
                    text_parts.append(str(content))

        return "\n".join(text_parts) if text_parts else ""

    async def _broadcast_status(self, state: AgentState):
        statuses = self.get_all_status()
        await self.bus.publish_status(statuses)

    def get_all_status(self) -> list[AgentStatus]:
        return [
            AgentStatus(
                name=s.name,
                directory=s.directory,
                online=s.online,
                thinking=s.thinking,
                session_id=s.session_id,
            )
            for s in self.agents.values()
        ]
