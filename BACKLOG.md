# Backlog

Source of truth for what is queued, in flight, and done. Update this file as part of shipping any item.

Status values: `ready` · `blocked` · `in-progress` · `done`
Item IDs are permanent. Never renumber.

---

## Ready now — no upstream dependencies

### PD-1 — Plant Detail layout rebuild
**Status:** ready · **Effort:** medium · **Schema:** none · **Touches:** `screenPlantDetail`

- Replace the full-width 16:9 hero with a side-by-side layout: square or 4:3 primary image beside the details block.
- Improve visual cohesion between the primary card and the photo timeline below it.
- Keep the existing per-location timeline grouping intact.
- **PD-1 owns the reusable card-media / 4:3 image treatment.** Design it once here as a shared CSS pattern, not a one-off inside `screenPlantDetail` — LOC-1 consumes it afterward. It replaces `.plant-hero`'s `aspect-ratio:16/9`; 16:9 crops off-center subjects badly, which is the reason for the change.
- Depends on nothing. Run before LOC-1.

---

### PD-3 — Care notes as a dated list
**Status:** ready · **Effort:** medium · **Schema:** yes (new table) · **Depends on:** PD-1

A running dated list of care events, separate from the existing free-text `plants.notes`.

- New `care_notes` table: `id`, `plant_id` FK, `noted_on` date, `body` text, `created_at`.
- Displayed newest-first on Plant Detail with an inline add.
- Include in the full JSON backup/restore path (`exportFullBackup` / `handleImportBackup`).
- Note the deletion implication in `REFERENCE.md` §6: deleting or merging a plant must handle `care_notes` rows.

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

Unblocks: BLOOM-1, RPT-3, RPT-4.

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
