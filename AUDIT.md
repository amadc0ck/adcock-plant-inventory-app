# Architecture & code quality audit

**Audited 2026-09-10** against `index.html` @ v2.31.1 (12,911 lines) and
`adcock-plant-inventory` (Edge Functions, 32 files). Analysis only — no
application code was changed.

## The five things that matter most

1. **There are no automated tests, and 230 commits in ~90 days deploy straight
   to production.** Five distinct production faults occurred in the last two
   days alone. Everything else in this document is secondary to that.
2. **`modalContent()` is 1,784 lines with cyclomatic complexity 257.** The next
   worst function is 48. It is 15% of the JavaScript and the single edit point
   for ~20 unrelated dialogs.
3. **Duplication is LOW in aggregate but concentrated in predicates**, and that
   exact class caused four separate "the tile and the list disagree" bugs.
4. **`REFERENCE.md` and `BACKLOG.md` are treated as specification and are
   unverified.** Two production faults came from building against a document
   that was wrong.
5. **The architecture is otherwise sound and deliberately so.** The single-file,
   no-build constraint is a defensible choice that has been honoured
   consistently. This is not a structurally troubled codebase; it is an
   untested one.

---

## Phase 0 — Ground truth

### Stated intent

From `~/Projects/CLAUDE.md` and `REFERENCE.md`:

- **One file, no build step, no framework, no external JS libraries.** Hard
  constraint #1. Everything ships inline in `index.html`.
- **Taxa and specimens are separate concepts** (SPECIES-1): `taxa` holds what a
  KIND of plant is, `plants` holds an individual. Species facts live once.
- **People/photos/locations are referenced by id, never denormalised.**
- **Accession numbers are immutable and server-generated.**
- **Schema changes are manual**, applied by hand in the Supabase SQL editor and
  recorded in `REFERENCE.md`.
- **Reads may go through views; writes go to base tables.**

### Actual structure

| | |
| --- | --- |
| `index.html` | 12,911 lines — 805 CSS, 12,084 JS, 471 top-level functions, one scope |
| `tools/boot-check.mjs` | 80 lines, added 2026-09-10 after a boot failure |
| `BACKLOG.md` / `REFERENCE.md` | 4,677 / 1,029 lines — the design record |
| Edge Functions | 9 Deno/TypeScript functions in a second repo |
| Persistence | Supabase Postgres, PostgREST, RLS on every table |
| Deploy | `git push` → GitHub Pages. No CI, no build, no gate. |

Data flow is consistent and legible: `loadAll()` fetches ~18 tables into a
single `state` object; screen functions render strings from `state`; mutations
`restPatch`/`restPost` then call `loadAll()` again. There is no client-side
cache invalidation problem because there is no cache.

### Where intent and reality diverge

1. **"Complete code blocks, never fragments" (style rule) vs `modalContent`** —
   a 1,784-line function is not a code block anyone holds in their head.
2. **`REFERENCE.md` claims to be the schema source of truth, and is wrong in at
   least one place** — it asserted `identifications` carries `taxa_id`; the
   column does not exist (`42703` in production, 2026-09-09). Corrected.
3. **The "deletion/merge cleanup order" list in REFERENCE §6 was 5 steps and
   needed 9.** `mergePlants()` was built from it and destroyed watering and
   bloom history on every merge for ~10 days.
4. **No stated testing intent at all.** Not a divergence so much as a gap: the
   contract is silent, so nothing is being violated — but nothing is protected.

### Idiom

Vanilla ES2023, template-literal rendering, no classes, no modules, no
inheritance. Judged on its own terms this is a coherent style, consistently
applied. **Sections of this prompt do not apply and were not measured:**
import/dependency graphs, afferent/efferent coupling, instability, distance from
main sequence, LCOM, DIT/NOC, LSP, ISP, DIP, mutation coverage, dependency CVEs,
license audit. There are no modules, classes, inheritance, or dependencies.

---

## Phase 1 — Measurements

**Tooling:** ESLint 9 (via `npx`, temp cache, nothing added to the repo) for
complexity; a purpose-written normalised-window clone detector for duplication;
`git log` for churn. **jscpd could not be used** — three invocations no-opped
(0.4 ms, 0 files) against the 668 KB single file. Flagged rather than guessed.

### Complexity — ESLint, 94 findings

| Rule | Count |
| --- | --- |
| `complexity` > 10 | **71** |
| `complexity` > 20 | **20** |
| `max-lines-per-function` > 80 | 12 |
| `max-depth` > 4 | 10 |
| `max-params` > 4 | 1 |

Worst offenders (cyclomatic):

| Function | Complexity | Lines |
| --- | --- | --- |
| `modalContent` | **257** | **1,784** |
| *(anon, line 484)* | 48 | — |
| `renderLightbox` | 37 | — |
| `openModal` | 35 | — |
| `screenInbox` | 34 | — |
| `screenPlantDetail` | 33 | 328 |
| `screenTaxonDetail` | 30 | 233 |
| `screenGallery` | 30 | 238 |
| `workQueueDetail` | 29 | 220 |

Distribution is otherwise healthy: **471 functions, median 11 lines, mean 25.**
Only 13 exceed 100 lines. The problem is concentrated, not pervasive.

### Duplication — own detector

| Window | Duplicated blocks | Occurrences |
| --- | --- | --- |
| 8 lines | 8 | 16 |
| 4 lines | 12 | 24 |

**This is low for 12,084 lines** and shared rendering is genuinely well factored
— `photoActionsHtml`, `plantPicker`, `locationPicker`, `fieldRow` are each used
from 4+ call sites. Aggregate duplication is not a finding.

**Predicate duplication is**, and it does not show at these window sizes because
the copies are 2–4 lines. Four measured incidents:

| Ship | The duplicated rule |
| --- | --- |
| v2.19.0 | six hand-copied inbox filters → `isInboxPhoto()` |
| v2.22.0 | `taxaMissingOnlyLight()` bypassing the list function |
| v2.23.1 | `screenTaxa()`'s own copy of the incomplete-profile test |
| v2.29.0 | `expectedToBloom()` / `bloomsDeferredCount()` → `taxonBloomsNow()` |

### Churn

- **230 of 308 commits touch `index.html`** (75%), all within ~90 days.
- `BACKLOG.md` 216, `REFERENCE.md` 80.
- Churn is effectively uniform across the file — there is one file, so
  correlating churn against complexity hotspots is not meaningful here.

### Error handling

| | Count |
| --- | --- |
| `catch (e)` blocks | **119** |
| toast-only (shown to user, not recorded) | **71** |
| silently swallowed (`catch {}`) | **14** |
| with an explanatory comment | 7 |

Nothing is logged anywhere. A failure that happens while nobody is looking at
the screen leaves no trace.

### Testing

**Zero automated tests.** One tool exists: `tools/boot-check.mjs`, written
2026-09-10 in response to a two-hour outage. No coverage measurement is
possible because there is nothing to measure.

### Security & hygiene

- **Secrets: clean.** Audited 2026-09-08. A live Google OAuth client secret was
  found in the Edge Functions git history and purged before that repo's first
  push; the secret was rotated twice and verified. `.gitignore` covers
  `secrets/`, `tools/.migration/`, `response*.json`.
- **Dependencies: none in the app.** Nothing to CVE-scan. Edge Functions pin
  `npm:@supabase/supabase-js@2`.
- **RLS is blanket `for all to authenticated` on every table except
  `google_auth_tokens`.** Any authenticated user has full write access. A
  read-only guest view is a real design change, correctly scoped in BACKLOG and
  not started.
- **`public_plant_inventory`** is a deliberately narrow public view; locations
  and photos are excluded on purpose because location names map the interior of
  a home.

---

## Phase 2 — Findings

### F1 · No safety net · CRITICAL · effort M

**What.** No automated tests of any kind against 12,084 lines of JavaScript
deployed directly to production 230 times in 90 days.

**Evidence.** Zero test files. `node --check` was the only pre-ship gate and it
only parses. Five production faults in 48 hours:

| Fault | Undetected for | Cause class |
| --- | --- | --- |
| App failed to boot (`SEASON_MONTHS` TDZ) | ~2 hours | declaration order |
| `mergePlants` destroyed watering/bloom history | ~10 days | stale cleanup list |
| Every backup made un-restorable by a column drop | ~1 day | schema/consumer drift |
| `deleteTaxon` deleted against a non-existent column | first use | doc treated as schema |
| Tile and list disagreeing | 4 occurrences | duplicated predicate |

**Cost.** Every one was found by Amanda in normal use, not by a check. Three
were data-affecting. The merge fault is unrecoverable for anything merged in
that window.

**Not a hypothetical risk. A measured rate of roughly one production fault per
day of active development.**

### F2 · `modalContent()` is a god function · HIGH · effort L

**What.** `index.html:6800` — 1,784 lines, cyclomatic complexity **257**,
roughly 20 unrelated dialogs dispatched through one `if (type === …)` chain.

**Evidence.** ESLint `complexity` 257 vs 48 for the next worst. 15% of all JS.

**Cost.** Every modal edit happens in the same function, so unrelated dialogs
share a blast radius; it cannot be reasoned about or tested in isolation; and it
is the most likely place for a mis-anchored edit to land silently. This session
required 6 separate string-anchor searches inside it to avoid ambiguous matches.

**This is an OCP violation with a real cost, not a principle citation:** adding
a modal means editing a 1,784-line function rather than adding a case.

### F3 · One rule, many copies · HIGH · effort S

**What.** Membership predicates re-implemented at call sites instead of being
called.

**Evidence.** Four incidents (table in Phase 1). Aggregate duplication is low,
so this is *not* a general DRY problem — it is specific to boolean rules that
decide what appears in a queue.

**Cost.** The failure mode is always two numbers on one screen that cannot both
be right, and the visible one is usually the stale one. Amanda has reported this
class three times.

**Already partly fixed:** `isInboxPhoto()`, `photoHasAnyPlant()`,
`taxonInProfileQueue()`, `taxonBloomsNow()` were extracted during this session.
The remaining risk is that nothing prevents the next copy.

### F4 · Documentation is load-bearing and unverified · HIGH · effort S

**What.** `REFERENCE.md` is treated as the schema specification, including by
me, and is not checked against the database.

**Evidence.** `REFERENCE.md:452` asserted `identifications` carries `taxa_id`.
It does not — `42703` in production on first use of `deleteTaxon`
(2026-09-09). REFERENCE §6's merge cleanup list was 5 steps and needed 9;
`mergePlants` was built from it (F1).

**Cost.** The design record is the project's greatest asset — it is genuinely
excellent and is why a cold session can pick anything up. That is exactly why a
wrong line in it propagates into code.

### F5 · Errors are shown, never recorded · MEDIUM · effort S

**What.** 119 `catch` blocks; 71 surface a toast, 14 swallow silently, none log.

**Evidence.** `grep -c "catch (e)"` = 119; `catch (e) { toast(` = 71;
`catch {}` / `catch (e) {}` = 14.

**Cost.** A batch running 60 Claude calls, an upload, or a background refresh
that fails while the screen is not being watched leaves no trace. Diagnosis
depends on Amanda seeing a toast at the moment it appears.

### F6 · Blanket RLS · MEDIUM · effort L · already scoped

Every table is `for all to authenticated`. Correctly identified in BACKLOG with
three costed options. Not started. Only matters if a second person ever gets an
account — flagged, not urgent.

---

## What is already good

Stated plainly because the prompt asks for it and because it is true:

- **The comments are exceptional.** Most non-obvious code carries the reasoning
  and the failed alternative. This is rare and is the main reason the codebase
  is tractable at 12k lines.
- **The design record works.** `BACKLOG.md` captures decisions, reversals, and
  why — including where two decisions contradicted each other and which won.
- **Shared rendering is properly factored.** Aggregate duplication is low.
- **The schema is well normalised.** Taxa/specimen separation, junction tables
  for genuine many-to-many, snapshot columns (`bloom_events.location_id`) where
  history must survive a move.
- **Function size is healthy** outside the handful of screen/modal functions:
  median 11 lines across 471 functions.
- **Secrets hygiene is now sound**, including history.
- **The single-file constraint has been honoured**, not eroded.
