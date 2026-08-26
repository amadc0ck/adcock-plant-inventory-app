# Backlog

Source of truth for what is queued, in flight, and done. Update this file as part of shipping any item.

Status values: `ready` · `blocked` · `in-progress` · `done`
Item IDs are permanent. Never renumber.

---

## Observed 2026-08-25 — triaged from Amanda's session notes

### SPECIES-1 — Split taxa from specimens (epic)
**Phase 3 code pass shipped v1.65.0. The column drop is the only step left — see the block in the v1.65.0 entry below.**
**Status:** phases 1–2 **done** (v1.41.0–v1.41.3) · phase 3 pending · **Effort:** high · **Schema:** yes, new table + FK · **Touches:** nearly every screen

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

**Phases 1–2 shipped.** 27 taxa created 1:1, navigation rebuilt, specimens created by hand. **Phase 3 remains:** drop the duplicated species columns from `plants` and retire `plant_locations`. Deliberately left as the undo.

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


### SPECIES-2 — Split multi-location plants into one specimen per location
**Status:** splitting **done by hand** 2026-08-25 · cleanup pending · **Effort:** medium–high · **Schema:** yes, retires `plant_locations` for specimens · **Depends on:** SPECIES-1 · **Touches:** `plants`, `plant_locations`, `photos`, `care_notes`, `screenPlantDetail`, `allLocationsForPlant`, `mergePlants`

**Done manually rather than by migration.** Amanda created every missing specimen through the UI, which avoided the automated-split judgement calls entirely. 0014's redundant `plant_locations` row was deleted by hand 2026-08-26. **All that remains is the phase-3 column drop**, which is now tracked under SPECIES-1 phase 3 rather than here.

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


### PD-4 — Health status needs an urgent tier
**Status:** ready · **Effort:** low · **Schema:** none (text column) · **Touches:** `HEALTH_LABELS`, `plantRow`, `screenReports`

`healthy` / `watch` / `recovery` / `unknown` has no level above `watch`. Add an urgent tier.

`health_status` is free text standardized by the dropdown, so no migration — but **three places branch on the exact values** and must be updated together, or an urgent plant silently reads as healthy:
- `index.html:1301` — `needsAttention` on the plant card badge
- `index.html:1729` — `plantsNeedingAttention` in Reports
- `moveToHospital` sets `watch` — should it set the new tier instead?

Name to confirm: `urgent` / "Urgent care".


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


---


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


### RPT-3 — Check-ins
**Status:** blocked by AI-1 · **Effort:** medium
Plant check-ins support **both** staleness (days since last photo, via `photoDate()`) and a manual flag. Location watch status is a manual flag only.


---

## Gallery rebuild — largest net-new area


### GAL-2 (original scope) — **closed 2026-08-26, not built**
**Status:** done (closed as unnecessary)

Resolved without a junction table. `taxa.plant_type` already **is** plant-level category tagging, so the Gallery filters on it; and v1.62.0 made **favourites** the highlight mechanism, which covers the per-photo half of the intent with one gesture instead of a tagging vocabulary. Building the category junction table would have been a second source of truth for a fact `plant_type` already holds.

---

## Open decisions

**OPEN-1 — Build order.** Amanda sets priority across Plant Detail, Locations, Reports, and Gallery. Current call: **PD-1 first**, then LOC-1. Reversed from the original LOC-1-first call once the card-media image treatment moved to PD-1 — the pattern is designed once there and applied in LOC-1 second. LOC-2 shipped the Locations data defects ahead of both.

**OPEN-2 — In Bloom behavior.** *Closed 2026-08-26: derived from `bloom_events`, shipped in v1.59.0.* Written when the Gallery was expected to be curated. Since then albums, highlights and archives all derive from data, so a hand-curated In Bloom row would be the sole exception, and a stale one — blooming ends, and nothing would prompt anyone to remove it. Derive from `bloom_events` where `end_date` is null. Needs a nod from Amanda, not a decision from scratch.

---

## Deferred / known gaps

- **CSV import.** Export exists (plants CSV, full JSON backup). Import is JSON-only, upsert-based. No CSV import path.
- **Guest / read-only view.** Scoped as a question early on, never built. RLS currently grants full access to any authenticated user, so this is a real design change, not a UI toggle.
- **Bucket-level physical inventory.** All 92 wall buckets exist as location rows. Assigning actual plants to each is ongoing manual work, not automatable.
- **Pl@ntNet per-specimen limitation.** Identifies the whole frame, not individual specimens in a multi-plant container photo. Claude has the same limitation but can at least reason about the dominant subject.

---

## Completed

### v1.73.2

**Two sticky layers were fighting for the same 0px.** Schema: none.

`.sticky-header-group` (brand bar + Inbox sub-bar) has been `position:sticky; top:0` all along. `.sticky-controls`, added in v1.63.0, used `top:0` as well — so scrolling slid the filter row **over** the brand bar instead of under it. It only became obvious once the Inbox got sticky controls too, since the Gallery has no sub-bar to collide with.

The controls now pin to `top: var(--sticky-top)`, measured in `render()` rather than hardcoded — the group's height changes with the Inbox sub-bar, the task banner and the breakpoint, so no constant is correct. `z-index` drops to 19, one below the group, so any overlap resolves the right way round.

Also fixed while in there: the header group had no task-banner offset, so a running import pinned it *underneath* the banner.

### v1.73.1

**The Gallery's bulk actions were unreachable, and the archive shortcuts took three rows.** Schema: none.

- **Select mode in the Gallery rendered its actions inline**, above the results — so the moment you scrolled down to select anything, the buttons scrolled away. The Inbox already had a **fixed bottom bar** for this; the Gallery now uses the same one, with Edit, Attach to plant, Add location, Delete and Cancel. Select all stays inline, where it belongs beside the count it acts on.
- **The bulk modals are shared rather than duplicated.** `activeBulkSelection()` returns whichever selection is live, so the Inbox and the Gallery use one set of modals and one set of handlers instead of a parallel pair.
- **Former-home shortcuts became a dropdown.** Five archives rendered as chips wrapped to three rows on every one of 1,929 cards. They are a closed, rarely-changing set — which is what a select is for — and it now offers all of them rather than the first five. Recents stay one-tap chips, capped at three, on the same row: they are the streak, and not opening anything is the whole point.

### v1.73.0

**LOC-9 and INB-1 — navigating 157 locations, and the Inbox at 1,929 cards.** Schema: none.

**A real location picker.** One flat list of 157 rows indented with em-dashes, 92 of them near-identical buckets, replaced by a shared `locationPicker()` used by Add location, Move, and bulk assign:

- **Recently used first.** Filing runs in streaks — twenty photos off one shelf, then twenty off the next — so the last six places used sit at the top. Kept in `localStorage`, tolerant of a deleted location or unreadable storage.
- **One level at a time**, with a breadcrumb. The top level is 2 rows, not 46; the 42 buckets appear only when asked for. A parent row picks on tap and descends on its chevron, so a location that holds things is still a valid target — plus an explicit *"File into X itself"*.
- **Counts on every row**, because "Bucket 07" identifies nothing on its own.
- **Search flattens across all levels** and shows each hit's path.
- **Archived locations are excluded** — the flag means "no longer somewhere you file things".

**The Inbox card.** Six same-weight buttons wrapping to two rows, on 1,929 cards. The two that actually move a photo out of the Inbox — **Plant** and **Location** — are promoted; Identify, Ask Claude, New and Delete become icons pushed to the right.

**And a jump list under each card**: the locations she filed to most recently, one tap each, plus the archive shortcuts that were already there. Recents come from the same store the picker writes, so using the full picker teaches the jump list what to offer.

**The Inbox controls are sticky**, matching the Gallery.

### v1.72.1

**Leftovers from the v1.56.0 photo-type rename.** Schema: see below — a DB constraint was never updated.

Saving a photo as **Bloom** failed with `photos_photo_type_check`. The app was renamed `flower` → `bloom` and lost `identification` / `historical` in v1.56.0, but the database check constraint still allowed only the old set, so the one type the rename was *for* was the one the database refused. Four versions of bloom tracking shipped against a column that could not store it.

Two dead references removed alongside: the Type field's help text still described the removed `historical` option, and the Gallery lightbox still had a `photo_type === "historical"` branch that could never fire.

```sql
alter table photos drop constraint if exists photos_photo_type_check;
update photos set photo_type = 'bloom'   where photo_type = 'flower';
update photos set photo_type = 'general'
  where photo_type is null or photo_type not in ('general','bloom','detail','condition');
alter table photos add constraint photos_photo_type_check
  check (photo_type in ('general','bloom','detail','condition'));
notify pgrst, 'reload schema';
```

### v1.72.0

**PL-3 and LOCP-4 — picking a specimen, and doing it to many photos at once.** Schema: none.

- **The edit-photo form's Plant field was a `<select>` of all 52 specimens labelled by accession number** — the one picker PL-2 missed, and the one that matters most, since it is where a photo actually gets filed. It is the shared `plantPicker()` now: thumbnail, common name first, search and filters. The choice is **staged**, not saved on tap, because the form has a Save button and this field has to behave like the others in it.
- **It opens pre-filtered to the photo's own container**, which cuts 52 specimens to the two or three actually standing there. Only when that location holds plants — an Area or Archive gets no default.
- **Multi-select on the Location page**, in both the feed and the container layouts: Select all, batch edit, batch delete. The Gallery's select machinery is photo-generic despite the name, so it is reused rather than reimplemented. Select mode resets when you leave, since carrying it across meant arriving somewhere new with a selection you could not see.
- **The batch modal's plant field got the same picker**, staged so that picking does not apply the batch.

Two latent bugs found on the way:

- **`applyGalleryBatch()` built one `id=in.(...)` for the whole selection.** 300 photos is an ~11KB query string — past the request line proxies enforce, so the batch would have been rejected at the edge and looked like a dead button. Same bug as the duplicate delete in v1.63.1; now chunked through the same constant.
- **`bulkDeletePhotos()` cleared only two of the four things that reference a photo.** A location hero or a species cover anywhere in the selection would FK-error, reported as "failed to delete one photo" with no way to tell which. It uses `deletePhotosByIds()` now, which clears all four and chunks.

### v1.71.0

**Create a species and specimen from a Gallery tile.** Schema: none.

Working "Needs a plant" usually ends in *this is a plant I have not recorded yet*, which is a species **and** a specimen. `newPlantFromPhoto` already creates both and attaches the photo — there was just no way into it from the Gallery, so the answer meant a trip through the Plants tab and back. A **+** now sits beside the magnifier on any photo with no plant.

The photo's own location is pre-filled **only when that location actually holds plants** — pre-filling an Area or an Archive would record a specimen living in a former home. The modal still offers the picker either way.

The modal's blurb also said the accession number is generated and everything else is optional, which read as though it created only a specimen. It now says the botanical name creates or finds the species and this plant becomes a specimen of it.

### v1.70.1

**Identify from the Gallery grid.** Schema: none.

Working the "Needs a plant" bucket means looking at a photo and asking what it is, but the tiles only offered Edit — so identifying meant opening each photo first. A magnifier now sits beside the pencil in both the large and compact layouts, on any photo with no plant yet.

**Pl@ntNet only.** Ask Claude is a per-photo cost and belongs where the decision is deliberate, not on every tile in a 317-photo grid. Once Pl@ntNet answers, the button becomes a compare link naming the suggestion rather than offering to run it again; a Claude suggestion does not satisfy it.

### v1.70.0

**Locations list, and a report that contradicted itself.** Schema: none.

- **"Plants missing photos" listed plants that were showing a photo.** The report counted only `photos.plant_id` — the direct attachment — while every thumbnail in the same list came from `plantPhotosOrdered()`, which also counts `photo_plants` tags. So a plant whose only photos were tags appeared with a picture *and* as having none. A tagged photo does show the plant; that is what tagging is for. It reads the shared function now, and the local re-implementation is deleted. Same class as the four inline search-field lists collapsed in v1.65.0: a second definition of the same fact, drifting.
- **The name gets the full card width.** Counts sat in a right-aligned column beside it, so "4026 Sacramento Creation" wrapped to three lines to make room for "0 plants · 3 photos". Counts moved to their own line underneath.
- **Edit and Add photo are icon-only** — Add photo uses Tabler's `photo-plus`, supplied by Amanda.
- **Archives are separated from active locations.** Five former homes sat between the Front Yard and the Backyard, and their permanent "0 plants" read as a gap rather than a fact. They now sit under a **From the Archives** heading with a line explaining their photos still tag to specimens. Both `gallery_row = 'archives'` and the `archived` flag qualify.

### v1.69.0

**LOC-8 — the Location page reads as a place, not a form.** Schema: none.

- **The feed goes multi-column** — 2 up at 700px, 3 at 1100px. CSS columns rather than grid, because photos render at their own aspect ratio and a grid would make every cell as tall as the tallest in its row.
- **Child location cards carry a picture.** 42 buckets share a naming scheme and nothing else, so a name alone does not identify one. `locationCoverPhoto()` already borrowed from a descendant when a location had no photo of its own — the cards just never used it, which is the same gap LOC-5 closed on the Locations list.
- **The header was type, name, and then the path — which for a top-level location is the name again** — plus two links, leaving two-thirds of the panel empty. It now carries **plants / photos / what's inside** as roll-up counts across the whole subtree, the archive's period and locality where set, and a line saying plants live in the containers inside when they are not assigned directly. The redundant path only appears when there actually is a parent.

### v1.68.0

**LOCP-3 — Areas and Archives get a feed, not a filing queue.** Schema: none.

- **A location that does not hold plants renders its photos as a single-column feed**: the whole frame uncropped, actions as icons, caption underneath, date last. On an Area or an Archive the photos *are* the content; the card layout treated them as records waiting to be processed.
- **Identify and Ask Claude are gone from that view.** Both exist to name a plant, and there is no plant here to name — offering them was asking a question with no answer.
- **So is "Other containers."** Cross-tagging a whole-area view into individual buckets is noise, which is what LOCP-1 concluded when it left `photo_locations` unused for exactly this case. It stays where containers are the subject: a photo of Bucket 22 genuinely can show Bucket 23.
- **Edit and Delete are icon-only** in both views.
- The feed keeps Tag a plant, Edit, Move, Set as cover and Delete — the Santa Rita workflow still runs from here.

### v1.67.0

**LOCP-1/LOCP-2 — the Location page's photo actions.** Schema: none.

- **Six same-weight buttons became one primary and a ghost row**, matching the specimen timeline so a photo offers the same vocabulary wherever it is seen.
- **"Add to plant here" and "Attach to any plant" were the same verb at two scopes** — that is a filter, not two buttons. One **Attach to a plant** now opens the PL-2 picker pre-narrowed to this location, which she can widen. The `attachToLocalPlant` modal is deleted.
- **Move** — change which location a photo is filed under, from the Location page. Previously the only options were unfile or navigate elsewhere. It reuses the `attachLocation` modal, whose copy now adapts: "Add location" with no location, "Move this photo" with one, naming where it currently sits.
- **Edit**, **Set as cover** and **Delete** added — a photo should be fully actionable wherever it appears.
- **"Tag other containers" → "Other containers"**, and **"Unattach from here" → "Unfile"**.
- **"New plant from this photo" only appears where plants are expected** (v1.66.0's predicate). A specimen lives in one place; offering to create one at an archive would record a plant living in a former home.

### v1.66.0

**A photo with no plant is a gap only where plants are expected.** Schema: none.

- **LOC-7.** Three screens flagged archive and whole-area photos as unfiled: the Location page banner, the Reports "Needs a plant" bucket, and "Locations with photos but no plants". None of them were wrong about the data — an Area is a view of the wall and an Archive is a former home, so neither names a plant, and neither should. At archive scale that noise would have buried the real gaps.
- **`photoAwaitsPlant()`** now gates all three on `locationHoldsPlants()`, so the "Plants are assigned directly to this location" checkbox governs whether the absence counts against you. It respects the explicit override in both directions: an area opted in is a gap, a container opted out is not.
- **New bucket: "Could show a specimen."** Archive and area photos not yet tagged to a plant. Deliberately excluded from the "Photos not fully filed" headline count and rendered without the alert colour — these are an opportunity, not a debt. This is the working queue for the Santa Rita case: a specimen photographed across four former homes.
- **The Location page keeps the bulk action either way**, since tagging an archive shot to a specimen is exactly the point. Only the framing changes — "Assign" against an orange border becomes "Tag a plant" against a plain one.
- Gallery and Reports read the same predicate, so the counts still add up and each bucket can be worked through without re-covering another.

### v1.65.0

**NAME-1 and SPECIES-1 phase 3, together.** Schema: none yet — the column drop is below, deliberately unrun.

- **Composed names, free text as fallback.** `taxonDisplayName()` builds from `genus` / `species_epithet` / `cultivar`, reversing v1.41.0's precedence now that all 33 taxa are filled. Two shapes it must not get wrong: **the hybrid sign lives only in the free text**, so `Parodia × erubescens` would have composed as "Parodia erubescens" without reading `is_hybrid`; and **a cultivar of hybrid origin has no epithet at all**, so `Echeveria 'Purple Perle'` composes from genus + cultivar rather than falling back.
- **Per-part italics.** New `taxonDisplayHtml()` / `plantDisplayHtml()` emit `<i>Genus</i> <i>epithet</i> 'Cultivar'` — genus and epithet italic, hybrid sign and cultivar upright, which is correct botanically and impossible with one free-text string. The plain functions stay for `<option>` labels, `title` attributes and CSV, where markup cannot go.
- **`plantDisplayName()` reads through the taxon.** This was the keystone: it read `pl.botanical_name`, and every other specimen-level species read hung off it. A specimen has no name of its own.
- **The copy-down writes are gone.** Creating a specimen from a taxon, from a location, editing one, and propagating one all used to copy the species columns down onto `plants`. Propagation no longer asks for a name at all — an offset is the same kind as its mother by definition, and asking twice only created a chance to disagree.
- **The New Plant form's species fields create the taxon** instead of writing to the specimen, and `ensureTaxonForName()` now carries the structured parts. A **common name with no botanical name** creates a `working_label` taxon rather than returning null, which used to strand the specimen.
- **`editPlant` lost its six species inputs.** Editing a name there wrote to specimen columns that shadowed the real record and drifted from it. The Species select below already does the linking; the "+ create from the botanical name above" option went with the field it referenced.
- **One `plantSearchText()`** replaces four inline field lists that had each drifted, and duplicate detection keys on `taxa_id` rather than a name string.
- **CSV export resolves species columns from the taxon.** Headers unchanged so an existing spreadsheet still lines up.

**The drop — run only after the app has been used and looks right.** It is irreversible and there is no migration tool; take a JSON backup from Settings first.

```sql
alter table plants
  drop column if exists botanical_name,
  drop column if exists common_name,
  drop column if exists cultivar,
  drop column if exists family,
  drop column if exists genus,
  drop column if exists species,
  drop column if exists plant_type,
  drop column if exists growth_habit,
  drop column if exists mature_size,
  drop column if exists bloom_season,
  drop column if exists origin,
  drop column if exists native_range,
  drop column if exists hardy_to,
  drop column if exists light_conditions,
  drop column if exists water_needs,
  drop column if exists description;
notify pgrst, 'reload schema';
```

Closes **SPECIES-2**, whose only outstanding step was this drop.

### v1.64.0

**The focal picker was itself cropped, and the section cards sat over holes.** Schema: none.

- **You were picking a point on a crop.** The picker was a `.card-media.ratio-4x3`, so a portrait photo was already cut down before you touched it — you could not see what was being excluded, and the percentage was measured against the **cropped box** rather than the photo, so the number was wrong as well as blind. The stage now shows the whole frame at its own aspect ratio and the click is measured against the image element.
- **Live crop previews.** Square and 4:3 tiles under the stage update as you move the point, so you see what the crop will do before leaving the modal. Only those two, because they are the only ratios the app crops to — a 16:9 preview would show a shape that never appears.
- **`.section-grid` packs instead of aligning.** Six cards of very different heights in a 3-column grid made every cell as tall as the tallest, so Collection and Provenance sat over several hundred pixels of nothing. CSS columns pack them vertically. Reading order becomes down-then-across, which is fine for independent reference cards.
- **Every empty state was drawing a 200px icon.** `icon()` emits a bare `viewBox` with no width or height, so inside a block container the SVG stretched to full width. `.empty svg` is now 32px — this was app-wide, not just Care notes.

### v1.63.1

**Bulk duplicate delete failed silently at 694 photos.** Schema: none.

- **The delete never reached the database.** `deletePhotosByIds()` put every id into one `id=in.(...)` filter. A uuid is 36 characters, so 694 of them is a **~26KB query string** — past the 8KB request line every proxy in front of PostgREST enforces, so it was rejected at the edge. Now chunked at 100 ids, six requests per chunk.
- **The button also read as dead when nothing was selected**, because it was `disabled` — a disabled button gives no feedback at all, and the "Nothing selected" toast behind it was unreachable. Enabled now, so it says what to do.
- **No progress during a long run.** The `google_photos_id` carry-over is one request per survivor and can't be batched — each carries a different value — so hundreds of duplicates is minutes of apparent nothing. Both phases now drive the task banner, patched in place rather than re-rendered.

### v1.63.0

**PHOTO-1, PL-2 and a sticky Gallery header.** Schema: `photos.focal_x` / `focal_y`.

- **PHOTO-1 — per-photo focal point.** `.card-media img` was hardcoded `object-position:top`, which is right for an upright specimen and wrong for a wide planting. `photoImg()` now takes the photo *row* rather than a bare `drive_file_id` and emits `object-position:{x}% {y}%` when one is set; 30 call sites converted, and the two that only had an id were the ones silently losing the crop. Setting it is a click on a crosshair area in the **edit photo** modal, so it works from anywhere a photo can be opened.
- **PL-2 — plant pickers lead with a photo and a common name.** The `<select><option>` pickers became a shared `plantPicker()`: thumbnail, common name first with the botanical name demoted to a subtitle, accession number in small mono. Filters by search, species and location, and the filter state resets on every `openModal()` so a picker never opens pre-narrowed from last time.
- **Gallery controls stick to the top while scrolling.** At 2590 photos, reaching the bottom of a filtered set and wanting to change the filter meant scrolling all the way back up. The top bar still scrolls away — only the search, filter row and result count pin.

```sql
alter table photos add column if not exists focal_x smallint;
alter table photos add column if not exists focal_y smallint;
alter table photos add constraint photos_focal_x_range check (focal_x is null or focal_x between 0 and 100) not valid;
alter table photos add constraint photos_focal_y_range check (focal_y is null or focal_y between 0 and 100) not valid;
notify pgrst, 'reload schema';
```

Null means "unset" and keeps the existing `object-position:top` default, so nothing changes until a photo is deliberately focused.

### v1.62.0

**Eight polish items in one pass.** Schema: `photos.is_favorite`.

- **GAL-1 + GAL-2 — favourites are the highlight mechanism**, one idea rather than two overlapping ones. Hearting a photo puts it in the Gallery's Favourites row **and** promotes it to represent its taxon, so the gesture does real work. Amanda's call, and it closes GAL-2 without building per-photo category tags.
- **PD-6 — the New Plant form keeps its seven fields**, with everything else behind **More details**. It previously collected seven against the edit form's twenty, so anything more meant creating a plant and immediately reopening it — but Inbox capture has to stay fast, so the extras expand rather than crowd. The handler reads them defensively, so a collapsed form submits exactly as before.
- **PL-1 — closed as obsolete.** Badge placement on the flat plant list stopped mattering when the Plants tab became taxa; Amanda prefers the specimen cards on the species page as they are.
- **EXIF-1** — `DateTime` (`0x0132`) lives in IFD0 by spec, and the parser only ever looked inside the ExifIFD, making that branch unreachable. Scans and edited images now get a date instead of falling back to upload time.
- **LOC-5** — an area with no photo of its own borrows from a descendant. `locationCoverPhoto()` already walked the tree; the card just never used it, so most areas showed an empty placeholder while their buckets were full of pictures.
- **LOCP-3** — create a specimen from the Location page, with the location filled in. The other direction meant opening a species record and hunting for the location among 149.
- **PROP-1** — "How many offsets?" creates N specimens in one insert, each numbered by the accession trigger, all sharing the parent and location.
- **LOC-4** — remove a location, split into **Archive** (a container that no longer exists; hidden from pickers, history kept) and **Delete** (a row that should never have existed). Delete refuses while child locations remain, and the confirm names exactly what it will destroy — including how many move records — because that visibility is what made the call obvious when it was last done by hand.
- **LOC-3** — the last undimmed zero count.

```sql
alter table photos add column if not exists is_favorite boolean not null default false;
create index if not exists photos_favorite_idx on photos (is_favorite) where is_favorite;
```

### v1.61.0

**LOCP-4 and TAXP-1 — closing the filing loop.** Schema: none.

- **A location surfaces its own unfiled photos.** Open one holding photos with no plant and it says so, with **Assign**: multi-select the photos, then pick from the specimens that live there. This is the common case, not an edge one — **526** photos are filed to a container but not to the plant in it, because that is how photographing a bucket works. Answering it while standing in the location, looking at what lives there, is the whole point.
- Assigning sets `plant_id` **only**. The photos already carry the right location — that is how they were found — so nothing else changes.
- **The species page shows every photo across its specimens**, newest first, each labelled with its specimen and location, with **Move** and **Edit** inline. Previously it showed a cover and nothing else, so the one place you would naturally compare your plants of a kind, or spot a photo filed against the wrong specimen, showed nothing.
- A photo tagged onto two specimens of the same taxon appears **once**, not twice.

### v1.60.0

**Timeline as a journey; edit a photo from anywhere.** Schema: none.

- **The specimen timeline is chronological, split where the location changes.** Per-location columns made sense when one plant record stood for several physical plants; since SPECIES-2 a specimen lives in one place at a time, and what actually varies is *when it moved*. Amanda's Santa Rita has photos across four former homes — read in order, that is the plant's life story, which columns hid.
- Each run is headed with the location and its date span. A plant that moved away and came back shows **two separate stays**, not one merged block.
- A **Newest / Oldest first** toggle: newest for a plant you are tending, oldest for the story.
- **Editing a photo is now reachable from six places** — Inbox compact rows, the specimen timeline, both Gallery views, and the lightbox. It previously existed only in the Gallery, which is why it felt like the app had no photo editing at all.

### v1.59.0

**BLOOM-1, RPT-4 and GAL-5 — bloom tracking end to end.** Schema: yes, new `bloom_events` table.

All three shipped together because none of them ever needed AI-1; that dependency was mislabelled, as established earlier today.

- **A bloom is an event, not a flag** — start date, optional end date, `ended_on` null meaning blooming now. A plant flowers repeatedly and the history is the point.
- **Specimen page** gets a bloom card: mark in bloom, mark finished, and the full history. Backdating is expected, since noticing late is normal.
- **`location_id` is snapshotted** at the start, like photo locations: a bloom happened somewhere and that stays true after the plant moves.
- **Reports → Bloom**: *In bloom now*, and *Should be blooming* — specimens whose species flowers around now with nothing recorded. That second list is Amanda's "prompt me to go and look" idea, and it needs **no AI at all**: it compares `taxa.bloom_season` against the month. `monocarpic` and `not_observed` are excluded, since one blooms once and dies and the other means nobody knows yet.
- **Gallery gets its In Bloom row**, derived from active events — OPEN-2's answer. Prefers photos typed `bloom`, falling back to the specimen's cover so a blooming plant is never absent from the row.
- Loading is resilient: the app works before the migration runs, it just shows no bloom history.

```sql
create table if not exists bloom_events (
  id          uuid primary key default gen_random_uuid(),
  plant_id    uuid not null references plants(id) on delete cascade,
  location_id uuid references locations(id),
  started_on  date not null,
  ended_on    date,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists bloom_events_plant_idx on bloom_events (plant_id);
create index if not exists bloom_events_active_idx on bloom_events (plant_id) where ended_on is null;

alter table bloom_events enable row level security;
drop policy if exists "bloom_events_all_authenticated" on bloom_events;
create policy "bloom_events_all_authenticated"
  on bloom_events for all to authenticated using (true) with check (true);
```

### v1.58.0

**A 1950-photo import could never have finished.** Schema: none.

The first large run reported *299 imported, 286 failed*, having attempted only 635 of 1950. The arithmetic explains it: ~4 seconds per photo, sequential, against `baseUrl`s that die **60 minutes** after picking. 1950 × 4s is over two hours. It hit the wall and stopped on expired links. Any selection over roughly 800 was impossible.

- **Three concurrent workers**, ~3× throughput, which brings 1950 inside the window. Strictly sequential was an overcorrection against rate limiting.
- **Rate-limit backoff**: a 429 doubles a shared delay up to 30s rather than each worker racing on independently.
- **Failures are tallied by cause** — timed out, links expired, rate limited, database not migrated — instead of a bare count. "286 failed" told neither of us anything.
- The done screen reports **what was never attempted** and why the run stopped.
- **Dedupe ids now transfer to the surviving duplicate.** The newly-imported copy carries `google_photos_id`; the copy worth keeping is usually the older, already-filed one, which has none. Deleting the new one destroyed the only record that the item had ever been imported, so the next pick would re-import it forever. Amanda hit exactly this: 279 duplicates deleted, taking their ids with them.

### v1.57.0

**The Inbox becomes a triage tool.** Schema: none.

With ~1950 archive photos arriving at once, spanning 2016 to today, a fixed 20-at-a-time stack in upload order was unusable.

- **Sort by capture date**, newest or oldest. Deliberately not upload date: a bulk import shares one upload timestamp, so upload order carries no information, while capture date is exactly what groups an archive era together.
- **Filter by year**, offering only years actually present in the Inbox — which makes "show me 2018, file it all to Vallejo Apartment" a two-step job.
- **Search notes.**
- **Page size** of 20 / 50 / 100 / 250, and a **full-card / compact-row toggle**. Both persist across reloads; junk values in storage are ignored.
- Compact rows fit roughly five times more per screen, which is what makes a four-figure Inbox workable. Now viable because v1.55.0 stopped the full-render flashing.

Caught in test: the sort direction was inverted, so "newest first" returned oldest first.

### v1.55.0

**Tell a stalled import from a slow one — and stop the screen flashing.** Schema: none.

Amanda asked how to tell whether an import was still running. There was no way, and worse, two real defects behind the question.

- **No timeout on an import request.** A single hung one blocked the whole sequential queue indefinitely, with the count frozen and no recovery. Now aborts after 120s, counts as failed, and moves on.
- **Progress called `render()` per photo** — 2000 full rebuilds over a large import, each destroying every image and toggling the banner's body padding. That was the flashing, and it was **the PERF-1 mistake reintroduced by adding progress feedback**. Progress now patches the banner and the counter in place; a full render happens only when the banner appears or disappears.
- **A stalled import produced no events**, so nothing re-rendered and the banner sat on a stale count looking healthy. A 10-second heartbeat keeps elapsed time honest.
- The banner distinguishes the two: after 150s with no progress — comfortably past the 120s ceiling, so a slow run is never mislabelled — it turns terracotta, stops the spinner, says **"Import may have stalled"** with how long, and names the last error.
- The dialog shows elapsed time, an estimate of time remaining, and when the last photo landed.

### v1.54.0

**Google Photos import skips what it already has.** Schema: yes, `photos.google_photos_id` + partial unique index.

Nothing prevented re-importing; duplicates were only detectable afterwards. At 2000-photo selections, overlapping picks are easy and expensive — each duplicate costs a Photos download and a Drive upload before anyone notices.

- The Picker media item id is **stable across sessions**, so recording it identifies an item exactly rather than heuristically.
- Already-imported items are dropped **before downloading**, and reported: *"1000 selected, 400 new, 600 already imported."* Re-picking an identical set does nothing at all rather than silently doubling it.
- A partial unique index backstops the client-side check. A `23505` violation returns `duplicate: true` rather than an error — it is nothing to do, not a failure.
- **Only covers imports from v1.54.0 onward.** Earlier ones have no id recorded and cannot be matched this way; the capture-time duplicate report still covers those.

```sql
alter table photos add column if not exists google_photos_id text;
create unique index if not exists photos_google_photos_id_key
  on photos (google_photos_id) where google_photos_id is not null;
```

### v1.53.2

**Google Photos import now says what it skipped.** Schema: none · `photos-picker` redeployed.

Selecting 2000 photos imported 1957 with no explanation. Two causes, both silent:

- **Videos were filtered out without a word.** The app stores and renders stills only, so skipping them is right — saying nothing about it is not.
- **Items with no `baseUrl`** were passed through and failed one at a time during import, rather than being reported up front.

Both are now counted and returned with the original selection size, so the import screen reads *"2000 selected, 1957 importable — 43 videos skipped."* Picking only videos now explains itself rather than reporting "nothing was selected".

### v1.53.1

**The "photos not fully filed" buckets overlapped.** Schema: none.

"No plant" and "no location" each swallowed everything in "neither", so the same 793 photos were counted in all three. The numbers could not be added up, and working through one bucket meant re-covering photos already handled in another.

Each bucket now describes what is missing **given what is already there**, so they are mutually exclusive and sum to the real total:

| | Was | Now |
| --- | --- | --- |
| Needs a plant — filed to a location, not a specimen | 1319 | **526** |
| Needs a location — attached to a plant, nowhere on the map | 837 | **44** |
| Needs both | 793 | **793** |
| | — | **1363 unfiled** |

The section header now carries that total, so the three visibly add up.

### v1.53.0

**Three scale limits, one of them already losing data.** Schema: none.

Found by asking what breaks past 1000 photos, before the archive import rather than after.

- **PostgREST was silently truncating at 1000 rows.** Confirmed live: 1424 in the table, 1000 in the app — **424 photos invisible everywhere**, and every backup taken before this was truncated the same way, so a restore would have lost them. `restGetAll()` now pages every bulk fetch, in `loadAll` and in the backup export. It appends `id.asc` to the caller's order, since offset paging over a non-unique sort can skip or repeat rows on page boundaries.
- **Blob URLs were never released** except on logout, so a session accumulated every photo it had displayed — at a few MB each, enough to get a phone tab killed. Now capped at 180 most-recent, the rest revoked.
- **Every rendered image fetched immediately**, on screen or not. A Gallery filter matching 1000 photos fired 1000 Edge Function requests at once. Images now load via `IntersectionObserver` as they near the viewport, with `photoImgEager()` for the few that must not wait — detail heroes and the lightbox.

### v1.52.2

**Scroll position survives a re-render.** Schema: none · Touched `render()`.

Selecting one duplicate jumped back to the top of the list, so working through a long set meant re-scrolling after every tap. Same root cause as the search-focus bug in v1.38.2 — `render()` rebuilds `#app.innerHTML`, and scroll dies with the DOM. Focus was fixed then; scroll was not.

Restoring it unconditionally would be wrong, since navigating to a new screen **should** start at the top. So scroll is only restored when the render is the **same view** as the last one — keyed on tab, record id, `reportView` and modal type. Anything else counts as navigation.

Covers page scroll and modal scroll, so it fixes every selection surface at once: duplicates, Gallery multi-select, Inbox bulk select.

### v1.52.1

**The Google Photos tab closes itself after picking.** Schema: none.

Pressing Done in the picker left Amanda sitting in Google Photos with nothing to indicate the import had started. On a laptop the other tab is at least visible; **on a phone tabs are hidden, so it reads as though nothing happened** and she had to work out that the app was still open elsewhere.

- The app opened that tab, so it is allowed to close it. The handle is kept outside `state` — it is a live window reference, not data, and must never be serialised or rendered — and the tab is closed the moment `mediaItemsSet` comes back, which drops the browser back to the app.
- Closing is best-effort. If a browser refuses, she gets an explicit "switch back to this tab" toast rather than silence, and the import runs regardless.
- Cancelling closes it too, so backing out never leaves a stray tab.
- A blocked popup — `window.open` returning null — no longer matters: the flow still completes.
- Both modal descriptions now say what will actually happen, rather than "come back here".

### v1.52.0

**Batch-delete duplicate photos, and a latent delete bug.** Schema: none.

- **Multi-select in the duplicates report**, with **Select all extras** preselecting every copy except the best-filed one in each group — attached to a plant, then a location, then carrying notes, ties breaking to the earliest upload. That copy is badged "Best". Individual toggles still work, including deselecting the best one if the auto-pick is wrong.
- **Delete runs as one request per reference table**, not per photo, so clearing dozens of duplicates is a handful of requests rather than hundreds.
- **Fixed a latent bug found while doing it.** `deletePhoto()` cleared only `plants.primary_photo_id` and `photo_plants`. It never cleared `locations.primary_photo_id`, `photo_locations`, or `taxa.primary_photo_id` — the last added with the species split and never wired in. Deleting a location's hero or a species' cover photo would have failed on a foreign key. Both single and batch delete now share `deletePhotosByIds()`. Recorded in `REFERENCE.md` §6.

### v1.51.0

**Google Photos imports survive a refresh.** Schema: none · Touched the import loop, `boot()`, `taskBanner()`.

The queue lived only in browser memory, so a hard refresh or a closed tab lost every photo not yet imported — and re-picking would import second copies of the ones that had already succeeded.

- Progress and the remaining queue persist to `localStorage` after each photo. On next load the banner offers **"Resume importing N more"** with how much time is left.
- **Expired saves are not offered.** `baseUrl`s die 60 minutes after picking, so anything older than 55 minutes is discarded rather than dangled as an option that cannot work.
- **Deliberate stops clear the save**, so only genuine interruptions offer a resume: pressing Stop, or links expiring mid-run, both clean up after themselves. A refresh kills the loop before its cleanup ever runs, which is precisely what leaves the save behind.
- Storage failures degrade quietly — private mode or a full quota costs the resume, not the import.

Two limits, both stated in the UI: resume only works inside the 60-minute window, and a photo that was mid-request when the page went away may land twice. The duplicate-photo report catches the latter.

### v1.50.0

**Import progress, duplicate photo detection, gallery batch editing.** Schema: none.

- **Long-running work now has a persistent banner.** Tapping the modal backdrop calls `closeModal()`, which cleared the dialog but left the import running with **nothing on screen to say so** — easy to trigger while switching to the Google Photos tab. The banner sits above everything, survives modal dismissal, shows live counts, and reopens the dialog when tapped. Covers the EXIF backfill too.
- **Duplicate photo report.** Groups photos sharing an exact capture second. That is the only signal available — no file hash or size is stored, and `drive_file_id` is unique per upload, so re-uploading the same image looks entirely new. The case it catches in practice is importing from Google Photos something already uploaded from the phone: both carry the same capture time. Photos with no `taken_at` are never grouped, since upload timestamps collide constantly and mean nothing.
- **Gallery multi-select and batch edit.** Select within any filtered view, then set location, plant or type across all of them in **one** request. A blank field means *leave alone*, never *clear* — clearing forty photos' locations because a dropdown defaulted to empty would be unrecoverable in bulk — with explicit "Remove location" and "Detach from plant" options for when clearing is the intent.

### v1.49.0

**Five fixes from Amanda's first pass through the new screens.** Schema: none.

- **"Add photos" no longer stops at 24.** The cap was a hedge against dozens of simultaneous Drive fetches; it now pages 48 at a time and resets per open, so the rest of the Inbox is reachable without loading it all at once.
- **Back to Reports from a drill-in.** Opening a record from a report navigated away with no route back — the tab reset to the top. `state.backTo` remembers the exact list; the detail screen's own back button honours it, and pressing a nav tab abandons the trail.
- **Gallery view toggle** — large cards or compact rows with thumbnails. Roughly five times more photos on screen, which matters once a filter returns hundreds.
- **Photos are editable at all now (LOCP-partial).** `photo_type` was effectively write-once: set at upload, and marking one historical also removes it from the Inbox, so a mistake was permanent and invisible. The new `editPhoto` modal covers type, location, plant and notes, reachable from either Gallery view.
- **Add photos from a Location page (LOCP-2).** Straight to that location — including Google Photos import, which files everything picked to it.

### v1.48.0

**PHOTOS-1 — Import from Google Photos.** Schema: none · New `photos-picker` Edge Function, scope added to `drive-oauth-start`, picker modal and flow in the app.

Amanda's whole photo archive lives in Google Photos, so GAL-4's Archives were unreachable without this.

- Bulk library access was removed 2025-03-31 — apps reach only media they created. The **Picker API** is the replacement: she selects in Google Photos' own UI and the app gets exactly those items. Same restriction that shaped Drive (§8).
- One function, three actions: `create` (session + pickerUri), `poll` (until `mediaItemsSet`, then page through), `import` (download → Drive → `photos` row).
- **Imports a scaled JPEG (`=w2560-h2560`), not `=d`.** The original of an iPhone library is HEIC, which browsers and the rest of this app cannot display. The rendition drops EXIF, which does not matter — **capture time comes from the API's `createTime`**, so this path is immune to the whole EXIF problem class fixed in v1.45.2.
- **No external JS library**, unlike the Drive picker widget — REST plus a URL to open, so constraint #1 holds.
- `baseUrl`s expire after **60 minutes**; that is surfaced as "reselect the photos" and stops the run rather than failing every remaining item.
- A 403 on create means the token predates the scope, returned as `needsReconnect` so the app says "Settings → Reconnect" instead of showing a raw error.
- Polling gives up after 15 minutes rather than spinning forever.

**Prerequisites Amanda completed:** enabled the Photos Picker API in Cloud Console and declared the scope on the consent screen. One reconnect still needed, since scopes are per-authorization.

### v1.47.0

**Reports rebuilt as a drill-in list (RPT-1, RPT-2).** Schema: none · Touched `screenReports`, `filteredGalleryPhotos`, `state`, new `duplicatePlants` modal, new Reports CSS.

Built from Amanda's mockup, and prompted by a real hole: **photos marked historical had become invisible.** Being marked historical removes a photo from the Inbox, but those photos had no plant and no location either — so they appeared in no screen at all.

- **Stat tiles** — plants, locations, photos, inbox — with icons, on one cream card.
- **Records needing attention**, seven categories as one-line rows with counts and chevrons, each drilling into its own list. Previously every list rendered expanded inline, so the screen was a wall of cards and the counts, which are the actual signal, were buried in it.
- **Photos not fully filed** — no plant / no location / neither — routing into the Gallery, which already has the grid and lightbox. This is what makes archive-marked photos reachable.
- New category surfaced by the taxa split: **specimens with no species**.
- Possible duplicates moved into a modal rather than occupying the screen permanently.
- Leaving the tab resets the drill-in, so Reports never reopens mid-list.

### v1.46.0

**EXIF capture dates were never being stored.** Edge Function fix + backfill.

556 photos, **zero** with a capture date. The browser had always extracted `DateTimeOriginal` and appended `taken_at` to the upload form; `upload-photo` read only `photo`, `plant_id`, `location_id` and `notes` and never inserted it. **The bug was entirely server-side** — the client parser was verified correct first, against synthetic JPEGs covering little-endian, big-endian, no-EXIF, PNG and HEIC.

- `upload-photo` now reads and stores `taken_at`. Deployed as version 11. Confirmed working: a photo uploaded after the fix carries a capture date three days before its upload.
- **Settings → Photo capture dates** backfills the rest. Their EXIF was never lost — it is still inside the JPEGs on Drive — so it re-downloads each and parses it the same way the browser does. Idempotent (only null `taken_at`), cancellable, four at a time since each is a Drive fetch through an Edge Function. A fetch failure or a non-JPEG is counted and skipped rather than aborting the run.
- The Edge Functions directory is now **under version control**, which CLAUDE.md and REFERENCE.md both required before any Edge Function work. `secrets/`, `response*.json` and `supabase/.temp/` excluded — the last caught during review, since `pooler-url` is a Postgres connection string.

Matters for the Gallery: **Recently Photographed** filters on `photoDate()` with a 30-day window, so until the backfill runs it is really "recently uploaded" for every pre-existing photo.

Filed **EXIF-1** for a real parser limitation found while testing.

### v1.45.1

**ADM-2 — Backup was missing three tables, not one.** Schema: none · Touched `exportFullBackup`, `handleImportBackup`.

ADM-2 was filed for `plant_location_history` alone. Auditing the export against what `loadAll` fetches turned up two more, both added since the backup was last touched:

- **`plant_location_history`** — the trigger-populated audit trail. A restore silently lost every plant move ever recorded.
- **`taxa`** — added v1.41.0. **A restore would have lost every species record**, orphaning all 49 specimens. The worst of the three by far.
- **`list_options`** — added v1.44.0. Fetched defensively, since it may not exist yet.

Restore ordering matters and is now explicit: **taxa before plants** (`plants.taxa_id` is a hard FK), and `taxa.primary_photo_id` gets the same two-pass treatment plants already had, since it points at a photo that does not exist yet on the first pass. History goes after plants and locations.

All 12 data tables are now covered in both directions, verified by diffing the export against every table `loadAll` reads.

### v1.45.0

**The Gallery rebuild — GAL-3, GAL-4 and the plant-level half of GAL-2.** Schema: none · Touched `screenGallery`, `filteredGalleryPhotos`, `state.galleryFilters`, new gallery CSS and six data helpers.

Built from Amanda's mockup. **Every row is a query over data that already exists** — no curation tables anywhere, which is what LOC-6 made possible.

- **Garden Albums** = locations with `gallery_row = 'albums'`, showing everything in their subtree. Front Yard includes photos from Bucket 39 four levels down. Deduped, so a photo tagged onto a parent and a child counts once.
- **From the Archives** = locations with `gallery_row = 'archives'`, captioned from `active_from` / `active_to` / `locality` — "2018–2020 · SF, CA". A single-year span collapses to one year; missing dates fall back to locality alone.
- **Collection Highlights** derive from `taxa.plant_type`, so the grouping follows the taxa split instead of duplicating it. Untyped taxa and unattached photos are simply absent rather than forming a junk group.
- **Recently Added** sorts by upload; **Recently Photographed** uses `photoDate()` and a real 30-day window, so EXIF capture dates win over upload dates.
- Tapping any album or highlight collapses the screen to that filtered set; search and filters do the same. One Clear returns to browsing.

**In Bloom is the only row not built** — it needs BLOOM-1, which needs AI-1.

### v1.44.0

**ADM-1 — Editable dropdown lists in Settings.** Schema: yes, new `list_options` table · Touched `state`, `loadAll`, `screenSettings`, new `editList` modal and four mutations.

Prompted by hitting the too-short-list problem three times in one day — five untypeable plants, then Dracaena and Haworthiopsis.

- **Settings → Dropdown lists** manages plant type, growth habit, bloom season, water needs and light needs. Each shows its option count and how many species use each value.
- **Values are immutable once created; only labels, order and availability change.** A value is stored on every record using it, so renaming one would orphan them all. Labels are free to change.
- **Retiring hides an option from dropdowns without touching records that use it** — and a record's current value stays selectable so saving cannot silently change it.
- **Loading is resilient.** If `list_options` does not exist the app falls back to the built-in vocabularies instead of failing to load. Shipping code ahead of its SQL broke the app twice today; this one degrades instead.
- **The first edit to a list copies the whole built-in list into the database**, so editing one option cannot silently discard the other seven.
- Adding a value that matches a retired one **restores it** rather than creating an indistinguishable duplicate.

**Deliberately not editable:** `status`, `health_status`, `identification_status`, `collection_category`, `origin`, and location `type`. Code branches on their exact values — `needsAttention`, the Plants filter bar, `locationHoldsPlants` — so a renamed or removed value would break logic, not just a label.

```sql
create table if not exists list_options (
  id         uuid primary key default gen_random_uuid(),
  list_name  text not null,
  value      text not null,
  label      text not null,
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (list_name, value)
);
alter table list_options enable row level security;
drop policy if exists "list_options_all_authenticated" on list_options;
create policy "list_options_all_authenticated"
  on list_options for all to authenticated using (true) with check (true);
```

### v1.43.1

**Finish LOC-6's controls.** v1.43.0 put `holds_plants` and `gallery_row` on the **edit** location modal but not on **create**, so a new archive location had to be made and then immediately reopened to be flagged. The archive detail fields — `locality`, `active_from`, `active_to` — and `archived` had columns but no UI at all.

Both modals now carry the full set, with the former-location fields grouped under their own heading so creating an ordinary bucket stays short.

### v1.43.0

**LOC-6 — Location types reworked, plus gallery and plant-holding flags.** Schema: yes · Touched `locationTypeLabel`, both type dropdowns, `screenLocationDetail`, `editLocation`.

- **Types cut from eleven to six**: area · row · container · hospital · work_area · other. `slot` folded into `container` — 92 rows, one `update`. Areas nest freely, and every area is a Garden Album.
- **`holds_plants`** governs whether a Location page offers plants at all. An area like The Wall shows no plants block instead of a permanent, correct zero. **It never hides plants that exist** — Front Yard, Indoor and Wall Collection each still hold one placeholder plant, and those render with a hint rather than vanishing. A mis-set flag can cause noise, never data loss.
- **`gallery_row`** — albums / archives / none, set per location. This is what keeps Plant Hospital out of the Gallery and puts Meraki Office in Archives.
- Kept **`archived` separate from `gallery_row`** so a repotted bucket never surfaces as a former home of the collection. Two unrelated senses of the word.

**Collapses two backlog items:** GAL-3 stops being a curation system (an album is an area) and GAL-4 loses its separate schema entirely (archives are locations). Both drop from medium to low.

### v1.42.0

**Move a photo to another specimen.** Schema: none · Touched `screenPlantDetail` timeline, new `movePhoto` modal and `movePhotoToSpecimen()`.

Reassigning a photo took four steps — detach, navigate away, find it again, re-attach. That is the *common* case right after SPECIES-2, since a plant record that stood for several physical plants leaves all its photos on one specimen.

- **Move** on any owned timeline photo. Other specimens of the same species are listed first — a short, obviously-correct list — with every other plant underneath for a misidentified photo.
- **The photo's own location is highlighted when it matches a candidate**, since that is the strongest available clue about which specimen it shows. Amanda's 0013 had photos across Bucket 07, In Ground and no-location while the specimen sat in Bucket 39.
- A photo with no location inherits the target's; one that has a location keeps it. Same snapshot rule as attaching.

Filed **TAXP-1** alongside: the species page still shows no photo list, which is where Amanda went looking first.

### v1.41.3

**Link an existing specimen to a species.** An orphaned specimen could not be linked at all — v1.41.1 added taxon resolution to the create and propagate paths but not to edit, so the "Not linked to a species" group had no way out of it. Edit full record gained a Species picker: any existing species, or create one from the botanical name entered above.

### v1.41.1 / v1.41.2

**Fixes to the taxa split, from Amanda's first pass through it.**

- **New plants were created with no species** — a regression in v1.41.0. The Plants tab lists taxa, but the create path still wrote a bare `plants` row, so anything created after the split was invisible there. `ensureTaxonForName()` now reuses a taxon matching the botanical name (case- and whitespace-insensitive) or creates one. Propagation inherits the parent's taxon directly.
- **Unlinked specimens surface in a "Not linked to a species" group** on the taxa list, so a specimen with no name cannot vanish either.
- **`editPlant` stopped editing species fields.** It was still writing description, type, growth habit, bloom season, origin and all of Care to `plants` columns nothing reads any more — the "still pulling a full plant record" symptom. Replaced with a link to the species record.
- **Cultivar quoting.** The display layer adds quotes, but real values already carry them ("Echeveria 'Purple Perle'"), rendering as `''doubled''`. `cultivarLabel()` renders anything already quoted verbatim rather than nesting. Stripping the outer pair was tried first and was worse — it leaves embedded-cultivar values unbalanced.
- **"+ Add another location" retired** from the specimen page. A specimen is one physical plant in one place; extra locations mean extra specimens.
- Species photo can be set from any specimen's photos. Locations on the specimen page are clickable. "Container photos" → "Location photos". Dropped the stale identify-from-a-photo explainer.

### v1.41.0

**SPECIES-1 phases 1 & 2 — taxa split and full navigation.** Status: done · Schema: yes, new `taxa` table + `plants.taxa_id` · Touched `state`, `loadAll`, `icon` consumers, `screenPlants` → `screenTaxa`, new `screenTaxonDetail`, `screenPlantDetail`, two new modals and form handlers.

- **27 plants → 27 taxa, 1:1.** Not a simplification — all 27 botanical names are distinct, so a taxon per plant is the correct grouping. Zero judgement calls, fully mechanical.
- Navigation is now **Plants tab → taxon list → taxon detail → specimen → specimen detail**, as specified.
- Taxon detail carries Details, Care, Taxonomy, description, the cover photo, every location its specimens occupy, and the **specimen list as a lineage tree** — bought plants at top level, propagated offsets nested underneath their mother, at any depth.
- **Specimen detail lost its Details and Care cards**, replaced by a read-only Species summary linking up. Duplicating them is the exact thing SPECIES-1 exists to prevent.
- **+ Add specimen** inherits the taxon, so only location, provenance and health are entered.
- `plant_type` grew from 9 values to 14 — Cotyledon, Haworthia, Kalanchoe, Portulacaria and Senecio added. Five real plants had no valid value. `aloe`, `sedum` and `sempervivum` remain unused by any plant.
- **Display name precedence is `botanical_name` first**, composed parts second — backwards from the intent, and deliberate: family 3/27, genus 5/27, species 3/27 populated, so composing would produce worse names than the free text. See NAME-1.

Phase 3 (drop the duplicated columns from `plants`, retire `plant_locations`) waits until Amanda has created the ~10 missing specimens by hand.

```sql
-- Run before loading v1.41.0. See the full block in the session notes.
-- create table taxa (...); alter table plants add column taxa_id ...;
```

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
