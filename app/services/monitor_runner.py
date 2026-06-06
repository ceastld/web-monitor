from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Monitor, Snapshot
from app.services.browser import browser_manager


def content_hash(content: str | None) -> str | None:
    if content is None:
        return None
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


async def run_monitor(session: AsyncSession, monitor_id: int) -> Snapshot:
    result = await session.execute(
        select(Monitor).where(Monitor.id == monitor_id).options(selectinload(Monitor.snapshots))
    )
    monitor = result.scalar_one()

    fetch = await browser_manager.fetch_content(
        url=monitor.url,
        selector=monitor.selector,
        selector_type=monitor.selector_type,
        extract_mode=monitor.extract_mode,
        profile_id=monitor.profile_id,
        monitor_id=monitor.id,
    )

    previous = await session.execute(
        select(Snapshot)
        .where(Snapshot.monitor_id == monitor_id, Snapshot.status == "success")
        .order_by(Snapshot.fetched_at.desc())
        .limit(1)
    )
    prev_snapshot = previous.scalar_one_or_none()
    new_hash = content_hash(fetch.content)

    changed = False
    if fetch.error is None and prev_snapshot is not None and prev_snapshot.content_hash:
        changed = prev_snapshot.content_hash != new_hash

    snapshot = Snapshot(
        monitor_id=monitor.id,
        content=fetch.content,
        content_hash=new_hash,
        screenshot_path=fetch.screenshot_path,
        status="error" if fetch.error else "success",
        error_message=fetch.error,
        changed=changed,
        fetched_at=datetime.now(UTC),
    )
    session.add(snapshot)

    monitor.last_fetched_at = snapshot.fetched_at
    monitor.last_status = snapshot.status
    await session.commit()
    await session.refresh(snapshot)
    return snapshot
