import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src", "services");
const distDir = path.join(root, "dist", "services");

fs.mkdirSync(distDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith(".browser.js")) {
    fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
    console.log(`[build] copied ${file} -> dist/services/`);
  }
}
