# Backlog

Source of truth for what is queued, in flight, and done. Update this file as part of shipping any item.

Status values: `ready` · `blocked` · `in-progress` · `done`
Item IDs are permanent. Never renumber.

---

## Observed 2026-08-25 — triaged from Amanda's session notes

### SPECIES-1 — Split taxa from specimens (epic)
**Status:** needs plan approval · **Effort:** high · **Schema:** yes, new table + FK · **Touches:** nearly every screen

`plants` is one row per accessioned specimen, so **every species-level fact is copied onto every specimen of that species** and nothing keeps the copies in sync. Four offsets of one plant store the same mature size four times.

Costs today: correcting a species fact means editing every specimen or letting them drift; AI-2 would fill identical facts once per specimen; propagation via `parent_plant_id` re-enters everything by hand.

**Decided with Amanda 2026-08-25:**
- Navigation becomes **taxon list → taxon detail → specimen list → specimen detail**. The Plants tab browses taxa, not specimens.
- The table is **taxa**, not species — a row is the most specific level known: a species, a cultivar, or a bare genus. Cultivars are **separate rows** because their traits genuinely differ (*Aeonium arboreum* is green, 'Zwartkop' is near-black). Name stored in structured parts — `genus`, `species_epithet`, `cultivar`, `is_hybrid` — and composed for display. "All Aeoniums" is a query on `genus`, so no self-referencing tree is needed.
- **Unidentified plants stay first-class.** `taxa_id` is nullable. Confirming an identification either creates a taxon and links it, or links an existing one. This makes AI-1 cleaner: identify once, link, fill taxon facts once.
- **Identifiers:** specimens keep `ABG-YYYY-NNNN` **unchanged** — existing trigger, existing data, still immutable per §5. Taxa get their own `ABG-TX-NNNN` from a trigger mirroring the accession one, plus the composed name as a unique natural key. The synthetic code is only worth the trigger if labels or QR codes are wanted.

Field split:
- **Taxon:** description, plant_type, growth_habit, mature_size, bloom_season, origin, native_range, hardy_to, light_conditions, water_needs, family/genus/species/cultivar, primary_photo_id (any specimen's photo).
- **Specimen:** accession_number, identification_status/notes, collection_category, original_collection, status, health_status, location_id, date_acquired, acquisition_*, parent_plant_id, primary_photo_id, care_notes, photos.

**Locations need no schema change.** "Where can I find any specimen of this taxon" is a query over its specimens; "where exactly is this one" is the specimen's existing `location_id`.

Migration groups existing plants by botanical name into taxa, links them, and **leaves the duplicated columns on `plants` until confirmed** — the reversible pattern used for the notes migration in v1.38.0.

Open before building:
- **Does every individual offset get accessioned?** If a bucket holds five offsets of one taxon, is that five specimen rows or one? Decides whether specimen count stays manageable.
- Are labels/QR codes wanted, i.e. is the `ABG-TX-NNNN` trigger worth building?
- Does taxon detail show a merged photo gallery across its specimens, or only the profile photo?
- Interaction with GAL-2: `plant_type` moves to taxa, so Collection Highlights becomes a taxon-level filter.
- Interaction with `mergePlants`: merging two specimens of different taxa needs a rule.

Supersedes the plant-level half of GAL-2. AI-1 and AI-2 should be designed against this model, not the current flat one.

### PERF-1 — Photo loading flicker
**Status:** ready · **Effort:** medium · **Schema:** none · **Touches:** `ensurePhotoLoaded`, `render`, `debouncedRender`

Images visibly flash and blink while loading. Every resolved Drive URL triggers `debouncedRender()`, which rebuilds `#app.innerHTML` from scratch (§11) — so every `<img>` on screen is destroyed and recreated, losing already-painted images and re-requesting them.

`debouncedRender()` reduced how *often* this happens but not what it does. Options: skip the full rebuild and patch resolved `<img>` elements in place; keep a stable placeholder box so layout doesn't shift; or a first-load state. The in-place patch is the real fix — full-rebuild-on-every-photo is the root cause.

### PD-4 — Health status needs an urgent tier
**Status:** ready · **Effort:** low · **Schema:** none (text column) · **Touches:** `HEALTH_LABELS`, `plantRow`, `screenReports`

`healthy` / `watch` / `recovery` / `unknown` has no level above `watch`. Add an urgent tier.

`health_status` is free text standardized by the dropdown, so no migration — but **three places branch on the exact values** and must be updated together, or an urgent plant silently reads as healthy:
- `index.html:1301` — `needsAttention` on the plant card badge
- `index.html:1729` — `plantsNeedingAttention` in Reports
- `moveToHospital` sets `watch` — should it set the new tier instead?

Name to confirm: `urgent` / "Urgent care".

### PD-6 — New Plant form is missing most fields
**Status:** ready · **Effort:** low–medium · **Touches:** `newPlant` / `newPlantFromPhoto` modal (~`index.html:2166`), `wireModalForms`

The create form collects only botanical name, common name, ID status, location, category, original-collection, notes. The edit form collects roughly twenty fields. Everything else can only be filled by creating the plant and immediately reopening it in Edit.

Gap widened with PD-2 — none of `plant_type`, `growth_habit`, `mature_size`, `bloom_season`, `origin` appear at creation. Affects both entry points, which share one modal.

Decide: full parity with the edit form, or a short form plus a "More details" expander so quick capture from the Inbox stays fast.

### PL-1 — Status badge placement on plant list cards
**Status:** ready · **Effort:** low · **Touches:** `plantRow` (`index.html:1305`), `.status-badge` CSS

The badge sits at the card's top-right corner (moved there in v1.34.1 from an invisible corner dot). Amanda dislikes the placement. Needs a specific direction before building — inline with the title, on the thumbnail, as a left edge stripe, or a text pill in the metadata row.

### PL-2 — Plant pickers should lead with a photo and common name
**Status:** ready · **Effort:** low–medium · **Touches:** every `${p.accession_number} — ${plantDisplayName(p)}` picker (~`index.html:1843`, `1924`, `1962`, `2265`, `2412`)

Attach/tag pickers list plants as `ABG-2026-0007 — Aeonium arboreum 'Zwartkop'`. Accession numbers aren't memorized and botanical names aren't yet recognizable at a glance, so the list is hard to scan.

- Lead with **common name**, falling back to botanical name when there's no common name — the inverse of `plantDisplayName()`'s current precedence.
- Show a **thumbnail**. This is the actual recognition cue.
- Accession number demoted to small mono text, not the primary label.

Note these are `<select><option>` elements in places, which cannot hold images — those become custom list pickers, which is where the effort sits.

### PHOTO-1 — Per-photo focal point
**Status:** ready · **Effort:** medium · **Schema:** yes · **Touches:** `photos`, `.card-media img`, lightbox

Every cropped image is hardcoded `object-position:top` (`.card-media img`). Good default for upright specimens, wrong for wide plantings and off-centre subjects — the original reason for dropping 16:9.

Add `photos.focal_x` / `focal_y` (0–100 percent, default 50/50 or 50/0) and emit `object-position:{x}% {y}%`. UI: click a point on the photo in the lightbox to set it. Once this exists, the crop complaint behind PD-1 and LOC-1 is properly solved rather than defaulted around.

---

## Ready now — no upstream dependencies

### LOC-1 — Locations list card layout
**Status:** ready · **Effort:** low · **Schema:** none · **Depends on:** PD-1 (image treatment must exist to apply) · **Touches:** `locationCard`, `.plant-list-card` / `.plant-list-thumb` CSS

Apply the card-media image treatment PD-1 establishes to the Locations list cards, and settle the card layout.

Acceptance criteria:
- The card's image uses the **reusable card-media pattern defined in PD-1**. LOC-1 consumes that pattern; it does not define its own.
- Card layout and image size are decided against real photos in the cards. Current treatment is the compact square side thumb at 92 / 120 / 140px per breakpoint — deliberately left at that size in LOC-2 pending this judgment.
- Responsive behavior matches the existing 700px / 1100px breakpoints.

Counts, inline actions, and the nested indicator already ship — see LOC-2. This item is layout and imagery only.

### LOC-3 — Apply the zero-count treatment to plant cards
**Status:** ready · **Effort:** trivial · **Schema:** none · **Touches:** `plantRow` (`index.html:1242`)

LOC-2 established the rule that a zero count renders dimmed rather than hidden (`countLabel()` / `.count-zero`, `REFERENCE.md` §12), and applied it to the Locations card and the Location Detail child cards. `plantRow` still renders its photo count by hand, so a plant with no photos shows an undimmed `0 photos` while location cards dim theirs.

One-line change: route it through `countLabel()`. Deliberately deferred out of LOC-2 to keep that commit scoped to the Locations screens.

---

### ADM-1 — Editable dropdown lists in Settings
**Status:** ready · **Effort:** medium · **Schema:** yes (new table) · **Touches:** `screenSettings`, `loadAll`, every screen reading a `*_LABELS` map

Amanda manages dropdown option lists herself, from an admin area in Settings, instead of asking for a code change.

Today the vocabularies live in JS constants inside `index.html` (`PLANT_TYPE_LABELS`, `GROWTH_HABIT_LABELS`, `BLOOM_SEASON_LABELS`, `ORIGIN_LABELS`, and older ones like `STATUS_LABELS`). Editing one means editing the file and shipping a version.

Proposed: a `list_options` table — `list_name`, `value`, `label`, `sort_order`, `active` — loaded in `loadAll` and cached in `state`, with the existing constants kept as seed data and fallback. One table serves every list.

Decide before building:
- **What happens to records already using a value that is renamed or deleted.** Retiring via `active = false` (still displays on existing records, no longer offered in the dropdown) is safer than a hard delete, which silently orphans data.
- **Which lists are eligible.** `plant_type`, `growth_habit`, `bloom_season` are pure vocabulary and safe. `origin`, `status`, `health_status` and `identification_status` have **code branching on their exact values** (`status !== "active"`, `health_status === "watch"`, the Plants filter bar) — making those editable breaks logic. Either exclude them or separate "label is editable" from "value set is editable".
- Whether `value` stays immutable once created, with only `label` editable. That would remove most of the orphaning risk in one stroke.

### ADM-2 — `plant_location_history` is missing from the backup
**Status:** ready · **Effort:** trivial · **Touches:** `exportFullBackup`, `handleImportBackup`

`exportFullBackup` fetches eight tables and does not include `plant_location_history`, even though §6 treats it as FK-critical. A restore from backup silently loses every recorded plant move. Add it to the export and to the import chain after plants.

Spotted during PD-3; not folded in to keep that commit scoped.

---

## Foundation — unblocks most of the rest

### AI-1 — Unified Claude vision call on upload (Epic 3)
**Status:** ready · **Effort:** high · **Schema:** none initially · **Touches:** `identify-plant-claude` Edge Function, `uploadPhoto`, `identifications`

One Claude vision call returns a single structured JSON payload containing:
- plant identification
- health notes
- bloom detection
- location suggestion

Design constraints:
- Existing `identifications` audit-trail behavior is preserved: suggestions are **pending**, never silently applied to confirmed data.
- A bloom suggestion may never set bloom state automatically. It proposes; Amanda confirms.
- Watch the base64 chunking gotcha documented in `REFERENCE.md` §8. Do not use spread-operator conversion.
- Decide and document where the non-identification fields (health, bloom, location) are stored. `identifications.raw_response` is the cheap path; a dedicated column or table is the durable one. Propose both with tradeoffs before building.

Unblocks: BLOOM-1, RPT-3, RPT-4, AI-2, AI-3.

**Interaction model changed 2026-08-25.** Amanda wants Claude to stop being a button she presses and become a background process whose suggestions surface for confirmation on Plant Detail. That means: drop the per-photo "Ask Claude" action from the Inbox card, run the call automatically on upload, and design where pending suggestions appear. The audit-trail rule is unchanged and matters more under this model, not less — suggestions stay **pending** and are never silently applied.

### AI-2 — Claude fills the horticultural fields
**Status:** blocked by AI-1 · **Effort:** medium · **Schema:** depends on AI-1's storage decision

Extend the single vision call beyond identification to propose the fields Amanda would otherwise research by hand: `botanical_name`, `family`, `genus`, `species`, `native_range`, `hardy_to`, `light_conditions`, `water_needs`, and the PD-2 fields `plant_type`, `growth_habit`, `mature_size`, `bloom_season`.

- Every field is a **suggestion pending confirmation**, shown on Plant Detail with accept / reject per field. Never written directly.
- Most of these are **species-level facts, not observations of this specimen** — Claude can answer them from the identified name without the photo. Worth deciding whether they come from the vision call or a cheaper follow-up text call once identification is confirmed.
- Confirming an identification could offer "also fill in what Claude knows about this species" as one action.

### AI-3 — Duplicate plant detection when adding
**Status:** partly blocked by AI-1 · **Effort:** medium

Adding a plant that already exists creates a silent duplicate. Two layers, separable:

1. **Name match — needs no AI, build first.** On the new-plant form, match the typed botanical/common name against existing plants and warn before creating, offering **tag the existing plant instead** as the primary action.
2. **Photo match — needs AI-1.** When creating from an Inbox photo, Claude suggests the existing plant it most resembles.

Layer 1 catches the common case and is independent of AI-1. Do not wait for the vision call to ship it.

---

## Blocked

### BLOOM-1 — Bloom event tracking (Epic 1)
**Status:** blocked by AI-1 · **Effort:** medium · **Schema:** yes

- New `bloom_events` table: `plant_id`, nullable `location_id`, `start_date`, nullable `end_date` (null while active), `bloom_photo_id`.
- New `bloom` photo type, distinct from profile and timeline photos.
- Manual toggle **and** AI suggestion. AI suggests only.
- Feeds RPT-4 (What's in Bloom) and GAL-5 (Gallery In Bloom row).

### RPT-1 — Dashboard summary tiles
**Status:** ready · **Effort:** low · **Touches:** `screenReports`
Merge the Home Dashboard concept into the Reports screen. Tiles for Plants, Locations, Photos, Inbox counts. This sub-item has no dependency and can ship ahead of the rest of Reports.

### RPT-2 — Records needing attention
**Status:** ready · **Effort:** low–medium
Live counts for: empty locations, plants missing photos, plants missing identification, unassigned photos. Much of this logic already exists in `screenReports` — consolidate rather than duplicate.

### RPT-3 — Check-ins
**Status:** blocked by AI-1 · **Effort:** medium
Plant check-ins support **both** staleness (days since last photo, via `photoDate()`) and a manual flag. Location watch status is a manual flag only.

### RPT-4 — What's in Bloom section
**Status:** blocked by BLOOM-1 · **Effort:** low

---

## Gallery rebuild — largest net-new area

### GAL-1 — Favorites
**Status:** ready · **Effort:** low · **Schema:** `photos.is_favorite` boolean
Heart icon, manual per-photo toggle, filter row in Gallery.

### GAL-2 — Collection Highlights
**Status:** ready · **Effort:** medium · **Schema:** category-tagging junction table
Cactus icon. Manual per-photo or per-plant category tags: Cacti, Agaves, Aloes, Succulents. Decide photo-level vs. plant-level tagging before building — the two produce different Gallery behavior.

**Re-scope against PD-2.** `plants.plant_type` now holds cactus / agave / aloe / euphorbia / sedum / crassula / echeveria / sempervivum / aeonium, which **is** plant-level category tagging. The open question shrinks to whether GAL-2 additionally needs *photo-level* tags. If not, GAL-2 needs no junction table at all — it becomes a Gallery filter reading `plant_type`. Do not build a second source of truth for the same fact.

### GAL-3 — Garden Albums
**Status:** ready · **Effort:** medium
Manually curated groupings: The Wall, Potted Collection, Front Yard.

### GAL-4 — From the Archives
**Status:** ready · **Effort:** medium · **Schema:** archive-grouping fields
Group `photo_type = 'historical'` photos by former collection location and date range. These former locations are **archival labels, not rows in `locations`** — they need their own small schema addition.

### GAL-5 — In Bloom row
**Status:** blocked by BLOOM-1 and OPEN-2

---

## Open decisions

**OPEN-1 — Build order.** Amanda sets priority across Plant Detail, Locations, Reports, and Gallery. Current call: **PD-1 first**, then LOC-1. Reversed from the original LOC-1-first call once the card-media image treatment moved to PD-1 — the pattern is designed once there and applied in LOC-1 second. LOC-2 shipped the Locations data defects ahead of both.

**OPEN-2 — In Bloom behavior.** Should the Gallery's In Bloom row be derived automatically from `bloom_events`, matching how blooming is actually tracked, or manually curated like Favorites and Collection Highlights for consistent Gallery interaction? Unresolved. GAL-5 cannot start until this is decided.

---

## Deferred / known gaps

- **CSV import.** Export exists (plants CSV, full JSON backup). Import is JSON-only, upsert-based. No CSV import path.
- **Guest / read-only view.** Scoped as a question early on, never built. RLS currently grants full access to any authenticated user, so this is a real design change, not a UI toggle.
- **Bucket-level physical inventory.** All 92 wall buckets exist as location rows. Assigning actual plants to each is ongoing manual work, not automatable.
- **Pl@ntNet per-specimen limitation.** Identifies the whole frame, not individual specimens in a multi-plant container photo. Claude has the same limitation but can at least reason about the dominant subject.

---

## Completed

### v1.38.1

**BUG-1 — "Move to Plant Hospital" did nothing.** Status: done · Schema: none · Touched `moveToHospital`.

The lookup required `name === "Plant Hospital"` **exactly** and `!parent_location_id`. Amanda's hospital location exists, is top-level and is typed `hospital`, so the name string differed invisibly — stray whitespace or casing. Matching a literal English name instead of the standardized `hospital` location **type** was the real defect.

Now matches `type === "hospital"` first, falls back to a trimmed case-insensitive name match, and drops the top-level requirement. Multiple hospitals are allowed; the destination is named in the confirm dialog rather than silently chosen. Empty-case toast now says what to fix.

### v1.38.0

**PD-7 — Plant Detail layout v2.** Status: done · Schema: yes (below) · Touched `icon()`, `<style>`, `screenPlantDetail`, `editPlant` modal, `wireModalForms`, `exportPlantsCsv`, new `fieldRow()`.

**Closes PD-5** (show all Plant Detail fields even when empty) — delivered here rather than as its own item, since the rebuild had to decide the empty-field treatment anyway. PD-5's rule now applies to Care, Provenance, Identification and Collection, superseding the "new five only" decision from PD-2.

Built from Amanda's mockup. **The screen holds one shape on every plant** — every section renders, every field renders, blanks show a dimmed em-dash. A bare record renders all six sections with 15 dashes.

- **Hero:** 4:3 image · identity + pills + Locations + description · vertical action card (Edit / Hospital / Propagate / Delete) with chevrons. Actions become a third column only at 1100px, where there's room.
- **Six section cards:** Details, Care, Identification, Collection, Provenance, Care notes. 3-up at 1100px, 2-up at 700px, stacked below.
- **Photo timeline is grouped by location as columns** — one column per location, photos descending inside it, horizontally scrollable. Grouping preserved; only the axis changed.
- `description` added — species-level prose, distinct from `care_notes` observations.
- **`plants.notes` migrated into `care_notes`** and no longer displayed. Column retained, not cleared, so the migration is reversible. `identification_notes` and `acquisition_notes` deliberately **not** migrated.
- Light stays a list of selected values, rendered as chips.
- 13 real Tabler icons added from Amanda's source, normalized to the house format. `shovel` / `bowlSpoon` (Soil, Feeding — fields not added yet), `heartStar` (GAL-1) and `plant2` (BLOOM-1 / GAL-5) are defined but not yet wired to a screen.

```sql
-- PD-7: species-level description
alter table plants add column if not exists description text;

-- Preview: how many notes will become care notes
select count(*) from plants where notes is not null and btrim(notes) <> '';

-- Migrate. NOT IDEMPOTENT — running twice duplicates every note.
insert into care_notes (plant_id, noted_on, body)
select id, created_at::date, notes
from plants
where notes is not null and btrim(notes) <> '';
```

### v1.37.1

**Fix: `@media` blocks were being shadowed by later base rules.** Status: done · Schema: none · Touched `<style>` ordering only.

PD-1's side-by-side detail layout never rendered — the image sized correctly but the details stacked underneath it, leaving a large empty area beside the photo. Cause was CSS ordering, not flexbox: media queries add no specificity, so `.detail-split{flex-direction:column}` declared *below* the `@media` block beat `flex-direction:row` *inside* it at every width.

Same bug had already silently disabled `.plant-list-thumb`'s responsive sizing — base `92px` was declared below the block, so the 120px / 140px breakpoint sizes had **never** applied on any screen. Card thumbnails on Plants and Locations grow at 700px and 1100px now, as `REFERENCE.md` §11 always claimed they did.

Fix: moved both `@media` blocks to the end of `<style>` and left a warning comment there. Recorded in `REFERENCE.md` §11.

### v1.37.0

**PD-3 — Care notes as a dated list.** Status: done · Schema: yes, new `care_notes` table (below) · Touched `state`, `loadAll`, `screenPlantDetail`, new `addCareNote` modal, `saveCareNote` / `deleteCareNote`, `exportFullBackup`, `handleImportBackup`, `deletePlant`, `mergePlants`.

- Newest-first list on Plant Detail between Care and the Photo timeline, with an Add button and per-note delete.
- `noted_on` is the observation date, defaulting to the **local** calendar date via `todayLocalISO()`. `new Date().toISOString()` rolls to tomorrow during a Pacific evening and would misdate evening notes.
- Same-day notes tiebreak on `created_at`.
- In the JSON backup; restored after plants, since `plant_id` is a hard FK.
- §6 cleanup order gained step 6: merge **reassigns** care notes to the surviving plant, delete removes them. FK is `on delete cascade`; both paths still handle it explicitly.

```sql
-- PD-3: dated care events, separate from free-text plants.notes
create table if not exists care_notes (
  id          uuid primary key default gen_random_uuid(),
  plant_id    uuid not null references plants(id) on delete cascade,
  noted_on    date not null default current_date,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists care_notes_plant_id_idx on care_notes (plant_id);
create index if not exists care_notes_noted_on_idx on care_notes (noted_on desc);

alter table care_notes enable row level security;

create policy "care_notes_all_authenticated"
  on care_notes for all to authenticated
  using (true) with check (true);
```

### v1.36.0

**PD-2 — Structured Details fields.** Status: done · Schema: yes, `ALTER TABLE plants` (below) · Touched `screenPlantDetail`, `editPlant` modal, `wireModalForms`, `exportPlantsCsv`, new `detailRow()` + four label maps.

Five fields added: `plant_type`, `growth_habit`, `mature_size`, `bloom_season`, `origin`.

- `introduced` was renamed **`origin`** and is a Native / Introduced / Unknown classification, not a date. The original backlog name read wrong holding the value `native`. Decided in conversation and previously unrecorded — now in `REFERENCE.md` §3.
- All five render on Plant Detail even when blank, dimmed em-dash via `detailRow()` / `.value-blank`. Care and Provenance keep hiding when empty — **deliberate**, decided explicitly; the screen follows two conventions on purpose.
- Dropdown values live in JS label maps, not DB enums, per §3 convention. Extending a list is a one-line edit with no migration. See ADM-1 for making them user-editable.
- `plant_type` doubles as the plant-level grouping GAL-2 needs — see the note on that item.
- Added to the plant edit modal and appended to the CSV export after `species`.

```sql
-- PD-2: structured plant detail fields
alter table plants
  add column if not exists plant_type   text,
  add column if not exists growth_habit text,
  add column if not exists mature_size  text,
  add column if not exists bloom_season text,
  add column if not exists origin       text default 'unknown';
```

### v1.35.0

**PD-1 — Plant Detail layout rebuild.** Status: done · Schema: none · Touched `<style>`, `screenPlantDetail`, `screenLocationDetail`, `photoRow`.

- New `.card-media` treatment with `ratio-4x3` / `ratio-1x1` modifiers, replacing `.plant-hero` (16:9), `.inbox-photo-hero` (4:3) and `.plant-hero-empty` — three parallel boxes doing one job. **This is the reusable pattern LOC-1 consumes.**
- New `.detail-split`: image stacked on phones, beside the details block from 700px (image column 42%, max 400px).
- `.hero-change-btn` deleted — it floated over a full-width hero via `margin-top:-40px`, which breaks in a column. Replaced by `.media-btn` positioned inside the media box.
- Applied to Plant Detail, Location Detail, and the Inbox card. Photo timeline and its per-location grouping untouched.
- Side effect: Inbox thumbnails now crop from the top rather than centre, inherited from the shared treatment.

### v1.34.5

**LOC-2 — Location cover photo and count defects.** Status: done · Schema: none · Touched `locationCoverPhoto`, `aggregatePhotoCount`, `locationCard`, new `nestedCountLabel`.

Split out of the original LOC-1 once the defects turned out to be data, not layout. The Locations list renders **only top-level locations**, and a top-level area's plants and photos live on the rows and buckets nested under it — so the direct-only lookups read as empty on exactly the cards this screen shows.

- `locationCoverPhoto()` searched direct photo attachments only, so top-level areas fell through to the empty-photo placeholder even when their descendants had photos. Now resolves own primary → own newest → newest anywhere beneath.
- `locationCard` used `photosAtLocation().length` instead of `aggregatePhotoCount()`, showing `0 photos` for areas with photos underneath them.
- `aggregatePhotoCount()` summed per-descendant lengths without deduping, double-counting any photo tagged onto both a parent and a child or onto two siblings. Now deduped by photo id, which also corrects the child-card counts on Location Detail.
- Photo count no longer suppressed at zero. A container with no photos is the record that needs work, so hiding the zero hid the actionable state — and the line already rendered `0 plants` unconditionally, so it was showing one zero and hiding the other. Zero counts now render dimmed via `countLabel()` / `.count-zero` (opacity 0.45): present when looked for, receding when scanning a long list of not-yet-populated buckets. Applied to both counts on both the Locations card and the Location Detail child cards.
- Nested indicator is type-aware via `nestedCountLabel()`: "6 rows inside" under Wall Collection, not "6 areas inside". Mixed child types and types with no natural plural fall back to "locations". Applied at **both** call sites — the Locations list card and the child cards on Location Detail — so the two screens word it identically.
- Thumb `<img>` gained `object-position:top`, matching `plantRow`.
- `locationCard` hoisted out of `screenLocations` to top-level scope so other screens can share it.

Thumb size deliberately left at 92 / 120 / 140px — to be judged against real photos in LOC-1.

### v1.34.4 and earlier
- Trash icon on every delete action: lightbox, timeline, bulk-select, choose-photo modal, delete plant.
- Status badge moved from an invisible corner dot to a visible icon badge on the card's top-right: checkmark for healthy, triangle for needs attention.
- Plant cards simplified. Identification status and location removed from cards, reserved for dashboard task logic.
- Multi-location timeline bug fixed. "Add another location" now suggests locations already seen in the plant's photo timeline.
- Photo timeline on Plant Detail groups into per-location sub-timelines instead of one flat list.
- `plantPhotosOrdered()` fixed — previously checked only `photos.plant_id` and ignored the `photo_plants` tag table. Tag-only plants now show photos in thumbnails, counts, and the timeline.
- Tagged-but-not-owned photos get **Remove tag** instead of **Delete**, and are labeled **Tagged**.
- "Add to a plant here" excludes the photo's existing owner and already-tagged plants. Defensive guard added to `attachPhotoToExistingPlant()`.
- Duplicate tag data cleaned up (literal duplicate rows and owner-also-tagged rows). Both confirmed clean.
