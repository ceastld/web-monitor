from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/screenshots/{filename}")
async def get_screenshot(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="非法文件名")

    path = settings.screenshots_dir / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="截图不存在")

    return FileResponse(path)
