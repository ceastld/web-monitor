import { monitorRepo } from "../db.js";
import { runMonitor } from "./monitor-runner.js";

class MonitorScheduler {
  private timers = new Map<number, NodeJS.Timeout>();

  async start(): Promise<void> {
    await this.reloadAll();
  }

  shutdown(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  async reloadAll(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();

    const monitors = monitorRepo.listEnabled();
    for (const monitor of monitors) {
      this.scheduleMonitor(monitor.id, monitor.interval_minutes);
    }

    console.log(`Scheduled ${monitors.length} monitor jobs`);
  }

  scheduleMonitor(monitorId: number, intervalMinutes: number): void {
    this.unscheduleMonitor(monitorId);
    const ms = intervalMinutes * 60 * 1000;
    const timer = setInterval(() => {
      runMonitor(monitorId).catch((error) => {
        console.error(`Monitor job failed: ${monitorId}`, error);
      });
    }, ms);
    this.timers.set(monitorId, timer);
  }

  unscheduleMonitor(monitorId: number): void {
    const timer = this.timers.get(monitorId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(monitorId);
    }
  }
}

export const monitorScheduler = new MonitorScheduler();
