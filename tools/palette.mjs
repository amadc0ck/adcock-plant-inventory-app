#!/usr/bin/env node
/* Generates tools/palette.html from index.html — the real variables, the real
 * usage counts, and real WCAG contrast for every text/ground pair.
 *
 * Written because the same fault happened three times: a component built for
 * the cream panel was moved onto the dark page and its colours inverted.
 * .action-row (v2.27.3), then .attn-row twice. Each was invisible in source and
 * obvious on screen. This page makes the ground/foreground pairing visible.
 *
 *   node tools/palette.mjs && open tools/palette.html
 */
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const root = html.slice(html.indexOf(":root{"), html.indexOf("}", html.indexOf(":root{")));
const vars = [...root.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => ({
  name: "--" + name, value: value.trim(),
  uses: (html.match(new RegExp(`var\\(--${name}\\)`, "g")) || []).length,
}));

// The brand sheet. Kept here so the page can say which brand colours the app
// actually uses, and which it has never touched.
const BRAND = [
  ["Deep Garden Green", "#243E36"], ["Aloe Green", "#70866B"],
  ["Terra Cotta", "#D97474"],       ["Aloe Bloom Orange", "#F2A65A"],
  ["Cactus Flower Pink", "#D67A9A"],["Agave Blue", "#7CA7A1"],
  ["Warm Cream", "#F5EFE3"],        ["Charcoal", "#252925"],
];

const hex = (v) => (/^#([0-9a-f]{6})$/i.test(v) ? v : null);
const GROUNDS = vars.filter((v) => ["--bg", "--bg-raised", "--parchment", "--parchment-dim"].includes(v.name) && hex(v.value));
const INKS = vars.filter((v) => hex(v.value) && !GROUNDS.includes(v));

const page = `<!doctype html><meta charset="utf-8"><title>ABG palette</title>
<style>
  :root{${vars.map((v) => `${v.name}:${v.value};`).join("")}}
  body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#1b2e28;color:#F5EFE3;padding:32px;}
  h1{font:600 24px/1.2 Georgia,serif;margin:0 0 4px;}
  h2{font:500 17px/1.2 Georgia,serif;margin:36px 0 12px;color:#9fb8a8;letter-spacing:.3px;}
  p.note{color:#9fb8a8;margin:0 0 8px;max-width:70ch;}
  table{border-collapse:collapse;width:100%;font-size:12.5px;}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid rgba(245,239,227,.12);}
  th{color:#9fb8a8;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.4px;}
  .sw{width:34px;height:22px;border-radius:5px;display:inline-block;vertical-align:middle;border:1px solid rgba(0,0,0,.25);}
  .bar{height:7px;border-radius:4px;background:#7CA7A1;display:inline-block;vertical-align:middle;}
  .pass{color:#8fd6a8;} .warn{color:#F2A65A;} .fail{color:#ff9c9c;font-weight:600;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:12px;}
  .card{border-radius:10px;padding:12px 14px;border:1px solid rgba(245,239,227,.14);}
  .mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;}
  .spec{border-radius:10px;padding:14px 16px;margin-bottom:10px;}
</style>
<h1>Adcock Botanical Garden — palette</h1>
<p class="note">Generated from <span class="mono">index.html</span> on ${new Date().toISOString().slice(0, 10)}.
Regenerate with <span class="mono">node tools/palette.mjs</span>. Every number here is measured, not asserted.</p>

<h2>Brand palette · what the app actually uses</h2>
<table><tr><th>Brand colour</th><th>Hex</th><th>CSS variable</th><th>Uses in index.html</th></tr>
${BRAND.map(([n, h]) => {
  const m = vars.filter((v) => hex(v.value) && v.value.toUpperCase() === h.toUpperCase());
  const uses = m.reduce((a, v) => a + v.uses, 0);
  const max = Math.max(...vars.map((v) => v.uses), 1);
  return `<tr><td><span class="sw" style="background:${h}"></span> ${n}</td><td class="mono">${h}</td>
    <td class="mono">${m.length ? m.map((v) => v.name).join(", ") : '<span class="fail">not mapped</span>'}</td>
    <td>${uses ? `<span class="bar" style="width:${Math.round((uses / max) * 110)}px"></span> ${uses}` : '<span class="fail">0 — unused</span>'}</td></tr>`;
}).join("")}</table>

<h2>Contrast · every ink on every ground</h2>
<p class="note"><strong>WCAG AA is 4.5:1 for body text, 3:1 for large text.</strong>
A cell that fails is a component that will be unreadable if it is ever placed on that ground —
which is exactly how three components ended up invisible after being moved.</p>
<table><tr><th>Ink</th>${GROUNDS.map((g) => `<th>${g.name}<br><span class="mono">${g.value}</span></th>`).join("")}</tr>
${INKS.map((i) => `<tr><td><span class="sw" style="background:${i.value}"></span> <span class="mono">${i.name}</span></td>
  ${GROUNDS.map((g) => "<td data-c='" + i.value + "|" + g.value + "'></td>").join("")}</tr>`).join("")}
</table>

<h2>Specimens · the same component on both grounds</h2>
<p class="note">If a block below is hard to read, that pairing exists somewhere in the app.</p>
<div class="grid">
${GROUNDS.map((g) => `<div>
  <div class="mono" style="color:#9fb8a8;margin-bottom:6px;">${g.name}</div>
  ${INKS.slice(0, 8).map((i) => `<div class="spec" style="background:${g.value};color:${i.value};">
    <div style="font-weight:600;">Worked recently</div>
    <div style="font-size:11.5px;">245 plants · 242 with no note</div>
    <div class="mono" style="font-size:10px;opacity:.8;">${i.name}</div></div>`).join("")}
</div>`).join("")}
</div>

<h2>All variables</h2>
<table><tr><th>Variable</th><th>Value</th><th>Uses</th></tr>
${vars.sort((a, b) => b.uses - a.uses).map((v) => `<tr><td><span class="sw" style="background:${v.value}"></span> <span class="mono">${v.name}</span></td>
  <td class="mono">${v.value}</td><td>${v.uses}</td></tr>`).join("")}</table>

<script>
  const lum = (h) => { const c = h.replace("#",""); const [r,g,b] = [0,2,4].map(i => parseInt(c.substr(i,2),16)/255);
    const f = (x) => x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4);
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
  for (const td of document.querySelectorAll("[data-c]")) {
    const [ink, ground] = td.dataset.c.split("|");
    const [a,b] = [lum(ink), lum(ground)].sort((x,y)=>y-x);
    const r = (a + 0.05) / (b + 0.05);
    td.textContent = r.toFixed(2) + ":1";
    td.className = r >= 4.5 ? "pass" : r >= 3 ? "warn" : "fail";
  }
</script>`;

writeFileSync(new URL("../tools/palette.html", import.meta.url), page);
console.log("  wrote tools/palette.html");
console.log(`  ${vars.length} variables · ${BRAND.filter(([, h]) => !vars.some((v) => hex(v.value) && v.value.toUpperCase() === h.toUpperCase())).length} brand colours unmapped`);
