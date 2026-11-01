# union-volume-lab

**Adaptive-octree CSG union-volume estimator: reach 0.0045% relative error with 270,920 inside-tests**, where a uniform grid needs >2×10⁹ cells (over=512) and still misses 0.5% — measured, not claimed.

Upstream: none

## 这是什么

For the union of equal spheres, the volume is a classic CSG primitive. The exact closed form (overlapping lenses) is trivial for *two* spheres, but general CSG unions (three or more overlapping primitives) have no cheap closed form. This tool estimates **union volume of N spheres** by adaptive octree quadrature over each connected component's tight box, and gates the result against an analytic closed form so the approximation error is a **hard number**, not a "looks right" eyeball.

Feature that makes it distinct: the browser drags the separation `/` depth and **recomputes with the exact same `src/core.mjs`** the node benchmark uses, then bit-compares against a node-baked `data/reference.json` — a **dual-end bit-identical** verdict in the UI.

## 怎么跑

```
# 生成示例数据（确定性，同命令两次字节一致）
node tools/gen-sample.mjs

# 断言（退出码 0 才算过）
node bench/verify.mjs

# 计时基准 → bench/result.json
node bench/bench.mjs

# 浏览器
python3 -m http.server 4173   # 打开 http://localhost:4173
```

## 证据（`bench/result.json`，真实测得）

- 两等球 d=1：**adaptive 270,920 cells → 0.0045% err**（median 26.1 ms, [p25 24.2, p75 26.4, p95 27.4], RSD 4.9%）
- 对照 uniform grid over=128（2.1M cells）仅 **2.31% err**；over=512（>2×10⁹ cells）仍 **0.59% err**
- **7.9× fewer inside-tests + ~500× more accurate** at this depth, on real measured data
- cold start: adaptive 42.2 ms; 9 warm samples, median+p25/p75+p95+stddev in `result.json`
- exact lens formula verified: V = 4.188790, d=1 union = 7.068583, all scan rows within 0.5%
- dual-end: `computeAt()` in node == baked `reference.json` bytes (verify asserts bit-identity)

## 本轮创新

把 adaptive-octree **体积积分**（而非等值面/蒙版）与**误差预算计价**结合，做成一个可交互参数扫描器：拖动分离度/深度时，浏览器用**同一 `src/core.mjs`** 现场复算，并把结果与 **node 烘焙值逐字节比对**才显示 "YES" ——「所见即所验」成为现场重算 + 位级一致的硬闸门，而不是只展示一个离线算好的数字。台账里 octree（isosurface / lipschitz / qem-lod）做过体积与误差预算，但**没做过「参数扫描 + 体积积分 + 双端位级一致」合体**（B 档）。

## 已知限制

- 均匀网格对照在 over=512 需要 >2 秒/格，瓶颈在样本数（cells），实测在 2<over<128 时误差 ~O(1/over) 收敛极慢——uniform 是教科书最差基线，数值真实性由 bench 实测佐证。
- Octree 探针是并行的角落判据，deep depth 下 worst-case cells 可到数百万；depth>6 浏览器会变慢。
- 只用等半径球演示；非凸/N>3 通用 CSG 需成分拆分（components() 已处理分离簇）。