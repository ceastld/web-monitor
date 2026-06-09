import { useCallback, useState } from "react";
import { apiGet, apiSend } from "./api/client";
import { SetupCapabilitiesProvider } from "./context/SetupCapabilitiesContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { SetupNotice } from "./components/SetupNotice";
import { DashboardTab } from "./components/DashboardTab";
import { MonitorDialog } from "./components/MonitorDialog";
import { MonitorsTab } from "./components/MonitorsTab";
import { ProfileDialog } from "./components/ProfileDialog";
import { ProfilesTab } from "./components/ProfilesTab";
import { QuickSetupWizard } from "./components/QuickSetupWizard";
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
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);

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
      <Sidebar
        tab={tab}
        onTabChange={setTab}
        onRefreshAll={() => void refreshAll()}
        onQuickSetup={() => setQuickSetupOpen(true)}
      />
      <main className="content">
        <SetupNotice variant="banner" />
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
            onQuickSetup={() => setQuickSetupOpen(true)}
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
        onSaved={async ({ id, isEdit }) => {
          if (isEdit) {
            try {
              await apiSend("POST", `/api/monitors/${id}/fetch`);
              showToast("监控节点已更新并已重新抓取");
            } catch (err) {
              showToast(
                err instanceof Error ? err.message : "监控节点已更新，但重新抓取失败",
              );
            }
          } else {
            try {
              const snapshot = await apiSend<{ status: string }>(
                "POST",
                `/api/monitors/${id}/fetch`,
              );
              showToast(
                snapshot?.status === "error"
                  ? "监控节点已创建，但首次抓取失败"
                  : "监控节点已创建并完成首次抓取",
              );
            } catch (err) {
              showToast(
                err instanceof Error ? err.message : "监控节点已创建，但首次抓取失败",
              );
            }
          }
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
      <QuickSetupWizard
        open={quickSetupOpen}
        onClose={() => setQuickSetupOpen(false)}
        onCompleted={() => {
          showToast("一键配置完成");
          bumpReload();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SetupCapabilitiesProvider>
        <AppShell />
      </SetupCapabilitiesProvider>
    </ToastProvider>
  );
}
