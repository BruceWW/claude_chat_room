import { useEffect, useRef, useCallback, useState } from "react";
import type { ChatMessage, AgentStatus, WSMessage } from "../types";

interface UseWebSocketReturn {
  messages: ChatMessage[];
  agents: AgentStatus[];
  connected: boolean;
  sendMessage: (content: string, to?: string) => void;
}

export function useWebSocket(roomId: string): UseWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [reconnectTick, setReconnectTick] = useState(0);

  useEffect(() => {
    fetch(`/api/rooms/${roomId}/messages?limit=100`)
      .then((r) => r.json())
      .then((msgs: ChatMessage[]) => setMessages(msgs.reverse()));

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/rooms/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(() => setReconnectTick((t) => t + 1), 2000);
    };

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);
      if (msg.type === "chat_message") {
        setMessages((prev) => [...prev, msg.data as ChatMessage]);
      } else if (msg.type === "agent_status") {
        setAgents(msg.data as AgentStatus[]);
      }
    };

    return () => {
      ws.close();
    };
  }, [roomId, reconnectTick]);

  const sendMessage = useCallback(
    (content: string, to: string = "all") => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "chat_message",
            content,
            from_name: "user",
            to,
          })
        );
      }
    },
    []
  );

  return { messages, agents, connected, sendMessage };
}
