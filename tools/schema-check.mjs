#!/usr/bin/env node
/* Verifies every column index.html writes actually exists.
 *
 * Two production faults came from a column reference that was never checked:
 *   · deleteTaxon deleted against `identifications.taxa_id`, which does not
 *     exist — 42703 on first use. The claim came from REFERENCE.md.
 *   · mergePlants was built from REFERENCE's cleanup list, which was five
 *     steps and needed nine, and destroyed watering and bloom history.
 *
 * Every list in this repo is a document. The schema is not. PostgREST answers
 * a column question in one request: 200 means it exists (RLS then returns []),
 * 400 means it does not. Anon cannot read rows, so this is safe to run against
 * production and needs no secret.
 *
 *   node tools/schema-check.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cfg = html.match(/SUPABASE_URL:\s*"([^"]+)"[\s\S]*?SUPABASE_PUBLISHABLE_KEY:\s*"([^"]+)"/);
if (!cfg) { console.error("could not read CONFIG from index.html"); process.exit(2); }
const [, URL_, KEY] = cfg;

/* Harvest column names per table. Regex alone conflates adjacent calls — an
   early version attributed `task_id` to `tasks` and `plant_id` to `plants` by
   running past the end of one call into the next. This walks the source and
   matches balanced delimiters instead, so a column is only ever credited to the
   call it is actually inside. */
const wanted = new Map();
const add = (t, c) => { if (!wanted.has(t)) wanted.set(t, new Set()); wanted.get(t).add(c); };

function balanced(src, from, open, close) {
  let i = src.indexOf(open, from);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return src.slice(i + 1, j);
  }
  return null;
}

for (const m of html.matchAll(/rest(Patch|Post|Upsert|Delete|Get|GetAll)\(\s*"([a-z_]+)"/g)) {
  const table = m[2];
  const callArgs = balanced(html, m.index, "(", ")");
  if (!callArgs) continue;
  // Body object: the first balanced { } inside this call only.
  const body = balanced(callArgs, 0, "{", "}");
  // Strip string and template literals first: `body: `…from a photo: ${x}`` was
  // yielding a column called "photo". A key regex cannot tell prose from syntax.
  if (body) {
    const code = body
      .replace(/`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const k of code.matchAll(/(?:^|[\s,{])([a-z_][a-z0-9_]*)\s*:/g)) add(table, k[1]);
  }
  // Filter string: col=eq.… and order=col, again scoped to this call.
  for (const f of callArgs.matchAll(/([a-z_][a-z0-9_]*)=(?:eq|in|is|neq|not)\./g)) add(table, f[1]);
  for (const f of callArgs.matchAll(/order=([a-z_][a-z0-9_]*)/g)) add(table, f[1]);
}

// Not columns: query params, and JS properties that look like `x:` in a body.
// Not columns: query params, and JS properties that look like `x:` in a body.
const skip = new Set(["select", "limit", "order", "on_conflict", "length", "type", "method", "headers", "body"]);
const head = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/* Fired in parallel. Sequentially this was 79 round trips and 30 seconds, which
   is long enough that a pre-push hook gets bypassed — and a bypassed gate is
   worse than no gate, because it looks like one. */
const jobs = [];
for (const [table, cols] of [...wanted].sort()) {
  for (const col of [...cols].sort()) {
    if (skip.has(col)) continue;
    jobs.push((async () => {
      const r = await fetch(`${URL_}/rest/v1/${table}?select=${col}&limit=1`, { headers: head });
      return { table, col, ok: r.status === 200, status: r.status };
    })());
  }
}
const results = await Promise.all(jobs);

const byTable = new Map();
for (const r of results) {
  if (!byTable.has(r.table)) byTable.set(r.table, []);
  byTable.get(r.table).push(r);
}
let missing = 0;
for (const [table, rows] of [...byTable].sort()) {
  const bad = rows.filter((r) => !r.ok);
  missing += bad.length;
  console.log(`  ${bad.length ? "FAIL" : "ok  "}  ${table.padEnd(24)} ${rows.length} column(s)` +
    (bad.length ? `\n          missing: ${bad.map((b) => b.status === 400 ? b.col : `${b.col} (HTTP ${b.status})`).join(", ")}` : ""));
}
console.log(`\n  ${results.length} columns checked, ${missing} missing`);
process.exit(missing ? 1 : 0);
