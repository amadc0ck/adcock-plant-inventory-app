# Remediation plan

> **Stage 0 and Stage 1 items 1.1 and 1.2 were executed 2026-09-10.** See the
> status column against each. Stage 2 is deliberately not started.

Companion to `AUDIT.md`. Every item is shippable on its own behind a green
build. No big-bang rewrite; the single-file, no-build constraint is treated as
permanent, per Amanda 2026-09-10.

## The five things that matter most

1. **Do Stage 0 first.** Characterisation tests before any refactor. Nothing
   below is safe without it, and F2 in particular must not be attempted first.
2. **Item 1.1 (pure-function test harness) is the single highest-value change
   in this plan.** It is ~1 day and it addresses the cause of 4 of the 5 recent
   faults.
3. **`modalContent` is deliberately LAST among structural work.** It is the
   scariest number in the audit and the least urgent thing to touch.
4. **Guardrails ratchet, they do not block.** A coverage floor that rises with
   each ship, not a gate that stops a Saturday afternoon.
5. **Do not adopt any of this wholesale.** Items 1.1, 1.2, 1.3 are worth doing
   this month. Everything from Stage 2 on is optional and should wait for a
   reason.

---

## Stage 0 — Safety net

### 0.1 · Extract-and-test harness · **DONE**
**Rationale** F1. **Size** M. **Depends on** nothing.

`index.html` cannot be imported. `tools/boot-check.mjs` already proves the
script can be extracted and executed in a `vm` context with a stub DOM — that
same mechanism can expose pure functions to a test file.

*Current state* — no way to call `taxonProfileGaps()` from a test.
*Target state* — `node tools/test.mjs` runs assertions against real functions.
*Migration* — extend `boot-check.mjs` into `tools/harness.mjs` that returns the
vm context; a test file imports it and asserts. Zero changes to `index.html`.
*Rollback* — delete two files.

**Acceptance** `node tools/test.mjs` exits 0, runs in under 5 s, and requires no
network or database.

### 0.2 · Characterisation tests for the queue predicates · **DONE**
**Rationale** F1, F3. **Size** S. **Depends on** 0.1.

Pin current behaviour of the rules that decide what appears in a queue:
`taxonProfileGaps`, `taxonInProfileQueue`, `isInboxPhoto`, `photoHasAnyPlant`,
`photoAwaitsPlant`, `taxonBloomsNow`, `bloomWindowWeeks`, `seasonsNow`,
`plantsAtLocation`, `plantsEverAtLocation`, `needsAttention`.

These are pure, they take plain objects, and they are where four of the recent
faults lived.

**Acceptance** each has ≥3 cases including the edge that previously broke it —
e.g. `seasonsNow(September)` still matches `late_summer`; a taxon with a
`bloom_habit` has no `bloom_season` gap; `[].every()` does not make an
empty-specimen taxon vanish.

### 0.3 · Baseline metrics recorded · **DONE**
**Rationale** measurability. **Size** S.

Record today's numbers in `AUDIT.md` (done) and add
`tools/metrics.sh` emitting: function count, functions over complexity 10 and
20, longest function, duplicated-block count, catch-block counts.

**Acceptance** one command prints the table; re-runnable to show movement.

---

## Stage 1 — Low risk, high leverage

### 1.1 · Guard the cleanup lists with a schema check · **DONE**
**Rationale** F1, F4 — cause of the merge data loss AND the `deleteTaxon`
failure. **Size** S. **Depends on** none.

`tools/schema-check.mjs`: for each table, probe every column the app writes
(`?select=<col>&limit=1` with the publishable key — `200` exists, `400` does
not, anon cannot read rows so it is safe against production). Fail if the app
references a column that is absent.

**Acceptance** run against a deliberately mistyped column name and it fails;
run against `main` and it passes. Catches the `identifications.taxa_id` class
before a user does.

### 1.2 · `boot-check` in a pre-push hook · **DONE**
**Rationale** F1 — the 2-hour outage. **Size** S. **Depends on** none.

Already written and validated. Wire it so it cannot be forgotten.

**Acceptance** `git push` with a deliberately reordered const is rejected.
**Risk** a hook that annoys gets bypassed — keep it under 2 s.

### 1.3 · Log what is currently only toasted
**Rationale** F5. **Size** S.

Add `reportError(where, e)` — `console.error` with context, and toast as now.
Replace the 14 silent `catch {}` with either a comment justifying the silence
or a call to it.

**Acceptance** no bare `catch {}` without a comment; every user-facing failure
also appears in the console with the operation name.

### 1.4 · Verify REFERENCE against the database
**Rationale** F4. **Size** S. **Depends on** 1.1.

Extend `schema-check.mjs` to parse the column lists out of `REFERENCE.md` §3
and compare to reality. Report drift; do not auto-edit.

**Acceptance** running it today reports zero drift, having been corrected on
2026-09-09.

---

## Stage 2 — Structural

Only worth doing if the code starts resisting change. It is not doing so yet.

### 2.1 · Split `modalContent` by dispatch table
**Rationale** F2. **Size** L. **Depends on** 0.1, 0.2, and characterisation
tests for the specific modals being moved.

*Current* — one 1,784-line function, `if (type === "x")` ×20.
*Target* — `const MODALS = { x: (data) => …, y: (data) => … }` and
`modalContent()` becomes a 3-line lookup. Same file, same scope, no build.
*Migration* — **one modal per commit.** Move the branch into the table, run the
harness, ship. 20 commits, each independently revertible, build green at every
one.
*Rollback* — revert the single commit; the `if` chain and the table can coexist
during the transition.

**Acceptance** complexity of `modalContent` under 10; no modal's rendered output
changes (assert on the returned HTML string for each type before and after).
**Risk** MEDIUM — the modals are the most-touched surface in the app. Mitigated
entirely by doing it one at a time and by 0.2 existing first.

### 2.2 · Screen functions over 200 lines
**Rationale** F2. **Size** M. **Depends on** 2.1's pattern proving out.

`screenPlantDetail` (328), `screenLocationDetail` (302), `screenGallery` (238),
`screenTaxonDetail` (233), `workQueueDetail` (220). Extract each card/section
into a named function. Lower value than 2.1 and lower risk.

---

## Stage 3 — Needs a decision, not a refactor

### 3.1 · Read-only access
Already scoped in BACKLOG with three costed options. **Option A** show it in
person (nothing to build). **Option B** a second Supabase user — two minutes,
full write access, fine for one trusted person. **Option C** a real viewer role
— 17 tables, mechanical, and the test that matters is that Amanda's own access
does not break. Pick when there is a person to give it to, not before.

### 3.2 · Should `index.html` become several files?
Answered "permanent" on 2026-09-10 and this plan respects that. Recorded only so
the tradeoff is on paper: multiple `<script>` files would need no build step and
would make F2 structural rather than cosmetic, at the cost of load-order hazard
and the Claude.ai Project sync expecting one file. **Revisit only if 2.1 proves
insufficient.**

---

## Guardrails

Intended to ratchet, never to block a Saturday.

| Check | Threshold | When |
| --- | --- | --- |
| `boot-check.mjs` | must pass | pre-push |
| `schema-check.mjs` | must pass | pre-push |
| `test.mjs` | must pass | pre-push |
| complexity | **no NEW function above 15**; existing ones grandfathered | manual, reviewed at ship |
| duplicated 4-line blocks | must not increase from 12 | `metrics.sh` |
| test count | must not decrease | `metrics.sh` |

**Deliberately not adopted:** a coverage percentage floor (there is no coverage
tool without a build step and inventing one is not worth it), CI (GitHub Actions
on a repo with no build adds latency between edit and deploy, which is the thing
this project is optimised for), and import-boundary linting (there are no
imports).

### ADRs worth writing
1. **Why one file, no build.** Currently implicit in CLAUDE.md as a constraint
   with no recorded reasoning. It is a real decision with real tradeoffs.
2. **Why documents are the design record.** BACKLOG/REFERENCE are unusual and
   effective; the reasoning should be recorded, along with F4's caveat that a
   document is not a schema.

---

## Metrics and what success looks like

Track from `tools/metrics.sh`: functions over complexity 10 / 20, longest
function, duplicated-block count, bare `catch {}` count, test count, and
**production faults per week** — the only one that matters.

**30 days.** Stage 0 and Stage 1 complete. Fault rate down from ~1/day of
active development to near zero for the four classes now guarded. `modalContent`
untouched.

**90 days.** `modalContent` under complexity 10 via 2.1, or a recorded decision
that it is not worth doing. Baseline metrics show movement in at least three of
the tracked numbers. No new function above complexity 15.

**Success is not a lower complexity number.** It is Amanda not finding faults in
normal use.
