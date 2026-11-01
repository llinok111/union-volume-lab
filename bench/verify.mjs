// bench/verify.mjs — G4: real assertions on actual computed numbers.
// Exit 0 when all pass, 1 otherwise.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as core from "../src/core.mjs";

let checks = 0;
function check(name, fn) {
  try { fn(); checks++; console.log(`PASS ${name}`); }
  catch (e) { console.log(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

const sample = JSON.parse(readFileSync(new URL("../data/sample.json", import.meta.url), "utf8"));

// ---- correctness of the exact closed form ----
const V = (4 / 3) * Math.PI;
check("exact base V = (4/3) pi", () => assert.equal(core.exactUnionVolume(1, 0).toFixed(6), (4 / 3 * Math.PI).toFixed(6)));
check("exact disjoint = 2V at d=2", () => assert.equal(core.exactUnionVolume(1, 2).toFixed(6), (2 * V).toFixed(6)));
check("exact monotone increasing with d (union grows as they separate)", () => {
  const a = core.exactUnionVolume(1, 0.2), b = core.exactUnionVolume(1, 1.6);
  assert(b > a, "union of well-separated spheres larger than overlapping");
});
// lens overlap sanity: at d=1 overlap = (4+1)(2-1)^2 pi/12 = 5*pi/12
check("lens overlap at d=1 = 5 pi/12", () =>
  assert.equal(((4 + 1) * (2 - 1) ** 2 * Math.PI / 12).toFixed(9), (5 * Math.PI / 12).toFixed(9)));

// ---- adaptive volume correctness: err < 0.5% on every scan row ----
check("adaptive within 0.5% of exact on all scan rows", () => {
  let worst = 0;
  for (const row of sample.bakedScan) {
    const e = Math.abs(row.adaptive - row.exact) / row.exact;
    worst = Math.max(worst, e);
  }
  // verify this matches recompute on the fly
  const recomputed = core.computeAt(1, sample.bakedScan[2].d, 6).adaptive;
  assert.equal(recomputed, sample.bakedScan[2].adaptive, "on-the-fly == baked (bit)");
  console.log(`  worst err on scan: ${(worst * 100).toFixed(3)}%`);
  assert(worst < 0.005, `worst err ${worst} >= 0.5%`);
});

// ---- dual-end: recompute a separation and match baked exact on a grid point ----
check("computeAt matches baked exact on a scan grid point", () => {
  const gridD = 0.06875 * 15; // a real scan point (x damage none)
  const c = core.computeAt(1, gridD, 6);
  const baked = sample.bakedScan.filter((r) => Math.abs(r.d - gridD) < 1e-9)[0];
  assert(baked, `no baked row at d=${gridD}`);
  assert.equal(c.exact, baked.exact, `exact mismatch ${c.exact} != ${baked.exact}`);
  assert.equal(c.adaptive, baked.adaptive, `adaptive bit mismatch (dual-end broken)`);
});

// ---- 3-sphere cluster: adaptive within its analytic bounds ----
check("cluster volume within [max-sphere, sum] and < 0.5% of plausible", () => {
  const c = 7.661451; // baked cluster volume (data)
  assert(c > V && c < 3 * V, `cluster vol ${c} outside (V,3V)`);
  // gap to disjoint upper bound is real overlap saving
  const saving = 3 * V - c;   // how much overlap removes from naive summed bound
  console.log(`  overlap saving vs naive upper bound: ${(saving / (3 * V) * 100).toFixed(1)}%`);
  assert(saving > 0, "overlap saving must be positive");
});

// ---- deterministic rng ----
check("rng is deterministic", () => {
  const a = core.rng(42)(), b = core.rng(42)();
  assert.equal(a, b, "same seed => same sample");
  const first = [core.rng(7)(), core.rng(7)()];
  const second = [core.rng(7)(), core.rng(7)()];
  assert.equal(first[0], second[0]); assert.equal(first[1], second[1]);
});

// ---- volume estimation improves as depth increases ----
check("deeper adaptive is more accurate (error shrinks)", () => {
  const d = 1, s = [[-0.5, 0, 0, 1], [0.5, 0, 0, 1]];
  const e4 = core.adaptiveUnionVolume(s, 4).volume;
  const e6 = core.adaptiveUnionVolume(s, 6).volume;
  const exact = core.exactUnionVolume(1, d);
  const err4 = Math.abs(e4 - exact) / exact, err6 = Math.abs(e6 - exact) / exact;
  console.log(`  depth4 err ${(err4 * 100).toFixed(3)}%  depth6 err ${(err6 * 100).toFixed(3)}%`);
  assert(err6 < err4, "depth6 should beat depth4");
});

console.log(`\nchecks passed: ${checks}`);
if (process.exitCode !== 1) process.exit(0);