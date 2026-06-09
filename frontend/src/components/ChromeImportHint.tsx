import { useSetupCapabilities } from "../context/SetupCapabilitiesContext";

interface ChromeImportHintProps {
  compact?: boolean;
}

export function ChromeImportHint({ compact = false }: ChromeImportHintProps) {
  const { canUseInteractiveSetup, canUseChrome, chromeCdp } = useSetupCapabilities();

  if (!canUseInteractiveSetup || canUseChrome) {
    return null;
  }

  return (
    <aside className={`setup-notice setup-notice-inline${compact ? " setup-notice-compact" : ""}`}>
      <strong>「从 Chrome 导入」需要先连接本机 Chrome</strong>
      <p>
        1. 关闭所有 Chrome 窗口（含后台应用）
        <br />
        2. 在项目目录运行：<code>.\scripts\launch-chrome-debug.ps1</code>
        <br />
        3. 脚本会同步你的登录配置并打开调试版 Chrome（端口 19222）
        <br />
        4. 若常用 Chrome 里刚登录了新站点，重新运行脚本同步后再导入
      </p>
      {chromeCdp.hint ? <p className="setup-notice-sub">{chromeCdp.hint}</p> : null}
    </aside>
  );
}
