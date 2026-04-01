import { useState, useEffect } from "react";
import type { PermissionRequest } from "../types";

interface Props {
  requests: PermissionRequest[];
  onRespond: (requestId: string, allowed: boolean, message?: string) => void;
}

export function PermissionDialog({ requests, onRespond }: Props) {
  if (requests.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxHeight: "80vh",
        overflowY: "auto",
      }}
    >
      {requests.map((req) => (
        <PermissionCard key={req.id} request={req} onRespond={onRespond} />
      ))}
    </div>
  );
}

function PermissionCard({
  request,
  onRespond,
}: {
  request: PermissionRequest;
  onRespond: (requestId: string, allowed: boolean, message?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [countdown, setCountdown] = useState(120);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          onRespond(request.id, false, "Timed out");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [request.id, onRespond]);

  const inputStr = JSON.stringify(request.tool_input, null, 2);
  const shortInput =
    inputStr.length > 120 ? inputStr.slice(0, 120) + "..." : inputStr;

  return (
    <div
      style={{
        background: "#1a1a2e",
        border: "1px solid #4A9EFF",
        borderRadius: 8,
        padding: 12,
        width: 380,
        boxShadow: "0 4px 20px rgba(74,158,255,0.15)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ color: "#4A9EFF", fontWeight: 600, fontSize: 13 }}>
          Permission Request
        </span>
        <span style={{ color: countdown <= 10 ? "#FF6B6B" : "#888", fontSize: 12 }}>
          {countdown}s
        </span>
      </div>

      <div style={{ fontSize: 13, color: "#ddd", marginBottom: 6 }}>
        <span style={{ color: "#51CF66", fontWeight: 500 }}>{request.agent_name}</span>
        {" wants to use "}
        <span style={{ color: "#FFD43B", fontWeight: 500 }}>{request.tool_name}</span>
      </div>

      <div
        style={{
          background: "#111",
          borderRadius: 4,
          padding: 8,
          fontSize: 12,
          fontFamily: "monospace",
          color: "#aaa",
          maxHeight: expanded ? 300 : 60,
          overflow: "auto",
          cursor: "pointer",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
        onClick={() => setExpanded(!expanded)}
        title={expanded ? "Click to collapse" : "Click to expand"}
      >
        {expanded ? inputStr : shortInput}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => onRespond(request.id, true)}
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 4,
            border: "none",
            background: "#51CF66",
            color: "#111",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Allow
        </button>
        <button
          onClick={() => onRespond(request.id, false, "Denied by user")}
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 4,
            border: "1px solid #FF6B6B",
            background: "transparent",
            color: "#FF6B6B",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
