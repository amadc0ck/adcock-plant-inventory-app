# Backlog

Source of truth for what is queued, in flight, and done. Update this file as part of shipping any item.

Status values: `ready` · `blocked` · `in-progress` · `done`
Item IDs are permanent. Never renumber.

---

## Picking this up cold — state as of 2026-08-31

### GWS-1 — Google Workspace migration — ✅ COMPLETE 2026-08-31

Drive storage and the OAuth client now live on `me@justamanda.net`, in GCP
project `adcock-botanical-garden-app` inside the `justamanda.net` organization.
Audience Internal, published In Production — **no more weekly reconnects.**

**2,732 photos copied, 0 failed, every one checksum-verified on both sides.**
1,542 orphaned Drive files were deliberately left behind (36% of the folder) —
files from photos deleted in the app, which never deletes from Drive.
`photos.drive_file_id` repointed in a single statement; verified by sampling and
by the id range matching the new set exactly.

**The originals are untouched** in `amdaoh@gmail.com`'s Drive. Rollback is: put
the old secrets back, reconnect as the old account, and run the inverse update
from `tools/.migration/migration-map.jsonl`, which holds both ids for every row.

**Three things went wrong and are worth remembering:**
- The Supabase SQL editor runs statements over a **pooled connection**, so
  `create temp table` then `insert` fails with `42P01`. Generated SQL must be a
  single self-contained statement.
- Reconnecting in the app **before** the secrets were swapped sent her to the
  old client's consent screen and produced `Error 403: access_denied` —
  alarming, entirely expected, and diagnostic of nothing but ordering.
- `get-photo` sets `Cache-Control: private, max-age=3600`, so photos kept
  rendering from browser cache throughout the cutover. **Photos loading is not
  evidence Drive works** for an hour after any change.

**Cleanup still outstanding** — see the Deferred section.

### ~~GWS-1 — Google Workspace migration, IN FLIGHT~~ (original plan, kept for reference)

Amanda set up `@justamanda.net` (**the account is `me@justamanda.net`**) and
wants Drive + the OAuth client moved off the personal Gmail account.

**The personal account is `amdaoh@gmail.com`** — not the address on her Claude
Code profile. That is the account that authorised the app and owns the Drive
folder holding every photo, so it is the one `auth-old` must sign in as. Getting
this wrong does not error: `drive.file` is per `(client_id, user)`, so the wrong
Gmail account simply returns zero files and reads as an empty folder, and the app published so refresh tokens stop expiring
weekly.

**Decided 2026-08-31:** new GCP project in the `justamanda.net` Cloud
Organization · skip publishing the old project, publish only the new one ·
copy the photos and **leave the originals in place** as a backup ·
~2,600 photos, under 10 GB.

**Two findings that change the shape of this:**

1. **Publishing needs no verification review.** `drive.file` is classified
   **non-sensitive**, and apps using only non-sensitive scopes are not required
   to verify. REFERENCE §8's "verification is a multi-week process" was the
   reason the app stayed in Testing and the reason for the weekly reconnect.
   That premise is wrong for these scopes. **Still to confirm in the Console:**
   how `photospicker.mediaitems.readonly` is classified — the Console labels
   each scope as you add it, and that label is the answer.

2. **The photos cannot change hands.** `drive.file` is granted per
   `(client_id, user)` pair, so sharing the folder or transferring ownership
   both leave the app unable to see the files. The read side of any copy must
   use the **OLD client id**. Therefore the account swap and the file copy
   **cannot be separated** — swapping secrets first 404s every historical photo.

**Tooling is written and committed:** `adcock-plant-inventory/tools/migrate-drive.mjs`
plus `tools/README.md`. Resumable, checksum-verified both sides, writes nothing
to Postgres. `tools/.migration/` is git-ignored because it holds refresh tokens.

**GCP project — DONE 2026-08-31:** `adcock-botanical-garden-app`, created inside
the `justamanda.net` organization (Organization and Parent resource both
confirmed as `justamanda.net` at creation).

**Skip Google's Cloud Setup / landing-zone wizard** — it is offered to any new
org with no projects and builds Shared VPC, Security Command Center, central
logging and a Terraform estate. Enterprise scaffolding with recurring cost, for
a single-project app. Go straight to `console.cloud.google.com/projectcreate`.

**Console checklist — Amanda, in the browser (nothing else can start until this
is done):**

1. ~~Create a project inside the `justamanda.net` Cloud Organization.~~ **DONE**
2. Enable **Google Drive API** (`drive.googleapis.com`) and **Google Photos
   Picker API** (`photospicker.googleapis.com`). Neither should ask for billing.
3. OAuth consent screen → audience **Internal** → publish **In Production**.
   Add both scopes and **record the sensitivity label the Console shows for
   `photospicker.mediaitems.readonly`.**
4. Create an OAuth **Web application** client. Authorised redirect URI, exactly:
   `https://fsckwgicmvviefuivgza.supabase.co/functions/v1/drive-oauth-callback`
   — unchanged from today, so **no code change is needed**.
5. Add `http://localhost:8910/callback` as a second redirect URI on **both** the
   old and the new client, so the migration script can authorise. Remove it
   afterwards.
6. Hand over the new client id + secret, and the OLD `DRIVE_FOLDER_ID` (it is in
   Supabase secrets).

Then: `auth-old` → `auth-new` → `copy` → swap secrets → reconnect → `sql`.
Order is in `tools/README.md` and must not be rearranged.

**Not yet decided:** whether the Anthropic and Pl@ntNet keys move too. They are
unrelated to Google and are not blocked by any of this — but a dedicated
Anthropic key for this app is still worth doing (see the cost note below), and
a Workspace-owned Anthropic account would be the moment to do it.

---

## Earlier — state as of 2026-08-30

### `watering_events` exists — RLS state UNVERIFIED

Amanda ran the `create table watering_events` block on **2026-08-30**, from a
plan sketch rather than a finished migration. Verified present via PostgREST:
`id`, `plant_id`, `watered_on`, `location_id`, `batch_id`, `notes`, `created_at`.
**`method` did not land** — no matter, W-1/W-2 do not use it.

**The sketch omitted the RLS policy**, and an anonymous probe cannot tell
"RLS on with no policy" from "RLS off" — both return `[]` on an empty table, and
every other table in this project returns `[]` to anon as well. A follow-up
block (enable RLS + policy + indexes, all idempotent) was handed over the same
day. **Confirm it ran before building W-1**, or the table will read back empty
and the symptom will look like a broken feature rather than a missing policy.

**The lesson worth keeping:** a fenced ```sql block in a *proposal* gets run
immediately. Never post illustrative SQL that is not safe and complete.

### Weather is live as of v2.11.0

Coordinates and thresholds are in `app_settings`, not code. See Completed for
the NWS User-Agent gotcha and the indoor/outdoor blind spot.

---

## Earlier — state as of 2026-08-29

Written so a session with no memory of the conversation can continue without asking. Everything below is either **waiting on Amanda** or **decided but unbuilt**. Delete an entry when it is resolved.

### `plant_type` list — resolved 2026-08-29

**`list_options` is empty for `plant_type`**, so Settings renders the built-in
map and v2.8.0's five new values show up there correctly. Confirmed by Amanda.

**The consequence to remember:** the first add/retire/rename in Settings calls
`seedListIfNeeded()`, which copies all 19 values into `list_options` wholesale.
From that moment `listOptionsFor()` reads only the table and **the code map is
dead for that list** — a new `plant_type` added in `index.html` will not appear.
After her first edit, adding a plant type is a Settings job, not a code change.

`suggest-species`'s prompt still hardcodes the vocabulary either way, so a value
added in Settings is one Claude cannot propose until the Edge Function is
updated too. Worth fixing properly if the lists start moving often.

### Species data — remeasured 2026-08-29 (133 taxa)

- **`origin`: zero nulls.** Every taxon has a value, which is why `suggest-species`
  never proposed one — the fill-the-blanks pass only asks about blanks. v2.8.0
  treats the sentinel `unknown` as blank so it can be asked.
- **`parentage`: 132 of 133 null, and that is mostly correct.** Only hybrids and
  cultivars have a cross to record. v2.8.0 gates the question behind
  `looksHybrid()` rather than generating ~100 dismissals.
- **`light_conditions`: 132 of 133 empty.** Genuinely unfilled; now asked for.
- **`plant_type`: two different problems.** 11 of 23 Echeveria are blank despite
  `echeveria` existing — those just need the Claude pass run. Curio (5),
  Dracaena (3), Hoya (2) and Haworthiopsis (2) had no valid value at all until
  v2.8.0 added them.

### Vocabulary columns are CHECK-constrained — adding a value is a schema change

**Learned the hard way 2026-08-28.** PD-4 shipped the `urgent` health tier on the
recorded assumption that `health_status` was free text. It is not:
`plants_health_status_check` rejected it, so Move to Plant Hospital and the edit
dropdown both failed with `23514` for five days.

**The column-existence probe cannot catch this.** It proves a column resolves; it
says nothing about accepted values, because an anonymous read cannot see
`pg_constraint`. Before adding any value to a vocabulary, ask Amanda for the
constraint list (the query is in REFERENCE under `taxa`).

**Both constraints were widened 2026-08-28 and verified from `pg_constraint`.**
`health_status` accepts `urgent`; `photo_type` accepts `overview` and
`progress`. The full constraint list is now recorded in REFERENCE — read it
there rather than inferring, and note that **`taxa` has no constraints at all**,
so a failed taxa write is never a constraint violation.

**The CLI has no `functions logs` subcommand** (v2.115.0) — an older note in this
file claimed it does. Use the Supabase dashboard for Edge Function logs.

### Species data — measured 2026-08-28

- **105 taxa. Only 13 are complete**; 86–91 of 105 are blank in every profile
  field. `suggest-species` has effectively never run at scale.
- **61 of 105 have no structured name parts** — genus, epithet and cultivar all
  empty, only free-text `botanical_name` (which all 105 have).
- **Known bad names** (character diffs given to Amanda 2026-08-28):
  `Echerveria Agavoides 'Lipstick'` (4 specimens) · `Euphorbia enolpa` →
  *enopla* (5 specimens) · `Echeveria Agavoides 'Ebony'` ·
  `Echeveria Runyonii 'Pink Edge'` · `Pacheyveria 'Haagei'` ·
  `Pilosocereus leucocephalus f. Palmeri` · `Curio repens 'Mini Blue'.`
  Unverified: `Echeveria deranosa`, `Pachyphytum exotica`.
- Three separate *agavoides* records exist. That is **correct** under SPECIES-1
  (cultivars are sibling rows, not children) — they just need their parts filled
  so they group.

**NAME-2 shipped in v1.95.0 and is confirmed working.** See Completed.

**The name cleanup itself is now Amanda's to work through**: 61 species with no
structured parts, findable via the "Names not split up" tile, plus the 7 known
misspellings. Each is one Ask and a few taps, not a retype.

---

## Observed 2026-08-25 — triaged from Amanda's session notes

### SPECIES-1 — Split taxa from specimens (epic)
**Status:** ✅ **COMPLETE.** Phases 1–2 shipped v1.41.0–v1.41.3, the phase 3 code
pass v1.65.0, and Amanda ran the column drop 2026-08-28 — proven lossless first
by comparing all 16 duplicated columns across 167 specimens (one stray `family`
value existed on a specimen but not its taxon and was promoted). SPECIES-2
closed the next day with the `plant_locations` drop and v2.7.2's code cleanup.
**Effort:** high · **Schema:** yes, new table + FK · **Touches:** nearly every screen

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
**Status:** ✅ **COMPLETE 2026-08-28** — table dropped, code cleaned in v2.7.2 · **Effort:** medium–high · **Schema:** yes, dropped `plant_locations` · **Depends on:** SPECIES-1 · **Touches:** `plants`, `plant_locations`, `photos`, `care_notes`, `screenPlantDetail`, `allLocationsForPlant`, `mergePlants`

**Done manually rather than by migration.** Amanda created every missing specimen through the UI, which avoided the automated-split judgement calls entirely. 0014's redundant `plant_locations` row was deleted by hand 2026-08-26.

**Closed 2026-08-28.** Amanda dropped the table after the 6 surviving rows were shown to carry nothing (4 exact duplicates of the plant's own `location_id`, 2 Car Port ancestor rows). v2.7.2 then removed every read and write: `allLocationsForPlant` reads `location_id` alone, `plantsAtLocation` and the descendant-count helper no longer merge junction ids, `removePlantLocation` is gone, and the merge/delete/location-delete cleanup paths lost their junction steps. The restore path keeps a deliberate guard that warns and skips if an **old backup** still contains `plant_locations` rows.

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



---

## Open — verified 2026-08-28, end of session

Everything below is either **waiting on Amanda** or **decided but unbuilt**.
Nothing here is blocked on code that has not shipped.

### Code, ready to build — reopened 2026-08-29

Three tools the taxa cleanup proved are missing. None urgent; all three will be
wanted again.

1. **Delete a species.** There is no `deleteTaxon` in the app at all. Must refuse
   while specimens exist, and clear `suggestions` and `task_subjects` first
   (both carry a `taxa_id` FK). Model it on `deleteLocation`.
2. **"Species with no specimens" tile.** Empty taxa are invisible, so they
   accumulate silently — `ensureTaxonForName` creates the taxon BEFORE linking
   the specimen, so a failed link orphans one.
3. **Duplicate-species detection.** Same shape as the Duplicate plants check.
   Two *Sedum adolphii* rows were found 2026-08-29, created **five seconds
   apart**, and merged by hand.

**The cause behind #3 is a check-then-act race.** `ensureTaxonForName()` calls
`findTaxonByName()` and then inserts; two rapid creates both miss the existing
row, and `taxa` has **no unique constraint** to catch it. Detection is a
workaround — the fix is a unique index on the composed name. Not designed yet:
the composed name is computed in JS, not stored, so it needs a generated column
or an expression index. **Schema change — ask first.**

### SQL — NOTHING OUTSTANDING

Both jobs done 2026-08-28. The **SPECIES-1 column drop** ran (see v2.6.0) and
**NAME-1** is closed, with the two pedigrees restored into `taxa.parentage`.

### Garden questions — ALL CLOSED 2026-08-28

The three left over from the rollback audit, resolved by Amanda from the app:

- **ABG-2026-0150** *Curio repens* — **a real plant, not a duplicate.** Three
  specimens now (0062, 0150, 0197) in different places. The "0 photos" that made
  it suspicious was just an unphotographed plant.
- **ABG-2026-0145** *Euphorbia mammillaris* — placed. "1 specimen in 1 location".
- **Bucket 40** — **two different plants.** *Previously here* shows 0029 moved
  out to Propagation / Work Area and 0013 gone to In Ground, while 0151 is the
  plant there now.

**The Bucket 40 question was only unanswerable this morning because nothing
rendered `plant_location_history`.** MOVE-1 (v1.86.0) surfaced a table the
trigger had been filling for months, and it answered the question the same day.

### The name cleanup, in progress

31 species still stored as free text only, down from 61. Findable via the
**Names not split up** tile. Each is one Ask and a few taps via *Check the name
and split it up*.

**NAME-3 (v2.5.0) stops the list growing** — every species created from a typed
name now arrives with its parts parsed. It does not shrink it; the existing
records still need the Claude pass.

Seven names are known-wrong and listed in the species-data section above.

### Shipped 2026-08-31, NOT yet verified in real use

Everything below is code-tested and syntax-clean; none of it has been exercised
against the running app on the iPad. Listed so a later session does not assume
it works.

- **WATER-1 / WATER-2 — ✅ FULLY VERIFIED 2026-08-31.** Measured from
  `watering_events`: **207 plants across 3 runs dated 2026-08-29**, plus 1 plant
  dated 2026-08-28.
  - **Dates are the ones she chose.** Both are deliberate back-dates recorded in
    the Pacific evening, when UTC has already rolled over — the exact case the
    pre-v2.11.1 skew would have pushed forward a day.
  - **The unique index did its job.** Three overlapping runs produced 207 rows,
    not duplicates, so "water an area then top up one pot" merges as designed.
  - **207 = Front Yard's 201 + the hospital + the work area.** Which also
    confirms `PLANT_HOLDING_TYPES` works for the non-container types — the water
    button appeared on `hospital` and `work_area`, which is precisely what
    LOC-9's `type === "container"` bug would have broken.
- **WEATHER-1 — no frost or heat event has occurred yet.** Concord's forecast
  has been mild all week, so only the quiet strip has ever rendered. The banner,
  the threshold logic and the link into the frostTender report are verified
  against synthetic forecasts only.
- **INB-2 (v2.15.1) — the Select button's new position.** Depends on
  `--sticky-top` being computed correctly for the iPad's header height. Amanda
  will confirm next time she takes progress photos.
- **`suggest-species` v8 — the rewritten `origin` prompt.** Nobody has run Ask
  Claude since the deploy. The check is whether `origin` now comes back varied
  rather than `introduced` every time — ideally on something plausibly
  Californian.
- **LOC-9 and PROF-1 / PROF-2 tiles — ✅ render correctly, 2026-08-31.** Amanda
  confirmed the To Do queue looks right with the new tiles in it. The counts
  themselves are hers to work through, not a correctness question.

### Shipped 2026-08-29, NOT verified against real data

- **AI-4 — `parentage`, `light_conditions`, `is_hybrid`, `origin`.** Deployed
  (`suggest-species`), and the array branch in `acceptSuggestion` is code-tested,
  but nobody has run Ask Claude on a species with blank light, or on a
  nothogenus, and confirmed a suggestion appears and accepts cleanly. **The most
  likely remaining gap** — the only change crossing into an Edge Function.
- **iOS focus-zoom — ✅ confirmed working 2026-08-31.** `@media (pointer:coarse)`
  16px, shipped v2.8.0. Amanda confirms fields no longer zoom on tap.
- **PHOTO-4 round trip.** The helper preserves `photo_type` alongside
  `historical` in test, but the bulk editor was never run on a photo typed
  anything other than General.

### Gemini — effectively closed, not built

Deep links (Google Images / iNaturalist / Wikipedia) shipped v2.8.0; Amanda's
verdict was "clutch". **Google Lens has no public API**, so there is nothing to
integrate there regardless. A Gemini identification call stays possible — new
Edge Function, Google AI Studio key, per-call cost — but the links solved the
actual problem. **Do not build without asking.**

### GRAVE-1 / WISH-1 — scoped 2026-08-29, approved shape, NOT built

Amanda asked for a wish list and a Graveyard / In Memoriam, then chose to stop
before building. **The design below was agreed; do not re-litigate it, build it.**

**Three connected pieces, one migration.**

1. **"No longer have this"** — an action on the plant record. Asks died / gave
   away / deaccessioned, a date, and a note; sets `status`,
   `collection_category = 'historical'`, stamps `date_removed`, writes a care
   note, and offers "add this species to my wish list" in the same step.
   Today status is only reachable through Edit full record's dropdown — there is
   no action for it, unlike Move to Plant Hospital.

2. **Graveyard / In Memoriam** — a view of every non-active plant, grouped by
   year: photo, name, how long it was held (`date_acquired` → `date_removed`),
   where it was, why it went. Nothing is deleted; photos and history stay.

3. **Wish list** — a standalone table. **Amanda chose this over a `taxa.wanted`
   flag** after being told the tradeoff: a second place plant names live, which
   can drift from `taxa`. Mitigation agreed — an entry WITH a `taxa_id` renders
   the taxon's name, so only genuinely unowned entries rely on free text.
   Marking one acquired creates a real specimen and closes the entry.

**Behaviour change this requires.** `plantsAtLocation()` ignores `status`, so a
dead plant still occupies its bucket — Bucket 40 reports 1 plant after that
plant dies. Filter those counts to active but **KEEP `location_id`**: the bucket
then reads empty while the Graveyard can still say "died in Bucket 40". Clearing
it would lose where the plant died.

**Migration — not yet run.** Write the code with feature detection first, verify
it behaves before AND after, then hand the SQL over (same discipline as
`photos.historical`).

```sql
alter table plants add column date_removed date;

create table wishlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  taxa_id uuid references taxa(id) on delete set null,
  photo_id uuid references photos(id) on delete set null,
  source text, notes text,
  acquired boolean not null default false,
  acquired_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table wishlist enable row level security;
create policy wishlist_all on wishlist for all to authenticated using (true) with check (true);
```

The RLS policy matches every other table's. Without it the table reads back
empty — it is not optional.

**Placement:** two toggles on the Plants tab, not new nav tabs. Still the
collection, in past and future tense.

### Found 2026-08-31, not yet built

Raised in session and recorded so they survive it. None is blocking.

1. **CACHE-1 — the Claude prompt cache is probably never hitting.** Three
   defects, one fix each. Do them together; they are one job.

   The catalogue `buildContext()` assembles — every taxon, active specimen and
   location, ~460 rows and roughly **15,000 tokens**, mostly UUIDs — is sent as
   the system prompt under `cache_control: {type:"ephemeral"}`. Caching is
   **prefix-matched**: one byte different anywhere and the whole block is a
   miss. At Sonnet 5 rates a hit is ~$0.003 per call and a miss ~$0.030, so this
   is a **10× difference on the largest part of every request** — about $3 vs
   $7.50 across a 170-photo health sweep.

   **(a) No `ORDER BY` on any of the three selects.** `taxa`, `plants` and
   `locations` come back in heap order, and an `UPDATE` moves a row to the end
   of the heap. So editing or moving a plant silently reshuffles the catalogue
   text. Fix: `.order("id")` on all three.

   **(b) `corrections` is inside the cached prefix, and it is the most volatile
   thing in the request.** `buildContext` appends the last 20 accepted/dismissed
   suggestions as examples, as the final element of the catalogue string — so
   **every accept or dismiss invalidates the cache**, which is precisely what
   she does while working a batch. Fix: move it out of the cached system block
   into the user turn. ~600 tokens at full price instead of re-paying 15,000.
   *This is the worse of the two and was missed on the first pass.*

   **(c) `callClaude` discards `data.usage`.** `cache_read_input_tokens` and
   `cache_creation_input_tokens` are never read, so nobody can confirm caching
   works or measure real cost — every figure above is inferred, not measured.
   Fix: log it; Supabase function logs will show it per call.

   **Do (c) first.** Then (a) and (b) can be proven rather than assumed.

   Until this is fixed, the operational workaround for the health sweep stands:
   **sweep first, review after** — reviewing mid-sweep triggers (b) on every
   remaining call.
4. **`.btn-ghost` is `--blue` on parchment — about 2.2:1.** Legible but below any
   accessibility floor. Deliberately not swept in v2.12.2: unlike
   `.btn-secondary` it is genuinely visible, many call sites override the colour
   inline, and restyling would change screens nobody has complained about.
   `on-cream-icon` (`--moss-dim`) is the fix where it matters.
5. **The frost report counts plants already brought indoors.** Nothing
   distinguishes a sheltered location from an exposed one —
   `LOCATION_TYPE_LABELS` has no such value and `indoor` was defined and went
   unused. A `sheltered` boolean on `locations` would fix it. Small migration.
6. **Service account + Shared Drive — DECIDED AGAINST 2026-08-31. Do not
   re-open without a trigger.** REFERENCE §8 records Attempt 1 failing because
   service accounts have zero storage quota on personal Google accounts, and
   Shared Drives — the fix — require Workspace. Workspace now exists, on
   **Business Standard**, so it is technically available.

   **Weighed and declined.** The acute problem it was going to solve — weekly
   reconnects — is already solved by publishing the app as Internal. What
   remained was insurance against repeating the 2026-08-31 file migration, and
   that migration only happened because the Google account changed.

   *An argument that was made and is wrong:* it does NOT protect against
   password-change token revocation. Google revokes refresh tokens on password
   change **for mail scopes only**, not Drive. Checked, not assumed.

   What it would still buy, for the record: files owned by the organisation
   rather than by `me@justamanda.net`; access by Shared Drive membership rather
   than the `(client_id, user)` pair, so no future account change costs another
   copy; and a smaller blast radius, since a dead OAuth token would then break
   only Google Photos import rather than every photo in the app.

   Costs: rewriting `_shared/google-auth.ts` for JWT auth, a long-lived private
   key in Supabase secrets (worse hygiene than a refresh token), and the Photos
   Picker still needing user OAuth regardless.

   **Reopen only if:** another person joins the Workspace · another Google
   account change is contemplated · the OAuth token starts dying for reasons
   Internal publishing did not fix. Amanda expects none of these — the Workspace
   exists to consolidate her email onto a custom domain and merge several
   personal Google Drives, not to become multi-user.
7. **Every table except `google_auth_tokens` still has blanket RLS.** That one was
   tightened 2026-08-31 (REFERENCE §3). It is a prerequisite for a guest view,
   not the whole job — a guest today could still read and write plants, photos
   and locations.

### Correction — Edge Function versions

The "Reference — settled today" note below says `suggest-species` v6. It is
**v8** as of 2026-08-31: v7, then v8 rewrote the `origin` prompt, which had been
telling Claude the answer ("Almost every succulent here is introduced") and so
returned `introduced` for everything. `suggest-photo` is still v10.

**AI-4 remains unverified against real data**, and now matters more: nobody has
confirmed that `origin` comes back varied — or that a genuinely Californian
native like a *Dudleya* is now called native.

### GWS-1 cleanup, outstanding

- **Remove `http://localhost:8910/callback`** from both OAuth clients — the old
  `Adcock Plant Inventory - Web Client` and the new `Adcock Botanical Garden App`.
  It was only ever for the migration script. Leave the Supabase redirect alone.
- **`tools/.migration/` holds live refresh tokens** for both Google accounts.
  Git-ignored, but delete `token-old.json` and `token-new.json` once you are
  confident no rollback is needed. Keep `migration-map.jsonl` — it is the only
  record of which new file corresponds to which old one.
- **The old Drive folder** (`Plant Inventory Photos (App)`, 4,274 files) stays as
  a backup. Delete by hand when ready; nothing points at it.
- **The old GCP project** `adcock-garden-collection` can be deleted eventually.
  Not yet — it is the rollback path.
- **1,542 orphans were not copied**, so deleting the old folder makes them
  unrecoverable. They are files whose photo rows were already deleted, so this
  is almost certainly fine, but it is a one-way door.

### Deferred / known gaps

- **CSV import.** Export exists (plants CSV, full JSON backup). Import is
  JSON-only, upsert-based.
- **Guest / read-only view.** RLS grants full access to any authenticated user,
  so this is a real design change, not a UI toggle. Scoped 2026-08-31, not
  started — Amanda is deciding.

  Three tiers, and the right one depends only on the audience:
  1. **Show it in person.** Nothing to build. Best demo of the three, because
     the app is better to use than to look at.
  2. **Add a Supabase user.** Two minutes; photos work, since `get-photo`
     accepts any authenticated user. **They get full write access** — every
     policy is `for all to authenticated`. Fine for one trusted person, not for
     a stranger.
  3. **A real read-only role.** Split every policy into `for select to
     authenticated` plus a write policy gated on not being a viewer, driven by a
     viewers table. **17 tables**, mechanical but fiddly, and the test that
     matters is that her own access does not break. Worth it only for several
     people or an ongoing arrangement.

- **A PUBLIC site is a different thing entirely** and was scoped the same day.
  Two blockers worth recording:
  - **Photos may carry EXIF GPS.** The app preserves EXIF and the 2026-08-31
    Drive migration copied bytes exactly, so whatever a phone wrote is still
    there. **Publishing photos unmodified would publish her home coordinates**
    in machine-readable form. Any public export MUST strip EXIF.
  - **Location names map her property** — "Bucket 32, Wall Collection, Front
    Yard" — and `acquisition_source_name` / `acquisition_notes` may name people
    or prices. Publishing the *botanical* record (species pages) rather than the
    *inventory* (specimens and their locations) sidesteps both.

  Recommended architecture if ever built: **a static generator**, writing JSON
  and resized EXIF-stripped images to a GitHub Pages repo like the legal site.
  A live public API would mean anon RLS on the real database plus a public
  endpoint proxying her Drive — a permanent attack surface in exchange for
  liveness that a plant collection does not need.
- **Bucket-level physical inventory.** All 92 wall buckets exist as rows;
  assigning actual plants to each is manual work, not automatable.
- **Pl@ntNet per-specimen limitation.** Identifies the whole frame, not one
  specimen in a multi-plant container photo. Claude has the same limitation but
  can at least reason about the dominant subject.

### Reference — settled today, do not re-derive

- **Edge Functions are current.** `suggest-photo` v10, `suggest-species` v6,
  verified 20:09 UTC. **Check `supabase functions list` before assuming a
  function is live** — the health focus sat written-but-undeployed for a day and
  the symptom was a feature that silently did nothing.
- **Bucket 32–61 renumber is done.** 61 → 32, 32–60 → 33–61, `sort_order`
  renumbered 1–30. No specimen, photo, tag, task or move record was touched:
  everything keys on `location_id`. **Numbers in older notes shifted** — anything
  recorded against buckets 32–60 before this reads one higher.
- **`taxa` has no constraints**, so a failed taxa write is never a constraint
  violation. Full constraint list in REFERENCE.
- **PERF-2, NAV-1, HEAD-1, TODO-1/2/3, FILE-1, HOVER-1, LAYER-1, NAME-2, NAME-3**
  all shipped — see Completed.

---

## Version numbering — audited 2026-08-28

Rules live in `CLAUDE.md`. All **102 recorded ships** were classified against
them. **Two breaks, both mine:**

| Ship | Shipped as | Should have been | Why |
| --- | --- | --- | --- |
| **v1.41.0** | minor | **2.0.0** | SPECIES-1 split taxa from specimens. The model changed and the Plants tab began browsing species rather than plants — the only true model change in the project's life. |
| **v2.0.0** | major | **1.100.0** | A page layout. No model change, nothing to do differently. Bumped to avoid a three-digit minor, which is not a reason. |

Everything else is correct. All 15 schema-carrying ships are minors, which is
what the rule says; every `.x` is a genuine fix. **The rules describe what this
project already did** — they were only ever broken by hand.

**Not corrected, deliberately.** Renumbering downwards would break the ordering
the stale-version banner relies on, and rewriting history means force-pushing a
repo GitHub Pages serves. `2.x` is therefore read as "after the taxa/specimen
split", which is true; the boundary simply landed 59 versions late.

---

## Completed

### v2.17.1 — the broken thumbnails deep in the archive galleries

Reported with a screenshot: scroll far enough into a history gallery and every
tile from that point on is a broken image. The console showed the answer —
`GET blob:https://garden.justamanda.net/... net::ERR_FILE_NOT_FOUND`, over and
over. **Blob URLs, not Drive.** Nothing to do with GWS-1, the migration, Drive
quotas or missing files, which is where I would have looked first without it.

`ensurePhotoLoaded()` cached the blob, queued it, called `evictPhotoCache()` and
**only then** patched the `<img>`. So at eviction time the photo that had just
arrived still had no `src`, and `idsOnScreen()` — which counts any `<img>`
holding a src — did not count it. Past roughly 600 photos in the DOM (one long
gallery) every older entry is live, so the newest arrival is the only thing
eviction is allowed to drop. It was revoked the instant it arrived, and the dead
`blob:` URL was then painted into the tile.

That is why it started at a depth rather than at the top, and why it never
recovered.

Three changes:
- `evictPhotoCache(protectId)` never evicts the photo that just arrived.
- It is called **after** the DOM patch, not before, so the new tile is live
  anyway. Belt and braces: either alone fixes it, and the ordering can no
  longer resurrect it.
- `releaseRenderedPhoto()` — when a blob genuinely is revoked, any `<img>` still
  pointing at it is blanked and handed back to the observer, so a dead blob can
  never be rendered and the tile reloads when it next nears the viewport.

**Also fixed, found while reading: a failed photo fetch was never retried.**
`observeLazyPhotos()` unobserves the element *before* the fetch, and the catch
only cleared the in-flight flag — so one transient failure left a tile blank
permanently, with nothing watching it and nothing able to trigger a retry. It is
now re-observed on failure. Still silent in the UI; a toast per thumbnail would
be noise if Drive blinks.

Seven assertions against the functions extracted from `index.html`: the exact
screenshot scenario, that eviction still frees memory once tiles leave the DOM,
that the cache stays at its limit, that no revoked id is left in the cache, and
that a dead blob is never left in a rendered `<img>`.

**Known tradeoff, unchanged from before:** while a gallery holds more than
`PHOTO_CACHE_LIMIT` (600) painted tiles, nothing is evictable and the cache
grows past the limit. That was already the stated intent — *"holding a few extra
blobs is better than blanking the page"* — the old code simply did the opposite.
The real ceiling is that `idsOnScreen()` means "in the DOM", not "on screen";
making it mean the viewport would let eviction reclaim scrolled-past tiles.
Deferred: it needs `getBoundingClientRect()` per image on every arrival, which
is its own performance problem at 2,700 photos.


### v2.17.0 — PHOTO-5 and PHOTO-6, filing photos from the Gallery

Both reported from a real session: attaching photos to plants one at a time,
and losing your place after every single one.

**PHOTO-5 — the Gallery jumped to the top after every attach.** The
scroll-restore machinery was already there and already correct; the key it
consulted was too coarse. `currentViewKey()` included the modal type, so opening
the attach picker counted as navigating to a new screen, and closing it counted
as navigating again — two trips to `window.scrollTo(0, 0)` per photo filed.

Split into two keys. `pageViewKey()` is tab plus record and deliberately
excludes the modal, because a modal is an overlay on the page behind it, not a
different screen. Page scroll restores whenever the page key is unchanged; modal
scroll still keys on the full view key, so a freshly opened modal starts at its
own top. Real navigation (`openPlant`, `openTaxon`, `openLocation`) all change
`state.tab`, so they still scroll to top — verified.

`captureScroll()` now also snapshots the Gallery's horizontal `.gal-scroll`
rows, which died with the DOM the same way the page did. Captured by position,
since render() rebuilds the rows rather than moving them.

**PHOTO-6 — recently used plants, five of them.** Mirrors LOC-9 exactly, which
solved the identical problem for locations: `abg_recent_plants` in localStorage,
`recentPlantIds()` / `notePlantUse()`, ids validated on read so a deleted
specimen cannot render as a dead button. Recorded wherever a photo is actually
attached — `assignPhotosToPlant` and `attachInboxPhotoToPlant`.

It lives in the shared `plantPicker()`, so it appears everywhere a plant is
picked, not only the Gallery. It ignores the search and filters above it —
skipping the search box is the entire point — and hides itself the moment
either is in use, because a row quietly disobeying the filter above it reads as
a bug. `locationPicker` hides its recents on the same reasoning.

**No schema change.** Both are client-side only.

Eleven assertions covering both, driven against the functions extracted from
`index.html` rather than a copy: the five scroll decisions (open modal, re-render
modal, close modal, and two real navigations) and six recents cases (ordering,
de-duplication, the five cap, deleted specimens, null input).


### v2.16.1 — Settings no longer promises a weekly reconnect

The Drive panel said *"Access expires roughly every 7 days while this app is in
personal-use (unverified) mode."* True until GWS-1; false from the moment the
app was published. Left alone it would have had her reconnecting out of habit,
and reading a real failure as normal.

Now: *"This connection does not expire — the weekly reconnect ended when the app
was published. Only reconnect if photos or uploads start failing."* Different
wording when disconnected, since there the point is that connecting is a
one-time thing.

**The Reconnect button and the 401 message stay exactly as they were.**
`driveErrorMessage()` still says "Google Drive needs to reconnect" on a 401,
which is still the right advice — the path is unchanged, it just stopped being
routine.

The code comment explaining *why* Drive sits first in Settings was updated too;
it gave the weekly expiry as the reason.

### v2.16.0 — ADM-3, the "full backup" was missing five tables

**Found by auditing a real export, 2026-08-31.** `exportFullBackup()` did not
include:

| Missing | What a restore lost |
| --- | --- |
| `bloom_events` | every recorded bloom, the whole flowering history |
| `tasks` / `task_subjects` | the entire task system |
| `app_settings` | check-in and watering intervals, garden coordinates, weather thresholds |
| `watering_events` | all watering |

**This is the fourth recurrence of one fault.** ADM-2 added
`plant_location_history` after discovering the same thing — "its absence meant a
restore silently lost all move history". Every table added since (BLOOM-1,
TASK-1, app_settings, WATER-1) repeated it, because nothing connects "add a
table" to "add it to the backup".

Both sides fixed. Restore order matters: all five reference plants or taxa,
which are already in by that point. `app_settings` upserts on `key`,
`watering_events` on `(plant_id, watered_on)` — the same conflict target the app
uses, so a restore merges rather than colliding with the unique index.

**The rule, now stated in REFERENCE §3: adding a table to the schema means
adding it to `exportFullBackup()` and to the restore, in the same change.**

Note the backup taken this morning as the pre-migration snapshot was made with
the old code, so it lacks all five. Take a fresh one.

### v2.15.1 — INB-2, Select moves down to the photos

Reported by Amanda 2026-08-30: *"The select button sits at top of to do page when
it needs to be down with the images."*

It was in `screenHeader`'s actions slot — above the weather banner, above the
whole work queue. You scroll down to the grid, decide to select some photos, and
have to scroll back up to start.

Now the last control in `.sticky-controls`, alongside sort, year, search and the
view toggle. That block is `position:sticky` with `top:var(--sticky-top)` — set
at runtime to header height plus any task banner — so it pins below the header
and **follows you down the grid**.

- **Last in the row on purpose**, so entering select mode does not reflow the
  filters to its left.
- **`btn-accent` while active.** In select mode a tap means something different
  everywhere on the screen; that deserves more than a label change.
- **Rendered when `unassigned.length || selectMode`.** The second clause is not
  redundant: filter to zero matches while selecting and the count is 0, which
  would remove Cancel and strand you in select mode — the bulk action bar only
  appears once something is selected.

### v2.15.0 — PROF-2 (working filters) + the `origin` prompt bias

**`origin` was coming back `introduced` for everything, and the prompt was the
cause.** Amanda spotted it 2026-08-30. The field description ended:

> "Relative to the San Francisco Bay Area, California. **Almost every succulent
> here is introduced.**"

That handed Claude the answer before it looked at the plant, which made the
field unfalsifiable. The prior was not even wrong on the facts — most of a
succulent collection in Concord genuinely is introduced — it was wrong as a
**method**, because it removed any reason to check the handful that are not.

Rewritten to ask the actual question, reason from the wild distribution (the
same knowledge `native_range` uses), and name the genera that really are native
here: Dudleya, several Sedum, some Opuntia and Yucca. It also states explicitly
that the field is **not** about wild-species-versus-cultivar — that is
`is_hybrid` / `parentage`. **Deployed: `suggest-species` v7 → v8.**

*Worth re-checking with Amanda:* if her mental model of `origin` is "wild plant
vs human creation" rather than "native to this region", the field is answering
a different question than she wants and the fix is a vocabulary change, not a
prompt change.

**PROF-2 — the list is now workable.** v2.14.0 shipped a true count, which on
133 taxa is a wall rather than a queue: a third of them are two fields short and
some have already been through Claude. Two filters, defaulting ON:

- **"Never asked Claude"** — needs suggestion history, which the app did not
  have: `suggestions` is loaded `status=eq.pending`, so accepted and dismissed
  rows (which prove Claude HAS been asked) were invisible. Added a second
  one-column fetch across all statuses into `state.taxaAskedIds`.
- **"At least N blank"** — any / 3 / 5 / 8 / 12, default 5.

The banner reads "Showing 34 of 118 incomplete, 84 filtered out", and each card
marks *Claude already asked*. **The tile keeps counting the true total**, so the
filters cannot hide work from the count — the filters are a working view, not a
redefinition of what is incomplete.

### v2.14.0 — PROF-1, species with unfinished profiles

**"Species profiles unfinished"** tile on To Do → filters the Plants tab to taxa
with blank fields, **emptiest first**, each card naming which fields are missing
rather than showing a bare count. A bare count sends her into the record to find
out which, and that is the trip the list exists to save.

**The completeness test is a PORT of `suggest-species`'s blank test, not a
second opinion.** If the tile counted fields Claude is never asked for, the
number could never reach zero and it would become another uncompletable count —
the fault NAME-4 and TODO-2 both had to correct. Consequences:

- **`common_name` and `cultivar` are not counted.** They are not in the Edge
  Function's `FIELDS`, so Claude never proposes them.
- **`parentage` and `is_hybrid` are only counted on hybrids** — a named
  cultivar, `is_hybrid` already true, a `×` prefix, or one of the nine
  nothogenera. 132 of 133 taxa have no parentage and for most that is correct.
- **Sentinels count as blank**: `origin = "unknown"` and
  `bloom_season = "not_observed"`, matching the Edge Function.
- **`frost_tender = false` is an answer, not a gap.** Only null counts.

**These are two halves of one rule and must move together.** `FIELDS`,
`SENTINELS` and `HYBRID_ONLY` in `suggest-species/index.ts` have counterparts
named `TAXON_PROFILE_FIELDS`, `TAXON_SENTINELS` and `TAXON_HYBRID_ONLY` in
`index.html`; changing one without the other desynchronises the tile from the
action that clears it.

Verified: an empty straight species reports **14 of 14** blank and is not asked
for parentage; a filled one reports **0** and drops off the list.

Expect a large number on first load — 133 taxa, and BACKLOG's 2026-08-28
measurement found only 13 complete.

### v2.13.0 — LOC-9, `holds_plants` contradicting its own type

**Reported from the app:** photos tagged to *Back Yard > Large Teal Ribbed Pot 3*
offered no way to assign plants. Cause: `locationHoldsPlants()` honours an
explicit `false` **in preference to** the type default, and the New location
form was saving an unticked checkbox as exactly that. A pot created without
touching that checkbox silently could not hold plants — `New plant from this
photo` is gated on `locationHoldsPlants(l)` (`index.html:5470`) and simply
vanished, with the only clue a subtle line reading "Plants are not assigned
directly here."

**The help text was actively false.** It said *"Containers get this
automatically."* They did not: the form saved the raw checkbox state.

Three write sites, two of them wrong:

| Site | Was | Now |
| --- | --- | --- |
| Quick-add | `(type \|\| "container") === "container"` | `typeHoldsPlants(type)` |
| New location modal | raw `.checked`, box unticked by default | box defaults on, follows the type select |
| Edit location | `.checked`, seeded from `locationHoldsPlants()` | unchanged (was correct) — now also follows the type select |

**The quick-add bug was wider than containers.** It stamped `false` onto every
**hospital, staging and work_area** created there, because it compared against
the single literal `"container"` while `locationHoldsPlants` has always
recognised four types. `PLANT_HOLDING_TYPES` is now the one source of truth.

**New queue tile — "Containers that hold no plants"** (`mistypedLocations`):
locations whose stored `false` contradicts their own type. This is how the
*other* instances get found, and it is deliberately a review list rather than a
migration — a container genuinely used as a staging shelf is a legitimate
`false`, and rewriting those silently would be the same class of mistake.

**Minor, not patch:** it adds a queue tile, which is a new capability.

### v2.12.2 — the cream/green button problem, fixed structurally

v2.12.1 fixed **one** button by adding `btn-on-cream`. That was not the fix, it
was a patch on one instance — so this audits all 66 `.btn-secondary` call sites
and moves the fix into CSS.

**A second live instance was already there:** the check-in bar's **"Checked
it"** on Plant Detail. `checkInSectionFor()` renders at `index.html:4805` inside
`.detail-body` → `.tag-card` → parchment, and `.checkin-bar` itself sets
`color:var(--ink)` (it expects a light background), yet the button inside it is
`.btn-secondary` — cream text on a pale pink bar. Invisible since the bar
shipped, and nobody noticed because you have to be due for a check-in to see it.

**The fix is scoped by ancestor**, so a call site cannot forget:

```css
.tag-card .btn-secondary, .task-row .btn-secondary,
.hover-card .btn-secondary, .checkin-bar .btn-secondary{
  color:var(--ink); border-color:rgba(37,41,37,0.2); }
```

Safe as a blanket rule: a `.btn-secondary` inside one of those containers is
broken **by definition**, so there is no correct-looking case to regress.
`.tag-card` has no dark sub-regions — `.card-media` and `.plant-list-thumb` are
`--parchment-dim`, `.detail-body` is `--parchment`. `btn-on-cream` still works
and is now belt-and-braces where already used.

**The other 64 sites are on the green screen and were always correct** —
screen-level headers, `.section-card` (which is `--bg-raised`, dark, despite
sitting on Plant Detail), modals (`.modal` is `--bg-raised`), Gallery, Settings.

**Not changed, worth a decision:** `.btn-ghost` is `color:var(--blue)`
(`#7CA7A1`), which on parchment is about **2.2:1** contrast — legible but below
any accessibility floor. Unlike `btn-secondary` it is genuinely visible, many
call sites already override it inline, and restyling it would change a lot of
screens nobody has complained about. Left alone deliberately; `on-cream-icon`
(`--moss-dim`) is the established fix where it matters.

### v2.12.1 — two rendering bugs in v2.12.0, one of them older

**The "Water N plants here" button on Location Detail was invisible.**
`.btn-secondary` is `color:var(--cream)` with a `--line` border — both designed
for the dark screen background. The location info panel is **parchment**, so the
button rendered as cream text on cream with an invisible border. `btn-on-cream`
exists for exactly this and I did not use it. Amanda found the button by
tapping blank space.

**Icons inside buttons had no size anywhere in the stylesheet.** An `<svg>` with
a `viewBox` and no `width`/`height` has no intrinsic size, so as a flex item in
`.btn` it took its default replaced-element size — the droplet on "Water 201
plants" rendered several hundred pixels tall and pushed the label into the
corner. `.icon-btn svg` constrained it, but only for buttons that opted in.

Fixed with a floor rule, `.btn svg{width:16px;height:16px}`, declared before
`.icon-btn svg` so opted-in buttons keep their 15px.

**This was not a new bug.** An audit of every `.btn` containing an `icon()` found
**three pre-existing call sites with the same fault**: "Import from Google
Photos" in the upload modal, the location card's "Add photos" (`photoPlus`), and
a `pin` button — all `btn ... btn-block` or `btn ... btn-sm` without `icon-btn`.
They are fixed by the same rule.

**The lesson for this file:** which background a component sits on is not
visible from the code, and `.btn-secondary` reads as neutral when it is not. On
the parchment panels — Plant Detail's info card, Location Detail's info card —
a `.btn-secondary` needs `btn-on-cream` and a ghost button needs
`on-cream-icon`.

### v2.12.0 — WATER-1 / WATER-2

**Watering tracking.** Table created by Amanda 2026-08-30; RLS policy added the
same day after the first `create table` sketch shipped without one (see
"Picking this up cold").

**Recording (WATER-1).** `openWaterModal(kind, id)` takes a *scope*, not a plant
list, so the confirm can say "34 plants — Front Yard, including everything
nested below it" rather than a bare count.
- **One plant** — action row on Plant Detail, and "Water it" on each row of the
  Needs watering queue.
- **A location and its whole subtree** — button on Location Detail.
  `plantsUnderLocation()` walks `descendantLocationIds()`, so watering Front
  Yard reaches buckets nested two levels down. Verified against a synthetic
  tree; inactive plants are excluded.
- **`watered_on` is the LOCAL day** (DATE-1). Watering at 6pm records as today.
- **One row per plant, one `batch_id` per run.** Upserted on
  `(plant_id, watered_on)` so watering an area and then topping up one pot in
  it merges instead of erroring against the unique index. Written in chunks of
  100 — a whole-collection run is ~170 rows.
- **Undo is per batch**, rendered on To Do until dismissed. `toast()` is
  text-only and gone in 3.2s, which is no use for undoing a 170-row mistake.
  Deliberately rendered *outside* `weatherBanner()`, which returns early when
  the forecast has not loaded — Undo must survive a dead weather API.

**Reading it back (WATER-2).**
- "Last watered" on Plant Detail (blank renders as a dimmed em-dash, per
  v1.38.0's rule), plus a short watering list with per-entry delete.
- Location Detail carries a rollup — "all watered 3 days ago", "mixed — oldest
  12 days", "2 of 9 never watered". Not an average: a mean would bury the one
  pot nobody has touched in a month.
- **Needs watering** tile in the work queue. **Never watered sorts above
  everything** — unknown is not the same as freshly watered.

**The weather tie-in is live.** `effectiveWateringInterval()` shortens the base
interval to 60% under heat (floor of 2 days) and multiplies it by 1.5 after
≥0.25″ of rain. Measured: base 7 → **4 under a 99°F day** → **11 after 0.40″ of
rain** → 6 with both. The reason is always named next to the number, in the
modal and in Settings — this nudges a threshold, it does not decide anything.
The heat card on To Do now links straight to the due list.

**Not built: W-3, the calendar.** Droplets on a month grid. The watering list on
Plant Detail is capped at 6 entries precisely because the calendar is where the
full history belongs.

### v2.11.1 — DATE-1

**Every date-only value in the app rendered a day early.** `fmtDate` did
`new Date("2026-09-01")`, which JS parses as **UTC midnight** and then renders
in local time — so anywhere west of Greenwich, Concord included, the date shown
was the previous day. Care-note dates, bloom starts, `date_acquired`, task due
dates and `next_check_date` were all wrong, silently, for the life of the app.
Found by test while building WEATHER-1, not by eye — which is why it survived
this long.

- `fmtDate` re-parses **only** anchored date-only strings (`^\d{4}-\d{2}-\d{2}$`)
  as local. A timestamptz already carries a zone and is left alone.
- `todayISO()` now returns the **local** calendar day. It was
  `new Date().toISOString().slice(0,10)`, so after 5pm Pacific the app believed
  it was already tomorrow: a task due today read as overdue, and the recheck
  date input would not let you pick today. Verified it is never written to the
  database — all eight call sites are comparisons against `date` columns plus
  one `<input type="date" min>`, and every one wants local.
- `localDateISO()` (added by WEATHER-1) is now the single implementation;
  `todayISO()` delegates to it rather than the two coexisting.

**Patch, not minor:** this is fixing something that shipped broken.

Amanda's standing preference, stated 2026-08-30: **local date and time**.

### v2.11.0 — WEATHER-1

**Frost and heat banners on To Do, from two keyless APIs called straight from
the browser.** No Edge Function, no secret, and **no migration** — the
coordinates and thresholds are rows in `app_settings`, which already existed.

- **Open-Meteo** (`api.open-meteo.com/v1/forecast`) — 7-day min/max temp and
  precipitation. Asked for `temperature_unit=fahrenheit&precipitation_unit=inch`
  and `timezone=auto`, so there is no unit or timezone conversion in the app.
- **NWS** (`api.weather.gov/alerts/active?point=`) — the named advisories a raw
  number cannot express (Frost Advisory, Heat Advisory, Extreme Heat Warning).
  A named event **overrides the numeric threshold**: NWS saying "Frost Advisory"
  at 41°F beats the app's own 38°F line.
- Banner renders above the work queue. The frost card's payoff is its button
  into the existing **frostTender** report, which was already sorted by location
  path as a walking route through the garden. That report existed and was unlit.
- Quiet strip ("83°F / 56°F today · updated 5:05 PM") renders when there is no
  risk, so *no banner* is distinguishable from *the fetch failed*.
- Settings → Preferences holds coordinates, the three thresholds, and a manual
  refresh. Defaults are Concord, CA (37.9779, −122.0311).
- Cached in `localStorage` for 3 hours; `loadWeather()` is called unawaited at
  the end of `loadAll()` and gates itself on staleness, so it is not a request
  per save. A failure renders nothing rather than breaking To Do.

**Frost watch defaults to 38°F, not 32°F.** Reported lows are measured at 2m,
and on the still clear nights that actually produce frost, bucket level runs
several degrees colder. Tunable in Settings.

**NWS User-Agent gotcha — verified 2026-08-30.** `api.weather.gov` returns
**403 to a blank User-Agent** and 200 to a browser's own. So this works from the
app and would **NOT** work from an Edge Function unless that function sets a
User-Agent explicitly. Do not "move it to the backend" without reading this.

**Known limit: the frost count includes plants already brought inside.**
`LOCATION_TYPE_LABELS` has no indoor/outdoor distinction (`indoor` was defined
and went unused), so nothing can tell a sheltered location from an exposed one.
The existing frostTender report has the same blind spot, so this is not a
regression. A `sheltered` boolean on `locations` would fix it — a small
migration, not yet proposed.

**The heat→watering tie-in is not built.** It needs W-1/W-2 to exist before it
can shorten a watering interval; today the heat card is advisory only.

### v2.7.1
**Full code audit — 374 functions, 9,593 lines.** Fourteen checks, drawn from the
failure shapes this session actually produced.

**One real bug.** `linkPlantToLocation()` — "Link existing plant" on a location
page — wrote a **`plant_locations` row** when the plant already had a location,
quietly recreating the many-to-many **SPECIES-2 retired**, so a specimen could
appear in two places at once. Linking a plant that lives elsewhere *is a move*:
it now sets `location_id`, the trigger records it, and it appears in "Where it
has lived". No `plant_locations` insert remains anywhere.

**Dead code removed — 86 lines.** `attachPhotoToExistingPlant`, `detailRow`,
`groupPhotosByLocation`, `state.tagLocationSearch`, the `attach` alias left by
the v1.85.0 merge, and the **`addPlantLocation` modal** — the multi-location
workflow SPECIES-2 retired — which orphaned `suggestedLocationsForPlant` with it.

**Silent failures made audible.** `.catch(() => null)` on optional loads cannot
tell "table not created yet" from "this query is malformed", which is exactly how
the `app_settings` paging bug hid for twelve versions. A new `optional()` wrapper
keeps the resilience and logs anything that is **not** a missing-relation error,
naming the table.

**Clean:** no duplicate function names, no orphans, balanced markup, every modal
opened has a branch and every branch is reachable, no code reads a dropped
column, the z-index ladder is ordered, no unsized icons, no raw `JSON.stringify`
in an attribute, and every `restGetAll` pages on a key its table actually has.

Two checks flagged false positives worth recording so they are not re-chased:
`walk` and `importOne` are local recursive helpers correctly scoped inside their
parents, and `.hover-card` paints `--ink` on a **cream** background.


### v2.7.0
**AI-3 layer 2 — catch a duplicate by photo, in the form that would create it.**
Layer 1 (v1.83.0) catches a duplicate by NAME as she types. This catches one by
PHOTO, at the only moment it can still be prevented.

**Two sources, cheapest first.** Specimens already at the photo's location come
first — deterministic, free, no call, and usually right, the same reasoning
FILE-1 uses. Claude's `plant_tag` suggestion is offered alongside when
`suggest-photo` has already run. **A duplicate is often caught before Claude is
asked at all**, and when there is nothing to match against the form says so and
offers the ask rather than leaving her to guess.

A candidate Claude names that is already at the location is not listed twice.
Every candidate carries the v2.3.0 hover card, so the plant can be seen before
committing.

**No Edge Function change and no deploy** — `focus: "plant"` has existed since
v1.82.0 and its suggestions were already stored. What was missing was surfacing
them **where the duplicate gets made**. Three times today a feature turned out to
be built but unreachable; this is the fourth.

10 assertions: location candidates, no location, a Claude suggestion, the
overlap case, an unknown photo, and a non-plant suggestion.


### v2.6.1
**Two bugs from the last two ships, both visible in one screenshot.**

**The Plants header rendered twice.** v2.1.0's `screenHeader()` added the counts
and the +Batch / +New Plant buttons, and the row that used to carry them was
left in place below the search. Only the *filtered* count was unique to it —
"12 of 126 kinds match" — and that now lives in the header. Audited the other
four list screens; none had the same leftover.

**Every screen sat scrolled sideways.** The hover card from v2.3.0 is
`position:absolute` on `<body>` and was hidden with `visibility:hidden` — which
still occupies the scrollable area. A card last shown near the right edge left
the document wider than the viewport, so the whole app appeared shifted left
with the logo and titles cut off. It parks off-canvas when closed now, and
`overflow-x:hidden` on the page guards against the next stray wide element,
since nothing here is meant to scroll sideways at page level.

**Both are the same failure**: an element that is invisible is not necessarily
absent. `visibility:hidden` hides pixels, not layout.


### NAME-1 — CLOSED 2026-08-28

Both leftovers resolved. The names were **already corrected** by Amanda's own
cleanup before this session looked at them — the backlog note saying otherwise
was a day stale, and the evidence was sitting in a query she had already run:
the 105-species listing composed names from parts first and printed
`Echeveria 'Purple Perle'` rather than the cross formula, which it could only do
if the free text had already been fixed.

What was genuinely missing was the **pedigree**, discarded when the name was
corrected. Restored into `taxa.parentage`:

- *Echeveria* 'Purple Perle' ← *E. gibbiflora* 'Metallica' × *E. elegans* 'Potosina'
- *Kalanchoe* 'Roseleaf' ← *K. tomentosa* × *K. beharensis*

These are the **first two real uses of `parentage`** — a column that existed
unused in the database until v1.83.0 wired it up, and had no data until now. It
shows on the species page's Taxonomy card, so the cross lives on the record
instead of in a backlog note.

**Lesson, and the second time today:** a note saying "unconfirmed" is a claim
with a date on it. Amanda's cleanup outran the notes twice — check the database
before quoting the backlog back at her.


### v2.6.0
**"In bloom now" left To Do.** It sat under *Records to finish*, and it is not a
record to finish — nor work of any kind. **It is a status**, and To Do is for
things that need doing, which was the whole principle of the rebuild. The
Gallery's In Bloom row is where you look at what is flowering, and **"Blooms
still open"** already carries the actionable half. Its drill-in view and the
now-dead branch in `reportRowActions` went with it.

### SPECIES-1 — CLOSED 2026-08-28
**The column drop ran.** `plants` is now 21 columns and every one is
specimen-level: accession, taxon link, location, status, health, next check,
acquisition, provenance, notes, timestamps. The 16 species fields are gone.

The epic opened 25 August is finished — taxa split from specimens in v1.41.0,
the code pass in v1.65.0, and the drop today. **SPECIES-2 closes with it**, the
column drop being its only outstanding step.

**The drop statement had a bug worth recording.** It listed
`drop column if exists light_conditions` — the **taxa** column name. On `plants`
the column is `light_requirements`, so `if exists` matched nothing and skipped
it silently. Written in v1.65.0 by reading the taxa field list rather than the
plants one. Cleaned up with a follow-up statement; the column was dead either
way, referenced only as a CSV **header string** whose value comes from
`taxa.light_conditions`.

**`if exists` makes a mistyped column name silent.** Worth naming: it protects
against a rerun, and it also hides a typo.


### v2.5.1
**SCROLL-1 — the scrollbars looked like a UI element, not a hint.** The browser
default is a heavy white slab against this palette, and on the Gallery's
horizontal rows it sat under every strip competing with the photographs.

Thin bars in the palette everywhere, with an inverted thumb on cream surfaces
(modals, cards, the filing strips) where a light one would vanish. Standard
`scrollbar-width` / `scrollbar-color` plus the `::-webkit-` rules Safari and
Chrome still need.

**The Gallery rows go further:** the bar is hidden until the row is hovered,
because those scroll by drag or wheel — the bar was never the control. A soft
fade at the right edge says "there is more" better than a scrollbar does.

Kept the row-specific rules **beside** the `.gal-scroll` rule they modify rather
than with the global block. Styling for one element living in two places is what
caused the v1.37.1 media-query bug, and there is no reason to repeat it.


### v2.5.0
**NAME-3 — new species now arrive with their parts filled in.** Amanda: every
plant she adds lands on the "Names not split up" list, so the cleanup never
finishes. She was right about the cause — `ensureTaxonForName()` wrote only
`botanical_name` unless `parts` were passed, and the only caller that passed
them read the New Plant form's **collapsed "More details" fields**, which are
almost always left blank. 61 of 105 records had no genus; the list grew with
every addition.

**The name already contains the parts.** `parseBotanicalName()` reads them:
genus, epithet, infraspecific rank, cultivar, and the hybrid sign. It sits
inside `ensureTaxonForName()`, the single choke point every creation path goes
through — the New Plant form, batch entry, and "New specimen here" — so all
three benefit and none needed changing.

**Deliberately refuses to guess.** A token becomes an epithet only if it is
lowercase, which is the botanical convention; a cultivar only if it is quoted.
So `Echeveria Agavoides` yields a genus and **no epithet** rather than baking in
a miscapitalisation, and `unidentified cactus` parses to nothing at all. What it
cannot read confidently is left to NAME-2's Claude pass, because **a wrong genus
is worse than an empty one**. Explicitly-passed form fields still win over the
parse.

This stops the list growing. It does not shrink it — the existing records still
need NAME-2, which is what Amanda is working through.

17 assertions, drawn from her own names: cultivars in straight and curly quotes,
`Sedum × rubrotinctum`, `Kalanchoe x houghtonii`, `var. erinacea`, `f. palmeri`,
the miscapitalised `Agavoides`, the misspelled `Echerveria`, a working label,
and empty input.


### v2.4.1
**The Pl@ntNet comparison opened behind the photograph.** `.modal-backdrop` was
`z-index: 50` and `.lightbox-backdrop` was `80`, so any modal opened from inside
the lightbox rendered underneath it. The compare badge is *in* the lightbox, so
it could never be seen.

**LAYER-1: the stacking order is now written down** in the stylesheet, because it
was ad-hoc and two of the numbers were wrong:

```
 28  bulk action bar        80  lightbox
 30  bottom nav             90  modal   — ALWAYS above the lightbox
 60  task banner           100  reference-image overlay
                           110  hover card
                           120  toast   — errors readable over anything
```

**Two latent bugs found by writing it out.** The reference-image overlay set
`z-index: 60` — *below* the lightbox — so enlarging a Pl@ntNet reference photo
would have opened it behind the picture too. And the toast sat at 100, level
with that overlay, so an error raised while it was open could have been hidden
underneath. Both are the same fault as the modal: a number picked because it
worked at the time, against a scale nobody had written down.

Modals stay **above** the lightbox rather than closing it, deliberately: several
are opened from inside it, and the photograph behind is the thing you are
comparing against.


### v2.4.0
**TODO-3 — completing a task put the plant straight back on the urgent list.**
Amanda made a task for each plant needing attention, did the work, marked them
done, and they reappeared immediately. v2.0.1 made an open task hide a plant
from the queue — but completing the task removed the only thing keeping it
quiet, and the plant is still marked urgent because **finishing the task does
not make it well**.

The missing step was hers exactly: *complete the task and say when to look
again.*

**One field, one meaning.** `plants.next_check_date` already existed and already
governed the check-in queue; it now silences **"Plants needing attention"** too.
"Look at this plant on this day" is one idea, not two.

Completing a task whose subjects are still unwell now asks **when to look
again** — a week, a fortnight, a month, or a date — showing each plant with its
photo and current health so the answer is informed. Declining is an explicit
*"leave it on the list"*, not a cancel, because "keep nagging me" is a real
answer.

The same **Check again…** action is on every attention row, so a plant can be
deferred without inventing a task first.

8 assertions: the full make-task → complete → recheck cycle, plus a date in the
past, a date today, a cleared date, and a healthy plant.


### v2.3.1
**The Pl@ntNet suggestion was invisible in the lightbox.** The badge rendered
"PLANTNET" and "— compare →" with a **gap where the species name should be** —
the one part that matters.

`.ident-badge` sets `color:var(--ink)`, correct on the cream cards it was
written for and invisible against the lightbox's near-black surround. The source
label and the compare link survived only because they set their own colours.
An `.on-dark` variant now carries cream text and a stronger border.

**Third time this exact trap has bitten today** — the Plants filter banner used
`.on-cream-ground` on the dark page, and now this. A class named for the surface
it was designed against will be reused on a surface it was not. Swept the
stylesheet for other classes named after a dark context that paint `--ink`;
there are none.


### v2.3.0
**HOVER-1 — see the plant before you trust the suggestion.** Amanda's point
about the filing screen: it says "the only plant here is *Curio peregrinus*" and
asks you to file four photos on that basis, with no way to check it is really
that plant without leaving the page.

Hovering a specimen name now shows a card: cover photo, name, common name,
location, photo count, check-in state and health.

**Deliberately outside `render()`.** The card is built once, lives outside
`#app`, and is filled by direct DOM writes. Routing it through state would
rebuild the entire page on every mouse movement — exactly what PERF-2 was fixed
to stop. The listener is **delegated from `document`**, so it survives every
re-render and any element can opt in with `data-plant-card="<id>"`. Nine places
do so far: the filing suggestions, the candidate buttons, and task subject
chips.

The cover photo is fetched through `ensurePhotoLoaded()` like every other image,
so it patches itself into the card when it lands rather than blocking it.

Pointer events only. A touch device gets whatever tap behaviour the element
already had, which for the filing suggestion is "open the plant".

**A self-inflicted break worth recording:** the insertion duplicated its own
anchor line, producing
`function bloomPhotosFor(plantId) {function bloomPhotosFor(plantId) {` and a
file that would not parse. The syntax check caught it, but only a per-function
bisect found *where* — "Unexpected end of input" points at the last line of the
file, never at the damage.


### v2.2.1
**"File all 4" answered "Pick some photos first".** A **name collision**:
`assignPhotosToPlant(plantId)` already existed for the bulk-selection flow, and
v2.2.0 added a second function with the same name. The later declaration wins,
so the group button silently ran the selection version with an array where it
wanted an id — and that version, finding no selection, refused.

Renamed to `fileGroupToPlant` / `fileGroupToLocation`, and rewritten to use the
existing chunked `id=in.()` pattern rather than one request per photo, which is
both faster and what `applyGalleryBatch` already does.

**Third name collision in one session** — after a duplicate `endBloom` and a
duplicate `startBloom`. In an 9,000-line single file, adding a function without
checking the name first is a reliable way to shadow a working one, and the
failure is silent: no error, just the wrong function running.

**Check before adding:**
```
grep -oE "^(async )?function [a-zA-Z0-9_]+\(" index.html | sed 's/^async //;s/function //;s/(//' | sort | uniq -d
```
Empty output means no duplicates. This is now clean.


### v2.2.0
**FILE-1 — the filing queues answer their own question.** Amanda: "Needs a
plant" was 95 photographs in a grid, which is the same question asked 95 times.
Her insight is that the answer is usually already in the data — a photo filed to
Bucket 17 showing an unnamed plant, where **Bucket 17 holds exactly one
specimen**, is almost certainly that specimen.

**Deterministic, not a guess.** No AI, no cost, no accuracy question. The two
queues that have a knowable answer now group by the thing that answers them:

- **Needs a plant** groups by **location**. One specimen there → it says so and
  files the whole group in one tap. Several → it lists them, each one tap.
  None → that is a different job, and it offers *Add a specimen* instead of
  leaving you stuck.
- **Needs a location** groups by **plant**, because the specimen already knows
  where it lives. One tap per plant, however many photos.

Groups with a confident answer sort first, and the header counts how many
photos can be filed in a single tap — so the size of the quick win is visible
before you start.

"Could show a specimen" still routes to the Gallery: those are archive and area
shots where browsing genuinely is the point, and there is no location to infer
from.

13 assertions covering one candidate, several, none, an already-filed photo, and
a plant with no location of its own.


### v2.1.0
**HEAD-1 — one header on every screen.** Five list screens had five shapes:
To Do's title lived in the **global top bar**, Plants had no context line and
put its counts *below* the controls, Locations had a title and an action but no
context, Settings had a bare title, and only the Gallery carried the full set.

`screenHeader(title, context, actions)` fixes the order everywhere: **title and
its actions, then one line of context, then the controls.** Actions sit beside
the title because they are things you do *to* the list; search and filters sit
below the context because they change what the list *shows*.

Each screen gained a context line it did not have: Plants now says "105 kinds ·
167 specimens" at the top rather than buried under the search, Locations says
how many places and how many top-level areas, Settings carries the version.

**To Do's title came out of the top bar.** That was the whole reason it was the
odd one out — the global bar is now brand and controls on every screen, and To
Do renders its own header like everything else, Select button included.

**Two orphans found while doing it.** `screenPlants()` — the old flat specimen
list — has been **unreachable since the taxa split** made the Plants tab browse
species; nothing routed to it. Its `plantFilters` modal was orphaned with it,
along with `state.plantSearch` and `state.plantFilters`. 78 lines of code that
could not be reached, plus the now-unused `.inbox-subbar` style.


### v2.0.2
**The back link wrapped onto two lines.** v1.99.0 made the label the *place* it
returns to rather than always a tab name — which is the point, but it means the
label can now be long: "Names to split", a bucket name, a quoted search.
"Names to split" broke beside its chevron and read as two loose words.

One `.back-link` class replaces the same inline style repeated at **six** call
sites, with the label in its own span that never wraps and truncates with an
ellipsis instead. Larger chevron, tighter gap, consistent opacity.

First ship under the numbering rules agreed today: a fix to something that
shipped wrong, so a patch.


### v2.0.1
**"Make a task" did not clear the count it was supposed to clear.** Amanda made
tasks for two plants and they stayed in "Plants needing attention" — so the
escape hatch for a count that cannot be cleared escaped nothing.

A record with an **open task about it is being handled**, and now leaves the
queue. Applied to attention and check-ins, the two prompts where "I have
planned what to do" is a real answer. **Self-correcting rather than a
dismissal:** complete or delete the task and, if the plant still needs looking
at, it comes straight back — so nothing can be hidden permanently by accident.

Nothing vanishes silently either: the drilled-in list says "*N more have tasks*"
and explains why they are not counted.

**Also fixed: "Nothing waiting" was printing under a queue showing 2,139 photos
to file.** It means "no *unfiled* photos", a far narrower claim than it read as.
Now "No unfiled photos — everything you have uploaded is filed."

**Version numbering is now written down** in `CLAUDE.md`, after Amanda
challenged v2.0.0. She was right, and more so than she knew: **fifteen ships
have carried schema changes as minor bumps** (v1.36.0 through v1.93.0), so
"schema change = major" was never this project's practice and v2.0.0 for a page
layout fit no rule at all. Recorded: patch for fixes, minor for features **and
schema additions**, major only when the collection's *model* changes or she has
to work differently. Also recorded that 1.100.0 legitimately follows 1.99.0 —
avoiding a three-digit minor is not a reason to bump the major — and that
versions are never renumbered downwards.

7 assertions on the task-clears-the-queue behaviour.


### v2.0.0
**TODO-1 — the To Do page becomes a place to work, not a report.** Amanda's
framing, and all four of her observations were right.

**Tasks moved to the right**, beside the queue at 1100px and above, with New
task at their head. Neither list pushes the other off the first screen now.

**Six groups became three.** She spotted that "Species names" is a records job;
Claude's suggestions are something waiting on her, which is what "Needs you
now" means; and Bloom was two status readouts filed as if they were work.
Grouped by *when she acts*, not by which table the row came from.

**Zero tiles are gone.** They used to render greyed, so the page was a list of
categories rather than a list of work. An empty To Do now reads as "nothing
outstanding" — with a real empty state saying so.

**"Six plants need attention" can now be acted on.** Her point: a red count that
cannot be cleared stops being read. Each queue row carries the actions that
would resolve *it*, and they differ per view because "needs attention" and
"should be blooming" are cleared by different things — Healthy again, To
hospital, Checked it, Remind me in 14 days, Record a bloom, It has finished,
Set a location. Every view also offers **Make a task**, so a row can be dealt
with honestly when the answer is "not today".

**Bloom became two real prompts.** "Should be blooming" gains *Record a bloom*
and clears itself when the season passes, so it needs no dismissal to store.
"Blooms still open" is new and is a data-quality fix as much as a prompt: a
bloom recorded in March and never closed makes the Gallery's In Bloom row lie.
The window comes from `bloom_season` rather than one number that would be wrong
for both a five-day Echeveria and a months-long Aeonium — 12 weeks for a full
season, 7 for early/late summer, 16 for `not_observed`, and **never** for
`intermittent` or `monocarpic`.

**A duplicate I nearly shipped:** `startBloom()` and `endBloom()` already
existed, with date validation and a location snapshot. An earlier pass in this
same session added a second, cruder `endBloom` without checking. Removed; the
rows call the real ones, which fall back to today when there is no modal field
to read — exactly right when she is standing in front of the plant.

12 assertions on the bloom windows.


### v1.99.0
**NAV-1 — Back now means back.** Amanda, working the 61-name cleanup: filter the
Plants list, open a species, and Back dropped the filter *and* the scroll
position. Every single record meant re-filtering and re-scrolling. Her words:
"that #1 is HUGE."

Back was never really a back button. Taxon Detail hardcoded `goTab('plants')`.
`state.backTo` existed but **only the work queue ever set it**, and it
remembered a tab and a label — not a filter, not a search, not where you were on
the page.

`state.navStack` now holds a snapshot per level: which list, which filter, what
was typed, and the scroll offset. `navBack()` restores all of it and scrolls
back to where you were, on a `requestAnimationFrame` so the DOM exists first.
Capped at 12; `goTab()` clears it, because a tab is a fresh start.

**The button also says where it goes** — "Names to split", "Bucket 18",
"&ldquo;echeveria&rdquo;" — rather than always naming a tab. A back button that
names its destination is one you can trust without trying it.

Retired `state.backTo`, `goBackTo()` and the two places that set them by hand;
`openPlant` / `openTaxon` / `openLocation` snapshot for themselves, so every
route in gets a route out for free.

**Also fixed: the filter banner was invisible.** v1.95.0 used
`.on-cream-ground`, which sets dark ink and supplies **no background** — it
exists for use inside a cream card. On the dark Plants page it was dark on dark.
Now a `.filter-note` with its own background.

13 assertions, including the filter surviving a round trip and a two-level path
back out.


### v1.98.0
**PERF-2 — the blinking.** Amanda asked whether it was a hosting limit or the
2,664 photos. Neither. Three causes, all fixed; she reported To Do as the worst
screen, which turned out to be the third and largest.

**1. Typing rebuilt the page.** Eleven `oninput` handlers called `render()` on
every keystroke, and `render()` replaces `app.innerHTML` wholesale — one
character in the Gallery search destroyed and recreated every node on screen,
images included. State still updates immediately; the repaint is coalesced to
90ms after typing pauses.

**2. Eviction threw away pictures that were on screen.** `PHOTO_CACHE_LIMIT` was
180 blob URLs against 2,664 photos, evicted in pure insertion order. Scrolling a
gallery revoked images still being displayed, which then refetched through the
Edge Function. Now 600, and eviction **skips anything currently rendered** — if
the whole window is live it holds extra rather than blanking the page.

**3. Every photo arrival could trigger a full re-render — this was the To Do
blinking.** `ensurePhotoLoaded()` patches the waiting `<img>` in place (PERF-1)
and falls back to `debouncedRender()` when nothing is waiting. Cause 2 fed it:
an evicted-but-still-displayed image kept its `src` attribute pointing at a
revoked blob, so it never matched "waiting", and **every arrival fell through to
a full rebuild**. On a photo-dense screen that is a rebuild every few hundred
milliseconds. The fallback now fires **only when the lightbox is open** — the
one caller that renders its `<img>` from state rather than a placeholder.

**A bug caught by the tests:** the rewritten eviction could revoke a blob while a
duplicate entry for the same id was still queued, leaving an id in the cache
queue with a dead URL — precisely the state that caused cause 3. 13 assertions,
including the invariant that every queued id still has a live blob.


### v1.97.0
**Settings had become a wall.** Six full-width cards, every one expanded, most of
them set once and never touched again.

Now: **Google Drive stays open and first** — its access expires roughly weekly,
so it is the only thing here she has to come back and act on. Everything else
collapses into named sections: **Your data**, **Preferences** (check-in interval
and the dropdown lists), **Account**.

**"Photo capture dates" is gone unless there is something to repair.** Amanda's
words: "I don't even know what that is there." Fair — it was a permanent card
reading "Every photo has a capture date", explaining a problem that no longer
exists. **A finished repair job is not a setting.** It now appears only when
photos are actually missing dates or a job is running, with a count badge and
copy that explains what the repair *does for her* — puts a photo in the right
place on a plant's timeline — rather than describing EXIF.

**Removed a note that had been false for months:** "sessions aren't remembered
across page reloads yet — you'll need to sign in again if you refresh."
`loadStoredSession()` has restored the session on boot since session persistence
shipped.

The Data section also now says plainly what a restore will and will not do: it
adds and updates by id, never deletes, and **cannot bring back a dropped
column** — which matters this week.


### v1.96.0
**The JSON backup could not run at all** — `column accession_counters.id does
not exist`. Found at the worst possible moment: Amanda was taking the backup
that stands between an irreversible column drop and losing data.

`restGetAll()` hardcoded `id` as its paging tiebreaker. Paging needs a stable
key or rows repeat or vanish between pages, but **two tables have no `id`**:
`accession_counters` is keyed on `year` and `app_settings` on `key`. The key is
a parameter now, and every one of the 17 tables it is called with was audited —
those two are the only ones.

**The second one had been failing silently since v1.84.0.** `app_settings` is
loaded with `.catch(() => null)`, so the error was swallowed and
`state.appSettings` was **always `{}`** — the check-in interval fell back to 14
on every load no matter what was saved, and Settings displayed 14 back because
it reads the same empty map. Saving worked; loading never did.

**The defensive catch that made the app resilient to a missing table also hid a
bug for twelve versions.** A `.catch()` that swallows every error cannot tell
"this table does not exist yet" from "this query is malformed".

7 assertions on the paging keys, including that an existing `order=` clause
still gets the tiebreaker appended and never duplicated.


### v1.95.2
**Batch entry could not create a new species** — `ensureTaxonForName is not
defined`. It was defined **inside** `wireModalForms()`, so it existed only while
that function was running. Every form handler closed over it and worked, which
is why this went unnoticed since v1.65.0; `createBatch()` calls it from outside
and got nothing.

Hoisted to module scope. Checked for siblings — no other function nested in
`wireModalForms` is called from outside it.

**Pattern worth noting:** a helper defined inside a wiring function works for
everything wired there and fails for everything else, and the failure is a bare
ReferenceError at click time rather than anything visible at load.


### v1.95.1
**"Add X as a new species" in batch entry did nothing.** A quoting bug in
v1.89.0: the handler was built with `JSON.stringify(state.batchSearch)`, which
emits **double** quotes — and the attribute is double-quoted, so the name closed
it. The rendered handler was `addBatchRow(null, ` followed by loose text: a
syntax error, so the click did nothing at all. Silent, because a broken inline
handler throws in the browser console rather than in the app.

Now `escapeAttr()`, which exists for exactly this and was already used for the
Pl@ntNet reference images. Swept the file for the same pattern elsewhere — this
was the only one. 8 assertions covering apostrophes, double quotes,
backslashes, curly quotes and a pasted newline.

**Worth remembering: never `JSON.stringify` into an HTML attribute.** Single
quotes plus `escapeAttr()`.


### v1.95.0
**NAME-2 — Claude checks the name and splits it into parts.** Amanda asked
whether the app could suggest the name corrections rather than her typing seven
by hand. It can, and most of the pipeline already existed: the accept handler
does `restPatch("taxa", {[sg.field]: v})`, so it has always been able to write
any taxa column.

What was missing was that `suggest-species` only ever asks about **blank**
fields — "anything she has filled in is hers" — which is exactly why a
misspelled name could never be corrected. A new `focus: "name"` mode inverts
that for the name parts only, and every result still arrives as a suggestion to
accept or dismiss; nothing is written behind her.

It returns `genus`, `species_epithet`, `infraspecific`, `cultivar`, `is_hybrid`,
a corrected `botanical_name` and `family` — and **only where the value differs
from what is stored**, so a suggestion never just confirms the status quo. Case
counts as a difference, because `Agavoides` → `agavoides` IS the correction.

The prompt is told to leave a name it does not recognise alone rather than
inventing a plausible replacement, and that a working label like "unidentified
cactus" is not an error.

**A bug this would have shipped with:** the accept handler special-cased
`frost_tender` as a boolean because `suggestions.value_text` is text. `is_hybrid`
needed the same treatment or it would have been written as the **string**
`"false"`, which is truthy — every hybrid flag set, permanently. Now a
`BOOL_FIELDS` list.

Also added: a **"Names not split up"** queue tile and matching Plants filter, so
the 61 records with no genus, epithet or cultivar are findable rather than
hunted for. 12 assertions.

**Deployed and confirmed working by Amanda 2026-08-28.**


### v1.94.0
**STALE-1 — the app now tells you when the tab is running old code.**

GitHub Pages serves `index.html` from cache, so a deploy can be live while an
open tab still runs the previous build. That cost real time on 28 Aug: a
`PGRST303` was investigated as a token bug through several rounds when the tab
simply predated v1.93.0's fix. The version in Settings only helps if you think
to look at it, and you only think to look once you already suspect it.

On boot the app fetches its own page past the cache (`?v=<now>`,
`cache: "no-store"`), reads `APP_VERSION` out of it and compares. If the server
is ahead, an orange banner says so and reloads on tap. Not awaited, so a slow or
failed check never delays startup, and it fails silently when the file cannot be
fetched.

The banner names both versions and warns that saving may fail until reloaded —
which is the actual symptom, and the thing that makes the connection.


### v1.93.0
**SESSION-1 — the access token was only ever refreshed on a full reload.**

`ensureFreshSession()` was called in exactly **one** place: inside `loadAll()`.
So sitting on a form for longer than the token's life meant every write failed
with `PGRST303 "JWT expired"` and nothing in the app recovered — the only cure
was reloading the page. Amanda lost an edit to a species name that way.

Every authenticated request now goes through `authedFetch()`, which refreshes
before the request when the token is near expiry and, if the server still says
the JWT is expired, forces a refresh and retries **once**. Headers are built from
a factory rather than passed in, because a retry that reuses the original headers
resends the dead token.

**15 call sites**: all five REST helpers plus every Edge Function call
(`upload-photo`, `drive-oauth-start`, `get-photo` ×2, `identify-plant`,
`suggest-photo`, `suggest-species`, `photos-picker`). The two `/auth/v1/` calls
are deliberately NOT wrapped — they mint the token, so wrapping them would
recurse.

`isExpiredAuth()` matches a 401 or a `PGRST303` / "JWT expired" body, and
deliberately does **not** match other 4xx: a `23514` constraint failure must
surface as itself rather than being retried and masked. 8 assertions cover that,
including Amanda's exact error body.


### v1.92.0
**You could not pick an existing species when creating a plant from a photo.**

"New specimen here" (from a Location) has offered a species list since it was
built. "New plant" — the form the Gallery and Inbox open — never did. It had two
free-text name fields and relied on the AI-3 fuzzy match to notice you meant a
species you already had.

That is fragile in one specific way Amanda hit: **the match fails when the
stored name has a typo.** Her existing record is `Echerveria Agavoides
'Lipstick'` (an r too many). Typing the correct `Echeveria Agavoides 'Lipstick'`
matched nothing, and the near-miss list could not offer it either, because
`similarTaxaByName()` compares the genus token and `Echerveria` ≠ `Echeveria`.
So the app proposed creating a **second** species record for a species she
already had.

The form now leads with **search and pick an existing species**, showing each
candidate's specimen count, and falls back to naming a new one underneath.
Picking is exact — no name matching involved — so a typo in stored data cannot
hide a species from you.

**Data note for Amanda:** `Echerveria Agavoides 'Lipstick'` is misspelled and
carries at least two specimens (ABG-2026-0098, ABG-2026-0102). Worth fixing on
the taxon record; the specimens follow automatically since they link by id.


### v1.91.0
**LOCFIELD-1 — one location field, and the second half of a v1.85.0 regression.**

Amanda hit the flat `<select>` of all 157 locations while creating a plant from
the Gallery. It was not one stale form: **eight forms used the flat select while
only four used the real picker** — searchable, hierarchical, with recents and
create-as-you-go.

`locationField(prefix)` now covers the five plant-location forms: New plant, Edit
plant, Add specimen, Propagate, and Batch. Staged like the edit-photo one, so
choosing never submits the form underneath her. Two flat selects stay on
purpose: the picker's own **location filter** (a filter wants a select) and the
Gallery batch editor, whose "leave unchanged / remove location" is a three-state
field the staged control cannot express.

**The `— None —` was a regression, not a default.** The Gallery's old New-plant
button seeded the form with the photo's own location whenever that location
expects plants. v1.85.0's shared action row only passed a location in `location`
mode, so from the Gallery it passed nothing — and a photo filed to Copper
Rectangle Planter 1 opened the form pointing at None.

**The tell was already in the file.** The comment explaining that behaviour —
"the photo's own location is offered as the default only when that location
actually holds plants" — survived at line 4777, describing code that had been
deleted. Same shape as v1.90.2: the consolidation kept the prose and dropped the
behaviour.

Also restored: `ns-location` carried `required` on the `<select>`; a staged field
cannot, so the check moved into the submit handler rather than silently creating
a homeless specimen.

10 assertions on the field helpers.


### v1.90.2
**Pl@ntNet suggestions were invisible in the Gallery — a v1.85.0 regression.**

Two different things were being conflated. Claude's *filing* suggestions live in
`suggestions` and render via `suggestionBlock()`. Pl@ntNet's proposed *names*
live in `identifications` and render via a badge. v1.90.0 fixed the first in the
Gallery; this fixes the second.

The regression: v1.85.0 folded every photo surface into one shared action row
and dropped the Gallery's old `identifyBtn`, which had rendered a "Pl@ntNet
suggested X — compare" affordance. In the shared row a pending Pl@ntNet
suggestion correctly suppresses the Identify button (it has already run) and
offers Dismiss **only in the lightbox** — so on a card, the suggestion vanished
completely. "Needs a plant" is a Gallery view of cards, which is exactly where it
mattered.

Also **deduplicated**: near-identical local `suggestionBadge` closures existed
inside `photoRow` and `screenLocationDetail`, which is why the Gallery having
none went unnoticed. One `identificationBadge()` now, used by the Inbox card, the
Location feed, both Gallery layouts and the lightbox. It takes `inert` for select
mode, where a tap is choosing the photo rather than opening a comparison.

**Rule this reinforces:** when consolidating surfaces into one component, the
audit has to cover what each surface rendered, not just which buttons it had.
The buttons were all accounted for in v1.85.0; a *badge* was not.


### v1.90.1
**The two AI buttons swapped icons, per Amanda.** The photo-with-a-question-mark
now belongs to **Identify with Pl@ntNet**, which is literally "what is this a
picture of?" — the glyph was always a better fit there. **Ask Claude** gets
Claude's own burst mark.

New `claude` icon: a ten-ray radial burst, alternating ray lengths so it stays
legible at the 12–15px this icon set renders at rather than turning to mush.
Stroke-based with `currentColor` like every other icon here, so it inherits
colour and the disabled/spinner states unchanged.

Changed in all four places: the shared photo action row (which covers every card
and lightbox), the Gallery bulk bar in both view modes, and the species-level
Ask Claude on Taxon Detail. The `search` icon is now unused but kept — it is a
generically useful spare.


### v1.90.0
**Claude's photo suggestions were invisible in the Gallery.** Amanda pressed Ask
Claude from To Do → "Needs a plant" and could not find the answers.

They were being saved correctly. `suggestionBlock()` was rendered in exactly
three places — the Inbox card, the Location Detail feed, and the Edit photo
modal — and **`screenGallery` called it nowhere**: not the compact rows, not the
grid tiles, not the Gallery lightbox.

**Both routes to reviewing suggestions land in the Gallery.** "Needs a plant" is
`showGalleryNeeds('no_plant')`; the queue tile "Photos with suggestions" is
`showGalleryHasSuggestions()`. So the one destination built for reviewing
suggestions was the one screen that could not display them — and the filter
worked, which made it worse: the right photos appeared, with the answers hidden.

Now rendered on the list row, the grid tile and the Gallery lightbox. The list
row needed restructuring — it was a flex `[thumb][text][actions]` row, so the
block had nowhere to sit; the card is now a column with that row on top.
`event.stopPropagation()` on the wrapper so accepting a suggestion does not also
open the lightbox.


### v1.89.2
**Opening a Gallery album was a dead end.** Every other drill-in in the app
carries a back button at top left — "← Plants", "← Locations", "← To Do". The
Gallery had none. The only way out was the **Clear** button in the controls row,
which reads as "clear the search box", not "leave this album", and sits nowhere
near where the app has trained you to look.

Now: a "← Gallery" button in the same place, with the same words, on every
drilled-in view — albums, highlights, needs-buckets, In Bloom, Favourites. The
album name is promoted from a grey subtitle to a heading, and the
whole-collection stat tiles are hidden while drilled in, because "94 species,
2664 photos" on top of one album is the wrong signal about where you are.

**Worth generalising:** the app has one back pattern and this screen simply
never adopted it. When adding a view that filters down to a subset, give it the
same affordance in the same place.


### v1.89.1
**The plant picker leads with the newest specimens.** Straight out of BATCH-1:
after entering a group, the plants she is assigning photos to are the ones she
just created, and alphabetical buried them behind every Adromischus and Aeonium.
Newest first is the default; an A–Z toggle sits next to the filters and the
choice persists for the session.

**Sorted on `accession_number`, not `created_at`.** The first attempt used
`created_at` with accession as a tiebreaker, and the tests caught it: a row with
no `created_at` sorted to the *bottom* — the opposite of "newest first", and
worst for exactly the rows most likely to be new. Accession numbers are issued
sequentially by the trigger, never reused, always present, and compare correctly
as strings across years, so they already are creation order.

7 assertions, including a null `created_at` row and every filter combination.


### v1.89.0
**BATCH-1 — record a group of plants before planting them.** Amanda buys
succulents as a group and wants them in the system before they are planted and
photographed.

**Rows, not a quantity box.** A nursery trip is several *different* plants, not
five of the same, so the form is a list where each row carries its own count.
"Six species, one each" and "one species, five offsets" are then the same form.
Acquisition source, date, health and identification are shared across the batch,
because that is the one thing genuinely identical about a purchase — which is
what makes this faster than the single-plant form six times over.

Location is optional and defaults to **not planted yet**, which is the whole
point: they sit in the tray, land in "Plants with no location", and get filed
when they go in the ground.

A typed name creates or finds its taxon **once per row**, so five offsets of a
new species share one taxon instead of making five. Specimens are inserted one
at a time — the accession trigger fires per row, and a failure partway reports
how many were made rather than losing the batch.

15 assertions on the row logic, including the quantity guards (0, negative, 999,
junk and decimals all clamp), run under node.


### v1.88.0
Four of the six things Amanda raised on 28 Aug. Batch entry and the render
performance are queued behind these — see Ready now.

**Landing at the bottom of a species page.** `render()` restored scroll when the
view stayed the same and **left it alone when the view changed**, so arriving
somewhere new inherited the previous page's Y offset. Scrolled down the Plants
list, opening a species put you at the bottom of a shorter page. Resets to top
on a view change now.

**A catch-all species no longer forces "confirmed".** Two create paths hardcoded
`identification_status: "confirmed"` on the reasoning that a specimen of a known
taxon is identified by definition. True of *Agave americana*; false of
"unidentified cactus", where the link means "some kind of cactus". **Amanda
chose per-specimen control over a taxon-level flag** — so no schema change, and
the identification dropdown is now on every create form.

**`overview` and `progress` photo types.** The exemption logic already existed
but keyed off the LOCATION, so a wide shot of the whole wall taken while
standing at one bucket was filed to that bucket — a container, which does expect
plants — and flagged as a gap forever. The type travels with the photo wherever
it is filed. Both types are exempt from "needs a plant" and from the
archive/area bucket.

**"Previously here" appeared on locations that opted out of plants.** A bug
introduced in v1.86.0 — it was never gated on `locationHoldsPlants`, so Front
Yard, an area whose plants live in the containers inside it, was showing a
plant-history list. Gated.

**Acquisition fields were three different subsets.** "New plant" had the full
set behind More details, "Add a specimen" had source and date, "New specimen
here" had source only. One `acquisitionFields()` / `readAcquisitionFields()`
pair now, used by both specimen paths.

13 assertions on the photo-type gating, run under node.


### v1.87.0
**Annotate a move that already happened.** Amanda reviewed the seven moves made
after 27 Aug 5PM and confirmed **all were intentional** — so there was nothing to
roll back. What she wanted was to capture them properly, and the obvious route
was wrong: re-running an intentional move through the Move action would either
be blocked (the button disables when the destination is already the current
location) or record a **fake round trip**. The plant is already where it belongs.

What was actually missing is the *note*. All seven history rows had
`notes = null`, because the old edit path had nowhere to put one and the Move
action did not exist yet.

So: a pencil on every stay in "Where it has lived" opens a small modal writing
straight to `plant_location_history.notes`. It annotates history rather than
manufacturing new history — which is the distinction that matters, and one the
Move action alone could not make.

**Rule worth keeping: a move that already happened is edited, not repeated.**


### v1.86.1
**The trigger fires on any plant update, not just a location change.** Found
while helping Amanda roll back a batch of moves, by reading her actual rows:
ABG-2026-0137 has two history rows both pointing at Bucket 13 (one move, two
rows), and ABG-2026-0079 has three rows all at Bucket 06 — two of them **0.2
milliseconds apart**. Harmless in the table; v1.86.0 rendered each as its own
stay, so "Where it has lived" read "Bucket 06, Bucket 06, Bucket 06".

`locationHistoryForPlant()` now collapses **consecutive** rows at the same
location into one stay, taking the earliest start and latest end. Consecutive
only — a plant that left and came back has two genuine stays there and both must
stay visible.

7 assertions, written against rows copied out of the live database rather than
invented.


### v1.86.0
**MOVE-1 — where a specimen has lived.** Amanda moved plants around and asked
how to show that one used to be in Bucket 32 and is now in Bucket 01.

The answer was uncomfortable: **the move was already being recorded and nothing
could show it.** `plant_location_history` is populated by a database trigger and
was read in exactly one place in the whole app — the JSON backup. It never
reached `state`, so no screen could render it. The only way to answer "where did
this plant used to live?" was to export a backup and read the JSON by hand.

- Loaded into `state` and surfaced in three places: a **Where it has lived**
  timeline on Plant Detail, a **Previously here** list on Location Detail (the
  other side of the same table — what left this bucket and where it went), and
  a **recorded-move line in the photo timeline**, which already broke into runs
  whenever the photos' location changed but never said why.
- **A dedicated Move action**, so relocating does not mean opening the full edit
  form. Optional note per move, because "why is this one in Bucket 01?" is a
  real question six months later.

**A move is not a new specimen.** SPECIES-2 split plants that were in several
places AT ONCE, because a physical individual is in one place. Moving is the
same individual changing place over time — same accession, same photos, same
care notes. Worth keeping straight; the two look similar and are not.

**Caught by the tests:** `plantsPreviouslyAt()` listed a plant twice when it had
lived at a location, left, and come back before leaving again — two stays, and
the list read as two different plants. Deduped to the most recent stay.

**Unverified assumption, flagged deliberately.** The trigger's exact behaviour
is recorded nowhere in this repo — only that it exists. `confirmMovePlant()` is
written defensively: it patches the location, then attaches the note to whatever
history row it finds, and inserts the row itself if none appeared. If the
verification query in the conversation shows the trigger does something else,
revisit that function first.

14 assertions on the history logic, run under node.


### v1.85.0
**The consistency audit, and the refactor it demanded.** Amanda asked whether
she gets the same ability to manage the collection from anywhere in the app.
She does not, and the audit said why: **every surface had grown its own button
set**, so each fix was local and the next gap was structural rather than
accidental.

What the audit found, before fixing:
- **Favourite existed on 3 of 11 photo surfaces** — and favourites are not
  cosmetic here. They are the highlight mechanism (v1.62.0) and the intended
  source of taxon galleries (SPECIES-1). Not on the Gallery grid, the Inbox, a
  plant's photo list, or a location's feed.
- **The Location lightbox had two actions**, one of which — "Edit location" —
  edited the location record rather than the photo. The *identical* mislabel the
  plant lightbox carried until v1.84.0. Fixed there, missed here, because the
  two modes did not share code.
- **"Tag plants" was missing from the location feed**, which is exactly where a
  mixed planter lives. This was Amanda's original observation #1.
- **The Plants list card had no inline actions at all**, while the Locations
  list card has had Edit and Add-photos since LOC-2.
- Location detail turned out to have **two** photo feeds and the Gallery **two**
  card layouts, each with their own buttons.

**Fix: `photoActionList()` / `photoActionsHtml()` — one row, every surface.**
Gating lives in one function, so "does Favourite appear here?" has exactly one
answer. Amanda's rule applied: minimal on cards, everything in the lightbox.
Each surface passes its own button classes so the row still looks native.
Deliberate exceptions, all commented: the Inbox keeps INB-1's two promoted
primaries, and the location feed keeps its own Unfile.

**Vocabulary, per Amanda:**
- **Assign / Unassign, not attach / detach / tag / move.** Four verbs for one
  relationship became one modal. The storage split stays — `photos.plant_id` is
  the specimen that owns the timeline, `photo_plants` is everything else in
  frame — but she is no longer asked to care which is which: the first plant
  assigned becomes the owner, "Make owner" promotes another, and `movePhoto` is
  gone because moving is just reassigning.
- **Set / Change / Move location were already the same modal**, wearing three
  labels. Now one label everywhere.
- **"Other containers" removed entirely** — it did not make sense. Note:
  existing `photo_locations` extra rows still *display*; there is no longer a UI
  to add or remove them. Say so if that ever matters.

**Also:** `uploadPhoto()` has always taken a `plantId` and nothing ever passed
one, so the only way to get a photo onto a specimen was to upload to the Inbox
and file it back. The Plants list card now has Edit and Add-photo inline, and
Add-photo lands straight on the specimen.

Dead code removed: `tagPlants`, `tagLocations`, `movePhoto` modals;
`saveTaggedPlants`, `saveTaggedLocations`, `untagPlantFromPhoto`,
`detachPhotoFromPlant`, `movePhotoToSpecimen`, `attachPhotoToPlant`,
`diagnoseButton`, `identifyBtn`, `newPlantBtn`.

14 gating assertions on the shared row, run under node.


### v1.84.0
Amanda's six observations from a day using the app, plus RPT-3. Shipped
together at her request rather than staged.

**TASK-1 and RPT-3 turned out to be one feature, and that shaped the build.**
RPT-3's manual half is "flag this for a look"; her task examples are that plus a
note and more than one subject — eleven buckets to pull and re-evaluate, one
bucket with a rotted centre, one species to consolidate across locations.
Building both separately would have created two places to look for what needs
doing, which is the mistake v1.79.0 fixed by retiring Reports.

So: `tasks` + `task_subjects`, where a subject is exactly one of plant /
location / taxon — the same "exactly one of" shape `identifications` uses. A
task appears on every record it points at, so standing at bucket 11 shows the
note about the rot. Tasks render as **rows, not counted tiles** like the rest of
the queue: a tile answers "how many", and a task's whole value is its text.

RPT-3 then cost almost nothing on top. Two independent reasons a specimen wants
looking at: a `plants.next_check_date` that has arrived, or nothing
photographed for longer than `check_in_interval_days` (default **14**,
adjustable in Settings, per Amanda). The explicit date wins when set. Dead and
never-photographed specimens are excluded — the latter belongs to the "no
photos" queue, or every new specimen would be overdue on creation day.

**Two features existed and could not be reached.** Multi-specimen tagging
(`photo_plants`, a real many-to-many) and photo editing (bloom type, focal
point) were both **only on the Plant Detail photo row**. The plant-mode
lightbox — where you land after tapping a photo — offered "Set as profile
picture" and a button labelled **"Edit location" that actually opened the whole
Edit Plant modal**. Gallery mode had Edit, Favourite and Delete; plant mode
never got them. It now carries the same vocabulary as every other mode.

**Identify on already-filed photos.** The Gallery has always gated this
(`identifyBtn` returns `""` when `p.plant_id` is set); Location Detail's photo
feed never did, so a filed photo still offered to re-ask Pl@ntNet a settled
question. Same gate, copied.

**Pl@ntNet reference photos enlarge.** They were 64px and inert, which is too
small to compare a spine pattern against your own photo — the entire point of
that screen. They open at the largest size the API returns. Deliberately a
**separate overlay, not the app lightbox**: that one steps through Drive photos
resolved via `photoUrlCache` by `drive_file_id`, and these are remote URLs with
no record behind them.

**Health diagnosis — `focus: "health"` on `suggest-photo`.** Third focus after
location and plant, and the only one that requires the photo to already be
filed: the read is against what *this* species should look like, which needs the
specimen. The prompt is told what NOT to panic about — drying lower leaves,
summer dormancy, sun colouring — and to be forward about basal and central rot,
because it spreads and is often fatal. Returns a note plus a **separately
acceptable** suggested tier, so the note can be kept on the record without
changing the plant's status. Ties into PD-4: Claude can propose `urgent`.

29 assertions on the task and check-in logic, run under node.

**Deploy:** `supabase functions deploy suggest-photo` — the health focus is
inert until that runs.

**Schema (run 2026-08-27):** `tasks`, `task_subjects`, `app_settings`,
`plants.next_check_date`, plus RLS policies on all three new tables. The two
task tables were initially created without RLS, which would have left them
readable by anyone holding the publishable key embedded in `index.html`.


### v1.83.0
Four backlog items, closing everything that was buildable without a decision.

**PD-4 — an urgent tier above Watch.** `HEALTH_LABELS` gains `urgent` /
"Urgent care", and **Move to Plant Hospital now sets it** rather than Watch —
the hospital is the strongest worry signal in the app and setting Watch
understated it. Urgent outranks plain attention visually by weight and a
terracotta ring; the palette is fixed (§5) so it does not get a new hue.

The item warned that the exact health values are branched on in more than one
place and must be changed together. **It listed two sites and there were three**
— the third was `plantsAttention` in the work queue, filtering
`watch || recovery`, so an urgent plant would have been **absent from the
queue entirely**: the worst of the three, and the only one nobody had recorded.
The inline expression is now a single `needsAttention()` / `isUrgent()` /
`healthPillClass()` trio, so the next tier cannot be half-added. Urgent sorts to
the top of the queue. Plant Detail's health pill was also hardcoded
`pill-solid-blue` regardless of health, and now reflects the tier.

**`infraspecific` and `parentage` wired up.** Both columns were already in the
database with no code touching them. `Opuntia polyacantha` **var. erinacea**
'Snow Fuzzy' displayed as *Opuntia polyacantha* 'Snow Fuzzy' — the variety was
silently dropped, because since v1.65.0 the name composes from the parts and the
parts had nowhere to hold it. Rank abbreviation renders upright, epithet italic,
per convention; a bare word is read as `var.`. Both fields are on the taxon form
and taxon detail, and appended (not inserted) to the CSV export so existing
spreadsheets keep their column positions.

**LOC-1 — Locations cards take the PD-1 card-media band.** They were using the
92px square side thumb, which is the treatment for a specimen: one plant,
centred, identifiable small. A location is a *place*, and a wide shot of a bed
or a bucket wall is unreadable at 92px. Full-bleed 4:3 at the top of the card
now, matching Location Detail's hero so the same photo does not recompose
between the list and the page it opens.

**AI-3 layer 1 — duplicate detection, and a real bug behind it.**
`ensureTaxonForName` compared the typed name to `botanical_name` and nothing
else. Since v1.65.0 a taxon created from parts often has **no `botanical_name`
at all**, so typing "Aeonium arboreum" against an existing *Aeonium arboreum*
matched nothing and **silently created a second species record**. Matching now
runs against the composed display name, the botanical name, the common name and
the working label, all normalised for case, quoting, `×` vs `x`, and rank words.

On top of that, the new-plant form says live what is about to happen: an exact
match shows "joins the existing species X — N specimens already", and a near
miss (same genus, different epithet; or one name a prefix of the other) shows a
warning with one-tap "use X instead". Fifteen assertions on the matching
helpers, run under node.


### v1.82.1
**Version drift and a stale map.** Housekeeping, no behaviour change.

`APP_VERSION` had been left at `1.80.1` / `2026-08-26` while `v1.81.0` and
`v1.82.0` both shipped — neither commit touched the constant. The running app
reported 1.80.1 while serving 1.82.0 code, which defeats the one mechanism for
telling a real deploy from a stale cache. Now `1.82.1` / `2026-08-27`.

`CLAUDE.md`'s map of `index.html` claimed ~3,200 lines / 180KB; the file is
**8,077 lines / 448KB**, and every line range in the table was off by 2–3×. It
listed a `screenReports` that no longer exists and omitted `screenTaxa` /
`screenTaxonDetail`. Rebuilt from the file's own `/* ==== NAME ==== */` section
banners, with a note on how to re-derive it.

Also recorded the verified live schema state at the top of this file, replacing
the guesswork in "SQL she may not have run yet".


### v1.82.0

**Ask one question instead of all of them.** Schema: none. Deploy: `suggest-photo`.

"Where was this taken?" is a different job from "what plant is this?", and it is the one with **932 photos** behind it. Selecting photos and pressing Ask Claude now asks which question first:

- **Where was this taken?** — location only
- **Which plant is this?** — specimen only, leaving any location suggestion untouched
- **Everything** — as before

A narrower prompt is cheaper *and* better: the model is not splitting attention across five answers, and `max_tokens` drops from 1400 to 400 for the location pass.

**Locations now carry their period in the catalogue** — "2018-2021, Concord, CA" — and the location prompt is told to weigh the capture date first. For an archive photo that is the strongest evidence available and needs no image at all: a 2019 photo cannot be in a bucket built in 2026, and very probably *is* the place the collection lived in 2019. The prompt then falls back to flooring, walls, fencing and staging, and is told explicitly that a close-up with no surroundings should be a **null** rather than a guess.

A focused ask **replaces only what it can answer** — asking "where?" no longer discards a plant suggestion from an earlier full pass.

### v1.81.0

**"Claude thinks these are *Opuntia santa-rita*" on the species page.** Schema: none.

A section listing every unfiled photo Claude has proposed for this species — either onto one of its specimens, or by offering to create a new one. Derived entirely from suggestions already stored, so opening a species page costs nothing extra.

This is the Santa Rita workflow end to end: run a batch over the archive photos, open the species, and see every shot Claude believes belongs to it across four former homes — newest first, each with its location, its reasoning, and Accept / Dismiss.

Proposals pointing at other species are excluded, as are location-only proposals, dismissed ones, and any whose photo has since been deleted.

### v1.80.5

**"Species with suggestions" dropped you on all 33 of them.** Schema: none.

The tile called `goTab('plants')`, so a count of 1 landed on the full species list with nothing indicating which one it meant.

- **One waiting species opens that species**, with back going to To Do.
- **Several open the list filtered to them**, with a line saying why it is short and a **Show all** to leave. The filter clears on any tab change, so it cannot strand you on a short list you have forgotten the reason for.
- **Taxon cards say how many are waiting**, so the filtered list is scannable and the count is visible while browsing normally too.

### v1.80.4

**The same paragraph three times per card.** Schema: none. Deploy: `suggest-photo`.

Claude returns one rationale explaining the **identification** — why this photo is that plant. I attached it to every row it produced, so a card showed the plant's reasoning again under the photo type, and again under a health note it did not describe. It now goes on the identification only; a health note explains itself, and "Type: Detail" needs no paragraph.

**Order.** Suggestions arrive newest-first and are unshifted into state, so they rendered upside down — the photo type above the identification that justifies it. Sorted now by what she acts on first: plant, location, bloom, type, health.

### v1.80.3

**The suggestions were unreadable on the cream cards.** Schema: none.

`suggestionLine()` hardcoded `color:var(--cream)` — right in the edit-photo modal, which is dark, and wrong everywhere else. The Inbox card, the Location card and the species record are all **parchment**, so it rendered light text on a light panel.

Colour now comes from the container: the row is `color:inherit`, the sub-line uses opacity rather than a fixed grey, and an `.on-cream-ground` wrapper switches the tint and the icon to their dark equivalents. The blue used for the icon is also too light against parchment, so it drops to `--ink-soft` there.

`suggestionBlock(photoId, onCream)` makes the caller state its ground rather than the component guessing.

### v1.80.2

**"Could not parse Claude's response" — `content[0]` is not reliably the text block.** Schema: none. Deploy: both functions.

Both functions read `content[0].text`. A response can lead with a **thinking block**, where `text` is undefined — so `JSON.parse("")` threw and every call failed identically, for the photo and the species paths alike. `textFromResponse()` now collects every block of type `text` and joins them.

Parse failures also carry **the first 300 characters of what Claude actually said**. "Could not parse" with nothing attached is the least useful error in the app; it cost two rounds to work out, and a truncated payload or a plain-English refusal would have been obvious from the text. `max_tokens` raised on both, so a long rationale cannot truncate the JSON either.

### v1.80.1

**"Failed 9" with no reason was my bug.** Schema: none. Deploy: both functions again.

The batch ran with toasts suppressed and reported a count, so nine identical failures looked the same as nine different ones. It now carries the **first error message** into the summary, and gives up after three consecutive failures with nothing succeeding — every photo failing the same way means the cause is the setup, not the photos, and there is no reason to spend 37 more calls proving it.

Three specific diagnoses replace the shrug:

- **Function not deployed.** A 404 answers with HTML, so `res.json()` threw and looked identical to "Claude failed". It now reads the status and says `run: supabase functions deploy suggest-photo`.
- **Table missing.** Both functions detect `does not exist` / `PGRST205` on insert and name the migration to run.
- **`buildContext` no longer requires the table.** It reads past decisions from `suggestions` to feed back as examples — a nice-to-have that was taking the whole call down with it before the migration ran.

### v1.80.0

**AI-1 and AI-2 — Claude suggests filing, and fills species blanks.** Schema: new `suggestions` table. Deploy: two Edge Functions.

**The change that makes this work: Claude gets the catalogue.** The old call sent one image and asked "what species is this?", which can only ever return a *guess at a name* — never a specimen she owns. Every call now carries the whole collection (33 taxa, 58 specimens, 157 locations — about 6KB) and Claude answers with **ids copied from it**. That is what turns a suggestion into one tap instead of a name to match by hand. Anything not in the catalogue is discarded before it reaches the database, so a hallucinated uuid can never render as a row she cannot act on.

**Deliberately not an agent, not trained, not synced.** The collection is small enough to ride along with every request, which means it is never stale — a specimen created a minute ago is in the next call. A scheduled sync would be strictly worse. Two things do accumulate: the catalogue sits in a `cache_control` block so a batch pays for it once, and her last 20 accepted/dismissed decisions are fed back as examples, which is the only honest form of "learning" available here.

- **`suggest-photo`** (vision) → specimen to tag, location to file to, photo type, bloom, health note, or an offer to **create** a specimen of a known species when none matches.
- **`suggest-species`** (text, no image) → fills only the **blank** fields on a species record. Never asks about a field she has filled, so it cannot propose overwriting an established fact. A tenth of the cost, because these follow from the name rather than the photograph.
- **"Ask Claude" changed job rather than going away**: it answers "where does this belong?" Species identification stays with Pl@ntNet, which is cheaper, purpose-built and returns reference images to compare. Existing pending Claude identifications still render and can be confirmed or dismissed; no new ones are created.
- **Accept / Dismiss per line**, on the photo card, in the edit modal, in the lightbox and on the species record. Accepting writes the record **then** marks the suggestion, so a failed write leaves it pending rather than vanishing having done nothing. A suggestion whose target was since deleted shows "out of date" and offers dismiss only.
- **Batch on a selection**, never on upload — at 1,605 unfiled photos an automatic call would run on every duplicate and blurry shot. Confirms with the count first, runs sequentially so a rate limit does not take out a whole run, and a failure mid-batch is counted rather than fatal.
- **A To Do group, "Claude is waiting on you"**, plus a Gallery filter for photos carrying suggestions.

```sql
create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete cascade,
  taxa_id  uuid references taxa(id)   on delete cascade,
  kind text not null,
  field text,
  value_id uuid,
  value_text text,
  confidence numeric,
  rationale text,
  status text not null default 'pending',
  raw_response jsonb,
  created_at timestamptz not null default now()
);
alter table suggestions enable row level security;
create policy "suggestions all" on suggestions for all to authenticated using (true) with check (true);
create index if not exists suggestions_photo_idx on suggestions (photo_id) where status = 'pending';
create index if not exists suggestions_taxa_idx  on suggestions (taxa_id)  where status = 'pending';
notify pgrst, 'reload schema';
```

Chose a table over `identifications.raw_response`, which AI-1 asked to be weighed: that table has **one status per row** and a row means "a guess at a name". A bundle holding a plant, a location and a bloom cannot be half-accepted there — and half-accepting is the normal case.

### v1.79.1

**Every "select all" was silently dead.** Schema: none.

They rendered `onclick="selectAllInboxPhotos(["a","b"])"` — and the first double quote from `JSON.stringify` **closes the attribute**. The browser read `selectAllInboxPhotos([`, threw a syntax error, and the click did nothing. No console noise a user would see, no visible failure: the button just didn't work.

Four call sites, all broken from the day each shipped — Inbox (v1.75.1), Location page (v1.72.0), Gallery (v1.72.0) and the assign-photos modal. The duplicate-photos "Select all extras" was never affected because it takes no arguments, which is why one of them appeared to work.

Fixed by not putting data in the attribute at all: `selectAllGalleryPhotos('gallery')` takes a **scope name** and `visiblePhotoIds()` resolves the list at click time. That also removes a second, quieter problem — the array was baked in at render, so it could go stale against a filter changed since.

The assign-photos modal takes a comma-joined string, which survives a double-quoted attribute.

### v1.79.0

**Reports is retired. The work moved to where the work happens.** Schema: none.

Reports was a place to *look at* work; the Inbox was where she went to *do* it. Every row on that tab was something outstanding, so the two were the same list living on different screens.

- **The tab is now "To Do"** — the work queue on top, the unfiled photos below, in one scroll. The counts are the first thing visible when the app opens; putting them behind a toggle is how a backlog gets forgotten. Suppressed in select mode, where the job is the photos in front of you.
- **The queue is a dashboard, not a menu.** Tiles with the number leading, since the number is what she is scanning for. Grouped as **Needs you now** (frost tender, plants needing attention — the two about a plant's survival rather than a record's tidiness, and the only ones that read as urgent), **Photos to file**, **Records to finish**, and **Bloom**, which hides itself entirely when nothing is blooming or due. Zero-count tiles dim rather than disappear, so a cleared category still reads as cleared.
- **The fourth nav slot is the Gallery**, which previously had no home of its own — it was reachable only through a button on Reports.
- **The collection stats moved to the top of the Gallery**, and now split **Species** from **Specimens**, which the old four-up conflated. The Inbox count went with them: it is the tab you are standing on.
- `state.tab === "reports"` still routes, landing on To Do, so nothing bookmarked or half-remembered breaks.

### v1.78.0

**FROST-1 — mark a species as not frost hardy.** Schema: `taxa.frost_tender`.

- A checkbox on the species record, beside Hardy to. **Explicit, not derived from `hardy_to`** — that column is free text ("Zone 9", "20F", "Zone 10b — not frost hardy"), and the one night a year it matters is exactly when a parsing guess costs a plant.
- **A badge wherever the species is named**: the taxon card and list, the species record, and every specimen of it — so it is visible while browsing, not only when looking for it.
- **A Reports section, "Frost tender — bring in."** It lists **specimens**, not species, because on a cold night the question is which physical plants and where. Sorted by **location path** rather than name, so it reads as a route through the garden. Dead and deaccessioned specimens are excluded — nothing to carry.
- The code ships ahead of the SQL: saving a species before the column exists degrades on `PGRST204`, keeps the rest of the edit, and says which statement is missing.

```sql
alter table taxa add column if not exists frost_tender boolean not null default false;
create index if not exists taxa_frost_tender_idx on taxa (frost_tender) where frost_tender;
notify pgrst, 'reload schema';
```

A starting point, for review rather than blind application — `hardy_to` is free text and this only catches the obvious cases:

```sql
select id, botanical_name, hardy_to
from taxa
where hardy_to ~* 'zone\s*1[01]|not frost|tender|frost.?sensitive'
order by botanical_name;
```

### v1.77.2

**"Showing plants in Bucket 80" was showing all 58.** Schema: none.

v1.67.0 merged "Add to plant here" and "Attach to any plant" into one picker opened pre-narrowed to the location — and wrote the copy saying so. But `openModal()` clears the picker filters on every open, three lines above where the location would have been applied, so the filter was wiped every time. The modal has been asserting a behaviour it never had.

The pre-filter is set after the reset now, and only when the location actually holds plants — an Area or Archive still opens on the whole collection, because nothing is assigned directly to one.

**The sentence reads the live filter rather than the opening intent.** Widening the location dropdown used to leave it claiming a narrowing that had stopped being true; it now switches to telling you how to get back to it.

Also: the lightbox's Attach passes the photo's own location, so it behaves like the Location page and the edit form rather than being the one entry point that ignores context.

### v1.77.1

**A reference photo for the filtered species.** Schema: none.

Choosing "Aeonium arboreum" from a dropdown of 33 botanical names is a guess until you can see one. The picker now shows a tinted card above the results whenever a species filter is on: cover photo, the composed name in proper italics, common name, and how many specimens are recorded.

It stays visible when the filter returns **no** plants, which is exactly when it matters — that is the moment before **Another *Aeonium arboreum*** creates a specimen under a species that may be the wrong one, and every species fact follows from that choice.

The cover comes from `taxonCoverPhoto()`, so a hearted photo wins — the same gesture that promotes a shot to represent its taxon in the Gallery. A species with no photo anywhere gets the placeholder and says "no photo yet" rather than showing an empty frame.

### v1.77.0

**Location gets the same treatment as Plant.** Schema: none.

The edit-photo form had a thumbnail card with Change / Clear for the plant and a flat `<select>` of 157 rows for the location — the two halves of the same question, answered two different ways.

- **Location is a card now**: name, its parent path, Change and Clear, with the shared `locationPicker()` opening inline. So it arrives with recently-used first, one level at a time, counts on every row and a search that flattens.
- **New location, in place.** A quick-add form at the bottom of the picker, **parented to whatever level the picker is standing on** — "New location inside Below Wall" — with a name, a type, and a Create-and-use that selects it immediately. Sending her to the Locations tab and back would have discarded everything staged in the form. Type defaults to container, and `holds_plants` follows the type.
- Choosing a location — including accepting the "lives in" suggestion — now records it as **recently used**, so it feeds the Inbox jump list too.

### v1.76.0

**Same species, new specimen — and the button was an icon the size of the modal.** Schema: none.

- **"Another *Kalanchoe luciae*"** creates a second specimen of a species already recorded, without a form. The taxon carries every species fact; the only thing that distinguishes this one is where it stands, and the photo's own container already says that. It is created and **selected in place**, so the edit form is never left. If the photo sits in an Area or Archive the location is left unset and the toast says so.
- The species comes from the **active filter** — which is exactly the case that raises the question, a filter returning one plant beside a photo of a second — or from the plant already picked.
- **The buttons are text.** `icon()` emits a bare `viewBox` with no width or height, so inside a full-width block button it stretched to the button's width: a `+` roughly 300px tall. Same no-intrinsic-size trap as the empty states in v1.64.0, in a context that rule did not cover.

### v1.75.1

**Select all in the Inbox.** Schema: none.

Select mode had no way to select more than one photo at a time, while the Gallery and the Location page both did. Two buttons, deliberately distinct:

- **Select all N shown** — the page in front of you, toggling off on a second press.
- **Select all N matching** — everything behind the current filter, which at *2019* is 1,243 photos she cannot see. Conflating the two would let one tap select a thousand records without saying so, and past 250 it confirms first.

They sit in the sticky controls beside the running count, so they stay reachable while the bulk bar holds the actions at the bottom.

### v1.75.0

**Create a specimen from inside the plant picker.** Schema: none.

The picker is exactly where you find out the plant is not recorded yet — most sharply when a species filter returns **one** specimen and the photo clearly shows a second of the same kind. Until now that meant closing the modal, losing everything staged, and starting again from another screen.

`plantPicker()` takes an optional `onNew`, rendered as a full-width button under the results. Wired into the edit-photo form and the attach modal.

**The handoff does not throw away staged edits.** The new-plant modal attaches the photo itself, so the plant field resolves on its own — but Type, Location and Notes live in the edit form and would vanish silently. They are written first, and the toast says so. Saving without a Save press is mildly surprising; losing what she typed is worse. Nothing staged means no write and no toast.

The container carries across as the new specimen's home **only when it holds plants** — an Area or Archive is saved on the photo but not offered as somewhere a plant lives.

### v1.74.1

**The location suggestion was invisible, and modals were a bottom sheet on a 1400px screen.** Schema: none.

- **The suggestion is a callout now** — tinted panel, pin icon, the plant in bold above the path, and **File it here** as a real accent button. It was grey link text under a grey help-text line, sitting among four other grey help-text lines, so it read as more explanation rather than a one-tap answer.
- **Modals centre and widen from 700px up.** The bottom-sheet treatment is right on a phone and wrong on a desktop, where it left a 640px column pinned to the bottom edge of the window with the photo scrolled off the top. Centred, 760px, rounded on all four corners, and the drag handle hidden since nothing is being dragged. The phone layout is untouched.

### v1.74.0

**The photo form suggests where the plant lives.** Schema: none.

A photo attached to a specimen and filed to no container is a gap the record can close itself: the specimen already knows where it stands. The form now offers *"Santa Rita lives in Front Yard > Bucket 22 — Use it"* under the Location field, one tap.

**Offered, not applied.** A photo can show a plant that has since moved, or one photographed somewhere else entirely — silently filing it to the wrong container is worse than one extra tap. The suggestion disappears once the location matches, and reappears if you pick a different plant.

Location is **staged** like the plant now, rather than read from the DOM at save. Without that the suggestion could not survive its own re-render.

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
