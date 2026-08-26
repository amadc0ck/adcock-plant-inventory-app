# Backlog

Source of truth for what is queued, in flight, and done. Update this file as part of shipping any item.

Status values: `ready` · `blocked` · `in-progress` · `done`
Item IDs are permanent. Never renumber.

---

## Observed 2026-08-25 — triaged from Amanda's session notes

### SPECIES-1 — Split taxa from specimens (epic)
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


### PROP-1 — Propagate more than one offset at a time
**Status:** ready · **Effort:** low · **Schema:** none · **Touches:** `propagatePlant` modal, `wireModalForms`

`propagatePlant` creates one specimen per run. With every offset accessioned separately (SPECIES-1), taking five offsets off a mother plant means running the form five times and typing the same values five times.

Add a count field: "How many offsets?" → create N specimens in one go, each getting its own accession number from the existing trigger, all sharing `parent_plant_id` and the chosen location.

### SPECIES-2 — Split multi-location plants into one specimen per location
**Status:** splitting **done by hand** 2026-08-25 · cleanup pending · **Effort:** medium–high · **Schema:** yes, retires `plant_locations` for specimens · **Depends on:** SPECIES-1 · **Touches:** `plants`, `plant_locations`, `photos`, `care_notes`, `screenPlantDetail`, `allLocationsForPlant`, `mergePlants`

**Done manually rather than by migration.** Amanda created every missing specimen through the UI, which avoided the automated-split judgement calls entirely. All that remains is deleting 0014's redundant `plant_locations` row and the phase-3 column drop.

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


### LOC-4 — No way to delete or archive a location
**Status:** ready · **Effort:** low–medium · **Schema:** none · **Touches:** `screenLocationDetail`, `editLocation` modal, new `deleteLocation()`

A location can be created and edited but never removed, so mistakes and scaffolding accumulate with no way to clear them. Removing two ("Large Containers", "Container 001") took hand-written SQL on 2026-08-25.

Six things reference `locations.id` and all must be handled before the row goes, or the delete FK-errors or strips data silently:
`locations.parent_location_id` · `plants.location_id` · `photos.location_id` · `plant_locations` · `photo_locations` · `plant_location_history`

Proposed behaviour, mirroring `deletePlant()`:
- **Refuse outright** if the location has child locations — reparent or delete those first, and say so.
- **Plants and photos are unassigned, never deleted** — same principle as `deletePlant()` leaving photos intact. Offer to reassign to another location instead of nulling.
- **`plant_location_history` is the real decision.** It is a trigger-populated audit trail; the FK means deleting a location forces deleting its history. The confirm dialog must say how many history rows will be destroyed rather than doing it quietly. In the real case they were 5 and 4 rows and were judged not meaningful, but that was a judgement made only because the counts were visible first.
- **Archive and delete are both needed, for different reasons** (Amanda, 2026-08-25) — this is not archive-versus-delete:
  - **Archive** (`locations.archived` boolean): the container was real and has history, but no longer exists physically — the usual case being a **repot**. Hide it from pickers and lists; keep every history row intact.
  - **Delete**: the row should never have existed — a duplicate, an accident, or something created with an intention that changed. There is no history worth keeping, and leaving it archived just clutters the list forever.
  Offer both. Default the button to Archive when the location has any history or attachments, and to Delete only when it is genuinely empty.

### TAXP-1 — Photos on the species page
**Status:** ready · **Effort:** medium · **Depends on:** SPECIES-1 · **Touches:** `screenTaxonDetail`

The species page shows only a cover photo. Every photo of every specimen of that plant is invisible there, so managing them means guessing which specimen holds which and visiting each in turn.

Show all photos across the taxon's specimens, each labelled with the specimen and location it belongs to, with **Move** available inline. That makes "these three belong to the Bucket 07 one" a single screen rather than a hunt.

Overlaps GAL-1: once favourites exist, the *cover* gallery is the favourited subset, while this is the full working view. Both are wanted — one for looking, one for sorting.

### LOCP-1 — Act on photos from the Location page
**Status:** ready · **Effort:** medium · **Schema:** none · **Touches:** `screenLocationDetail`

From a location's photos, without navigating away:
- **Add a plant from this photo** — create a specimen already placed in this location.
- **Attach or tag to a different plant.**
- **Unattach.**

Not tagging other *locations* — a location is singular, holding multiple specimens, so cross-tagging containers has no meaning. `photo_locations` stays unused for this.

### LOCP-2 — Add location photos from existing sources
**Status:** ready · **Effort:** low–medium · **Schema:** none · **Touches:** `screenLocationDetail`

Add photos to a location from an identified plant's photos, from unattached location photos, or from the Inbox — mirroring what PHOTO-2 does for specimens.

### LOCP-3 — Create a specimen from the Location page
**Status:** ready · **Effort:** low · **Depends on:** SPECIES-1 · **Touches:** `screenLocationDetail`

Standing at a location knowing the species, create a specimen there directly: pick an existing taxon (or create one) and the location is pre-filled. Today it means going to the species record and picking the location from a list of 147.

### LOCP-4 — Prompt to assign a location's orphan photos to a new specimen
**Status:** ready · **Effort:** medium · **Depends on:** LOCP-3

When a specimen is created in a location that already holds photos with no plant, offer those photos for attachment straight away. Amanda's collection has **364 photos with a location but no plant**, so this is the common case, not an edge one.

### LOC-5 — Areas with sub-areas should show a thumbnail
**Status:** ready · **Effort:** low · **Touches:** `locationCard`, `locationCoverPhoto`

An area with children shows its own photo or nothing. It should fall back to a sub-area's photo — `locationCoverPhoto()` already walks descendants for this, so the card mostly needs to use it.

### NAME-1 — Normalize botanical names into structured parts
**Status:** ready · **Effort:** low–medium · **Schema:** none · **Depends on:** SPECIES-1

`taxa` has `genus` / `species_epithet` / `cultivar` / `is_hybrid`, but they are barely populated — **family 3/27, genus 5/27, species 3/27, cultivar 3/27**. So `taxonDisplayName()` prefers the free-text `botanical_name`, which is backwards from the intent.

The free text is also inconsistent in ways that will break parsing:
- **Mixed quote characters** — 'Zwartkop' and 'Metallica' use curly `\u2019`, 'Hamaji Silver' and 'fuzzy navel' use straight `'`. Two characters meaning one thing breaks matching and dedup.
- **Lowercase cultivar** — 'fuzzy navel' should be 'Fuzzy Navel'; cultivar epithets are capitalized.
- **Two hybrid notations** — *Parodia* × *erubescens* uses a proper `×`, the Echeveria cross uses a plain `x`.
- **Unquoted trailing descriptor** — "Austrocylindropuntia subulata monstrose": either cultivar 'Monstrose' or forma *monstrosa*.

Fill the parts for all 27 taxa, then flip `taxonDisplayName()` to prefer composed names. Cheap at 27 rows and annoying at 200. Once done, italics can be applied correctly per-part (genus and epithet italic, cultivar upright in quotes), which a single free-text string can never do.


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

### GAL-2 — Collection Highlights (per-photo tagging only)
**Status:** ready · **Effort:** low
**Plant-level grouping shipped in v1.45.0** — the Highlights row derives from `taxa.plant_type`, so Cacti rolls up eight genera with no junction table. What remains is only the open question of whether *photo-level* tags are additionally wanted: tagging one photo as a highlight independently of its plant. If not, this item is done.

### GAL-2 (original scope)
**Status:** ready · **Effort:** medium · **Schema:** category-tagging junction table
Cactus icon. Manual per-photo or per-plant category tags: Cacti, Agaves, Aloes, Succulents. Decide photo-level vs. plant-level tagging before building — the two produce different Gallery behavior.

**Re-scope against PD-2.** `plants.plant_type` now holds cactus / agave / aloe / euphorbia / sedum / crassula / echeveria / sempervivum / aeonium, which **is** plant-level category tagging. The open question shrinks to whether GAL-2 additionally needs *photo-level* tags. If not, GAL-2 needs no junction table at all — it becomes a Gallery filter reading `plant_type`. Do not build a second source of truth for the same fact.



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
