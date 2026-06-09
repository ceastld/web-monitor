import Database from "better-sqlite3";

const db = new Database("data/web_monitor.db");
const snap = db
  .prepare("SELECT content FROM snapshots WHERE monitor_id = 3 ORDER BY id DESC LIMIT 1")
  .get();
const html = JSON.parse(snap.content).html;

const i = html.indexOf("Thursday, June 4, 2026");
console.log(html.slice(i - 500, i + 600));
