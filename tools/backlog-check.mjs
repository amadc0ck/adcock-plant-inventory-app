#!/usr/bin/env node
/* Every shipped version must have a BACKLOG entry.
 *
 * Twice now a commit landed and its write-up did not — the BACKLOG edit failed
 * on a stale anchor while the code push succeeded, so nothing looked wrong.
 * v2.27.0 and v2.32.1/v2.33.0. Nothing failed loudly either time; both were
 * found by chance.
 *
 *   node tools/backlog-check.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const backlog = readFileSync(new URL("../BACKLOG.md", import.meta.url), "utf8");
const log = execSync("git log --oneline -40", { encoding: "utf8" });
const shipped = [...new Set([...log.matchAll(/\bv(\d+\.\d+\.\d+):/g)].map((m) => m[1]))];
const missing = shipped.filter((v) => !backlog.includes(`### v${v} `));

console.log(`  ${shipped.length} versions in the last 40 commits, ${missing.length} unrecorded`);
if (missing.length) {
  console.error("  missing from BACKLOG.md: " + missing.map((v) => "v" + v).join(", "));
  process.exit(1);
}
