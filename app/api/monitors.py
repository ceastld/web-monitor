from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Monitor, Profile, Snapshot
from app.schemas import MonitorCreate, MonitorPreviewRead, MonitorRead, MonitorUpdate, SnapshotRead
from app.services.browser import browser_manager
from app.services.monitor_runner import run_monitor
from app.services.scheduler import monitor_scheduler

router = APIRouter(prefix="/api/monitors", tags=["monitors"])


@router.get("", response_model=list[MonitorRead])
async def list_monitors(session: AsyncSession = Depends(get_session)) -> list[Monitor]:
    result = await session.execute(select(Monitor).order_by(Monitor.id.desc()))
    return list(result.scalars().all())


@router.post("", response_model=MonitorRead, status_code=status.HTTP_201_CREATED)
async def create_monitor(
    payload: MonitorCreate,
    session: AsyncSession = Depends(get_session),
) -> Monitor:
    if payload.profile_id is not None:
        profile = await session.get(Profile, payload.profile_id)
        if profile is None:
            raise HTTPException(status_code=400, detail="关联的配置档不存在")

    monitor = Monitor(**payload.model_dump())
    session.add(monitor)
    await session.commit()
    await session.refresh(monitor)

    if monitor.enabled:
        monitor_scheduler.schedule_monitor(monitor.id, monitor.interval_minutes)

    return monitor


@router.get("/{monitor_id}", response_model=MonitorRead)
async def get_monitor(
    monitor_id: int,
    session: AsyncSession = Depends(get_session),
) -> Monitor:
    monitor = await session.get(Monitor, monitor_id)
    if monitor is None:
        raise HTTPException(status_code=404, detail="监控节点不存在")
    return monitor


@router.patch("/{monitor_id}", response_model=MonitorRead)
async def update_monitor(
    monitor_id: int,
    payload: MonitorUpdate,
    session: AsyncSession = Depends(get_session),
) -> Monitor:
    monitor = await session.get(Monitor, monitor_id)
    if monitor is None:
        raise HTTPException(status_code=404, detail="监控节点不存在")

    data = payload.model_dump(exclude_unset=True)
    if "profile_id" in data and data["profile_id"] is not None:
        profile = await session.get(Profile, data["profile_id"])
        if profile is None:
            raise HTTPException(status_code=400, detail="关联的配置档不存在")

    for key, value in data.items():
        setattr(monitor, key, value)

    await session.commit()
    await session.refresh(monitor)

    monitor_scheduler.unschedule_monitor(monitor.id)
    if monitor.enabled:
        monitor_scheduler.schedule_monitor(monitor.id, monitor.interval_minutes)

    return monitor


@router.delete("/{monitor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_monitor(
    monitor_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    monitor = await session.get(Monitor, monitor_id)
    if monitor is None:
        raise HTTPException(status_code=404, detail="监控节点不存在")

    monitor_scheduler.unschedule_monitor(monitor.id)
    await session.delete(monitor)
    await session.commit()


@router.post("/{monitor_id}/preview", response_model=MonitorPreviewRead)
async def preview_monitor(
    monitor_id: int,
    session: AsyncSession = Depends(get_session),
) -> MonitorPreviewRead:
    monitor = await session.get(Monitor, monitor_id)
    if monitor is None:
        raise HTTPException(status_code=404, detail="监控节点不存在")

    profile_name: str | None = None
    if monitor.profile_id is not None:
        profile = await session.get(Profile, monitor.profile_id)
        profile_name = profile.name if profile else None

    result = await browser_manager.preview_page(
        monitor.url,
        profile_id=monitor.profile_id,
        selector=monitor.selector,
        selector_type=monitor.selector_type,
        monitor_id=monitor.id,
    )

    if result.error:
        return MonitorPreviewRead(
            monitor_id=monitor.id,
            url=monitor.url,
            profile_id=monitor.profile_id,
            profile_name=profile_name,
            screenshot_path=result.screenshot_path,
            final_url=result.final_url,
            page_title=result.page_title,
            selector_content=result.selector_content,
            status="error",
            error_message=result.error,
        )

    return MonitorPreviewRead(
        monitor_id=monitor.id,
        url=monitor.url,
        profile_id=monitor.profile_id,
        profile_name=profile_name,
        screenshot_path=result.screenshot_path,
        final_url=result.final_url,
        page_title=result.page_title,
        selector_content=result.selector_content,
        status="success",
    )


@router.post("/{monitor_id}/fetch", response_model=SnapshotRead)
async def fetch_monitor_now(
    monitor_id: int,
    session: AsyncSession = Depends(get_session),
) -> Snapshot:
    monitor = await session.get(Monitor, monitor_id)
    if monitor is None:
        raise HTTPException(status_code=404, detail="监控节点不存在")

    snapshot = await run_monitor(session, monitor_id)
    return snapshot


@router.get("/{monitor_id}/snapshots", response_model=list[SnapshotRead])
async def list_snapshots(
    monitor_id: int,
    limit: int = 20,
    session: AsyncSession = Depends(get_session),
) -> list[Snapshot]:
    monitor = await session.get(Monitor, monitor_id)
    if monitor is None:
        raise HTTPException(status_code=404, detail="监控节点不存在")

    result = await session.execute(
        select(Snapshot)
        .where(Snapshot.monitor_id == monitor_id)
        .order_by(Snapshot.fetched_at.desc())
        .limit(min(limit, 100))
    )
    return list(result.scalars().all())
