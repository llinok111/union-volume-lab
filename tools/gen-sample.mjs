// tools/gen-sample.mjs — deterministic sample generation for the union-volume
// resolver: a separation scan over two equal spheres + a fixed 3-sphere random
// cluster (seeded). Same command twice => byte-identical output.
import { writeFileSync, mkdirSync } from "node:fs";
import { rng, exactUnionVolume, adaptiveUnionVolume, scanUnion, bounds, computeAt } from "../src/core.mjs";

const outDir = new URL("../data/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const scan = scanUnion({ R: 1, dMin: 0, dMax: 2.2, steps: 32, maxDepth: 6 });

// Fixed 3-sphere cluster (corner case: all three mutually overlapping).
const R = 1;
const rand = rng(42);
const sphere3 = [[0, 0, 0, R]];
for (let i = 1; i < 3; i++) {
  const ang = rand() * 2 * Math.PI;
  const rad = 0.6 + rand() * 0.8;          // 0.6..1.4, all overlapping first
  const z = 0.3 * (rand() - 0.5);
  sphere3.push([Math.cos(ang) * rad, Math.sin(ang) * rad, z, R]);
}

// bake the reference for dual-end recompute + verify
const bakedScan = scan;
const clusterVol = adaptiveUnionVolume(sphere3, 7);
const clusterBounds = bounds(sphere3);

const sample = {
  description: "Union-volume of equal spheres (two-sphere separation scan + one 3-sphere seeded cluster).",
  R: 1,
  seed: 42,
  scan,
  bakedScan,
  bakedExact: scan.map((r) => r.exact),
  threeSphereExactUpper: 3 * (4 / 3) * Math.PI,   // sum of three, dijoint upper bound
  cluster: { spheres: sphere3, adaptiveVolume: clusterVol.volume, cells: clusterVol.cells,
             bounds: clusterBounds },
};

writeFileSync(new URL("../data/sample.json", import.meta.url),
  JSON.stringify(sample, null, 2) + "\n");

// deterministic byte-identical check
writeFileSync(new URL("../data/VERSION", import.meta.url), "sample-v1\n");

// node-baked dual-end reference: browser recomputes with the same core and must
// match these bytes exactly. Generated here so it is script-produced too.
const reference = { depth: 6, rows: [] };
for (let i = 0; i <= 44; i++) {
  const d = +(i * 0.05).toFixed(6);
  const r = computeAt(1, d, 6);
  reference.rows.push({ d: +r.d, adaptive: r.adaptive, exact: r.exact, cells: r.cells });
}
writeFileSync(new URL("../data/reference.json", import.meta.url),
  JSON.stringify(reference, null, 2) + "\n");

console.log("scan rows:", scan.length);
console.log("baked scan d=0 adaptive:", scan[0].adaptive, "exact:", scan[0].exact);
console.log("cluster volume:", clusterVol.volume.toFixed(6), "cells:", clusterVol.cells);
console.log("cluster upper(sum):", (3 * (4 / 3) * Math.PI).toFixed(6));