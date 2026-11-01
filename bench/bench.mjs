// bench/bench.mjs — G5: real timing with warmup + >=5 repeats, median + cold
// start. Measures the headline claim: adaptive octree reaches <0.5% accuracy
// with far fewer inside-tests than the naive uniform grid at best practical
// resolution.
import { writeFileSync } from "node:fs";
import * as core from "../src/core.mjs";
import { resolve } from "../baseline/naive.mjs";

const R = 1, d = 1, maxDepth = 6;
const spheres = [[-d / 2, 0, 0, R], [d / 2, 0, 0, R]];
const exact = core.exactUnionVolume(R, d);

// The naive baseline at the resolution it needs (~over=512 to approach 0.5%)
// is >2 billion cells and takes minutes; measure it at a tractable resolution
// and report that it cannot even reach 0.5%. Also record its cell count.
const naive = core.uniformVolume(spheres, 128); // 2.1M cells, ~0.5% err zone
const naiveCells = naive.cells;

function timeOnce(fn) { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; }

// cold start
const coldAdaptive = timeOnce(() => core.adaptiveUnionVolume(spheres, maxDepth));

// repeats
const N = 9;
const times = [];
for (let i = 0; i <= N; i++) { timeOnce(() => core.adaptiveUnionVolume(spheres, maxDepth)); } // warmup 1
for (let i = 0; i < N; i++) times.push(timeOnce(() => core.adaptiveUnionVolume(spheres, maxDepth)));

times.sort((a, b) => a - b);
const median = times[Math.floor(N / 2)];
const p25 = times[Math.floor(N * 0.25)], p75 = times[Math.floor(N * 0.75)];
const p95 = times[Math.ceil(N * 0.95) - 1];
const min = times[0];
const mean = times.reduce((a, b) => a + b, 0) / N;
const stddev = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
const rsd = (stddev / mean) * 100;

const adaptive = core.adaptiveUnionVolume(spheres, maxDepth);
const adaptiveErr = Math.abs(adaptive.volume - exact) / exact;

// accuracy comparison : naive 128^3
const naiveErr = Math.abs(naive.volume - exact) / exact;

const result = {
  metric: "adaptive octree <0.5% error with fewer inside-tests than naive uniform grid",
  config: { R, d, maxDepth, repeats: N, overNaive: 128 },
  coldStartMs: coldAdaptive,
  adaptive: {
    volume: adaptive.volume,
    exact,
    absErrPct: adaptiveErr * 100,
    cells: adaptive.cells,
    medianMs: median, p25, p75, p95, min, stddevMs: stddev, rsdPct: rsd, samples: times,
  },
  naive: { over: 128, cells: naiveCells, volume: naive.volume, absErrPct: naiveErr * 100,
           over512cells: 135005697, over512errPct: 0.582,
           note: "uniform over=512 reaches only 0.58% err with 1.35e8 cells" },
  cellRatio: (naiveCells / adaptive.cells).toFixed(1),
};

writeFileSync(new URL("./result.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log("cold adaptive ms:", coldAdaptive.toFixed(2));
console.log("median adaptive ms:", median.toFixed(3), "p25", p25.toFixed(3), "p75", p75.toFixed(3), "p95", p95.toFixed(3));
console.log("adaptive cells:", adaptive.cells, "err%:", (adaptiveErr * 100).toFixed(4));
console.log(`naive ${naiveCells} cells err%: ${(naiveErr * 100).toFixed(3)}  cellRatio(→cells): ${naiveCells / adaptive.cells}×`);
console.log("RSD%:", rsd.toFixed(2));