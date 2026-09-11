#!/usr/bin/env node
/* Renders real app components under both themes, using index.html's OWN <style>.
 *
 * The app cannot be inspected locally — it needs a session, and the local origin
 * has none. This inlines the actual stylesheet and real class names, so what
 * appears here is what the app will do. Anything that looks wrong here is wrong
 * there.
 *
 *   node tools/theme-preview.mjs && open tools/theme-preview.html
 */
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));

// Representative of the surfaces that have actually broken: a queue tile, the
// attn-row that was 1.28:1, an action card that inverted, a cream panel.
const SPECIMENS = `
  <div class="queue-group">
    <div class="queue-head"><h3>Needs you now</h3><span class="queue-total">6</span></div>
    <div class="queue-grid">
      <button class="queue-tile is-urgent"><div class="queue-num">5</div>
        <div class="queue-title">Due for a check-in</div>
        <div class="queue-sub">Scheduled, or nothing photographed in 14 days</div></button>
      <button class="queue-tile"><div class="queue-num">17</div>
        <div class="queue-title">Waiting to be planted</div>
        <div class="queue-sub">In a staging area, not yet in the ground</div></button>
    </div>
  </div>

  <div class="queue-group" style="margin-top:18px;">
    <button class="attn-row on-dark">
      <div style="flex:1;min-width:0;">
        <div class="attn-title">Worked recently</div>
        <div class="attn-sub">16 plants in the last 7 days &middot; 9 with no note yet</div>
      </div>
    </button>
  </div>

  <div class="section-card" style="margin-top:18px;">
    <h4>Growing it</h4>
    <div class="field-row"><div style="flex:1;">Container or ground</div><div>Happy either way</div></div>
    <div class="field-row"><div style="flex:1;">Water</div><div>Low</div></div>
    <div class="field-row"><div style="flex:1;">Soil</div><div class="value-blank">&mdash;</div></div>
  </div>

  <div class="action-card on-dark" style="margin-top:18px;">
    <button class="action-row"><span class="action-label">Edit species record</span></button>
    <button class="action-row action-danger"><span class="action-label">Delete species</span></button>
  </div>

  <div class="tag-card" style="margin-top:18px;padding:14px 16px;">
    <div class="tag-id">ABG-2026-0101 &middot; Bucket 28</div>
    <div style="font-size:14px;margin-top:3px;">A cream panel sitting on the page ground.</div>
    <div class="subtle" style="font-size:12px;margin-top:4px;">Subtle text on the panel.</div>
    <div class="wrap-gap" style="margin-top:10px;">
      <button class="btn btn-accent btn-sm">Primary</button>
      <button class="btn btn-secondary btn-sm">Secondary</button>
      <button class="btn-ghost" style="font-size:12.5px;">Ghost</button>
    </div>
  </div>
`;

const page = `<!doctype html><meta charset="utf-8"><title>ABG themes</title>
<style>${css}</style>
<style>
  body{padding:0;margin:0;background:#111;}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:100vh;}
  .pane{padding:24px;}
  .pane h2{font:500 13px/1 'Inter',sans-serif;letter-spacing:.5px;text-transform:uppercase;
    margin:0 0 18px;opacity:.65;}
  .pane[data-theme="night"]{background:var(--ground);color:var(--on-ground);}
  .pane[data-theme="daylight"]{background:var(--ground);color:var(--on-ground);}
</style>
<div class="split">
  <div class="pane" data-theme="night"><h2>Night &mdash; indoors</h2>${SPECIMENS}</div>
  <div class="pane" data-theme="daylight"><h2>Daylight &mdash; outside in sun</h2>${SPECIMENS}</div>
</div>`;

writeFileSync(new URL("../tools/theme-preview.html", import.meta.url), page);
console.log("  wrote tools/theme-preview.html");
