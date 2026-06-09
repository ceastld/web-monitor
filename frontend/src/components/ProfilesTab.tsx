import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { useSetupCapabilities } from "../context/SetupCapabilitiesContext";
import { useToast } from "../context/ToastContext";
import { ChromeImportHint } from "./ChromeImportHint";
import { SetupNotice } from "./SetupNotice";
import { useProfileLogin } from "../hooks/useProfileLogin";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";
import type { Profile } from "../types";

interface ProfilesTabProps {
  reloadToken: number;
  onCreate: () => void;
}

export function ProfilesTab({ reloadToken, onCreate }: ProfilesTabProps) {
  const { showToast } = useToast();
  const { canUseInteractiveSetup, canUseChrome, chromeCdp, shortNotice } = useSetupCapabilities();
  const { importFromChrome } = useProfileLogin({
    onSuccess: (message) => showToast(message),
    onError: (message) => showToast(message),
  });
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const load = useCallback(async () => {
    setProfiles(await apiGet<Profile[]>("/api/profiles"));
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const importChrome = async (profile: Profile) => {
    if (!canUseChrome) {
      showToast(
        `未连接 Chrome 调试端口。请先关闭所有 Chrome 窗口，再运行：.\\scripts\\launch-chrome-debug.ps1${chromeCdp.hint ? `\n${chromeCdp.hint}` : ""}`,
      );
      return;
    }
    const ok = await importFromChrome(profile.id);
    if (ok) await load();
  };

  const startLogin = async (profile: Profile) => {
    try {
      const res = await apiSend<{ message: string }>("POST", `/api/profiles/${profile.id}/login/start`, {
        start_url: `https://${profile.site_domain}`,
        use_chrome_cdp: canUseChrome,
      });
      showToast(res?.message ?? "已打开登录窗口");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "打开登录失败");
    }
  };

  const saveLogin = async (id: number) => {
    try {
      await apiSend("POST", `/api/profiles/${id}/login/save`);
      showToast("登录状态已保存");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    }
  };

  const cancelLogin = async (id: number) => {
    await apiSend("POST", `/api/profiles/${id}/login/cancel`);
    showToast("已取消登录会话");
    await load();
  };

  const remove = async (id: number) => {
    if (!window.confirm("删除配置档将清除已保存的登录状态，确定继续？")) return;
    await apiSend("DELETE", `/api/profiles/${id}`);
    showToast("配置档已删除");
    await load();
  };

  return (
    <section className="tab active">
      <PageHeader
        title="登录配置档"
        subtitle="保存的是 Cookie / 本地存储（非账号密码）。已在 Chrome 登录时，可一键导入登录态"
        actions={
          <button type="button" className="primary-btn" onClick={onCreate}>
            新建配置档
          </button>
        }
      />

      {!canUseInteractiveSetup ? <SetupNotice title="交互式登录需在服务器本机操作" /> : null}
      <ChromeImportHint />

      {profiles.length === 0 ? (
        <div className="empty">暂无配置档。为同一网站创建多个配置档，即可隔离登录不同账号。</div>
      ) : (
        <div className="table-wrap">
          <div className="table-scroll responsive-table">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>域名</th>
                  <th>登录状态</th>
                  <th>说明</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td data-label="名称">{p.name}</td>
                    <td data-label="域名">{p.site_domain}</td>
                    <td data-label="登录状态">
                      <StatusBadge status={p.login_status} kind="login" />
                    </td>
                    <td className="col-span-2" data-label="说明">
                      {p.description || "-"}
                    </td>
                    <td className="col-actions" data-label="操作">
                      {canUseInteractiveSetup ? (
                        <button
                          type="button"
                          className={`small-btn ${canUseChrome ? "primary-btn" : "ghost-btn"}`}
                          title={
                            canUseChrome
                              ? "从本机 Chrome 导入 Cookie"
                              : "需先运行 scripts/launch-chrome-debug.ps1"
                          }
                          onClick={() => void importChrome(p)}
                        >
                          从 Chrome 导入
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="small-btn primary-btn"
                        disabled={!canUseInteractiveSetup}
                        title={!canUseInteractiveSetup ? shortNotice ?? undefined : undefined}
                        onClick={() => void startLogin(p)}
                      >
                        {canUseChrome ? "在 Chrome 打开" : "打开登录"}
                      </button>
                      <button
                        type="button"
                        className="small-btn ghost-btn"
                        disabled={!canUseInteractiveSetup}
                        title={!canUseInteractiveSetup ? shortNotice ?? undefined : undefined}
                        onClick={() => void saveLogin(p.id)}
                      >
                        保存登录状态
                      </button>
                      <button
                        type="button"
                        className="small-btn ghost-btn"
                        title={p.login_status === "logging_in" ? "结束残留登录会话" : undefined}
                        onClick={() => void cancelLogin(p.id)}
                      >
                        {p.login_status === "logging_in" ? "结束残留会话" : "取消"}
                      </button>
                      <button
                        type="button"
                        className="small-btn danger-btn"
                        onClick={() => void remove(p.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
