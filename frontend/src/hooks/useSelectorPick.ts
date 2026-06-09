import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import type { SelectorPickSession } from "../types";

interface UseSelectorPickOptions {
  onPicked: (selector: string, selectorType: string, label?: string) => void;
  onCancelled?: () => void;
  onError?: (message: string) => void;
  onStatusMessage?: (message: string) => void;
  preferChromeCdp?: boolean;
}

export function useSelectorPick(options: UseSelectorPickOptions) {
  const [picking, setPicking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    stopPolling();
    setPicking(false);
    setSessionId(null);
  }, [stopPolling]);

  const cancelPick = useCallback(async () => {
    if (sessionId) {
      try {
        await apiSend("POST", `/api/monitors/pick-selector/${sessionId}/cancel`);
      } catch {
        // ignore cancel errors
      }
    }
    finish();
    options.onCancelled?.();
  }, [finish, options, sessionId]);

  const startPick = useCallback(
    async (url: string, profileId: number | null) => {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        options.onError?.("请先填写 URL");
        return;
      }

      if (picking && sessionId) {
        await cancelPick();
      }

      setPicking(true);
      try {
        const session = await apiSend<SelectorPickSession>("POST", "/api/monitors/pick-selector/start", {
          url: trimmedUrl,
          profile_id: profileId,
          use_chrome_cdp: options.preferChromeCdp ?? false,
        });
        if (!session) {
          throw new Error("无法启动选区会话");
        }
        setSessionId(session.session_id);
        options.onStatusMessage?.(session.message ?? "浏览器已打开，请使用悬浮球选区");
      } catch (err) {
        setPicking(false);
        options.onError?.(err instanceof Error ? err.message : "打开选区浏览器失败");
      }
    },
    [cancelPick, options, picking, sessionId],
  );

  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        const session = await apiGet<SelectorPickSession>(`/api/monitors/pick-selector/${sessionId}`);
        if (session.status === "picked" && session.result) {
          options.onPicked(
            session.result.selector,
            session.result.selector_type,
            session.result.label,
          );
          options.onStatusMessage?.("选区已确认");
          finish();
          return;
        }
        if (session.status === "cancelled") {
          options.onCancelled?.();
          finish();
          return;
        }
        if (session.status === "error") {
          options.onError?.(session.error_message ?? "选区失败");
          finish();
        }
      } catch (err) {
        options.onError?.(err instanceof Error ? err.message : "选区状态查询失败");
        finish();
      }
    };

    void poll();
    pollRef.current = window.setInterval(() => void poll(), 1000);
    return stopPolling;
  }, [finish, options, sessionId, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { picking, startPick, cancelPick };
}
