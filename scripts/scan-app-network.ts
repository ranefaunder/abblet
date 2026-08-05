/**
 * Scan published app version code for raw network APIs (fetch/XHR/WebSocket).
 * Usage: bun scripts/scan-app-network.ts
 * Informational — CSP is the enforcement layer.
 */
import { Database } from "bun:sqlite";

const dbPath = process.env.DB_PATH ?? "server/database/app.db";
const db = new Database(dbPath, { readonly: true });

const PATTERNS = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", re: /\bXMLHttpRequest\b/ },
  { name: "WebSocket", re: /\bWebSocket\b/ },
  { name: "navigator.sendBeacon", re: /navigator\.sendBeacon\s*\(/ },
] as const;

type Row = { app_id: string; slug: string; title: string; code: string };

const rows = db
  .query<Row, []>(
    `SELECT a.id as app_id, a.slug, a.title, v.code as code
     FROM apps a
     JOIN app_versions v ON v.id = a.published_version_id
     WHERE a.is_draft = 0 AND a.visibility = 'public' AND v.code IS NOT NULL`,
  )
  .all();

let hits = 0;
for (const row of rows) {
  const code = row.code ?? "";
  const found = PATTERNS.filter((p) => p.re.test(code)).map((p) => p.name);
  if (found.length) {
    hits++;
    console.log(`${row.slug}\t${row.title}\t${found.join(",")}`);
  }
}

console.log(`\nScanned ${rows.length} published apps; ${hits} with raw network APIs.`);
console.log("Note: Remiix.ai / Remiix.connect are expected; CSP blocks non-platform connects.");
