import type { TabId } from "../types";

interface SidebarProps {
  tab: TabId;
  onTabChange: (tab: TabId) => void;
  onRefreshAll: () => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "监控面板" },
  { id: "monitors", label: "监控节点" },
  { id: "profiles", label: "登录配置档" },
];

export function Sidebar({ tab, onTabChange, onRefreshAll }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">◉</div>
        <div>
          <h1>Web Monitor</h1>
          <p>站点数据统一监控</p>
        </div>
      </div>
      <nav className="main-nav">
        <div className="nav-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-btn${tab === item.id ? " active" : ""}`}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="nav-btn nav-refresh mobile-only"
          aria-label="刷新全部"
          onClick={onRefreshAll}
        >
          刷新
        </button>
      </nav>
      <div className="sidebar-footer desktop-only">
        <button type="button" className="primary-btn" onClick={onRefreshAll}>
          立即刷新全部
        </button>
      </div>
    </aside>
  );
}
