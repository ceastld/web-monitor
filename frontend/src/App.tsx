import { useCallback, useState } from "react";
import { apiGet, apiSend } from "./api/client";
import { ToastProvider, useToast } from "./context/ToastContext";
import { DashboardTab } from "./components/DashboardTab";
import { MonitorDialog } from "./components/MonitorDialog";
import { MonitorsTab } from "./components/MonitorsTab";
import { ProfileDialog } from "./components/ProfileDialog";
import { ProfilesTab } from "./components/ProfilesTab";
import { Sidebar } from "./components/Sidebar";
import type { Monitor, TabId } from "./types";

function AppShell() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabId>("dashboard");
  const [reloadToken, setReloadToken] = useState(0);
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [editingMonitorId, setEditingMonitorId] = useState<number | null>(null);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  const bumpReload = () => setReloadToken((v) => v + 1);

  const refreshAll = useCallback(async () => {
    try {
      const monitors = await apiGet<Monitor[]>("/api/monitors");
      for (const monitor of monitors.filter((m) => m.enabled)) {
        await apiSend("POST", `/api/monitors/${monitor.id}/fetch`);
      }
      showToast("全部监控已刷新");
      bumpReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "刷新失败");
    }
  }, [showToast]);

  const openCreateMonitor = () => {
    setEditingMonitor(null);
    setEditingMonitorId(null);
    setMonitorDialogOpen(true);
  };

  const openEditMonitor = (monitor: Monitor) => {
    setEditingMonitor(monitor);
    setEditingMonitorId(monitor.id);
    setMonitorDialogOpen(true);
  };

  const closeMonitorDialog = () => {
    setMonitorDialogOpen(false);
    setEditingMonitorId(null);
    setEditingMonitor(null);
  };

  return (
    <div className="app">
      <Sidebar tab={tab} onTabChange={setTab} onRefreshAll={() => void refreshAll()} />
      <main className="content">
        {tab === "dashboard" ? (
          <DashboardTab
            reloadToken={reloadToken}
            onEditMonitor={openEditMonitor}
            onRefreshAll={refreshAll}
          />
        ) : null}
        {tab === "monitors" ? (
          <MonitorsTab
            reloadToken={reloadToken}
            onCreate={openCreateMonitor}
            onEdit={openEditMonitor}
          />
        ) : null}
        {tab === "profiles" ? (
          <ProfilesTab reloadToken={reloadToken} onCreate={() => setProfileDialogOpen(true)} />
        ) : null}
      </main>

      <MonitorDialog
        open={monitorDialogOpen}
        monitorId={editingMonitorId}
        initialMonitor={editingMonitor}
        onClose={closeMonitorDialog}
        onSaved={() => {
          showToast(editingMonitorId ? "监控节点已更新" : "监控节点已创建");
          bumpReload();
        }}
      />
      <ProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
        onSaved={() => {
          showToast("配置档已创建");
          bumpReload();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
