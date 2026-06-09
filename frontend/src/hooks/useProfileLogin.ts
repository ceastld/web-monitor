import { useCallback } from "react";
import { apiSend } from "../api/client";

interface UseProfileLoginOptions {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useProfileLogin(options: UseProfileLoginOptions = {}) {
  const saveLogin = useCallback(
    async (profileId: number) => {
      try {
        await apiSend("POST", `/api/profiles/${profileId}/login/save`);
        options.onSuccess?.("登录状态已保存");
      } catch (err) {
        options.onError?.(err instanceof Error ? err.message : "保存登录失败");
      }
    },
    [options],
  );

  const cancelLogin = useCallback(
    async (profileId: number) => {
      try {
        await apiSend("POST", `/api/profiles/${profileId}/login/cancel`);
        options.onSuccess?.("已取消登录会话");
      } catch (err) {
        options.onError?.(err instanceof Error ? err.message : "取消登录失败");
      }
    },
    [options],
  );

  const importFromChrome = useCallback(
    async (profileId: number): Promise<boolean> => {
      try {
        const res = await apiSend<{ message: string }>(
          "POST",
          `/api/profiles/${profileId}/import-chrome`,
        );
        options.onSuccess?.(res?.message ?? "已从 Chrome 导入登录环境");
        return true;
      } catch (err) {
        options.onError?.(err instanceof Error ? err.message : "从 Chrome 导入失败");
        return false;
      }
    },
    [options],
  );

  const startLogin = useCallback(
    async (profileId: number, startUrl: string, useChromeCdp = false): Promise<boolean> => {
      try {
        const res = await apiSend<{ message: string }>(
          "POST",
          `/api/profiles/${profileId}/login/start`,
          { start_url: startUrl, use_chrome_cdp: useChromeCdp },
        );
        options.onSuccess?.(res?.message ?? "已打开浏览器窗口，请手动登录");
        return true;
      } catch (err) {
        options.onError?.(err instanceof Error ? err.message : "打开登录失败");
        return false;
      }
    },
    [options],
  );

  return { startLogin, saveLogin, cancelLogin, importFromChrome };
}
