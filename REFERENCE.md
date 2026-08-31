# Technical Reference — Adcock Botanical Garden

Current version: see `APP_VERSION` in `index.html`.

Rules for this file:
- When this document and the code disagree, inspect Git history and the code, then fix this document.
- Update it whenever a feature, schema, architectural decision, or version changes.
- Record failed approaches. The "why not" is worth more than the "what."

---

## 1. Purpose & Scope

A personal, single-user plant collection inventory. Tracks individual specimens by permanent accession number, their physical location (down to a specific bucket on a wall of ~92 containers), photo history, AI-assisted identification, propagation lineage, and collection metadata.

Not multi-user and not public-facing. Every table's RLS policy grants full access to any authenticated user because there is exactly one legitimate user.

---

## 2. Architecture

```
Frontend (GitHub Pages)          single-file HTML/CSS/JS, no build step
  amadc0ck.github.io/adcock-plant-inventory-app/
        |  REST + Edge Function calls
        v
Supabase                          Postgres + Auth + Edge Functions
  project ref: fsckwgicmvviefuivgza
        |
        v
Google Drive (photo files, user OAuth)   Pl@ntNet / Claude (identification)
```

Deliberate simplicity constraints, still honored:
- No build step, no framework. Vanilla JS, single `index.html`.
- No external JS libraries — not even for EXIF parsing, which is hand-rolled.
- Everything directly editable, no bundler or transpiler in the loop.

---

## 3. Database Schema

All tables have RLS enabled with a single policy: `for all to authenticated using (true) with check (true)`.

### `locations`
Physical containers and spaces. Self-referencing hierarchy (Front Yard → Wall Collection → Top Row → Bucket 14).

- `id` uuid PK
- `name` text
- `type` text, nullable — **area / row / container / hospital / work_area / other** (v1.43.0). Not DB-enforced; standardized through the app's dropdown. **Areas nest freely** — Front Yard › The Wall › Below Wall are all areas — and every area is a Garden Album. `slot` folded into `container`; they were the same thing. `pot` / `bed` / `greenhouse` / `hanging` / `indoor` went unused, since a container's name carries that detail ("Bucket 39", "Black Pedestal Pot 1").
- `holds_plants` boolean, nullable — whether the Location page **offers** plant affordances. Seeded from real data rather than type: containers, the hospital and the work area yes, and among areas only In Ground, which genuinely holds plants directly. **It never hides plants that exist** — a wrongly flagged location would otherwise make its own plants invisible on their own page. Existing plants always render, with a hint that they probably want a container.
- `gallery_row` text, default `none` — `albums` / `archives` / `none`. Areas default to `albums`; the hospital and work area stay `none`. Somewhere the collection used to live (an old flat or office) is a **location** with `gallery_row = 'archives'`, which is why GAL-4 needs no schema of its own.
- `archived` boolean, default false — hide from pickers; the repotted container of LOC-4. **Deliberately separate from `gallery_row`**, so a retired bucket never appears as a former home of the collection.
- `active_from` / `active_to` date, `locality` text, all nullable — used only by archive locations, for "2018–2020 · SF, CA".
- `parent_location_id` uuid FK → locations.id — enables the tree
- `sort_order` int, nullable — physical-order display, not alphabetical
- `code` text, nullable — e.g. `W-T-14`
- `primary_photo_id` uuid FK → photos.id, nullable — the location's hero image
- `notes` text, nullable
- `created_at` timestamptz

### `taxa`
The **kind** of plant — whatever the most specific level is known: a species, a cultivar, or a bare genus. Introduced v1.41.0 (SPECIES-1 phase 1). Species-level facts live here once instead of on every specimen.

- `id` uuid PK · `taxa_id` on `plants` links a specimen to it, **nullable** so unidentified plants stay first-class
- **Name parts are optional and mostly unfilled.** Measured 2026-08-28: of 105 taxa, **61 have no genus, no epithet and no cultivar** — only free-text `botanical_name`, which all 105 have. NAME-1 filled the parts for the 33 taxa that existed then; every species created since by typing a name into a form gets free text only, because `ensureTaxonForName()` writes parts only when a caller passes them and the forms leave them blank. Composed display names, per-part italics, `infraspecific` and `parentage` therefore do not engage for most of the collection.
- **Cultivars are separate rows, never children.** *Aeonium arboreum*, *A. arboreum* 'Atropurpureum' and *A. arboreum* 'Zwartkop' are three taxa sharing `genus` and `species_epithet`. There is no parent/child link; "all Aeoniums" is a query on `genus`. Grouping only works when the parts are filled — see above.
- `botanical_name` / `common_name` / `cultivar` / `family` / `genus` / `species_epithet` / `is_hybrid`
- `infraspecific` text (wired up v1.83.0) — variety, subspecies or form, stored **with** the rank abbreviation as written on the tag: `var. erinacea`, `subsp. horrida`, `f. monstruosa`. A bare word with no recognised rank is read as `var.`, which is overwhelmingly the common case; rendering it rankless would read as a second species epithet. `infraspecificParts()` splits rank from epithet so markup can set the rank upright and the epithet italic, per convention.
- `parentage` text (wired up v1.83.0) — the cross a cultivar came from, e.g. *E. gibbiflora* 'Metallica' × *E. elegans* 'Potosina'. Vendors put the pedigree in the name field; this is where it goes so that recording the real name does not discard it.
- `working_label` — names an unidentified taxon until it has a real one. Three plants can obviously be the same kind without anyone knowing what that kind is; a null `taxa_id` cannot express that.
- `description`, `plant_type`, `growth_habit`, `mature_size`, `bloom_season`, `origin`
- `native_range`, `hardy_to`, `light_conditions`, `water_needs`
- `frost_tender` boolean, default false (v1.78.0) — deliberately **not** derived from `hardy_to`, which is free text and unparseable. Drives the badge on every specimen of the species and the "Frost tender — bring in" report, which lists specimens in location order because on a cold night it is a route, not an index.
- `primary_photo_id` — any specimen's photo

**Display name precedence is composed parts first, `botanical_name` second** (v1.65.0, NAME-1). Reversed from v1.41.0, which preferred the free text only because the parts were barely populated (family 3/27, genus 5/27, species 3/27). NAME-1 filled all 33 taxa, so composition is now the better name and the only form that can be marked up per part. Composition needs **genus plus either an epithet or a cultivar** — genus alone loses to the free text, since a partial name is worse than none.

Two shapes the composition must handle, both present in the real data:
- **`is_hybrid` carries the `×`.** The sign exists only in the free text, so composing *Parodia* × *erubescens* from parts silently yields "Parodia erubescens" unless the flag puts it back. One record, and it would have looked fine.
- **A cultivar of hybrid origin has no epithet.** *Echeveria* 'Purple Perle' is genus + cultivar; requiring an epithet would send it to the fallback and lose the per-part markup. Its parentage — *E. gibbiflora* 'Metallica' × *E. elegans* 'Potosina' — had been sitting in `botanical_name`, which is where the name belongs, not the pedigree.

**`taxonDisplayHtml()` / `plantDisplayHtml()` return markup**: genus and epithet italic, hybrid sign and cultivar upright — correct botanically and impossible with one free-text string. Callers must **not** wrap them in `escapeHtml()`; the parts are escaped inside. The plain-text functions stay for `<option>` labels, `title` attributes and CSV, and each call site picks one deliberately.

**Cultivar is stored bare**, without quotes; the display layer adds them.

**Both `infraspecific` and `parentage` existed in the database for some time with no code touching them** — added, then never built against. Until v1.83.0 the consequence was silent: composition prefers the parts, so *Opuntia polyacantha* var. *erinacea* 'Snow Fuzzy' displayed as *Opuntia polyacantha* 'Snow Fuzzy' and the variety simply vanished from the name. The same shape as the hybrid `×` trap above: a fact present in the data, absent from the composed name, and nothing anywhere to say so. **When a column is added, wire it or record why not.**

**Name matching is normalised, not string equality** (v1.83.0, AI-3). `nameKey()` lowercases and strips quoting, folds `×` to `x`, drops rank words, and collapses punctuation and whitespace; `taxonNameKeys()` returns every name a taxon answers to — composed display name, `botanical_name`, `common_name`, `working_label`. `findTaxonByName()` is the single lookup used when a new specimen needs a taxon.

This replaced a comparison against `botanical_name` alone, which had become **actively wrong** once composition landed: a taxon built from parts often has no `botanical_name` at all, so typing an existing species name matched nothing and created a duplicate species record. Any future "does this already exist" check must go through `findTaxonByName()` rather than comparing a column.

### Constraints — the actual list, read from `pg_constraint` 2026-08-28

Stop inferring these. Verified:

| Table | Constraint |
| --- | --- |
| `plants` | `health_status` in healthy / watch / **urgent** / recovery / unknown |
| `plants` | `identification_status` in confirmed / tentative / unidentified |
| `plants` | `status` in active / dormant / given_away / dead / deaccessioned |
| `plants` | `collection_category` in current / historical |
| `plants` | `acquisition_source_type` nullable, else one of seven |
| `plants` | `water_needs` nullable, else low / moderate / high · `light_requirements` nullable, else full_sun / partial_shade / shade |
| `plants` | UNIQUE `accession_number` |
| `photos` | `photo_type` in general / bloom / detail / condition / **overview** / **progress** |
| `photos` | `focal_x` / `focal_y` 0–100, NOT VALID |
| `photo_plants`, `photo_locations` | UNIQUE on their two ids |
| `list_options` | UNIQUE (list_name, value) |
| `task_subjects` | exactly one of plant_id / location_id / taxa_id |

**Placeholder taxa: use the GENUS, not a family or a common name (v2.10.1).**
`Opuntia` and `Haworthiopsis` are real identifications at genus rank. They parse
into `genus`, so they group with relatives, style correctly, and leave the
"names not split up" queue. `Cactus` is not a family (Cactaceae is) and a
family-level placeholder splits into nothing.

For a plant that genuinely cannot be placed to genus, use a **working label**
and set `family` — the label carries the honest state, the family still carries
real information, and `taxonMissingNameParts()` no longer nags about it.

`taxonMissingNameParts()` asks whether a genus can be READ from the name, via
`parseBotanicalName()`. Before v2.10.1 it only checked whether the parts columns
were empty, so "unidentified cactus" was queued as a split that had been skipped
— an item nobody could ever complete, sitting in the same count as
"Haworthiopsis", which is one tap from done. Identification gaps belong to
"Plants missing identification"; this queue is only for names that CAN be split.

**Staging areas (STAGE-1, v2.10.0).** `locations.type = 'staging'` marks a
holding area for specimens that have arrived but are not planted yet. `type` is
**not** CHECK-constrained (verified from `pg_constraint` 2026-08-28), so adding
it needed no SQL.

**The queue is DERIVED, not triggered.** `plantsAwaitingPlanting()` reads the
plant's own `location_id` against `stagingLocationIds()`, which includes
descendants — a tray inside a staging bench is still staging. Amanda asked for a
task to be created on arrival; that was declined for two reasons, both recorded
so it is not re-litigated:

1. **Five code paths set `location_id`** — the new-plant form, Move, Edit, New
   specimen here, and `moveToHospital`. A write hook has to be right in all five
   and fails silently when it is not.
2. **A task written on arrival outlives the move.** Plant the specimen, take it
   out of staging, and the task is still open waiting to be closed by hand. A
   derived row cannot go stale, because the plant's location IS the state.

"Make a task" is still offered per row, and a future-dated task defers the row
exactly as it does for blooms — see `hasScheduledTask()`.

**"Historical" photos of an ACTIVE location: `photos.historical` (PHOTO-4, v2.9.0).**
A boolean column, NOT a `photo_type` value. It means *no specimen will ever be
created for this* — a photo of a container recording what it used to hold.

**Why a column and not a type.** The `historical` TYPE removed in v1.56.0 was
harmful because a photo has exactly one type, so "archival" and "shows a bloom"
became mutually exclusive and a plant's history across former homes could not be
recorded. As a separate flag both are true at once. The same objection applies to
using `overview` for this — it works, but it overwrites what the photo shows.

**Scope is deliberately narrow.** It suppresses `photoAwaitsPlant()` only. The
claim is about specimens, not about where the photo was taken, so a historical
photo with no location is still asked for one.

Distinct from `isArchivePhoto()`, which is location-derived (`gallery_row =
'archives'`) and cannot express "this ACTIVE container's past" — the Bucket 36
case that prompted it. Both badges can show on one photo.

Set in the edit-photo modal or in bulk via Gallery → Select → Edit. Both controls
are **feature-detected** through `photosHaveHistorical()`, which checks whether
`select=*` returned the key, so the app behaves correctly before the migration is
run rather than writing 42703 into a toast.

```sql
alter table photos add column historical boolean not null default false;
notify pgrst, 'reload schema';
```

**Tasks have a visibility horizon (v2.8.1).** `openTasks()` is every unfinished
task; the UI almost never shows that set. `actionableTasks()` — overdue, due
within `TASK_HORIZON_DAYS` (7), or **undated** — is what the To Do panel and the
"Due now" filter render. `scheduledTasks()` is the remainder, reachable via the
"Later" tab. The two partition `openTasks()` exactly, so a task cannot fall
between them. An undated task is always actionable: "I'll get to it" is not a
schedule, and hiding those would lose them.

Note the deliberate asymmetry: `taskSectionFor()` on a plant, location or
species page still shows **all** open tasks. On the record itself, "a bloom check
is scheduled for June" is context worth having; on the To Do page it is noise.

**Vocabularies that are NOT constrained: everything on `taxa`.** `plant_type`,
`growth_habit`, `bloom_season`, `origin`, `water_needs` and `light_conditions`
all live on `taxa`, which has no CHECK constraints — so adding a value there is
a code change only, no SQL. This is the opposite of the `plants` columns above,
and the distinction is worth keeping straight before writing a migration nobody
needs. v2.8.0 added five `plant_type` values (`curio`, `dracaena`, `hoya`,
`haworthiopsis`, `lithops`) with no schema change at all.

**`plant_type` is stored in three places and all three must agree:**
`PLANT_TYPE_LABELS` in `index.html`, the hardcoded list inside `suggest-species`'s
prompt, and any `list_options` rows.

**Which one wins flips the first time a list is edited in Settings.** While
`list_options` has no row for a list, `listOptionsFor()` falls back to the
built-in map and Settings renders from it. The first add/retire/rename calls
`seedListIfNeeded()`, which copies the built-in list into the table **wholesale**
(deliberately — editing one option must not discard the rest). After that
`listOptionsFor()` reads only the table, and **a value added in code will never
appear**. Verified 2026-08-29: `plant_type` is still on the built-in map.

Either way `suggest-species` keeps its own copy in the prompt, so a value added
in Settings is one Claude cannot suggest until the function is redeployed.

**`taxa.light_conditions` is `text[]`, not text.** `suggestions.value_text` is
text, so Claude returns light values semicolon-separated and `acceptSuggestion`
splits them back into an array (`ARRAY_FIELDS`). The CSV export uses the same
`"; "` convention. Writing a bare string into this column fails.

**`taxa` has NO constraints of any kind.** No CHECK, no UNIQUE. Two consequences:
- A failed write to `taxa` is never a constraint violation — look at RLS or the token instead.
- **This file used to claim taxa are identified by "the composed name as a unique natural key". That is not enforced.** Nothing prevents two identically-named species, which is how three spellings of *Echeveria agavoides* came to coexist.

**Vocabulary columns are CHECK-constrained in the database, whatever this file used to say.** PD-4 recorded `health_status` as "free text standardized by the dropdown, so no migration" — that is **wrong**, and it shipped a broken tier: `plants_health_status_check` rejected `urgent`, so Move to Plant Hospital, the edit dropdown and Claude's health suggestion all failed with `23514` until the constraint was widened.

**Adding a value to any of these lists is a schema change.** `health_status`, and by the same pattern `photo_type`, `status`, `identification_status`, `collection_category`. Widen the constraint in the same ship as the code, inside a transaction so a failed `add` cannot leave the table unconstrained:

```sql
begin;
alter table plants drop constraint if exists plants_health_status_check;
alter table plants add constraint plants_health_status_check
  check (health_status in ('healthy','watch','urgent','recovery','unknown'));
commit;
```

**Probing PostgREST does not reveal constraints.** The column-existence probe (see the schema-state notes in BACKLOG) proves a column resolves; it says nothing about what values it accepts, because an anonymous read cannot see `pg_constraint`. Before adding a value to a vocabulary, ask for:

```sql
select rel.relname, con.conname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'c'
order by rel.relname;
```

**Health tiers are branched on by exact value, in three places** (v1.83.0, PD-4). `healthy` / `watch` / `urgent` / `recovery` / `unknown`. The branching is centralised in `needsAttention()`, `isUrgent()` and `healthPillClass()` — before that the test was an inline expression copied into each screen, and adding the `urgent` tier meant an urgent plant was **missing from the work queue** because the third copy, `plantsAttention`, was not on anyone's list. `moveToHospital()` sets `urgent`. Add a tier by editing `HEALTH_LABELS` and `HEALTH_ATTENTION` only.

**Check-ins are derived, not stored** (RPT-3, v1.84.0). `plants.next_check_date` is the only stored part, and it is an override. `checkInStatus()` returns due/not-due for one specimen from two independent rules: an explicit `next_check_date` that has arrived, or nothing photographed for longer than `check_in_interval_days` (default 14). The explicit date wins whenever it is set. Two exclusions matter and are easy to get wrong: a **non-active** specimen is not a chore, and a **never-photographed** one is excluded here — it belongs to the "missing photos" queue, or every new specimen would be overdue the day it is created.

**Phase 3 shipped v1.65.0.** Nothing in the app reads or writes a species column on `plants` any more — `plantDisplayName()` resolves through `taxa_id`, and the four paths that copied species data down onto the specimen are gone. The columns themselves still exist: the drop is a separate step, recorded in BACKLOG under v1.65.0 and deliberately held back so the app can be exercised against the still-present data first. A backup precedes it; there is no migration tool and it is irreversible.

### `plants`
One row per individual accessioned specimen.

- `id` uuid PK
- `accession_number` text, **unique, not null** — format `ABG-YYYY-NNNN`, auto-generated, immutable once set (§5)
- `botanical_name` / `common_name` / `cultivar` text, nullable — display name logic: botanical → common → "Unidentified Plant"
- `family` / `genus` / `species` text, nullable — structured taxonomy, separate from free-text `botanical_name`
- `plant_type` text, nullable — cactus / agave / aloe / euphorbia / sedum / crassula / echeveria / sempervivum / aeonium. Collection grouping, **not** taxonomy. Partly redundant with `genus`: only `cactus` rolls up multiple genera; the rest duplicate a genus value that is free text and may be blank or unnormalized. Doubles as the plant-level category GAL-2 needs.
- `growth_habit` text, nullable — columnar / globular / rosette / clumping / caudiciform / trailing / mounding / upright / climbing / groundcover / solitary
- `mature_size` text, nullable — free text, e.g. "3–4 ft tall × 5 ft wide"
- `bloom_season` text, nullable — spring / early_summer / summer / late_summer / fall / winter / intermittent / monocarpic / not_observed. The plant's **expected** trait. Observed blooming belongs to BLOOM-1's `bloom_events`; RPT-4 reads that table, not this column.
- `origin` text, default `unknown` — native / introduced / unknown. Whether the plant is native **to this garden's region**. Distinct from `native_range`, which holds where the plant is from ("Central Mexico"). Named `origin` by decision; the backlog originally called it `introduced`, which read wrong when holding the value `native`.

**Every field on Plant Detail renders even when blank** (v1.38.0), as a dimmed em-dash via `fieldRow()` / `.value-blank`. An unrecorded field marks the record as incomplete, which is information. This supersedes the narrower v1.36.0 rule that applied only to the five fields above while Care and Provenance still hid when empty — PD-7 extended it to Care, Provenance, Identification and Collection so the screen holds one shape on every plant.
- `identification_status` text — `confirmed` / `tentative` / `unidentified` (default)
- `identification_notes` text, nullable
- `collection_category` text — `current` / `historical`
- `original_collection` boolean — marks specimens from the founding collection
- `status` text — `active` / `dormant` / `given_away` / `dead` / `deaccessioned`
- `health_status` text — `healthy` / `watch` / `recovery` / `unknown`
- `location_id` uuid FK → locations.id, nullable — **primary** location, see §6
- `primary_photo_id` uuid FK → photos.id, nullable — profile picture
- `date_acquired` date, nullable
- `acquisition_source_type` text, nullable — nursery / gift / propagation / rescue / original_collection / unknown / other
- `acquisition_source_name` text, nullable
- `acquisition_notes` text, nullable
- `parent_plant_id` uuid FK → plants.id, nullable — propagation lineage
- `native_range` text, nullable
- `hardy_to` text, nullable — free text ("Zone 9", "20F")
- `light_conditions` **text[]**, default `{}` — multi-select: direct, indirect, partial, full, shade, morning, afternoon, all_day
- `water_needs` text, nullable — low / moderate / high
- `description` text, nullable — **species-level** prose: what this kind of plant looks like. Not observations of this specimen, which belong in `care_notes`. Prime candidate for Claude to fill under AI-2.
- `notes` text, nullable — **legacy as of v1.38.0.** Migrated into `care_notes` and no longer displayed on Plant Detail. The column is retained and not cleared, so the migration stays reversible. `identification_notes` and `acquisition_notes` were deliberately **not** migrated — they stay in the Identification and Provenance sections.
- `created_at` / `updated_at` timestamptz

### `photos`
- `id` uuid PK
- `plant_id` uuid FK → plants.id, nullable — primary plant attachment
- `location_id` uuid FK → locations.id, nullable — primary container attachment
- `drive_file_id` text, not null — Google Drive file ID
- `taken_at` timestamptz, nullable — real capture date from EXIF when available (§7)
- `uploaded_at` timestamptz — fallback display date
- `is_primary` boolean — **legacy, effectively unused.** Superseded by `plants.primary_photo_id` / `locations.primary_photo_id`
- `photo_type` text, default `general` — **general / bloom / detail / condition** (v1.56.0), enforced by the `photos_photo_type_check` constraint. The v1.56.0 rename changed the app but not the constraint, so `bloom` was rejected by the database until v1.72.1: **changing this vocabulary is a schema change, not a labels change.** Describes **what the photo shows**, never how it is filed; filing is `plant_id` and `location_id`.
  - `identification` was removed: it existed only to keep a reference shot out of a timeline, a distinction obscure enough that nobody could say when to use it, and moot once AI-1 identifies from any photo.
  - `historical` was removed, and it was actively harmful: it meant *"needs no plant or location"*, so an archive photo and a specimen-tagged photo were **mutually exclusive**. A plant's history across former homes could not be recorded. **Archive-ness now comes from the photo's location being an archive location** (`locations.gallery_row = 'archives'`), which is both true and compatible with a plant link. See `isArchivePhoto()`.
  - `flower` renamed `bloom`, matching BLOOM-1's vocabulary.
- `focal_x` / `focal_y` smallint, nullable — 0–100 percent, the point of the photo that must survive a crop (v1.63.0). Null means unset and keeps the `object-position:top` default, so a photo is only re-crop-anchored deliberately. Emitted by `focalStyle()` and applied by `photoImg()`.
- `is_favorite` boolean, default false (v1.62.0) — hearting a photo puts it in the Gallery's Favourites row and promotes it to represent its taxon. One gesture, two jobs; see BACKLOG GAL-1/GAL-2.
- `notes` text, nullable — editable directly from the Inbox before assigning
- `google_photos_id` text, nullable, unique where set (v1.54.0) — the Picker media item id for photos imported from Google Photos. Stable across picking sessions, so it is what lets a later import skip items already brought in instead of creating second copies. **Only set from v1.54.0 onward**; anything imported before that has null and cannot be matched this way — the capture-time duplicate report covers those.

A photo with **both** `plant_id` and `location_id` null is in the Inbox. It leaves the Inbox once either is set, or once `photo_type = 'historical'`.

### `care_notes`
A running dated log of care events, separate from the free-text `plants.notes`.

- `id` uuid PK
- `plant_id` uuid FK → plants.id, **not null**, `on delete cascade`
- `noted_on` date, not null, default `current_date` — the observation date, set by Amanda, not the insert time
- `body` text, not null
- `created_at` timestamptz, not null — tiebreak only, for two notes on the same `noted_on`

Displayed newest-first on Plant Detail. Included in the full JSON backup and restored **after** plants, since `plant_id` is a hard FK. See §6 for merge/delete handling.

### `bloom_events`
When a specimen actually flowered. An event with a start and an end, not a flag — a plant blooms repeatedly and the history is the point.

- `id` uuid PK
- `plant_id` uuid FK → plants.id, **not null**, `on delete cascade`
- `location_id` uuid FK → locations.id, nullable — **snapshot** of where it bloomed. A bloom happened somewhere, and that stays true after the plant moves.
- `started_on` date, not null
- `ended_on` date, nullable — **null means blooming right now**, which is what every "in bloom" view keys on
- `notes` text, nullable
- `created_at` timestamptz

**Distinct from `taxa.bloom_season`, and the distinction matters.** That column records when a species is *expected* to flower; this table records when one *did*. Conflating them would have the Gallery claim plants are in flower because the calendar says so. The expectation drives a "should be blooming — worth a look" prompt in Reports; only a recorded event puts a plant in the In Bloom row.

### `identifications`
Audit trail for AI suggestions. Never silently overwrites confirmed data.

- `id` uuid PK
- `photo_id` uuid FK → photos.id
- `source` text — `PlantNet` or `Claude`. A photo can hold one pending suggestion per source simultaneously.
- `suggested_name` text
- `confidence` numeric, nullable — Pl@ntNet: real computed score. Claude: qualitative high/medium/low mapped to ~0.85/0.55/0.25 for consistent UI display. **Not a precise probability.**
- `raw_response` jsonb — full API response. Pl@ntNet includes up to 5 candidates with reference images (`include-related-images=true`).
- `status` text — pending / confirmed / rejected
- `confirmed_name` text, nullable
- `created_at` timestamptz

### `suggestions`
Everything Claude proposes, one row per proposal (v1.80.0). Separate from `identifications`, which stays the Pl@ntNet audit trail: that table has one `status` per row and a row means "a guess at a name", so a bundle holding a plant, a location and a bloom could not be half-accepted there — and half-accepting is the normal case.

- `photo_id` / `taxa_id` — exactly one is set, depending on `kind`
- `kind` — `plant_tag` · `location_tag` · `new_specimen` · `photo_type` · `bloom` · `health_note` · `species_field`
- `field` — for `species_field`, which taxon column
- `value_id` — the plant, location or taxon proposed. **Validated against the catalogue before insert**, so a hallucinated uuid never reaches the table
- `value_text` — for fields and notes
- `confidence` — qualitative high/medium/low mapped to 0.85/0.55/0.25, as with Claude identifications. Not a probability
- `rationale` — one sentence, shown under the suggestion
- `status` — pending / accepted / dismissed. Accepted and dismissed rows are **kept**: the last 20 are fed back to Claude as examples, which is the only learning available without fine-tuning

**Claude is given the whole collection on every call** — 33 taxa, 58 specimens, 157 locations, about 6KB — rather than being trained, synced or scheduled. It is small enough to ride along, which means it is never stale. The catalogue sits in a `cache_control` block so a batch pays for it once.

### `tasks` / `task_subjects`
TASK-1 + RPT-3 (v1.84.0). A task is something Amanda wants to do; a subject is what it is about.

- `tasks` — `id` uuid PK · `title` (required) · `detail` · `status` (`open` | `done`) · `due_date` · `created_at` · `completed_at`
- `task_subjects` — `task_id` FK cascade, plus **exactly one** of `plant_id` / `location_id` / `taxa_id`, enforced by `check (num_nonnulls(...) = 1)`. Same shape as `identifications`, which carries exactly one of `photo_id` / `taxa_id`.

**Why one feature and not two.** RPT-3 was specified as a manual "needs a check-in" flag, and the task request arrived separately. They are the same thing at different sizes: a flag is a task with one subject and no note. Building both would have produced two places to look for what needs doing — the exact fault v1.79.0 corrected by retiring Reports and moving work into the queue. **If a "flag this record" feature is ever proposed again, it is a task.**

**Subjects are mixed-type and many-per-task because the real work is.** The three cases that drove it: eleven buckets pulled off the wall together, one bucket with a rotted centre, and one species to consolidate across several locations. A single `plant_id` column would have handled none of them.

**Tasks render as rows, not as counted tiles**, which is the one place the work queue's vocabulary is deliberately broken. A tile answers "how many"; a task's value is its text, and hiding "bucket 11, centre is rotted" behind a count would make her click to remember what she meant.

### `app_settings`
Key/value, one row per setting, RLS on (v1.84.0). Holds `check_in_interval_days`
and, since v2.11.0, the weather configuration: `garden_latitude`,
`garden_longitude`, `frost_watch_f`, `frost_alert_f`, `heat_advisory_f` (§14).
Adding a setting is an insert, never a migration — which is why WEATHER-1
shipped with no SQL at all. Read into `state.appSettings` as a plain object at load; `settingInt()` coerces and falls back, so a missing table, a missing key or a junk value all degrade to the built-in default rather than breaking.

### `google_auth_tokens`
Single-row table, one Google account ever. `access_token` (~1hr, auto-refreshed by Edge Functions), `refresh_token` (expires ~weekly, see §8), `expires_at`, `updated_at`.

### Junction tables (§6)
- **`photo_plants`** — multiple plants tagged on one photo. `id, photo_id, plant_id, created_at`, unique on `(photo_id, plant_id)`.
- **`plant_locations`** — **DROPPED 2026-08-28**, closing SPECIES-2. It let one plant be in several places at once, which was a workaround for having no taxon/specimen distinction. With specimens real, a specimen is one physical individual in exactly one place, and `plants.location_id` is the whole answer. The 6 rows that remained at drop time were 4 exact duplicates of a `location_id` and 2 ancestor rows (Car Port, the parent of the two Black Pedestal Pots) — no information was lost.
- **`photo_locations`** — a photo tagged across multiple containers. `id, photo_id, location_id, created_at`, unique on `(photo_id, location_id)`.

### `plant_location_history`
Auto-populated by trigger. `id, plant_id FK, location_id FK, started_at, ended_at, notes, created_at`.

**Read by the app since v1.86.0.** For its first years it was written by the trigger and read by *nothing* — it appeared in exactly one place, the JSON backup. Every plant move was recorded faithfully and was invisible in the UI; the only way to see one was to export a backup and read the JSON. It now loads into `state.plantLocationHistory` and drives three views: "Where it has lived" on Plant Detail, "Previously here" on Location Detail, and the recorded-move line in the photo timeline.

**The app now writes `notes`**, which the previous note here forbade. `confirmMovePlant()` patches `plants.location_id`, then attaches the optional move note to the history row the trigger just opened — inserting the row itself if none is found, so a typed note is never silently dropped. **The trigger's exact behaviour is not recorded anywhere in this repo**; that function is written to survive either answer, and is the first place to look if moves start behaving oddly.

**A move is not a new specimen.** SPECIES-2 split plants recorded in several places *at once*, because a physical individual is in exactly one place. A move is the same individual changing place *over time*: same accession number, same photos, same care notes, one more history row. The two cases look alike and are not.

**The trigger fires on ANY update to a plant, not just a location change** (confirmed against live data, v1.86.1). One move can leave two rows, and two rows 0.2ms apart have been observed. `locationHistoryForPlant()` collapses **consecutive** same-location rows into one stay — consecutive only, because leaving and coming back is real history that must stay visible.

**Annotating a past move is editing, not re-moving** (v1.87.0). If a move was made before the Move action existed, the fix is the note, not the move: the plant is already in the right place, so repeating it records a fake round trip — and the Move modal disables its button when the destination already matches. The pencil on each stay writes to `plant_location_history.notes` directly.

**Deduplicate when reading by location.** A plant can live somewhere, leave, and come back, producing two stays at the same location. `plantsPreviouslyAt()` keeps only the most recent per plant — without that the "Previously here" list reads as two different plants.

### `accession_counters`
Internal only. `year int PK, last_number int`.

---

## 4. Edge Functions

Deployed from `~/Projects/adcock-plant-inventory/supabase/functions/`.

| Function | Auth | Purpose |
| --- | --- | --- |
| `upload-photo` | user | Uploads to Drive, inserts `photos` row (plant_id / location_id / notes / `taken_at` from client-side EXIF) |
| `get-photo` | user | Proxies a Drive file's bytes — required because `drive.file` scope files have no public URL |
| `identify-plant` | user | Pl@ntNet (`include-related-images=true&nb-results=5`), stores suggestion |
| `identify-plant-claude` | user | Anthropic API (`claude-sonnet-5`) with base64 image + JSON-structured prompt, stores suggestion |
| `drive-oauth-start` | user | Builds the Google consent URL |
| `drive-oauth-callback` | **none** (`verify_jwt = false`) | Google redirects here — exchanges code for tokens, saves, redirects back to `#drive-connected` |
| `_shared/google-auth.ts` | — | `getValidGoogleAccessToken()` auto-refresh, `getSupabaseAdmin()` |

Secrets required: `DRIVE_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `PLANTNET_API_KEY`, `ANTHROPIC_API_KEY`.

---

## 5. Accession Numbers

Format `ABG-YYYY-NNNN`, generated server-side, immutable once set.

- `next_accession_number(year)` — `SECURITY DEFINER`, atomically increments the per-year counter, formats and returns.
- `set_accession_number()` — `BEFORE INSERT` trigger on `plants`, generates if not supplied.
- `protect_accession_number()` — `BEFORE UPDATE` trigger, raises if the number changes.

**Why `SECURITY DEFINER`:** the counter write happens inside a trigger fired by a normal authenticated user's INSERT. Without it, RLS on `accession_counters` blocks the trigger itself. This was a real bug during setup (`new row violates row-level security policy for table accession_counters`), fixed by elevating the two functions rather than opening RLS on the counter table.

**Known gap:** full JSON backup includes `accession_counters` deliberately, so a restore does not reset the counter and collide with restored numbers.

---

## 6. Many-to-Many Design

Plants, locations, and photos all support many-to-many **on top of** a fast-path "primary" column.

- A plant has **exactly one** `location_id`. There is no junction — see SPECIES-2 above.
- A photo has one `plant_id` + one `location_id` plus optional `photo_plants` / `photo_locations` rows.

**Photo many-to-many stays; plant many-to-many does not.** One photograph genuinely can show three plants across two containers, so `photo_plants` and `photo_locations` describe reality. One specimen in three places never did — it was three specimens.

**Why keep a primary column:** the overwhelming majority have exactly one attachment. A direct FK keeps common-case queries (list cards, filters) join-free. Junction tables are consulted only for secondary "also in / also shows" relationships.

**Deleting a photo** must clear four references first, all hard FKs that block the delete: `plants.primary_photo_id`, `locations.primary_photo_id`, `taxa.primary_photo_id`, plus rows in `photo_plants` and `photo_locations`. `deletePhotosByIds()` is the single path for this — before v1.52.0 the delete cleared only plants and `photo_plants`, so removing a location's hero or a species' cover photo failed outright. `taxa.primary_photo_id` arrived with the species split and was never added until that bug was found.

**Deletion / merge cleanup order** — any function deleting or merging a plant must handle, in order:
1. `photos.plant_id` — unassign, do not delete the photo
2. `photo_plants`
3. `plants.parent_plant_id` — reparent children
4. **`plant_location_history`** — reassign history rows to the surviving plant
5. **`care_notes`** — on merge, **reassign** to the surviving plant; the observations happened and the merged record inherits them. On delete, remove. The FK is `on delete cascade`, but both functions handle it explicitly so this list stays readable from the code.

Step 4 was missed on first implementation and caused an FK violation (`plant_location_history_plant_id_fkey`) during a merge. (It was step 5 until `plant_locations` was dropped.)

**Direct-only vs. rolled-up reads (v1.34.5).** The many-to-many design means a location has two legitimate readings, and picking the wrong one is a recurring bug class:

- `photosAtLocation()` / `plantsAtLocation()` — **direct only.** Correct on Location Detail, where you are looking at one container.
- `aggregatePhotoCount()` / `aggregatePlantCount()` — **rolled up** through `descendantLocationIds()`. Correct anywhere a parent stands in for its subtree.

The Locations list renders **only top-level locations**, and a top-level area's plants and photos almost all live on the rows and buckets nested under it. Direct-only reads therefore return empty on exactly the cards that screen shows — this produced both `0 photos` counts and missing cover images until v1.34.5.

Both aggregate helpers **dedupe by id**. A photo tagged onto a parent and a child, or onto two sibling containers, is one photo in the rolled-up count. `aggregatePhotoCount` originally summed per-descendant lengths and double-counted.

`locationCoverPhoto()` follows the same rolled-up logic: own `primary_photo_id` → own newest direct photo → newest photo anywhere beneath. The cost is that the Locations screen now issues Drive fetches on first paint where it previously issued none; `ensurePhotoLoaded` → `debouncedRender()` absorbs the async settle.

---

## 7. Photo Dates — EXIF vs. Upload

`photos.taken_at` holds real capture date when available; `uploaded_at` is always the fallback.

**The Edge Function silently dropped this for months (fixed v1.45.2).** `upload-photo` read only `photo`, `plant_id`, `location_id` and `notes` from the form — the browser had always sent `taken_at`, and the insert never included it. Result: 556 photos, **zero** with a capture date, every one falling back to upload date. The browser parser was correct throughout; the bug was entirely server-side. Lesson: when a client-side value never appears in the database, check that the receiving end reads it before debugging the sender.

Photos predating the fix are repaired by **Settings → Photo capture dates**, which re-downloads each file from Drive and runs the same parser. Idempotent — it only touches rows where `taken_at` is null.

`extractExifDate()` is a hand-rolled vanilla-JS parser: reads the first 128KB of a JPEG client-side, walks the APP1/Exif segment, extracts `DateTimeOriginal` (tag `0x9003`) or `DateTime` (`0x0132`). No library, per the no-build-step constraint. **JPEG only** — PNGs, screenshots and HEIC silently fall back to upload date.

**Known limitation:** the parser looks for `DateTime` (`0x0132`) only inside the ExifIFD, but by spec that tag lives in IFD0, so that branch never fires. Phone photos carry `DateTimeOriginal` (`0x9003`) in the ExifIFD and are unaffected; scanned or heavily edited images may not be.

`photoDate(p)` (`p.taken_at || p.uploaded_at`) is used everywhere a photo date is displayed or sorted, instead of raw `uploaded_at`.

**PostgREST truncates at 1000 rows, silently (v1.53.0).** `db-max-rows` on this project is 1000, and a response over that is cut with no error and no header the app inspects. Confirmed live: 1424 rows in `photos`, 1000 in the app — 424 invisible everywhere, **including in every backup taken before the fix**. `restGetAll()` pages until a short page returns and must be used for any table that can grow. It appends `id.asc` to the caller's ordering, because offset paging over a non-unique sort can skip or repeat rows where values tie.

**Never call `render()` in a loop (v1.55.0).** It replaces `app.innerHTML`, so a per-iteration render over a long job means one full rebuild per item — every image destroyed and re-created, scroll and focus restored each time, the body padding toggled. A 2000-photo import rendered 2000 times and the screen visibly flashed. Patch the specific elements that changed instead, exactly as `ensurePhotoLoaded()` does for images; `refreshImportProgress()` is the pattern. This is the same mistake PERF-1 fixed, reintroduced by adding progress feedback.

**Photo memory (v1.53.0).** Blob URLs pin their data until revoked, and revoking only happened on logout — so a long session accumulated every photo it had ever displayed, at a few MB each. `evictPhotoCache()` keeps the most recent 180 and revokes the rest. Evicting one still on screen is harmless: it has already decoded, and a re-render re-fetches it.

**Photo loading (v1.39.0, lazy since v1.53.0).** `photoImg()` emits every photo `<img>` up front with a `data-drive-id` and no `src`; `ensurePhotoLoaded()` sets `src` on arrival **in place**, without re-rendering. **`photoImg()` does not fetch** — `observeLazyPhotos()` does, via an `IntersectionObserver` with a 300px margin, once an image nears the viewport. Before that, a Gallery filter matching 1000 photos fired 1000 Edge Function requests at once. Use `photoImgEager()` where an image must not wait: detail heroes, the lightbox. Before this, each arriving blob called `debouncedRender()`, which rebuilt `app.innerHTML` and destroyed every image on screen — the cause of the flashing. Consequences for anyone touching this: never gate a click handler on the cached URL (the DOM is not rebuilt when it arrives, so the handler would never attach — gate on the photo record instead), and any new image site must use `photoImg()` or it will only update via the `debouncedRender()` fallback.

---

## 8. Google Drive — What Didn't Work

**Attempt 1 — Service account.** Permanently failed. Service accounts have **zero storage quota** on personal (non-Workspace) Google accounts and cannot upload even to a folder shared with them as Editor. Shared Drives, the usual fix, require Google Workspace.

**Attempt 2 — Real OAuth pointed at a manually-created folder.** 404. The `drive.file` scope grants visibility **only into files and folders the app itself created**, not pre-existing ones, even ones the signed-in user owns.

**Current design:** the app creates its own Drive folder via the API on first use. All uploads go there.

**Ongoing tradeoff, by design:** the OAuth app stays in Google's "Testing" (unverified) status. Verification is a multi-week process, disproportionate for a single-user app. The cost: **refresh tokens expire roughly every 7 days.** Drive-dependent actions then 401, which the frontend translates into "Google Drive needs to reconnect — go to Settings and tap Reconnect" rather than a generic error. Reconnect takes ~10 seconds.

**Base64 gotcha (`identify-plant-claude`):** converting an image buffer via `String.fromCharCode(...new Uint8Array(buffer))` crashes on any real photo — the spread operator passes every byte as a separate argument and blows the JS engine's argument limit. Must chunk at 8KB.

This crash presented as a **CORS error** in the browser, not a server error: the uncaught exception fired before `withSupabase` could attach CORS headers, so the browser misreported it. **Debugging pattern worth remembering: CORS error + 500 on an Edge Function usually means an uncaught crash inside the handler, not a CORS misconfiguration.**

---

## 9. Photo Lightbox

One system (`state.lightbox = { mode, photoId, plantId?/locationId? }`) covering four contexts:

- **`inbox`** — paginated Inbox photos with Identify / Ask Claude / Attach / New Plant / Delete, auto-advancing to the next unprocessed photo after any action (`prepareLightboxResume()` / `maybeResumeLightbox()`)
- **`plant`** — a plant's photo timeline, with "Set as profile picture" and location editing
- **`location`** — a container's photos, with "Set as main photo" and location editing
- **`gallery`** — the Gallery's filtered result set, with View plant / View location jumps

`lightboxPhotoList()` branches by mode to build the navigable list.

---

## 10. Archive / Historical Photos

**Superseded v1.56.0.** `photo_type = 'historical'` no longer exists. A photo is archival because its **location** is an archive location (`gallery_row = 'archives'`), so a photo of the Santa Rita taken at Vallejo Apartment appears in that specimen's timeline **and** in the Gallery's From the Archives row — both derived from the same row. Under the old model those were mutually exclusive, because `historical` meant the photo needed no plant.

The Inbox rule simplifies accordingly: a photo is in the Inbox when it has **neither** a plant nor a location. There is no longer a type that excuses it from being filed.

---

## 11. Frontend Structure

- **Single file:** `index.html`. CSS in a `<style>` block, all JS inline.
- **Rendering:** `render()` rebuilds `#app.innerHTML` from scratch on every state change. **This destroys any focused input and the scroll position**, so live-search fields lose focus and caret position mid-typing; `captureFocus()` / `restoreFocus()` in `render()` save and restore them by element id (v1.38.2). Any new input that triggers a re-render while focused needs a stable `id` to participate.

Scroll is preserved the same way (v1.52.2), for both the page and the modal — but **only when the render is the same view as the last one**, keyed on tab + record id + `reportView` + modal type. Restoring it unconditionally would be wrong: navigating to a new screen should start at the top. Anything that changes the view key is treated as navigation. Without this, toggling one checkbox in a long list threw the user back to the top of it. `debouncedRender()` (150ms) batches rapid updates — necessary once Inbox counts reached the hundreds, since each async thumbnail load used to trigger its own full rebuild.
- **State:** one global `state` object. Session persists in `localStorage` with access-token refresh before each data load (`ensureFreshSession()`).
- **Screens:** Login, To Do (`state.tab === "inbox"` — the work queue plus unfiled photos), Plants, PlantDetail, Locations, LocationDetail, Gallery, Settings. **Reports was retired in v1.79.0**: `workQueue()` renders the dashboard at the top of To Do, `workQueueDetail()` renders a drilled-in list in place of it, and `collectionStats()` moved to the Gallery. The `inbox` tab id is unchanged — renaming it would touch persistence, the lightbox mode and the prefs keys for no user-visible gain.
- **Modals:** single `state.modal = {type, data}` rendered through one `modalContent()` switch. ~20 modal types.
- **Icons:** inline SVG strings via `icon(name)`. As of v1.32, 8 icons use **real Tabler Icons source** (plant, map-pin, map-2, clipboard-text, info-circle, progress-check, progress-x, photo-question), copied from tabler.io rather than approximated. Get exact source from Amanda if more Tabler icons are wanted.
- **Responsive:** mobile-first, breakpoints at 700px (2-column card grids, larger thumbnails) and 1100px (3-column, widest container). `.card-grid` handles this. `.stack` is reserved for form/vertical layouts and deliberately never becomes a grid.
- **The `@media` blocks must stay last in `<style>` (v1.37.1).** Media queries add **no specificity**. A single-class base rule declared *after* them wins at every width, and the breakpoint silently stops working — no error, no warning, it just never applies. This had already killed `.plant-list-thumb` (base at 92px declared below the block, so the 120/140px breakpoint sizes never applied on any screen) and it killed `.detail-split` the day it was written. Add new base rules **above** the block.
- **"Photos of a plant" means `plantPhotosOrdered()`, never `photos.plant_id` alone (v1.70.0).** The direct attachment is one of two ways a photo shows a plant; `photo_plants` tags are the other, and a plant can have only the second kind. Any count, report or empty state that tests `p.plant_id === pl.id` directly will contradict the thumbnail beside it, which is exactly what "Plants missing photos" did.
- **The Location page has two photo layouts (v1.68.0), chosen by `locationHoldsPlants()`.** A container gets action cards — its photos are records to file. An Area or Archive gets `.photo-feed`: one column, whole frame uncropped, icon actions, caption below. Identify, Ask Claude and "other containers" are dropped there, because all three presuppose a plant or a container that a whole-area view does not have.
- **"No plant" is a gap only where plants are expected (v1.66.0).** `locationHoldsPlants()` decides, and `photoAwaitsPlant()` is the single predicate the Location banner, the Reports bucket and the Gallery filter all read. An Area photographs the whole wall and an Archive is a former home; neither names a specimen, so flagging them nags about correct data. Archive photos remain fully taggable — that is the Santa Rita workflow (§10) — and get their own non-accusing bucket, "Could show a specimen", which is excluded from the unfiled headline count. Any new report over photos must use the predicate rather than testing `!p.plant_id` directly, or the buckets stop being mutually exclusive.
- **Never interpolate `JSON.stringify` into an `onclick` (v1.79.1).** Handlers are written as `onclick="fn(...)"` with double quotes, so the first `"` in a JSON array or object closes the attribute and the browser sees a truncated expression — a syntax error, no visible failure, a dead button. Pass a scope name and resolve the data in the handler, or a comma-joined string. Four "select all" buttons shipped broken this way.
- **The app has two grounds, and a shared component must not assume one (v1.80.3).** Modals, the Gallery and the To Do queue sit on `--bg-raised` (dark); the Inbox card, the Location card, Plant Detail and the species record are `--parchment` (cream). A component used on both — `.suggestion-row` is the first — takes `color:inherit`, uses opacity for secondary text, and gets an `.on-cream-ground` wrapper from the caller that swaps the tint and any `--blue` accent for `--ink` / `--ink-soft`. `--cream` and `--parchment` are the same hex, so light-on-light is invisible rather than merely low-contrast.
- **`icon()` SVGs have no intrinsic size (v1.64.0, again in v1.76.0).** Sized by the font in a flex/inline context, but stretched to the container in any **block** context — a `.empty` panel, a `.btn-block`. The `.icon-btn` and `.empty svg` rules cover the usual cases; anywhere else, either size the svg explicitly or use text. A 300px `+` inside a full-width button is what this looks like when it goes wrong. They carry a `viewBox` and nothing else, so in a flex or inline context they size from the font but in a **block** container they stretch to 100% of it. Every container that renders one as a block child needs an explicit `svg{width;height}` rule — `.empty`, `.card-media-empty` and `.plant-list-thumb-empty` each have one. A new empty state without one draws a 200px icon.
- **`.section-grid` is CSS columns, not grid (v1.64.0).** Grid makes every cell in a row as tall as the tallest, and these cards range from four rows to a full empty state, so the short ones sat over a hole. Columns pack vertically at the cost of down-then-across reading order, which is acceptable for independent reference cards and would not be for a sequence.
- **Deleting photos in bulk goes through `deletePhotosByIds()` (v1.72.0).** Four things reference a photo — `plants.primary_photo_id`, `locations.primary_photo_id`, `taxa.primary_photo_id` and the two junctions — and every one is a hard FK. Any path that deletes photos and clears fewer than all of them will FK-error on a location hero or a species cover. It also chunks, per the rule below.
- **Any `in.(...)` filter over a list of uuids must be chunked (v1.63.1).** A uuid is 36 characters, so the URL grows ~37 bytes per id and crosses the **8KB request line** proxies enforce at roughly **200 ids**. Past that the request is rejected before PostgREST sees it, which looks like a dead button rather than an error. `deletePhotosByIds()` chunks at 100. This is a different limit from the 1000-row response cap that `restGetAll()` solves — one is the request, the other the response, and both truncate silently.
- **`photoImg()` takes the photo row, not a `drive_file_id` (v1.63.0).** It still accepts a bare id for the few places that only have one, but a bare id **cannot carry the focal point** — the crop silently falls back to `top`. Pass the row whenever you have it. `focalStyle(photo)` is the single place the `object-position` is composed.
- **Pickers are shared components, not per-modal lists (v1.72–1.73).** `plantPicker()` and `locationPicker()` are each defined once and used by every modal that needs one; both substitute `{id}` into a caller-supplied snippet. Inside a form with a Save button they must **stage** rather than act — `setEditPhotoPlant()` / `setBatchPlant()` — or picking commits a change the user has not confirmed. `locationPicker()` also writes `noteRecentLocation()`, which is what feeds the Inbox jump list; a new picker that skips it silently degrades that list.
- **There are two sticky layers, and the second is measured, not guessed (v1.73.2).** `.sticky-header-group` (brand bar plus the Inbox sub-bar) is `sticky; top:0; z-index:20`. A screen's own filter row uses `.sticky-controls`, which pins to `top: var(--sticky-top)` at `z-index:19` — one below, so overlap resolves correctly. `measureStickyOffset()` sets the variable on every render from the group's actual height plus 46px when the task banner is up. Do not hardcode the offset: the group's height changes with the sub-bar, the banner and the breakpoint.
- **Card image treatments** are currently inconsistent and being unified: `.plant-list-thumb` is a square side thumb (92 / 120 / 140px by breakpoint) used by both `plantRow` and `locationCard`; `.plant-hero` is 16:9 on Plant Detail and Location Detail; `.inbox-photo-hero` is 4:3. PD-1 replaces the 16:9 hero with a **single reusable card-media pattern**, which LOC-1 then applies to the Locations cards. Do not add a fourth one-off treatment in the meantime.

---

## 11b. Photo actions — one row, every surface (v1.85.0)

`photoActionList(photo, ctx)` decides **what** a photo offers; `photoActionsHtml()` renders it in the calling surface's own button language. Every photo surface calls it: the Inbox card, Plant Detail's row, both of Location Detail's feeds, the Taxon grid, both Gallery card layouts, and all four lightbox modes.

**Why it exists.** Before it, each surface owned its buttons. The audit that prompted this found Favourite on 3 of 11 surfaces, "tag the other plants in this planter" missing from the location feed where mixed planters actually live, and the Location lightbox offering two actions — one of which edited the *location record* rather than the photo, the same mislabel the plant lightbox had until v1.84.0. That one was fixed in plant mode and missed in location mode **because the two did not share code**. Drift was structural, not accidental.

**The rule** (Amanda, 2026-08-27): minimal on cards, everything in the lightbox. `ctx.variant` is `"card"` or `"full"`. A filed photo's card shows Favourite / Edit / Delete; its lightbox adds health, assignment, location and set-as-primary. An *unfiled* photo keeps its filing actions on the card, because progressing it is the card's job.

**Add a new photo action here and nowhere else.** Surfaces pass `cls`, `style`, `iconOnly` and `omit`; they do not add buttons of their own. Two deliberate exceptions, both commented in place: the Inbox keeps INB-1's promoted Plant/Location pair, and the location feed keeps its own Unfile.

**Assign / Unassign is the vocabulary** (Amanda, 2026-08-27). There were four verbs for one relationship — attach, tag, detach, move. There are now two, and one modal. The storage split remains and still means something: `photos.plant_id` is the specimen whose timeline the photo belongs to; `photo_plants` is everything else visible in frame. The UI hides the distinction — the first plant assigned becomes the owner, "Make owner" promotes another. `movePhoto` is gone: moving a photo is reassigning it.

**"Other containers" was removed**, not hidden — `tagLocations` did not map to anything Amanda recognised. `photo_locations` rows created before v1.85.0 still display via `allLocationsForPhoto()`; there is no UI to add or remove them.

## 12. Brand / Design System

Approved palette. Do not deviate without a new brand sheet.

| Token | Hex | Role |
| --- | --- | --- |
| Deep Garden Green | `#243E36` | Background, primary buttons on light surfaces |
| Aloe Green | `#70866B` | Secondary controls |
| Terra Cotta | `#D97474` | Attention / waiting states — corrected from an initial `#D06A4E`, confirm before changing again |
| Aloe Bloom Orange | `#F2A65A` | Primary capture action, highlights |
| Cactus Flower Pink | `#D67A9A` | Special / flowering, sparing use only |
| Agave Blue | `#7CA7A1` | Informational, location-related |
| Warm Cream | `#F5EFE3` | Cards, light surfaces |
| Charcoal | `#252925` | Text on light surfaces |

**Typography:** Fraunces (display/headings), Inter (body/UI), IBM Plex Mono (technical metadata — accession numbers, dates, codes).

**Zero counts (v1.34.5).** Card metadata counts always render, including zero — a container with no plants or no photos is the record that needs work, and suppressing the zero hides the actionable state. Zeros are dimmed rather than removed (`countLabel()` → `.count-zero`, opacity 0.45) so a list of not-yet-populated buckets stays scannable without losing the signal. `countLabel()` returns HTML; do not escape it at the call site.

**Logo assets** in `assets/`: `favicon.png`, `icon-192.png`, `icon-512.png`, `icon-submark.png`, `logo-horizontal.png`, `logo-horizontal-dark.png`, `logo-stacked.png`, `logo-stacked-dark.png`. Use `-dark` variants on the green page background; light variants only on cream/white surfaces such as the login card.

---

## 14. Weather (v2.11.0)

Two **keyless, CORS-open** APIs called directly from the browser. No Edge
Function, no secret, no migration.

| | Endpoint | Gives |
| --- | --- | --- |
| Forecast | `api.open-meteo.com/v1/forecast` | 7-day min/max temp, precipitation |
| Advisories | `api.weather.gov/alerts/active?point=lat,lon` | named NWS events |

Open-Meteo is queried with `temperature_unit=fahrenheit&precipitation_unit=inch`
and `timezone=auto`, so no unit or timezone conversion happens in the app.

**NWS returns 403 to a blank User-Agent** (verified 2026-08-30 — an Akamai
"Access Denied", not a JSON error) and 200 to a browser's own. A browser always
sends one, so this works from `index.html`; **it would fail from an Edge
Function** unless that function sets `User-Agent` explicitly. This is the reason
weather is client-side, and the first thing to check if it is ever moved.

**A named NWS event overrides the numeric threshold.** "Frost Advisory" at 41°F
beats the app's own 38°F line — the forecasters know things the daily minimum
does not carry.

**Frost watch defaults to 38°F, not freezing.** Reported lows are measured at
2m; on the still clear nights that produce frost, bucket level runs several
degrees colder. All three thresholds are `app_settings` rows, editable in
Settings → Preferences.

**Timezone.** `loadWeather` stores Open-Meteo's **local** dates (`timezone=auto`),
which is why DATE-1 was found here first. Since v2.11.1 the whole app is local:
`todayISO()` returns the local calendar day and `fmtDate()` parses date-only
strings as local. **Dates and times are local throughout — that is Amanda's
stated preference, not an implementation accident.** Timestamps
(`taken_at`, `uploaded_at`, `started_at`) carry a zone and are untouched.

**Failure behaviour.** Both fetches are wrapped; a failure renders no weather
rather than breaking To Do, the same discipline as `optional()` in `loadAll`.
Results cache in `localStorage` for 3 hours. `loadWeather()` is called unawaited
at the end of `loadAll()` and gates itself on staleness.

**Blind spot.** Nothing distinguishes an indoor location from an outdoor one
(`LOCATION_TYPE_LABELS` has no such value; `indoor` was defined and went
unused), so the frost count includes plants already brought in. The frostTender
report has always had this. A `sheltered` boolean on `locations` would fix it.

---

## 13. Deployment Quick Reference

```bash
# Frontend
cd ~/Projects/adcock-plant-inventory-app
git add . && git commit -m "v1.x.x: ..." && git push

# Edge Functions
cd ~/Projects/adcock-plant-inventory
supabase functions deploy <function-name>

# Secrets
supabase secrets set KEY="value"
supabase secrets list

# SQL migrations
# Run manually in Supabase Dashboard -> SQL Editor. No migration tool.
```

Bump `APP_VERSION` / `APP_UPDATED` in `index.html` on every change. Both are visible in Settings and the (i) App Info modal, and are how a real deploy is distinguished from a stale cache.
