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
- `type` text, nullable — area / row / slot / container / indoor / hospital / work_area / other. Not DB-enforced; standardized through the app's dropdown.
- `parent_location_id` uuid FK → locations.id — enables the tree
- `sort_order` int, nullable — physical-order display, not alphabetical
- `code` text, nullable — e.g. `W-T-14`
- `primary_photo_id` uuid FK → photos.id, nullable — the location's hero image
- `notes` text, nullable
- `created_at` timestamptz

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

The five fields above render on Plant Detail **even when blank**, because an unrecorded field marks the record as incomplete. The Care and Provenance sections deliberately keep their older behavior of hiding entirely when empty, so Plant Detail follows two conventions on purpose.
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
- `photo_type` text, default `general` — general / identification / flower / detail / condition / **historical** (§10)
- `notes` text, nullable — editable directly from the Inbox before assigning

A photo with **both** `plant_id` and `location_id` null is in the Inbox. It leaves the Inbox once either is set, or once `photo_type = 'historical'`.

### `care_notes`
A running dated log of care events, separate from the free-text `plants.notes`.

- `id` uuid PK
- `plant_id` uuid FK → plants.id, **not null**, `on delete cascade`
- `noted_on` date, not null, default `current_date` — the observation date, set by Amanda, not the insert time
- `body` text, not null
- `created_at` timestamptz, not null — tiebreak only, for two notes on the same `noted_on`

Displayed newest-first on Plant Detail. Included in the full JSON backup and restored **after** plants, since `plant_id` is a hard FK. See §6 for merge/delete handling.

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

### `google_auth_tokens`
Single-row table, one Google account ever. `access_token` (~1hr, auto-refreshed by Edge Functions), `refresh_token` (expires ~weekly, see §8), `expires_at`, `updated_at`.

### Junction tables (§6)
- **`photo_plants`** — multiple plants tagged on one photo. `id, photo_id, plant_id, created_at`, unique on `(photo_id, plant_id)`.
- **`plant_locations`** — a plant occupying more than one location (groundcover, vine spanning containers). `id, plant_id, location_id, notes, created_at`, unique on `(plant_id, location_id)`.
- **`photo_locations`** — a photo tagged across multiple containers. `id, photo_id, location_id, created_at`, unique on `(photo_id, location_id)`.

### `plant_location_history`
Auto-populated by trigger, never written to directly by the app. `id, plant_id FK, location_id FK, started_at, ended_at, notes, created_at`.

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

- A plant has one `location_id` plus optional `plant_locations` rows.
- A photo has one `plant_id` + one `location_id` plus optional `photo_plants` / `photo_locations` rows.

**Why keep a primary column:** the overwhelming majority have exactly one attachment. A direct FK keeps common-case queries (list cards, filters) join-free. Junction tables are consulted only for secondary "also in / also shows" relationships.

**Deletion / merge cleanup order** — any function deleting or merging a plant must handle, in order:
1. `photos.plant_id` — unassign, do not delete the photo
2. `photo_plants`
3. `plant_locations`
4. `plants.parent_plant_id` — reparent children
5. **`plant_location_history`** — reassign history rows to the surviving plant
6. **`care_notes`** — on merge, **reassign** to the surviving plant; the observations happened and the merged record inherits them. On delete, remove. The FK is `on delete cascade`, but both functions handle it explicitly so this list stays readable from the code.

Step 5 was missed on first implementation and caused an FK violation (`plant_location_history_plant_id_fkey`) during a merge.

**Direct-only vs. rolled-up reads (v1.34.5).** The many-to-many design means a location has two legitimate readings, and picking the wrong one is a recurring bug class:

- `photosAtLocation()` / `plantsAtLocation()` — **direct only.** Correct on Location Detail, where you are looking at one container.
- `aggregatePhotoCount()` / `aggregatePlantCount()` — **rolled up** through `descendantLocationIds()`. Correct anywhere a parent stands in for its subtree.

The Locations list renders **only top-level locations**, and a top-level area's plants and photos almost all live on the rows and buckets nested under it. Direct-only reads therefore return empty on exactly the cards that screen shows — this produced both `0 photos` counts and missing cover images until v1.34.5.

Both aggregate helpers **dedupe by id**. A photo tagged onto a parent and a child, or onto two sibling containers, is one photo in the rolled-up count. `aggregatePhotoCount` originally summed per-descendant lengths and double-counted.

`locationCoverPhoto()` follows the same rolled-up logic: own `primary_photo_id` → own newest direct photo → newest photo anywhere beneath. The cost is that the Locations screen now issues Drive fetches on first paint where it previously issued none; `ensurePhotoLoaded` → `debouncedRender()` absorbs the async settle.

---

## 7. Photo Dates — EXIF vs. Upload

`photos.taken_at` holds real capture date when available; `uploaded_at` is always the fallback.

`extractExifDate()` is a hand-rolled vanilla-JS parser: reads the first 128KB of a JPEG client-side, walks the APP1/Exif segment, extracts `DateTimeOriginal` (tag `0x9003`) or `DateTime` (`0x0132`). No library, per the no-build-step constraint. **JPEG only** — PNGs and screenshots silently fall back to upload date.

`photoDate(p)` (`p.taken_at || p.uploaded_at`) is used everywhere a photo date is displayed or sorted, instead of raw `uploaded_at`.

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

`photo_type = 'historical'` marks a photo as deliberately **not** needing a plant or container — collection history kept for posterity. Excluded from the Inbox alongside the normal plant_id/location_id check, surfaced through the Gallery's Archive filter, which is their permanent home.

---

## 11. Frontend Structure

- **Single file:** `index.html`. CSS in a `<style>` block, all JS inline.
- **Rendering:** `render()` rebuilds `#app.innerHTML` from scratch on every state change. **This destroys any focused input**, so live-search fields lose focus and caret position mid-typing; `captureFocus()` / `restoreFocus()` in `render()` save and restore them by element id (v1.38.2). Any new input that triggers a re-render while focused needs a stable `id` to participate. `debouncedRender()` (150ms) batches rapid updates — necessary once Inbox counts reached the hundreds, since each async thumbnail load used to trigger its own full rebuild.
- **State:** one global `state` object. Session persists in `localStorage` with access-token refresh before each data load (`ensureFreshSession()`).
- **Screens:** Login, Inbox, Plants, PlantDetail, Locations, LocationDetail, Gallery, Reports (doubles as dashboard), Settings.
- **Modals:** single `state.modal = {type, data}` rendered through one `modalContent()` switch. ~20 modal types.
- **Icons:** inline SVG strings via `icon(name)`. As of v1.32, 8 icons use **real Tabler Icons source** (plant, map-pin, map-2, clipboard-text, info-circle, progress-check, progress-x, photo-question), copied from tabler.io rather than approximated. Get exact source from Amanda if more Tabler icons are wanted.
- **Responsive:** mobile-first, breakpoints at 700px (2-column card grids, larger thumbnails) and 1100px (3-column, widest container). `.card-grid` handles this. `.stack` is reserved for form/vertical layouts and deliberately never becomes a grid.
- **The `@media` blocks must stay last in `<style>` (v1.37.1).** Media queries add **no specificity**. A single-class base rule declared *after* them wins at every width, and the breakpoint silently stops working — no error, no warning, it just never applies. This had already killed `.plant-list-thumb` (base at 92px declared below the block, so the 120/140px breakpoint sizes never applied on any screen) and it killed `.detail-split` the day it was written. Add new base rules **above** the block.
- **Card image treatments** are currently inconsistent and being unified: `.plant-list-thumb` is a square side thumb (92 / 120 / 140px by breakpoint) used by both `plantRow` and `locationCard`; `.plant-hero` is 16:9 on Plant Detail and Location Detail; `.inbox-photo-hero` is 4:3. PD-1 replaces the 16:9 hero with a **single reusable card-media pattern**, which LOC-1 then applies to the Locations cards. Do not add a fourth one-off treatment in the meantime.

---

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
