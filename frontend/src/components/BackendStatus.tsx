"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest, type HealthResponse } from "@/lib/api";

export default function BackendStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [renderLabel, setRenderLabel] = useState("Render: chưa kiểm tra");
  const [renderReady, setRenderReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function check() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const health = await apiRequest<HealthResponse>("/api/health", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setStatus(health.status === "ok" ? "online" : "offline");
          setMessage(
            health.status === "ok"
              ? `Backend đã kết nối. ${health.renderer?.message || ""}`
              : "Hệ thống xử lý chưa sẵn sàng.",
          );
          setRenderReady(health.renderer?.state === "rendered");
          setRenderLabel(health.renderer?.state === "rendered" ? "Render: đã chạy thành công" : health.renderer?.state === "connected" ? "Render: đã xác minh model" : health.renderer?.configured ? "Render: chưa xác minh" : "Render: chưa cấu hình");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus("offline");
          setRenderReady(false);
          setRenderLabel("Render: chưa kết nối");
          setMessage(error instanceof Error ? error.message : "Chưa kết nối được hệ thống xử lý.");
        }
      } finally {
        pending = false;
      }
    }
    void check();
    const interval = window.setInterval(check, 30_000);
    window.addEventListener("online", check);
    window.addEventListener("infrarender-rendered", check);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("infrarender-rendered", check);
    };
  }, [attempt]);

  const labels = {
    checking: "Đang kết nối",
    online: "Backend: đã kết nối",
    offline: "Backend: mất kết nối",
  };
  return (
    <button
      type="button"
      className={`connection-status ${status}`}
      onClick={() => {
        setStatus("checking");
        setAttempt((value) => value + 1);
      }}
      title={`${message || labels[status]} Nhấn để kiểm tra lại.`}
      disabled={status === "checking"}
      aria-label={`${labels[status]}. Kiểm tra lại kết nối`}
    >
      <span className="status-dot" />
      <span className="connection-label" aria-live="polite">
        {labels[status]}
      </span>
      <span className={`render-status-label ${renderReady ? "ready" : "pending"}`}>{renderLabel}</span>
      <RefreshCw size={12} className={status === "checking" ? "spin" : ""} />
    </button>
  );
}
