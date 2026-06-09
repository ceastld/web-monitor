"""Fix GitHub monitor selectors that embed logged-in/logged-out in CSS paths."""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "web_monitor.db"

MONITOR_5_URL = "https://github.com/QuickerHub/quicker-rpc"
MONITOR_5_SELECTOR = (
    "#repo-content-pjax-container "
    "table.Table-module__Box__HZKiQ "
    "tbody tr.DirectoryContent-module__Box_3__gl6dE "
    "> td.bgColor-muted.p-1.rounded-top-2"
)

MONITOR_6_SELECTOR = "#repo-content-pjax-container div.LatestCommit-module__Box__B25ZT"


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "UPDATE monitors SET url = ?, selector = ?, profile_id = NULL WHERE id = 5",
            (MONITOR_5_URL, MONITOR_5_SELECTOR),
        )
        conn.execute(
            "UPDATE monitors SET selector = ?, profile_id = NULL WHERE id = 6",
            (MONITOR_6_SELECTOR,),
        )
        conn.commit()
        print("Updated monitor #5 url/selector; cleared profile (public repo)")
        print("Updated monitor #6 selector; cleared profile (public repo)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
