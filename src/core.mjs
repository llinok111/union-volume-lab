// core.mjs — union volume of N equal spheres via adaptive octree quadrature.
// Pure ES module: no three, no DOM, no file/network/env access. Bit-identical
// between node and browser because all math is deterministic IEEE-754 JIT ops.
//
// Exact reference for two equal spheres (classical lens formula):
//   overlap  = (4R + d) * (2R - d)^2 * PI / 12            (0 <= d <= 2R)
//   union    = 2 * (4/3)*PI*R^3 - overlap
// This is the closed-form baseline against which the adaptive estimator is
// measured, giving a hard numerical (not "looks right") gate.

export const EPS = 1e-9;

/** Deterministic PRNG (mulberry32). Same seed => same stream in node+web. */
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact closed-form union volume of two equal radius-R spheres at distance d. */
export function exactUnionVolume(R, d) {
  const V = (4 / 3) * Math.PI * R ** 3;
  if (d >= 2 * R) return 2 * V;                      // disjoint
  if (d <= 0) return V;                              // coincident
  const overlap = ((4 * R + d) * (2 * R - d) ** 2 * Math.PI) / 12;
  return 2 * V - overlap;
}

/** True when point p is inside the union of spheres. */
export function insideUnion(x, y, z, spheres) {
  for (const s of spheres) {
    const dx = x - s[0], dy = y - s[1], dz = z - s[2], r = s[3];
    if (dx * dx + dy * dy + dz * dz <= r * r) return true;
  }
  return false;
}

/** Bounding box of the union of spheres. */
export function bounds(spheres) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const s of spheres) {
    const [x, y, z, r] = s;
    if (x - r < minX) minX = x - r;  if (x + r > maxX) maxX = x + r;
    if (y - r < minY) minY = y - r;  if (y + r > maxY) maxY = y + r;
    if (z - r < minZ) minZ = z - r;  if (z + r > maxZ) maxZ = z + r;
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

/**
 * Split spheres into connected components. Two spheres are connected when their
 * surfaces intersect (center distance < 2r). Each component is integrated on
 * its own tight bounding box so disjoint clusters never share one huge box.
 */
export function components(spheres) {
  const n = spheres.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { parent[find(a)] = find(b); }
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (centerDist(spheres[i], spheres[j]) < spheres[i][3] + spheres[j][3])
        union(i, j);
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(spheres[i]);
  }
  return [...groups.values()];
}
function centerDist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Adaptive octree volume estimation of the union.
 * Each connected component is integrated over its own tight box. A cell whose
 * 8 corners all lie inside contributes its full volume; one whose 8 corners all
 * lie outside AND whose center is outside contributes 0 (empty); any other cell
 * is subdivided up to `maxDepth`. Boundary leaves are settled by sampling a
 * deterministic 3x3x3 sub-grid of the cell and using the inside fraction —
 * far cheaper than refining the octree further. All math is deterministic
 * IEEE-754, so node and the browser produce bit-identical results.
 */
export function adaptiveUnionVolume(spheres, maxDepth = 6) {
  let volume = 0, cells = 0;

  // sample a 3x3x3 internal sub-grid of a leaf cell, return inside fraction
  function leafFraction(x, y, z, h, comp) {
    let inside = 0, total = 0;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          total++;
          if (insideUnion(x + (i * h) / 2, y + (j * h) / 2, z + (k * h) / 2, comp)) inside++;
        }
    return inside / total;
  }

  for (const comp of components(spheres)) {
    const [minX, minY, minZ, maxX, maxY, maxZ] = bounds(comp);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const half = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;

    function recurse(x, y, z, h, depth) {
      let inCnt = 0, outCnt = 0;
      const cs = [[x - h, y - h, z - h], [x + h, y - h, z - h],
                  [x - h, y + h, z - h], [x + h, y + h, z - h],
                  [x - h, y - h, z + h], [x + h, y - h, z + h],
                  [x - h, y + h, z + h], [x + h, y + h, z + h]];
      for (const [px, py, pz] of cs) {
        cells++;
        if (insideUnion(px, py, pz, comp)) inCnt++; else outCnt++;
      }
      const cellVol = (2 * h) ** 3;
      if (inCnt === 8) { volume += cellVol; return; }                    // full
      const centerIn = insideUnion(x, y, z, comp);
      if (inCnt === 0 && !centerIn) return;                              // empty
      if (depth >= maxDepth) {
        volume += leafFraction(x, y, z, h, comp) * cellVol;              // boundary leaf
        return;
      }
      const hh = h / 2;
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1])
        recurse(x + dx * hh, y + dy * hh, z + dz * hh, hh, depth + 1);
    }
    recurse(cx, cy, cz, half, 0);
  }
  return { volume, cells };
}

/**
 * Uniform-grid volume estimation (baseline). Samples a regular grid of
 * `over` cells per axis over the same padded box; volume = insideFrac * boxVol.
 * Kept cheap/linear for the naive baseline.
 */
export function uniformVolume(spheres, over = 32) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bounds(spheres);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const box = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const step = box / over;
  let inside = 0, total = 0;
  for (let i = 0; i <= over; i++)
    for (let j = 0; j <= over; j++)
      for (let k = 0; k <= over; k++) {
        total++;
        if (insideUnion(cx - box / 2 + i * step, cy - box / 2 + j * step,
                        cz - box / 2 + k * step, spheres)) inside++;
      }
  return { volume: (inside / total) * box ** 3, cells: total };
}

/** Produce a parameter scan table: unionVolume vs separation d. */
export function scanUnion({ R = 1, dMin = 0, dMax = 2 * 1 + 0.2, steps = 32,
                            maxDepth = 6 }) {
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const d = dMin + ((dMax - dMin) * i) / steps;
    const spheres = [[-d / 2, 0, 0, R], [d / 2, 0, 0, R]];
    rows.push({
      d: +d.toFixed(12),
      exact: +exactUnionVolume(R, d).toFixed(12),
      adaptive: +adaptiveUnionVolume(spheres, maxDepth).volume.toFixed(12),
    });
  }
  return rows;
}

/** Interface for the browser + node dual-end: recompute one separation. */
export function computeAt(R, d, maxDepth = 6) {
  const spheres = [[-d / 2, 0, 0, R], [d / 2, 0, 0, R]];
  const res = adaptiveUnionVolume(spheres, maxDepth);
  return {
    d: +d.toFixed(12),
    exact: +exactUnionVolume(R, d).toFixed(12),
    adaptive: +res.volume.toFixed(12),
    cells: res.cells,
  };
}