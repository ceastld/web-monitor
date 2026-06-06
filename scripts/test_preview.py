import json
import urllib.request

req = urllib.request.Request(
    "http://127.0.0.1:8765/api/monitors/3/preview",
    method="POST",
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=120) as resp:
    data = json.loads(resp.read().decode("utf-8"))
print(json.dumps(data, ensure_ascii=False, indent=2))
