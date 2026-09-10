#!/usr/bin/env node
/* Extracts index.html's <script> and EXECUTES its top level against a stub DOM.
 *
 * `node --check` only PARSES. It cannot see "Cannot access X before
 * initialization" — that is a property of declaration ORDER at runtime, and it
 * took the app down from v2.30.0 to v2.31.1 while every syntax check passed
 * clean. `SEASON_MONTHS` was declared 400 lines below a const derived from it.
 *
 *   node tools/boot-check.mjs           # defaults to ../index.html
 *
 * Exits non-zero on a TDZ or undefined-reference error. Any OTHER error means
 * it reached real runtime and hit the limits of the stub — that is a pass, and
 * the message says so. This is a smoke test for module-level wiring, nothing
 * more; it does not render, fetch, or exercise behaviour.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* boot() is async, so anything it throws arrives as an unhandled rejection
   AFTER runInContext returns — outside the try below, which is why an earlier
   version printed PASS and then exited 1 anyway. Only an initialization-order
   error is a real failure here; everything else is the stub running out. */
let failed = false;
process.on("unhandledRejection", (e) => {
  const msg = String((e && e.message) || e);
  if (/before initialization|is not defined/.test(msg)) {
    console.error("FAIL — " + (e && e.name) + ": " + msg);
    failed = true;
  }
});
process.on("exit", (code) => { if (code === 0 && failed) process.exitCode = 1; });

const file = process.argv[2] || new URL("../index.html", import.meta.url).pathname;
const html = readFileSync(file, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no <script> block found in " + file); process.exit(2); }

// Returns itself for any property or call, so chained DOM access never throws
// for the wrong reason and mask a real one.
const el = new Proxy(function () {}, {
  get: (t, k) => (k === "value" || k === "textContent" || k === "innerHTML" ? ""
    : k === "checked" ? false : k === Symbol.toPrimitive ? () => "" : el),
  set: () => true, apply: () => el, construct: () => el,
});
const loc = { href: "", search: "", hash: "", pathname: "/", reload() {} };
const ctx = {
  document: {
    getElementById: () => el, querySelector: () => el, querySelectorAll: () => [],
    createElement: () => el, addEventListener: () => {}, body: el,
    documentElement: el, head: el, title: "",
  },
  window: { location: loc, addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  location: loc, history: { pushState() {}, replaceState() {} },
  navigator: { userAgent: "node", onLine: true },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: async () => ({ ok: false, status: 0, text: async () => "", json: async () => ({}) }),
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: () => 0, URL, Blob: class {}, FormData: class {},
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  crypto: { randomUUID: () => "00000000-0000-0000-0000-000000000000" },
  atob: () => "", btoa: () => "", alert() {}, confirm: () => false,
};
ctx.globalThis = ctx; ctx.self = ctx;

try {
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx, { filename: "index.html<script>" });
  console.log("PASS — top level executed with no initialization-order error");
} catch (e) {
  const msg = String((e && e.message) || e);
  if (/before initialization|is not defined/.test(msg)) {
    console.error("FAIL — " + e.name + ": " + msg);
    console.error(String(e.stack).split("\n").slice(1, 3).join("\n"));
    process.exit(1);
  }
  console.log("PASS — reached runtime, no initialization-order error");
  console.log("       (stub limit: " + e.name + ": " + msg.slice(0, 80) + ")");
}
