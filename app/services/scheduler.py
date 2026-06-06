from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Monitor
from app.services.monitor_runner import run_monitor

logger = logging.getLogger(__name__)


class MonitorScheduler:
    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler()

    async def start(self) -> None:
        self.scheduler.start()
        await self.reload_all()

    def shutdown(self) -> None:
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)

    async def reload_all(self) -> None:
        for job in self.scheduler.get_jobs():
            self.scheduler.remove_job(job.id)

        async with SessionLocal() as session:
            result = await session.execute(select(Monitor).where(Monitor.enabled.is_(True)))
            monitors = result.scalars().all()

        for monitor in monitors:
            self.schedule_monitor(monitor.id, monitor.interval_minutes)

        logger.info("Scheduled %s monitor jobs", len(monitors))

    def schedule_monitor(self, monitor_id: int, interval_minutes: int) -> None:
        job_id = f"monitor-{monitor_id}"
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

        self.scheduler.add_job(
            self._run_job,
            trigger="interval",
            minutes=interval_minutes,
            id=job_id,
            args=[monitor_id],
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

    def unschedule_monitor(self, monitor_id: int) -> None:
        job_id = f"monitor-{monitor_id}"
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

    async def _run_job(self, monitor_id: int) -> None:
        try:
            async with SessionLocal() as session:
                await run_monitor(session, monitor_id)
        except Exception:
            logger.exception("Monitor job failed: %s", monitor_id)


monitor_scheduler = MonitorScheduler()
