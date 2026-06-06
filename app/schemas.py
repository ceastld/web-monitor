from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    site_domain: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    site_domain: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class ProfileRead(BaseModel):
    id: int
    name: str
    site_domain: str
    description: str | None
    login_status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MonitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=2048)
    selector: str = Field(min_length=1, max_length=1024)
    selector_type: str = "css"
    extract_mode: str = "text"
    profile_id: int | None = None
    interval_minutes: int = Field(default=15, ge=1, le=1440)
    enabled: bool = True


class MonitorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    url: str | None = Field(default=None, min_length=1, max_length=2048)
    selector: str | None = Field(default=None, min_length=1, max_length=1024)
    selector_type: str | None = None
    extract_mode: str | None = None
    profile_id: int | None = None
    interval_minutes: int | None = Field(default=None, ge=1, le=1440)
    enabled: bool | None = None


class MonitorRead(BaseModel):
    id: int
    name: str
    url: str
    selector: str
    selector_type: str
    extract_mode: str
    profile_id: int | None
    interval_minutes: int
    enabled: bool
    last_fetched_at: datetime | None
    last_status: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SnapshotRead(BaseModel):
    id: int
    monitor_id: int
    content: str | None
    content_hash: str | None
    screenshot_path: str | None
    status: str
    error_message: str | None
    changed: bool
    fetched_at: datetime

    model_config = {"from_attributes": True}


class DashboardItem(BaseModel):
    monitor: MonitorRead
    profile_name: str | None
    latest_snapshot: SnapshotRead | None


class LoginStartRequest(BaseModel):
    start_url: HttpUrl | None = None


class LoginSessionRead(BaseModel):
    profile_id: int
    status: str
    message: str


class MonitorPreviewRead(BaseModel):
    monitor_id: int
    url: str
    profile_id: int | None
    profile_name: str | None
    screenshot_path: str | None
    final_url: str | None
    page_title: str | None
    selector_content: str | None
    status: str
    error_message: str | None = None
