# Web Monitor

Headless web monitoring dashboard with Playwright, isolated login profiles, and CSS/XPath selectors.

## Features

- **Unified dashboard** — view latest captured content from all monitors
- **Custom selectors** — monitor specific page regions via CSS or XPath
- **Component embed mode** — capture a full DOM subtree with inlined styles and preview it inline
- **Visual component setup** — load a page, pick a candidate region, and preview before saving (no agent/scripts required)
- **Login profiles** — isolated browser contexts per account (Playwright `storage_state`)
- **Headless fetching** — scheduled background checks with APScheduler
- **React + TypeScript UI** — Vite dev server with HMR

## Quick start (development)

Terminal 1 — backend API:

```bash
cd web-monitor
uv sync
uv run playwright install chromium
uv run web-monitor
```

Terminal 2 — frontend with hot reload:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** (Vite proxies `/api` to `http://127.0.0.1:8765`).

## Production

```bash
cd frontend && npm run build
cd ..
uv run web-monitor
```

Open **http://127.0.0.1:8765** — FastAPI serves the built React app from `frontend/dist`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `8765` | Server port |
| `HEADLESS` | `true` | Headless mode for scheduled fetches |
| `BROWSER_TIMEOUT_MS` | `30000` | Page/selector timeout |

## Architecture

```
Profile (isolated storage_state)
   └── Monitor (url + selector + interval)
          └── Snapshot (content + hash + screenshot)

frontend/   React + TypeScript + Vite
app/        FastAPI + Playwright + SQLite
```

## License

MIT
