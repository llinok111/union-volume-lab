// main.js — only rendering & interaction. All math comes from src/core.mjs,
// applied to the same function the node benchmark uses; the live result is
// compared bit-for-bit against the node-baked reference.json.
import * as THREE from "three";
import { computeAt } from "./src/core.mjs";

// ---- load node-baked reference for dual-end bit-identity check ----
const ref = await (await fetch("./data/reference.json")).json();
function refAt(d) { return ref.rows.find((r) => Math.abs(r.d - d) < 1e-9) ?? null; }

// ---- scene ----
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(3, 2.4, 4.5);
camera.lookAt(0, 0, 0);

const light = new THREE.DirectionalLight(0xffffff, 1.4);
light.position.set(3, 5, 4);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404060, 0.7));

const mat = new THREE.MeshStandardMaterial({
  color: 0x4f8cff, roughness: 0.3, metalness: 0.1,
  transparent: true, opacity: 0.85,
});
const group = new THREE.Group();
group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat));
group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat));
scene.add(group);

// grid floor hint
const grid = new THREE.GridHelper(8, 16, 0x30363d, 0x21262d);
grid.position.y = -1.2;
scene.add(grid);

const controls = new (await import("three/addons/controls/OrbitControls.js")).OrbitControls(camera, canvas);
controls.enableDamping = true;

let d = 1, depth = 6;
const splitEl = document.getElementById("split");
const depthEl = document.getElementById("depth");
const el = (id) => document.getElementById(id);

splitEl.addEventListener("input", () => { d = +splitEl.value; render(); });
depthEl.addEventListener("input", () => { depth = +depthEl.value; render(); });

function render() {
  group.children[0].position.x = -d / 2;
  group.children[1].position.x = d / 2;

  // live recompute with the SAME core as node
  const res = computeAt(1, d, depth);
  const baked = refAt(d);

  el("exact").textContent = res.exact.toFixed(6);
  el("adaptive").textContent = res.adaptive.toFixed(6);
  el("cells").textContent = res.cells.toLocaleString();
  const errPct = Math.abs(res.adaptive - res.exact) / res.exact * 100;
  el("err").textContent = errPct.toFixed(4) + "%";

  // bit-identity gate: at matching depth, browser value must equal node-baked
  const bitOK = baked && (depth === 6) && (res.adaptive === baked.adaptive);
  const b = el("bitok");
  b.className = bitOK ? "ok" : "bad";
  b.textContent = bitOK ? "YES (browser == node bytes)" : (baked ? "NO" : "n/a");
}

function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
}
function resize() {
  const w = document.getElementById("view").clientWidth;
  const h = document.getElementById("view").clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
render();
loop();