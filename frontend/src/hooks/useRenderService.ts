"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, type RenderServiceStatus } from "@/lib/api";

export function useRenderService() {
  const [service, setService] = useState<RenderServiceStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const verifyNext = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function check(verify = false) {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const result = await apiRequest<RenderServiceStatus>(
          verify ? "/api/render-status/check" : "/api/render-status",
          { signal: controller.signal, method: verify ? "POST" : "GET" },
          verify ? 25_000 : 10_000,
        );
        if (!controller.signal.aborted) {
          setService(result);
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setService(null);
          setError(err instanceof Error ? err.message : "Chưa kết nối được dịch vụ dựng phối cảnh.");
        }
      } finally {
        if (!controller.signal.aborted) setChecking(false);
        pending = false;
      }
    }
    void check(verifyNext.current);
    verifyNext.current = false;
    const refreshLocal = () => {
      void check();
    };
    const interval = window.setInterval(refreshLocal, 30_000);
    window.addEventListener("online", refreshLocal);
    window.addEventListener("infrarender-rendered", refreshLocal);
    window.addEventListener("infrarender-connection", refreshLocal);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", refreshLocal);
      window.removeEventListener("infrarender-rendered", refreshLocal);
      window.removeEventListener("infrarender-connection", refreshLocal);
    };
  }, [attempt]);

  return {
    service,
    checking,
    message: checking ? "Đang kiểm tra dịch vụ dựng phối cảnh…" : error || service?.message || "",
    refresh: () => {
      verifyNext.current = true;
      setChecking(true);
      setAttempt((value) => value + 1);
    },
  };
}
