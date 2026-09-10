/* Loads index.html's <script> into a vm context and hands it back, so tests can
 * call the app's real functions.
 *
 * index.html cannot be imported — there is no build step and no module system,
 * which is a deliberate constraint (CLAUDE.md #1). This is the seam that makes
 * the code testable without breaking it: extract the script, execute it against
 * a stub DOM, and reach into the context for whatever the test needs.
 *
 * `boot()` runs on load and fails against the stub. That is expected and
 * harmless — it happens after every top-level declaration, so everything a test
 * wants already exists by then. Its rejection is swallowed here; a genuine
 * initialization-order error is what tools/boot-check.mjs is for.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

export function load(file) {
  const path = file || new URL("../index.html", import.meta.url).pathname;
  const html = readFileSync(path, "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("no <script> block in " + path);

  const el = new Proxy(function () {}, {
    get: (t, k) => (k === "value" || k === "textContent" || k === "innerHTML" ? ""
      : k === "checked" ? false : k === Symbol.toPrimitive ? () => "" : el),
    set: () => true, apply: () => el, construct: () => el,
  });
  const loc = { href: "", search: "", hash: "", pathname: "/", reload() {} };
  const ctx = {
    document: {
      getElementById: () => el, querySelector: () => el, querySelectorAll: () => [],
      createElement: () => el, addEventListener() {}, body: el,
      documentElement: el, head: el, title: "",
    },
    window: { location: loc, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    location: loc, history: { pushState() {}, replaceState() {} },
    navigator: { userAgent: "node", onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    // Never let a test reach the network. A test that needs data sets `state`.
    fetch: async () => { throw new Error("fetch is not available in tests"); },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    requestAnimationFrame: () => 0, URL, Blob: class {}, FormData: class {},
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    crypto: { randomUUID: () => "00000000-0000-0000-0000-000000000000" },
    atob: () => "", btoa: () => "", alert() {}, confirm: () => false,
  };
  ctx.globalThis = ctx; ctx.self = ctx;

  const swallow = () => {};
  process.on("unhandledRejection", swallow);
  vm.createContext(ctx);
  try { vm.runInContext(m[1], ctx, { filename: "index.html<script>" }); }
  catch (e) {
    // Only boot-time DOM failures are tolerable; anything else is a real fault.
    if (!/Cannot (read|set) propert/.test(String(e.message))) throw e;
  }
  /* Top-level `const` goes into the global LEXICAL scope, not onto the global
     object — so `ctx.state` is undefined even though `state` exists. That scope
     is shared between scripts in the same context, so evaluating an expression
     reaches it. This is how a test gets at `state` and at consts like
     TAXON_PROFILE_FIELDS. */
  ctx.__eval = (expr) => vm.runInContext(expr, ctx);
  return ctx;
}

// Convenience: seed the app's state for a test, leaving everything else alone.
export function setState(ctx, patch) {
  const s = ctx.__eval("state");
  Object.assign(s, patch);
  return s;
}
