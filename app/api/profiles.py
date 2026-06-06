from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models import Profile
from app.schemas import (
    LoginSessionRead,
    LoginStartRequest,
    ProfileCreate,
    ProfileRead,
    ProfileUpdate,
)
from app.services.browser import browser_manager

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


def _storage_exists(profile_id: int) -> bool:
    return browser_manager.profile_storage_path(profile_id).exists()


@router.get("", response_model=list[ProfileRead])
async def list_profiles(session: AsyncSession = Depends(get_session)) -> list[Profile]:
    result = await session.execute(select(Profile).order_by(Profile.id.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ProfileRead, status_code=status.HTTP_201_CREATED)
async def create_profile(
    payload: ProfileCreate,
    session: AsyncSession = Depends(get_session),
) -> Profile:
    existing = await session.execute(select(Profile).where(Profile.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="配置档名称已存在")

    profile = Profile(**payload.model_dump(), login_status="unknown")
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=ProfileRead)
async def get_profile(
    profile_id: int,
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="配置档不存在")
    return profile


@router.patch("/{profile_id}", response_model=ProfileRead)
async def update_profile(
    profile_id: int,
    payload: ProfileUpdate,
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="配置档不存在")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)

    await session.commit()
    await session.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="配置档不存在")

    profile_dir = settings.profiles_dir / str(profile_id)
    await session.delete(profile)
    await session.commit()

    if profile_dir.exists():
        for item in profile_dir.glob("*"):
            item.unlink(missing_ok=True)
        profile_dir.rmdir()


@router.post("/{profile_id}/login/start", response_model=LoginSessionRead)
async def start_login(
    profile_id: int,
    payload: LoginStartRequest,
    session: AsyncSession = Depends(get_session),
) -> LoginSessionRead:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="配置档不存在")

    start_url = str(payload.start_url) if payload.start_url else f"https://{profile.site_domain}"

    try:
        await browser_manager.start_login_session(profile_id, start_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    profile.login_status = "logging_in"
    await session.commit()

    return LoginSessionRead(
        profile_id=profile_id,
        status="active",
        message=f"已打开浏览器窗口，请手动登录 {profile.site_domain}，完成后点击「保存登录状态」",
    )


@router.post("/{profile_id}/login/save", response_model=ProfileRead)
async def save_login(
    profile_id: int,
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="配置档不存在")

    try:
        storage_path = await browser_manager.save_login_session(profile_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    profile.storage_state_path = str(storage_path)
    profile.login_status = "logged_in"
    await session.commit()
    await session.refresh(profile)
    return profile


@router.post("/{profile_id}/login/cancel", response_model=LoginSessionRead)
async def cancel_login(
    profile_id: int,
    session: AsyncSession = Depends(get_session),
) -> LoginSessionRead:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="配置档不存在")

    await browser_manager.cancel_login_session(profile_id)
    profile.login_status = "logged_in" if _storage_exists(profile_id) else "unknown"
    await session.commit()

    return LoginSessionRead(
        profile_id=profile_id,
        status="cancelled",
        message="已取消登录会话",
    )
