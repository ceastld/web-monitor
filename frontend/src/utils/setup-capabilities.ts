import type { ChromeCdpStatus } from "../types";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** True when the UI is opened via LAN IP / hostname instead of loopback. */
export function isLikelyRemoteClient(): boolean {
  const host = window.location.hostname.trim().toLowerCase();
  return !LOCAL_HOSTS.has(host);
}

export function getRemoteSetupShortNotice(): string {
  return "远程访问：选区、登录、一键添加会在服务器上打开浏览器，此处无法操作。请在服务器本机打开，或使用「高级新建」手动填写选择器。";
}

export function getRemoteSetupDetailNotice(): string {
  const host = window.location.hostname;
  return `当前通过 ${host} 访问。浏览器选区与登录窗口会出现在运行后端的电脑上，远程浏览器无法看到或操作。请在服务器本机使用 localhost 完成配置；远程仍可使用监控面板、定时抓取，以及高级新建（手动填写选择器与脚本）。`;
}

export function getInteractiveSetupHint(
  likelyRemote: boolean,
  chromeCdp: ChromeCdpStatus,
): string | null {
  if (likelyRemote) {
    return getRemoteSetupDetailNotice();
  }
  if (chromeCdp.enabled && !chromeCdp.available && chromeCdp.hint.trim()) {
    return chromeCdp.hint;
  }
  return null;
}
