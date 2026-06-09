import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api/client";
import type { ChromeCdpStatus } from "../types";

const DEFAULT_STATUS: ChromeCdpStatus = {
  enabled: true,
  url: "http://127.0.0.1:19222",
  available: false,
  browser_version: null,
  context_count: 0,
  hint: "",
};

export function useChromeCdp(enabled = true) {
  const [status, setStatus] = useState<ChromeCdpStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setStatus(await apiGet<ChromeCdpStatus>("/api/system/chrome-cdp"));
    } catch {
      setStatus(DEFAULT_STATUS);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    status,
    loading,
    refresh,
    canUseChrome: status.enabled && status.available,
  };
}
