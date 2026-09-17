"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest, type HealthResponse } from "@/lib/api";

export default function BackendStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");

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
              ? "Hệ thống xử lý đã kết nối. Sẵn sàng soạn chỉ dẫn và dựng phối cảnh."
              : "Hệ thống xử lý chưa sẵn sàng.",
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus("offline");
          setMessage(error instanceof Error ? error.message : "Chưa kết nối được hệ thống xử lý.");
        }
      } finally {
        pending = false;
      }
    }
    void check();
    const interval = window.setInterval(check, 30_000);
    window.addEventListener("online", check);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", check);
    };
  }, [attempt]);

  const labels = {
    checking: "Đang kết nối",
    online: "Hệ thống đã kết nối",
    offline: "Hệ thống chưa kết nối",
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
      <RefreshCw size={12} className={status === "checking" ? "spin" : ""} />
    </button>
  );
}
