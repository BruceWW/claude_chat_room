export interface ChatMessage {
  id: string;
  room_id: string;
  from_type: "agent" | "human";
  from_name: string;
  from_directory?: string;
  to: string[] | null;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface AgentStatus {
  name: string;
  directory: string;
  online: boolean;
  thinking: boolean;
  session_id: string | null;
}

export interface PermissionRequest {
  id: string;
  agent_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  timestamp: string;
}

export interface WSMessage {
  type: "chat_message" | "agent_status" | "system_event" | "permission_request" | "connected";
  data: unknown;
}
