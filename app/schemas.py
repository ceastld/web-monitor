from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, field_serializer

from app.utils.datetime_utils import as_utc


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

    @field_serializer("created_at", "updated_at")
    def serialize_datetime(self, value: datetime) -> datetime:
        return as_utc(value) or value


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

    @field_serializer("last_fetched_at", "created_at")
    def serialize_datetime(self, value: datetime | None) -> datetime | None:
        return as_utc(value) if value is not None else None


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

    @field_serializer("fetched_at")
    def serialize_datetime(self, value: datetime) -> datetime:
        return as_utc(value) or value


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
    monitor_id: int | None = None
    url: str
    profile_id: int | None
    profile_name: str | None
    screenshot_path: str | None
    element_screenshot_path: str | None = None
    final_url: str | None
    page_title: str | None
    selector_content: str | None
    component_content: str | None = None
    match_count: int = 0
    status: str
    error_message: str | None = None


class MonitorDraftPreviewRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    selector: str = Field(min_length=1, max_length=1024)
    selector_type: str = "css"
    extract_mode: str = "component"
    profile_id: int | None = None


class SelectorCandidateRead(BaseModel):
    selector: str
    selector_type: str
    label: str
    tag: str
    width: int
    height: int
    x: int
    y: int


class DiscoverSelectorsRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    profile_id: int | None = None


class DiscoverSelectorsRead(BaseModel):
    url: str
    profile_id: int | None
    profile_name: str | None = None
    screenshot_path: str | None
    final_url: str | None
    page_title: str | None
    candidates: list[SelectorCandidateRead]
    status: str
    error_message: str | None = None
