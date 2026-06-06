"""Create getquicker QuickerAgent intro monitor."""
from __future__ import annotations

import json
import urllib.request

BASE = "http://127.0.0.1:8765"
URL = "https://getquicker.net/Sharedaction?code=aa5917ad-1256-4c73-7022-08debe3efcbe"
SELECTOR = "(//div[contains(@class,'action-detail')]//header/p)[1]"


def request(method: str, path: str, data: dict | None = None) -> dict | list | None:
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"} if body else {},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8")
        if not raw:
            return None
        return json.loads(raw)


def main() -> None:
    payload = {
        "name": "QuickerAgent 动作简介",
        "url": URL,
        "selector": SELECTOR,
        "selector_type": "xpath",
        "extract_mode": "text",
        "profile_id": None,
        "interval_minutes": 30,
        "enabled": True,
    }
    monitor = request("POST", "/api/monitors", payload)
    assert isinstance(monitor, dict)
    monitor_id = monitor["id"]
    print("created monitor:", json.dumps(monitor, ensure_ascii=False, indent=2))

    snapshot = request("POST", f"/api/monitors/{monitor_id}/fetch")
    print("fetch result:", json.dumps(snapshot, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
