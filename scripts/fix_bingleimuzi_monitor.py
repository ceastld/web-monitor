"""Fix bingleimuzi monitor encoding and config."""
from __future__ import annotations

import json
import urllib.request


def api_patch(path: str, payload: dict) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"http://127.0.0.1:8765{path}",
        data=data,
        method="PATCH",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


if __name__ == "__main__":
    updated = api_patch(
        "/api/monitors/3",
        {
            "name": "冰雷木子 API 余额",
            "selector": "//p[contains(normalize-space(.), '余额')]/following-sibling::p[1]",
        },
    )
    print(json.dumps(updated, ensure_ascii=False, indent=2))
