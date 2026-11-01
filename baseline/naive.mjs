// baseline/naive.mjs — the "naive" baseline: uniform box-sampling volume.
// Samples a uniform grid over the union's bounding box to decide inside/outside.
// This is the textbook baseline for volume estimation and the reference against
// which the adaptive octree estimator in src/core.mjs is measured.
import { uniformVolume } from "../src/core.mjs";

// Resolve a uniform-grid resolution that reaches a target max-relative-error
// ~< 1% on the two-sphere scenarios (the naive grid needs a lot of samples).
export function resolve({ dMin = 0, dMax = 2.2, steps = 16, targetErr = 0.01 } = {}) {
  let over = 16;
  const spheresAt = (d) => [[-d / 2, 0, 0, 1], [d / 2, 0, 0, 1]];
  const exacts = [];
  for (let i = 0; i <= steps; i++) exacts.push(exactVolAt(dMin + (dMax - dMin) * i / steps));
  function exactVolAt(d) {
    const V = (4 / 3) * Math.PI;
    if (d >= 2) return 2 * V;
    if (d <= 0) return V;
    return 2 * V - ((4 + d) * (2 - d) ** 2 * Math.PI) / 12;
  }
  let totalCells = 0;
  function worstErr(over) {
    let w = 0; totalCells = 0;
    for (let i = 0; i <= steps; i++) {
      const d = dMin + (dMax - dMin) * i / steps;
      const { volume, cells } = uniformVolume(spheresAt(d), over);
      totalCells += cells;
      w = Math.max(w, Math.abs(volume - exacts[i]) / exacts[i]);
    }
    return { w, totalCells };
  }
  for (let e = worstErr(over); e.w > targetErr; e = worstErr(over *= 2)) {
    // scale up until within target, give up past 512 to stay cheap
    if (over >= 512) break;
  }
  return { over, ...worstErr(over) };
}