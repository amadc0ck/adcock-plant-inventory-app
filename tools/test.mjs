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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
