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
- **Unidentified *taxa* must also be trackable** (Amanda, 2026-08-25). Three plants can obviously be the same kind without anyone knowing what that kind is. A null `taxa_id` cannot express that — each would stand alone with no way to say "these are the same mystery plant." So **a taxon does not require a name**: it can be created with a working label ("spiky thing from Mom's") and named properly later. Identifying it then **fills in the existing row**, so every specimen link survives and nothing needs re-linking. Two distinct states result:
  - `taxa_id` null — not yet grouped with anything.
  - linked to an unnamed taxon — grouped with its siblings, kind still unknown.
  Consequence: `genus` / `species_epithet` are nullable, and the composed display name needs a working-label fallback.
- **Identifiers:** specimens keep `ABG-YYYY-NNNN` **unchanged** — existing trigger, existing data, still immutable per §5. Taxa are identified by a **uuid PK plus the composed name as a unique natural key**. No synthetic taxon code: it only earns a trigger if labels or QR codes are printed, which they are not.

Field split — confirmed column by column with Amanda 2026-08-25:

| Current `plants` column | Goes to |
| --- | --- |
| `common_name`, `cultivar` | taxon |
| `family`, `genus`, `species` → `species_epithet` | taxon |
| `description` | taxon |
| `plant_type`, `growth_habit`, `mature_size`, `bloom_season`, `origin` | taxon (Details) |
| `native_range`, `hardy_to`, `light_conditions`, `water_needs` | taxon (Care) |
| `accession_number` | specimen |
| `identification_status`, `identification_notes` | specimen |
| `collection_category`, `original_collection` | specimen |
| `status`, `health_status` | specimen |
| `location_id` | specimen |
| `date_acquired`, `acquisition_source_type`/`_name`/`_notes` | specimen |
| `parent_plant_id` | specimen (lineage) |
| `primary_photo_id` | **both** — taxon profile photo, and each specimen's own |
| `notes` | already migrated to `care_notes` (specimen) |

`care_notes`, `photos`, `photo_plants` and `plant_location_history` stay keyed to **specimen**. `plant_locations` is retired by SPECIES-2. `identifications` is keyed to photos and does not move.

Three consequences worth holding onto:
- **`identification_status` describes the link, not the taxon.** It is not "how sure are we what this species is" but "how sure are we that *this plant* is that taxon." An unidentified specimen has `taxa_id` null and status `unidentified`; identifying it links a taxon and sets `confirmed`/`tentative`. A specimen must never be `confirmed` with no taxon — worth a soft check.
- **`botanical_name` becomes redundant** against structured `genus` / `species_epithet` / `cultivar`. **Decided 2026-08-25: compose the display name from the parts and drop the free-text column.** That is what makes ABG-2026-0014's hybrid (*Echeveria gibbiflora* 'Metallica' × *Echeveria elegans* 'Potosina') render correctly rather than being an unparseable string. Carrying both would invite drift.
- **`species` is renamed `species_epithet`** — `taxa.species` reads badly next to the table name, and it holds the epithet (*arboreum*), not the full name.

**Locations need no schema change.** "Where can I find any specimen of this taxon" is a query over its specimens; "where exactly is this one" is the specimen's existing `location_id`.

Migration groups existing plants by botanical name into taxa, links them, and **leaves the duplicated columns on `plants` until confirmed** — the reversible pattern used for the notes migration in v1.38.0.

**Every individual offset is accessioned** (decided 2026-08-25) — five offsets in a bucket are five specimen rows. Two consequences: propagation needs batch creation (PROP-1), and a taxon's specimen list will often be several near-identical rows, so it must distinguish them by **photo, location and health**, never by name — they share a name by definition.

**Scale note.** This is a personal collection in one front and back yard, not an institution. Professional apparatus — BG-BASE style accession qualifiers, taxon label codes, QR — is not warranted and was dropped. The taxa split is kept because it removes real repeated typing, and more so with every offset accessioned: twelve taxon facts entered once instead of once per specimen.

**Actions divide by level too** (2026-08-25). Move to Plant Hospital, health status, location, and delete are **specimen** actions — one individual plant is sick and gets moved. Editing description, care requirements and traits are **taxon** actions. Propagate creates a specimen from a specimen. The PD-7 action card therefore splits across the two detail screens rather than being duplicated.

**Taxon and lineage are independent relationships** (decided 2026-08-25). A taxon owns every specimen of it — purchased and propagated alike. `parent_plant_id` separately records which specimen an offset came off, exactly as a garden tracks provenance. Both hold at once: an offset shares its mother's `taxa_id` **and** points at her.

Consequences:
- The specimen list on taxon detail is a **lineage tree, not a flat list** — purchases at top level, propagations nested under the plant they came from. Same self-referencing pattern as `locations`, so `directChildLocations` / `descendantLocationIds` have direct analogues to copy. It also solves the near-identical-rows problem: five offsets share a name, but "three offsets under the 2024 Home Depot plant" reads instantly.
- **Propagation inherits `taxa_id` from the parent automatically.** An offset is by definition the same taxon. This is the largest single saving from the split — propagate five times and enter zero taxon facts, against twelve fields × five today. See PROP-1.
- `acquisition_source_type = 'propagation'` and a non-null `parent_plant_id` should agree. Worth a soft check rather than letting them contradict.

**Taxon photo gallery = favorited photos across all its specimens** (decided 2026-08-25). Not every photo — that would just repeat each specimen's timeline. Favorites become the curation mechanism, so **GAL-1 gains a second consumer**: `photos.is_favorite` stops being only a Gallery filter and becomes what promotes a specimen photo to represent the taxon.

Sequencing: SPECIES-1 does **not** block on this. Ship taxon detail with the profile photo alone; add the gallery when GAL-1 lands in the Gallery rebuild.

Open before building:
- Interaction with GAL-2: `plant_type` moves to taxa, so Collection Highlights becomes a taxon-level filter.
- Interaction with `mergePlants`: merging two specimens of different taxa needs a rule.

Supersedes the plant-level half of GAL-2. AI-1 and AI-2 should be designed against this model, not the current flat one.


### PROP-1 — Propagate more than one offset at a time
**Status:** ready · **Effort:** low · **Schema:** none · **Touches:** `propagatePlant` modal, `wireModalForms`

`propagatePlant` creates one specimen per run. With every offset accessioned separately (SPECIES-1), taking five offsets off a mother plant means running the form five times and typing the same values five times.

Add a count field: "How many offsets?" → create N specimens in one go, each getting its own accession number from the existing trigger, all sharing `parent_plant_id` and the chosen location.

### SPECIES-2 — Split multi-location plants into one specimen per location
**Status:** needs plan approval · **Effort:** medium–high · **Schema:** yes, retires `plant_locations` for specimens · **Depends on:** SPECIES-1 · **Touches:** `plants`, `plant_locations`, `photos`, `care_notes`, `screenPlantDetail`, `allLocationsForPlant`, `mergePlants`

**"Every plant + location combo is a specimen"** (Amanda, 2026-08-25). A specimen is one physical individual and a physical individual is in exactly one place, so a plant row listing three locations is really up to three plants.

This **reverses the plant↔location many-to-many in §6.** `plant_locations` existed to let one plant be in several places at once — a workaround for having no taxon/specimen distinction. With specimens real, a specimen has exactly one `location_id` and the junction is retired. Photo↔plant and photo↔location many-to-many **stay**: a single photo genuinely can show several plants and several containers.

**The split is not mechanical, and the obvious heuristic is wrong.** Locations recorded for one plant often sit in an **ancestor/descendant chain** — e.g. 0007 lists both "Wall Collection" and "Wall Collection > Bottom Row > Bucket 64". The tempting reading is one specimen recorded at two precisions. **In Amanda's data that reading was wrong twice out of three.** The coarse entry is usually a **real, separate plant whose location does not exist as a row yet** — 0007's is a pot below the container wall, 0027's is the door planter holding the jade.

Migration rules:
- **Every ancestor/descendant pair is reviewed by hand.** Do not auto-collapse. The coarse entry is more often a placeholder for a missing location than a duplicate.
- Locations in **disjoint branches become separate specimens** — this part is safe to automate.
- **Prerequisite:** create the missing locations first (the pots and planters below the container wall), so every specimen can land somewhere specific instead of on a bare ancestor.
- **Photos route by their own `location_id`** — a photo at location L belongs to the specimen at L. This is clean and needs no judgement. Photos with no location stay with the originating specimen and are reassigned manually.
- **Care notes** have no location and stay with the originating specimen.
- The original row **keeps its accession number** (immutable, §5); each newly split-out specimen draws a fresh one from the existing trigger.

Consequences for the UI: Plant Detail's "+ Add another location" / "Remove" block disappears — it was the workaround. `allLocationsForPlant()` becomes a taxon-level query (where can I find any specimen of this taxon) rather than a per-plant one.

**Size the job first:**
```sql
-- Plants carrying more than one location today
select p.id, p.accession_number, p.botanical_name, count(*) + 1 as location_count
from plants p
join plant_locations pl on pl.plant_id = p.id
group by p.id, p.accession_number, p.botanical_name
order by location_count desc;
```


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

**Second consumer: SPECIES-1.** A taxon's photo gallery is the favorited photos across all of its specimens, so `is_favorite` is not just a Gallery filter — it is how a specimen photo gets promoted to represent the taxon. Icon supplied: `heartStar`, already defined in `icon()` since v1.38.0.

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

### v1.40.0

**PHOTO-2 + PHOTO-3 — Attach and detach photos from the specimen side.** Status: done · Schema: none · Touched `screenPlantDetail`, new `attachInboxPhoto` modal, `attachInboxPhotoToPlant()`, `detachPhotoFromPlant()`.

Together these make the photo half of SPECIES-2 a UI job rather than a SQL job, which matters because ambiguous photos have to be *looked at* to be assigned.

- **Detach** on owned timeline photos sets `plant_id = null` without touching the record, so the EXIF date and Drive file survive — deleting and re-uploading loses both. It deliberately does **not** clear `location_id`: per §3 a photo returns to the Inbox only when both are null, so one with a location stays filed there. The toast says which happened rather than claiming "back in the Inbox" when it isn't.
- **+ Add photos** on the timeline header opens every photo with no plant attached, **regardless of location** — filtering by the specimen's location would hide almost everything, since unassigned photos usually have no location either. Newest first, capped at 24 with the total shown.
- The modal **stays open** after attaching; `loadAll()` re-renders it with that photo gone, so several can be added in a row.
- On attach, a photo with no location **inherits the specimen's** — a snapshot, never a live link, since a photo records where it was taken and must not follow the plant when the plant moves. A photo that already has a location keeps it.

### v1.39.0

**PERF-1 — Photo loading flicker.** Status: done · Schema: none · Touched `ensurePhotoLoaded`, new `photoImg()`, `.photo-img` CSS, 13 image call sites.

Every resolved Drive URL called `debouncedRender()`, and `render()` replaces `app.innerHTML` wholesale — so each arriving photo destroyed and recreated **every image on screen**, already-painted ones included, which then re-decoded. That was the flashing.

- New `photoImg()` emits an `<img>` that is in the DOM whether or not its blob has arrived, carrying `data-drive-id`.
- `ensurePhotoLoaded()` now fills `src` on the waiting elements directly. No re-render, so nothing else on screen is disturbed. Matched via `dataset` rather than an attribute selector, so Drive ids never need CSS-selector escaping.
- Falls back to `debouncedRender()` only when nothing was waiting — the blob beat its first render, or the call site still emits its own `<img>` (the lightbox, which keeps its deliberate "Loading…" state).
- Hidden-until-loaded is pure CSS (`.photo-img:not([src])`), so there is no class toggle to go wrong and a failed fetch cannot flash a broken-image icon.
- **Click guards had to change.** Sites gated interaction on the *loaded URL* (`${cachedUrl ? onclick : ""}`). With no re-render on arrival those handlers would never attach, leaving loaded images unclickable. They now test the **photo record**, which is the real distinction — "has a photo" vs "has none" — and thumbnails are clickable immediately.
- Removed 23 lines of dead URL variables and redundant prefetch calls that `photoImg()` now handles.

Also distinguishes two states the old code conflated: **no photo at all** still shows the placeholder icon; **photo still loading** shows an empty ratio box that fades in. The `.card-media` box already reserved the space, so nothing shifts.

### v1.38.2

**BUG-2 — Search inputs lost focus and reset the caret on every keystroke.** Status: done · Schema: none · Touched `render()`, new `captureFocus()` / `restoreFocus()`, ids on 9 search inputs.

Typing in any search box let you enter one character, then dropped focus; re-clicking put the caret wherever you clicked, so subsequent letters landed at the start of the string.

Cause is the same architecture as PERF-1: all 9 live-search inputs call `render()` on every keystroke, and `render()` replaces `app.innerHTML` wholesale — the field being typed into is destroyed and rebuilt each character.

Fix: capture the focused input's id and selection range before the rebuild, restore both after `wireModalForms()`. Search inputs gained stable ids; ids repeat only across mutually exclusive `modalContent()` branches, so no two are ever in the DOM together. `setSelectionRange` is wrapped in try/catch since it throws on input types without text selection — focus is the important half, caret is best-effort.

Does **not** fix PERF-1. The full rebuild still happens; this removes its worst symptom.

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
