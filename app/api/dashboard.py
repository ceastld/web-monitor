from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.models import Monitor, Snapshot
from app.schemas import DashboardItem, MonitorRead, SnapshotRead

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=list[DashboardItem])
async def get_dashboard(session: AsyncSession = Depends(get_session)) -> list[DashboardItem]:
    result = await session.execute(
        select(Monitor).options(selectinload(Monitor.profile)).order_by(Monitor.id.desc())
    )
    monitors = result.scalars().all()

    items: list[DashboardItem] = []
    for monitor in monitors:
        snap_result = await session.execute(
            select(Snapshot)
            .where(Snapshot.monitor_id == monitor.id)
            .order_by(Snapshot.fetched_at.desc())
            .limit(1)
        )
        latest = snap_result.scalar_one_or_none()

        items.append(
            DashboardItem(
                monitor=MonitorRead.model_validate(monitor),
                profile_name=monitor.profile.name if monitor.profile else None,
                latest_snapshot=SnapshotRead.model_validate(latest) if latest else None,
            )
        )

    return items
