#!/usr/bin/env node
/* Characterisation tests for the queue predicates.
 *
 * These are the rules that decide what appears in a list or a count, and they
 * are where four of the five recent production faults lived. Every case below
 * pins behaviour that was ONCE WRONG — this file is a record of real bugs, not
 * a coverage exercise. If a case fails, read the comment before "fixing" it.
 *
 *   node tools/test.mjs
 */
import { load, setState } from "./harness.mjs";

const ctx = load();
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`  FAIL  ${name}\n        ${e.message}`); }
};
const eq = (got, want, msg) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${msg || ""} expected ${w}, got ${g}`);
};
const ok = (v, msg) => { if (!v) throw new Error(msg || "expected truthy"); };
const no = (v, msg) => { if (v) throw new Error(msg || "expected falsy"); };

/* ---------- seasonsNow (BLOOM-3, v2.30.0) ---------- */
const sep = new Date("2026-09-15T12:00:00Z");

t("September still matches late_summer", () => {
  // The original seasonsNow had exactly one overlap: late_summer covered Aug
  // AND Sep. A naive one-month-per-label table silently dropped it, which would
  // have removed late-summer bloomers from "Should be blooming" every September.
  ok(ctx.seasonsNow(sep).includes("late_summer"));
});
t("September also matches early_fall and fall", () => {
  const s = ctx.seasonsNow(sep);
  ok(s.includes("early_fall") && s.includes("fall"));
});
t("seasonsNow no longer emits intermittent", () => {
  // It became a bloom_habit in v2.29.0; leaving it here would double-count.
  for (let m = 0; m < 12; m++) {
    no(ctx.seasonsNow(new Date(Date.UTC(2026, m, 15))).includes("intermittent"));
  }
});
t("every month matches at least one season", () => {
  for (let m = 0; m < 12; m++) ok(ctx.seasonsNow(new Date(Date.UTC(2026, m, 15))).length > 0, `month ${m + 1}`);
});

/* ---------- taxonBloomsNow (BLOOM-2, v2.29.0) ---------- */
t("a habit of rarely never blooms now", () => {
  no(ctx.taxonBloomsNow({ bloom_habit: "rarely", bloom_season: ["fall"] }, ctx.seasonsNow(sep)));
});
t("a habit of monocarpic never blooms now", () => {
  no(ctx.taxonBloomsNow({ bloom_habit: "monocarpic", bloom_season: ["fall"] }, ctx.seasonsNow(sep)));
});
t("intermittent always blooms now", () => {
  ok(ctx.taxonBloomsNow({ bloom_habit: "intermittent" }, ctx.seasonsNow(sep)));
});
t("not_observed stays eligible — it means nobody looked", () => {
  ok(ctx.taxonBloomsNow({ bloom_habit: "not_observed", bloom_season: ["fall"] }, ctx.seasonsNow(sep)));
});
t("bloom_season tolerates a legacy scalar", () => {
  // The column was text until v2.29.0; a stale client could still hold one.
  ok(ctx.taxonBloomsNow({ bloom_season: "fall" }, ctx.seasonsNow(sep)));
});

/* ---------- bloomWindowWeeks ---------- */
t("several seasons take the LONGEST window", () => {
  // Closing on the shorter one would nag about a bloom that is still real.
  eq(ctx.bloomWindowWeeks({ bloom_season: ["late_summer", "fall"] }), 12);
});
t("an edge season alone is the short window", () => {
  eq(ctx.bloomWindowWeeks({ bloom_season: ["late_summer"] }), 7);
});
t("a habit that never closes returns null", () => {
  eq(ctx.bloomWindowWeeks({ bloom_habit: "monocarpic" }), null);
});

/* ---------- taxonProfileGaps (PROF-3 / BLOOM-2 / PLANT-1) ---------- */
const full = {
  family: "F", genus: "G", species_epithet: "s", description: "d", plant_type: "p",
  growth_habit: "g", mature_size: "m", bloom_season: ["fall"], native_range: "n",
  hardy_to: "h", water_needs: "low", frost_tender: false, light_conditions: ["direct"],
  container_suitability: "either", soil_needs: "s", feeding_needs: "f",
};
t("a fully filled taxon has no gaps", () => eq(ctx.taxonProfileGaps(full), []));
t("a bloom_habit answers the bloom_season gap", () => {
  // Amanda, 2026-09-09: "if the bloom habit has a valid entry ... then it is no
  // longer a gap". Every habit value means there is no season to record.
  const t2 = { ...full, bloom_season: [], bloom_habit: "rarely" };
  no(ctx.taxonProfileGaps(t2).includes("bloom_season"));
});
t("no season and no habit IS a gap", () => {
  ok(ctx.taxonProfileGaps({ ...full, bloom_season: [] }).includes("bloom_season"));
});
t("a cultivar is not asked for a species epithet", () => {
  // Kalanchoe 'Roseleaf' sat at "1 of 16 blank" forever on a finished record.
  no(ctx.taxonProfileGaps({ ...full, species_epithet: "", cultivar: "Roseleaf" }).includes("species_epithet"));
});
t("a bare genus IS asked for a species epithet", () => {
  // Amanda kept these counted: a bare genus is a plant not yet identified.
  ok(ctx.taxonProfileGaps({ ...full, species_epithet: "" }).includes("species_epithet"));
});
t("frost_tender false is an answer, null is a gap", () => {
  no(ctx.taxonProfileGaps({ ...full, frost_tender: false }).includes("frost_tender"));
  ok(ctx.taxonProfileGaps({ ...full, frost_tender: null }).includes("frost_tender"));
});
t("not_observed is no longer a bloom_season sentinel", () => {
  eq(ctx.__eval("TAXON_SENTINELS"), {});
});

/* ---------- taxonInProfileQueue (v2.22.0 / v2.23.1) ---------- */
t("a taxon whose every specimen is unidentified leaves the queue", () => {
  setState(ctx, { plants: [{ id: "p", taxa_id: "T", identification_status: "unidentified" }] });
  no(ctx.taxonInProfileQueue({ id: "T", ...full, description: "" }));
});
t("one identified specimen keeps it in the queue", () => {
  setState(ctx, { plants: [
    { id: "p", taxa_id: "T", identification_status: "unidentified" },
    { id: "q", taxa_id: "T", identification_status: "confirmed" },
  ] });
  ok(ctx.taxonInProfileQueue({ id: "T", ...full, description: "" }));
});
t("a taxon with NO specimens stays in the queue", () => {
  // [].every() is true — without the guard, every orphaned taxon would vanish.
  setState(ctx, { plants: [] });
  ok(ctx.taxonInProfileQueue({ id: "T", ...full, description: "" }));
});

/* ---------- photo filing (v2.19.0) ---------- */
t("a photo tagged only via photo_plants counts as filed", () => {
  // Six counts tested !p.plant_id directly, so such a photo read as unfiled
  // forever and no action could clear it.
  setState(ctx, { photoPlants: [{ photo_id: "P", plant_id: "x" }] });
  ok(ctx.photoHasAnyPlant({ id: "P" }));
  no(ctx.isInboxPhoto({ id: "P", plant_id: null, location_id: null }));
});
t("a photo with neither is in the inbox", () => {
  setState(ctx, { photoPlants: [] });
  ok(ctx.isInboxPhoto({ id: "P", plant_id: null, location_id: null }));
});

/* ---------- plantsAtLocation (GRAVE-1, v2.24.0) ---------- */
t("a dead plant no longer occupies its bucket", () => {
  setState(ctx, { plants: [
    { id: "a", location_id: "L", status: "active" },
    { id: "b", location_id: "L", status: "dead" },
  ] });
  eq(ctx.plantsAtLocation("L").length, 1);
});
t("but it is still THERE for deletion safety", () => {
  // location_id is deliberately not cleared, so the Graveyard can still say
  // "died in Bucket 40". Deleting that bucket would destroy the fact.
  eq(ctx.plantsEverAtLocation("L").length, 2);
});

/* ---------- needsAttention (v2.31.0) ---------- */
t("a dead plant does not need attention", () => {
  no(ctx.needsAttention({ status: "dead", health_status: "watch" }));
});
t("a living plant on watch does", () => {
  ok(ctx.needsAttention({ status: "active", health_status: "watch" }));
});

/* ---------- plantsWorkedRecently (WORK-1, v2.32.0) ---------- */
const NOW = new Date().toISOString();
const OLD = "2020-01-01T00:00:00.000Z";
const blank = { plants: [], photos: [], photoPlants: [], careNotes: [],
  wateringEvents: [], bloomEvents: [], plantLocationHistory: [] };

t("a photo filed yesterday puts the plant on the list", () => {
  // The whole point: filing the photo is what removed it from the check-in
  // list, so this is the only way back to it.
  setState(ctx, { ...blank,
    plants: [{ id: "a", updated_at: OLD }],
    photos: [{ id: "p", plant_id: "a", uploaded_at: NOW }] });
  const r = ctx.plantsWorkedRecently(7);
  eq(r.length, 1); ok(r[0].what.includes("photo"));
});
t("a photo attached only via photo_plants still counts", () => {
  setState(ctx, { ...blank,
    plants: [{ id: "a", updated_at: OLD }],
    photos: [{ id: "p", plant_id: null, uploaded_at: NOW }],
    photoPlants: [{ photo_id: "p", plant_id: "a" }] });
  eq(ctx.plantsWorkedRecently(7).length, 1);
});
t("old activity falls outside the window", () => {
  setState(ctx, { ...blank,
    plants: [{ id: "a", updated_at: OLD }],
    photos: [{ id: "p", plant_id: "a", uploaded_at: OLD }] });
  eq(ctx.plantsWorkedRecently(7).length, 0);
});
t("a watering counts as working on it", () => {
  setState(ctx, { ...blank,
    plants: [{ id: "a", updated_at: OLD }],
    wateringEvents: [{ plant_id: "a", created_at: NOW }] });
  ok(ctx.plantsWorkedRecently(7)[0].what.includes("watered"));
});
t("several kinds of work on one plant collapse to one row", () => {
  setState(ctx, { ...blank,
    plants: [{ id: "a", updated_at: NOW }],
    photos: [{ id: "p", plant_id: "a", uploaded_at: NOW }],
    wateringEvents: [{ plant_id: "a", created_at: NOW }] });
  const r = ctx.plantsWorkedRecently(7);
  eq(r.length, 1); eq(r[0].what.length, 3);
});
t("hasNoteSince is false when the only note predates the work", () => {
  setState(ctx, { ...blank,
    plants: [{ id: "a" }],
    careNotes: [{ plant_id: "a", created_at: OLD }] });
  no(ctx.hasNoteSince("a", NOW));
  ok(ctx.hasNoteSince("a", OLD));
});

/* ---------- plantsAssignedToPhoto (DEDUPE-1, v2.34.0) ----------

   Three renders hand-rolled [primary, ...tagged] and none of them deduped:
   Plant Detail's "Also shows", and both "Identified"/"Shows" lines on Location
   Detail. A photo carrying BOTH photos.plant_id = X and a photo_plants row for
   X rendered "X, X". The fix was to delete all three copies and call this
   function, so these cases pin the behaviour they now depend on. */

t("a plant both assigned and tagged appears once", () => {
  // The exact shape of the 12 double-linked rows deleted 2026-09-08.
  setState(ctx, {
    plants: [{ id: "a" }, { id: "b" }],
    photos: [{ id: "p", plant_id: "a" }],
    photoPlants: [{ photo_id: "p", plant_id: "a" }, { photo_id: "p", plant_id: "b" }] });
  eq(ctx.plantsAssignedToPhoto("p").map((x) => x.id), ["a", "b"]);
});
t("the primary comes first", () => {
  // Ordering is load-bearing: "Identified: <owner>, <others>" reads wrong the
  // other way round, and the old hand-rolled version got this right by luck.
  setState(ctx, {
    plants: [{ id: "a" }, { id: "b" }],
    photos: [{ id: "p", plant_id: "b" }],
    photoPlants: [{ photo_id: "p", plant_id: "a" }] });
  eq(ctx.plantsAssignedToPhoto("p").map((x) => x.id), ["b", "a"]);
});
t("a tag naming a deleted plant is dropped, not rendered blank", () => {
  setState(ctx, {
    plants: [{ id: "a" }],
    photos: [{ id: "p", plant_id: "a" }],
    photoPlants: [{ photo_id: "p", plant_id: "gone" }] });
  eq(ctx.plantsAssignedToPhoto("p").map((x) => x.id), ["a"]);
});
t("an unassigned photo shows nobody", () => {
  setState(ctx, { plants: [{ id: "a" }], photos: [{ id: "p", plant_id: null }], photoPlants: [] });
  eq(ctx.plantsAssignedToPhoto("p"), []);
});

/* ---------- Species hygiene (v2.35.0) ---------- */

t("a taxon nothing is recorded as is an orphan", () => {
  // ensureTaxonForName() writes the taxon BEFORE linking the specimen, so a
  // failed link leaves exactly this — reachable from no screen in the app.
  setState(ctx, { taxa: [{ id: "t1", genus: "Sedum", species_epithet: "adolphii" }],
    plants: [], wishlist: [] });
  eq(ctx.taxaWithNoSpecimens().map((x) => x.id), ["t1"]);
});
t("a wished-for species is not an orphan", () => {
  // Having no specimen yet is what a wish IS. Deleting it would drop the entry
  // back to its typed free text, the drift wishlist.taxa_id exists to prevent.
  setState(ctx, { taxa: [{ id: "t1", genus: "Sedum", species_epithet: "adolphii" }],
    plants: [], wishlist: [{ id: "w", taxa_id: "t1" }] });
  eq(ctx.taxaWithNoSpecimens(), []);
});
t("a species whose only specimen died is not an orphan", () => {
  // GRAVE-1 keeps the plant row and only changes status, so the species still
  // has something behind it — the Graveyard is where it is now reached from.
  setState(ctx, { taxa: [{ id: "t1", genus: "Sedum", species_epithet: "adolphii" }],
    plants: [{ id: "p", taxa_id: "t1", status: "dead" }], wishlist: [] });
  eq(ctx.taxaWithNoSpecimens(), []);
});

t("quoting does not hide a duplicate species", () => {
  // The whole point of grouping on nameKey(): 'Lola' with the quotes baked into
  // the cultivar and Lola without them are one species entered twice.
  setState(ctx, { taxa: [
    { id: "a", genus: "Echeveria", cultivar: "'Lola'" },
    { id: "b", genus: "Echeveria", cultivar: "Lola" }] });
  eq(ctx.findDuplicateTaxaGroups().length, 1);
});
t("two species sharing a common name are not duplicates", () => {
  // Grouping on common_name would flag these, and a tile that cries wolf stops
  // being read — the reason nameKey is fed the composed name only.
  setState(ctx, { taxa: [
    { id: "a", genus: "Graptopetalum", species_epithet: "paraguayense", common_name: "Ghost Plant" },
    { id: "b", genus: "Monotropa", species_epithet: "uniflora", common_name: "Ghost Plant" }] });
  eq(ctx.findDuplicateTaxaGroups(), []);
});
t("unnamed taxa do not all group together", () => {
  // They compose to the same placeholder string, so a naive key would report
  // every unidentified record as one enormous duplicate group.
  setState(ctx, { taxa: [
    { id: "a", working_label: "the spiky one" },
    { id: "b", working_label: "the other spiky one" }] });
  eq(ctx.findDuplicateTaxaGroups(), []);
});

/* ---------- MERGE-2 guards (v2.36.0) ---------- */

t("a location's own descendants are excluded from its merge picker", () => {
  /* Merging a location into something nested inside it would reparent that
     subtree to itself and detach the branch from the tree. mergeLocations()
     refuses, and the picker never offers it — this pins the id list the modal
     builds, which is what both depend on. */
  setState(ctx, { locations: [
    { id: "top", name: "Front Yard", parent_location_id: null },
    { id: "mid", name: "Below Wall", parent_location_id: "top" },
    { id: "leaf", name: "Bucket 40", parent_location_id: "mid" },
    { id: "other", name: "Backyard", parent_location_id: null }] });
  const forbidden = ["top", ...ctx.descendantLocationIds("top")];
  eq(forbidden.sort(), ["leaf", "mid", "top"]);
  ok(!forbidden.includes("other"), "an unrelated location stays pickable");
});
t("descendantLocationIds reaches more than one level down", () => {
  // A one-level check would leave the grandchild pickable, which is the same
  // detached subtree by a longer route.
  setState(ctx, { locations: [
    { id: "top", parent_location_id: null },
    { id: "mid", parent_location_id: "top" },
    { id: "leaf", parent_location_id: "mid" }] });
  ok(ctx.descendantLocationIds("top").includes("leaf"));
});

/* ---------- NAME-3: two different crosses, two different signs (v2.37.0) ----------

   `is_hybrid` means the \u00D7 goes BETWEEN genus and epithet (a cross between two
   species). A nothogenus wears it BEFORE the genus (a genus that is itself a
   cross between two genera) and is looked up from TAXON_NOTHOGENERA, never
   stored. Conflating them is what made the 2026-09-11 audit ask for is_hybrid
   on five cultivars where four render nothing and the fifth renders a lie. */

t("a nothogenus wears its sign before the genus", () => {
  eq(ctx.taxonDisplayName({ genus: "Graptosedum", cultivar: "California Sunset" }),
     "\u00D7Graptosedum 'California Sunset'");
});
t("an ordinary genus does not", () => {
  eq(ctx.taxonDisplayName({ genus: "Echeveria", cultivar: "Lola" }), "Echeveria 'Lola'");
});
t("is_hybrid puts the sign between genus and epithet, not before", () => {
  // The four records where is_hybrid is true AND an epithet exists are all
  // correct interspecific hybrids; this is the notation they depend on.
  eq(ctx.taxonDisplayName({ genus: "Kalanchoe", species_epithet: "houghtonii", is_hybrid: true }),
     "Kalanchoe \u00D7 houghtonii");
});
t("is_hybrid on a cultivar with no epithet renders nothing at all", () => {
  /* Why the audit's "set is_hybrid on records that state a cross" was declined
     for four of five rows: the flag has nowhere to draw. */
  eq(ctx.taxonDisplayName({ genus: "Agave", cultivar: "Blue Glow", is_hybrid: true }),
     "Agave 'Blue Glow'");
});
t("is_hybrid on a cultivar that HAS an epithet renders a false claim", () => {
  /* The fifth row. Opuntia basilaris is a good species, not a hybrid one, so
     setting is_hybrid on 'Baby Rita' would assert something untrue. Pinned so
     nobody sets that flag later without seeing what it prints. */
  eq(ctx.taxonDisplayName({ genus: "Opuntia", species_epithet: "basilaris", cultivar: "Baby Rita", is_hybrid: true }),
     "Opuntia \u00D7 basilaris 'Baby Rita'");
});

t("the nothogenus sign does not change the matching key", () => {
  /* The regression this shipped within inches of. Rendering \u00D7Graptoveria
     would have moved its nameKey, findTaxonByName() would have missed it, and
     typing the name again would silently create a SECOND species row. */
  eq(ctx.nameKey("\u00D7Graptoveria 'Debbie'"), ctx.nameKey("Graptoveria Debbie"));
});
t("Xerosicyos survives the leading-x strip", () => {
  // ^x\s+ requires whitespace precisely so a genus that begins with x is safe.
  eq(ctx.nameKey("Xerosicyos danguyi"), "xerosicyos danguyi");
});
t("an interspecific sign mid-name is still folded, not stripped", () => {
  eq(ctx.nameKey("Kalanchoe \u00D7 houghtonii"), ctx.nameKey("Kalanchoe x houghtonii"));
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
