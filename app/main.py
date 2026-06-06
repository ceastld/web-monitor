from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import dashboard, files, monitors, profiles
from app.config import settings
from app.database import init_db
from app.services.browser import browser_manager
from app.services.scheduler import monitor_scheduler

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
LEGACY_STATIC = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    await browser_manager.start()
    await monitor_scheduler.start()
    yield
    monitor_scheduler.shutdown()
    await browser_manager.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(profiles.router)
app.include_router(monitors.router)
app.include_router(dashboard.router)
app.include_router(files.router)

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")


@app.get("/")
async def index() -> FileResponse:
    built_index = FRONTEND_DIST / "index.html"
    if built_index.exists():
        return FileResponse(built_index)
    legacy_index = LEGACY_STATIC / "index.html"
    if legacy_index.exists():
        return FileResponse(legacy_index)
    raise HTTPException(status_code=503, detail="Frontend not built. Run: cd frontend && npm run build")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    if FRONTEND_DIST.exists():
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")

    raise HTTPException(status_code=404, detail="Not found")


def run() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
