import * as THREE from './assets/vendor/three-0.180.0/three.module.min.js';
import { createTimeline, stagger } from './assets/vendor/animejs-4.2.2/anime.esm.min.js';

const PALETTE = ['#f26d61', '#f39842', '#eebe45', '#83be88', '#60aacf', '#a783d1'];
const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
const wrap = (n) => ((n % 1) + 1) % 1;

/** Six token streams exchange information, expand into features, then return to output lanes. */
export function initChoreography(canvas, { reducedMotion = false } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' }); }
  catch {
    canvas.dataset.engine = 'unavailable';
    return { setState() {}, setPaused() {}, setReducedMotion() {}, resize() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  canvas.dataset.engine = 'ready';
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-9, 9, 5, -5, 0.1, 80);
  camera.position.set(7, 6, 23);
  camera.lookAt(0.05, 0, 0);
  scene.add(new THREE.AmbientLight(0xdde8e6, 0.34));
  const key = new THREE.DirectionalLight(0xffeee1, 3.5);
  key.position.set(-5, 9, 10); scene.add(key);
  const fill = new THREE.DirectionalLight(0xa9cfdd, 0.3);
  fill.position.set(5, -2, 6); scene.add(fill);
  const colors = PALETTE.map((color) => new THREE.Color(color));
  const gridStarts = [colors[0], colors[3], colors[4]];
  const gridEnds = [colors[2], colors[4], colors[5]];
  const charcoal = new THREE.Color('#273235');
  const ivory = new THREE.Color('#e9e6db');
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  const pos = new THREE.Vector3();

  // One shared bevelled shape and instanced materials keep the hundreds of cells inexpensive.
  const square = new THREE.Shape();
  square.moveTo(-0.43, -0.43); square.lineTo(0.43, -0.43);
  square.lineTo(0.43, 0.43); square.lineTo(-0.43, 0.43); square.closePath();
  const cubeGeometry = new THREE.ExtrudeGeometry(square, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 1, steps: 1 });
  cubeGeometry.center();
  const cubeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.38, metalness: 0.16 });
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const cells = [], trains = [], attention = [], features = [], sparkPaths = [], revealedPaths = [], gates = [];
  const groupY = [2.43, 0, -2.43];
  const laneY = [1.66, 1.0, 0.34, -0.32, -0.98, -1.64];
  const leftGate = -3.63, rightGate = 5.3;
  function cell(kind, x, y, z, lane, size, extra = {}) {
    const item = { kind, x, y, z, lane, size, ...extra, index: cells.length, motion: { appear: 0, settle: 0, travel: 0, lift: 1 } };
    cells.push(item);
    return item;
  }
  function curve(points) {
    return new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal', 0.5);
  }
  const lineMaterials = colors.map((c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
  const neutralLine = new THREE.LineBasicMaterial({ color: '#bdc5bd', transparent: true, opacity: 0.76, toneMapped: false, depthWrite: false });
  function drawPath(path, material, tube = false, radius = 0.009, start = 0, end = 1) {
    const geometry = tube ? new THREE.TubeGeometry(path, 60, radius, 5, false) : new THREE.BufferGeometry().setFromPoints(path.getPoints(60));
    const mesh = tube ? new THREE.Mesh(geometry, material) : new THREE.Line(geometry, material);
    mesh.visible = false;
    scene.add(mesh);
    revealedPaths.push({ mesh, geometry, start, end, count: geometry.index?.count || geometry.attributes.position.count, tube });
    return mesh;
  }
  function tokenTrain(path, lane, count, size, speed, kind, offset = 0) {
    for (let i = 0; i < count; i++) trains.push(cell(kind, 0, 0, 0, lane, size, { path, phase: i / count + offset, speed, order: i / Math.max(1, count - 1) }));
  }

  // Input and output gates are light, open lattices; they never mask the data passing through.
  const gateLine = new THREE.LineBasicMaterial({ color: '#d5d9d0', transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false });
  for (const x of [leftGate, rightGate]) {
    const gate = new THREE.Group();
    gate.visible = false;
    scene.add(gate);
    gates.push({ group: gate, start: x === leftGate ? 0.25 : 0.885, end: x === leftGate ? 0.28 : 0.925 });
    const corners = [[x - 0.13, -2.0, 0.18], [x + 0.13, -2.0, 0.18], [x + 0.13, 2.0, 0.18], [x - 0.13, 2.0, 0.18], [x - 0.13, -2.0, 0.18]];
    const geometry = new THREE.BufferGeometry().setFromPoints(corners.map((v) => new THREE.Vector3(...v)));
    gate.add(new THREE.Line(geometry, gateLine));
    laneY.forEach((y) => {
      const bar = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x - 0.13, y, 0.18), new THREE.Vector3(x + 0.13, y, 0.18)]);
      gate.add(new THREE.Line(bar, gateLine));
    });
  }

  laneY.forEach((y, lane) => {
    const group = Math.floor(lane / 2), hy = groupY[group];
    const input = curve([[-8.25, y, 0], [-6.15, y, 0], [leftGate, y, 0]]);
    drawPath(input, lineMaterials[lane], false, 0.009, -0.12, 0.18);
    tokenTrain(input, lane, 9, 0.27, 0.078, 'input', lane * 0.04);
    const fan = curve([[leftGate, y, 0], [-3.28, y, 0.02], [-2.96, hy + (lane % 2 ? -0.24 : 0.24), 0.06], [-2.48, hy + (lane % 2 ? -0.28 : 0.28), 0]]);
    drawPath(fan, neutralLine, false, 0.009, 0.25 + group * 0.012, 0.335 + group * 0.012);
    tokenTrain(fan, lane, 2, 0.12, 0.18, 'fan', lane * 0.06);
    const bridgeY = hy + (lane % 2 ? -0.16 : 0.16);
    const bridge = curve([[-0.79, bridgeY, 0], [-0.4, bridgeY, 0.05], [0.05, bridgeY, 0.02], [0.47, bridgeY, 0]]);
    drawPath(bridge, lineMaterials[lane], false, 0.009, 0.5 + group * 0.01, 0.565 + group * 0.01);
    tokenTrain(bridge, lane, 5, 0.17, 0.15, 'bridge', lane * 0.06);
    const merge = curve([[4.05, hy + (lane % 2 ? -0.15 : 0.15), 0], [4.48, hy + (lane % 2 ? -0.16 : 0.16), 0.06], [4.95, y, 0.05], [rightGate, y, 0]]);
    drawPath(merge, lineMaterials[lane], false, 0.009, 0.78 + group * 0.012, 0.9 + group * 0.012);
    tokenTrain(merge, lane, 6, 0.2, 0.15, 'merge', lane * 0.025);
    const output = curve([[rightGate, y, 0], [6.6, y, 0], [8.25, y, 0]]);
    drawPath(output, lineMaterials[lane], false, 0.009, 0.9 + lane * 0.004, 0.968 + lane * 0.002);
    tokenTrain(output, lane, 9, 0.21, 0.083, 'output', lane * 0.03);
  });

  groupY.forEach((hy, group) => {
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
      const item = cell('attention', -1.69 + (col - 2) * 0.34, hy + (2 - row) * 0.34, 0, group * 2 + (row > 2 ? 1 : 0), 0.272, { group, row, col, seed: row * 5 + col });
      attention.push(item);
    }
    for (let row = 0; row < 5; row++) for (let col = 0; col < 12; col++) {
      const item = cell('feature', 2.27 + (col - 5.5) * 0.295, hy + (2 - row) * 0.295, 0, group * 2 + (row > 2 ? 1 : 0), 0.241, { group, row, col, seed: row * 12 + col });
      features.push(item);
    }
    // Residual information can bypass the attention and feature transformation.
    const top = group === 2 ? hy - 1.12 : hy + 1.12;
    const bypass = curve([
      [-2.1, hy + (group === 2 ? -0.64 : 0.64), -0.08], [-2.12, top + (group === 2 ? 0.13 : -0.13), -0.08],
      [-1.78, top, -0.08], [4.4, top, -0.08], [4.7, top + (group === 2 ? 0.17 : -0.17), -0.08],
      [4.7, hy + (group === 2 ? 0.88 : -0.88), -0.08], [4.35, hy + (group === 2 ? 1.0 : -1.0), -0.08], [-0.4, hy + (group === 2 ? 1.0 : -1.0), -0.08],
    ]);
    const residualMaterial = new THREE.MeshBasicMaterial({ color: '#8feaf0', transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false });
    drawPath(bypass, residualMaterial, true, 0.02, 0.82 + group * 0.015, 0.95 + group * 0.01);
    const haloMaterial = new THREE.MeshBasicMaterial({ color: '#6fcbd2', transparent: true, opacity: 0.08, toneMapped: false, depthWrite: false });
    drawPath(bypass, haloMaterial, true, 0.052, 0.82 + group * 0.015, 0.95 + group * 0.01);
    sparkPaths.push(bypass);
  });

  const cubes = new THREE.InstancedMesh(cubeGeometry, cubeMaterial, cells.length);
  cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(cubes);
  const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), coreMaterial, 42);
  cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(cores);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const coreGlows = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), glowMaterial, 42);
  coreGlows.instanceMatrix = cores.instanceMatrix;
  scene.add(coreGlows);
  const exchangeMaterial = new THREE.LineBasicMaterial({ color: '#d5f0e9', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const exchanges = [];
  for (let group = 0; group < 3; group++) for (let n = 0; n < 5; n++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    const line = new THREE.Line(geometry, exchangeMaterial);
    scene.add(line);
    line.visible = false;
    exchanges.push({ group, n, geometry, line });
  }
  // One scrubbed Anime.js timeline owns all cell entrances and path drawing.
  const revealTimeline = createTimeline({ autoplay: false, frameRate: 60, defaults: { ease: 'outExpo' } });
  revealTimeline.add({ duration: 10000 }, 0);
  const schedule = (items, start, duration, delay) => {
    revealTimeline.add(items.map((item) => item.motion), {
      appear: { from: 0, to: 1, ease: 'outExpo' },
      settle: { from: 0, to: 1, ease: 'outBack' },
      travel: { from: 0, to: 1, ease: 'outExpo' },
      lift: { from: 1, to: 0, ease: 'outExpo' },
      duration, delay,
    }, start);
  };
  cells.filter((item) => item.kind === 'input' && item.order <= 0.375).forEach((item) => {
    Object.assign(item.motion, { appear: 1, settle: 1, travel: 1, lift: 0 });
  });
  schedule(cells.filter((item) => item.kind === 'input' && item.order > 0.375), 50, 650,
    stagger([0, 1100], { grid: [5, 6], axis: 'x', from: 'first', ease: 'inOutQuad' }));
  schedule(cells.filter((item) => item.kind === 'fan'), 2550, 550,
    stagger([0, 350], { grid: [2, 6], axis: 'y', from: 'first' }));
  for (let group = 0; group < 3; group++) {
    schedule(attention.filter((item) => item.group === group), 2740 + group * 120, 660,
      stagger([0, 650], { grid: [5, 5], axis: 'x', from: 'first', ease: 'inOutQuad' }));
    schedule(features.filter((item) => item.group === group), 5250 + group * 120, 650,
      stagger([0, 950], { grid: [12, 5], from: 'center', ease: 'outQuad' }));
  }
  schedule(cells.filter((item) => item.kind === 'bridge'), 5100, 400,
    stagger([0, 300], { grid: [5, 6], axis: 'x', from: 'first' }));
  schedule(cells.filter((item) => item.kind === 'merge'), 7850, 450,
    stagger([0, 550], { grid: [6, 6], axis: 'x', from: 'first' }));
  schedule(cells.filter((item) => item.kind === 'output'), 8920, 330,
    stagger([0, 520], { grid: [9, 6], axis: 'x', from: 'first', ease: 'inOutSine' }));
  for (const path of revealedPaths) {
    path.reveal = { amount: path.start < 0 ? 0.36 : 0 };
    revealTimeline.add(path.reveal, { amount: [path.reveal.amount, 1], duration: (path.end - Math.max(0, path.start)) * 10000, ease: 'inOutSine' }, Math.max(0, path.start) * 10000);
  }
  for (const gate of gates) {
    gate.reveal = { amount: 0 };
    revealTimeline.add(gate.reveal, { amount: [0, 1], duration: (gate.end - gate.start) * 10000, ease: 'outExpo' }, gate.start * 10000);
  }
  revealTimeline.seek(0);
  const state = { progress: 0, project: 0 };
  let paused = false, hidden = document.hidden, last = performance.now(), time = 0, dirty = true, lastRender = 0, soughtProgress = 0;
  let canvasWidth = 1, canvasAspect = 1, framedProgress = NaN;
  const frameTarget = new THREE.Vector3();
  const frameCorner = new THREE.Vector3();
  const frameFocus = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(6.95, 6, 23);
  function frameRegion(progress) {
    if (framedProgress === progress) return;
    framedProgress = progress;
    {
      // Full-bleed backdrop: retain a large subject on portrait screens instead
      // of shrinking the entire horizontal network into a narrow strip.
      const attentionFrame = smooth(0.21, 0.33, progress);
      const featureFrame = smooth(0.455, 0.57, progress);
      const outputFrame = smooth(0.745, 0.885, progress);
      const left = -8.55;
      const right = -3.35 + attentionFrame * 2.95 + featureFrame * 4.88 + outputFrame * 4.07;
      const halfHeight = 2.08 + attentionFrame * 1.35 + featureFrame * 0.12 + outputFrame * 0.2;
      frameTarget.set((left + right) / 2, 0, 0);
      camera.position.copy(frameTarget).add(cameraOffset);
      camera.lookAt(frameTarget);
      camera.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const x of [left, right]) for (const y of [-halfHeight, halfHeight]) for (const z of [-0.55, 0.75]) {
        frameCorner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, frameCorner.x); maxX = Math.max(maxX, frameCorner.x);
        minY = Math.min(minY, frameCorner.y); maxY = Math.max(maxY, frameCorner.y);
      }
      const closeHeight = Math.max(maxY - minY, (maxX - minX) / Math.max(canvasAspect, 1.55)) * 1.04;
      const outputFit = smooth(.76, .885, progress);
      const fitHeight = Math.max(maxY - minY, (maxX - minX) / canvasAspect) * 1.13;
      const height = THREE.MathUtils.lerp(closeHeight, fitHeight, outputFit);
      const focus = 1 - smooth(.9, 1.5, canvasAspect);
      // Move the close-up only after the next cluster has visibly assembled.
      const activeX = -6.1 + smooth(.30, .43, progress) * 4.4
        + smooth(.59, .72, progress) * 3.9 + smooth(.90, .985, progress) * 3.1;
      frameFocus.set(activeX, 0, 0).applyMatrix4(camera.matrixWorldInverse);
      const readingColumnShift = window.innerWidth > 1000 ? (1 - smooth(1200, 1600, canvasWidth)) * .18 : 0;
      const boundsCenterX = (minX + maxX) / 2;
      const closeCenterX = THREE.MathUtils.lerp(boundsCenterX, frameFocus.x, focus) - closeHeight * canvasAspect * readingColumnShift;
      // The output stage resolves into a complete view, with safe edge margins.
      const centerX = THREE.MathUtils.lerp(closeCenterX, boundsCenterX, outputFit);
      const centerY = (minY + maxY) / 2;
      camera.left = centerX - height * canvasAspect / 2; camera.right = centerX + height * canvasAspect / 2;
      camera.top = centerY + height / 2; camera.bottom = centerY - height / 2;
    }
    camera.updateProjectionMatrix();
  }
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height), aspect = width / height;
    renderer.setSize(width, height, false);
    canvasWidth = width; canvasAspect = aspect; framedProgress = NaN;
    frameRegion(state.progress);
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  const actual = cells.map(() => new THREE.Vector3());
  let lastRevealCounts = '';
  function draw() {
    const t = reducedMotion ? 0 : time, p = state.progress;
    if (p !== soughtProgress) { revealTimeline.seek(p * 10000); soughtProgress = p; }
    frameRegion(p);
    const interact = smooth(0.3, 0.37, p) * (1 - smooth(0.43, 0.51, p)) * 0.48;
    const featureMotion = smooth(0.54, 0.61, p) * (1 - smooth(0.7, 0.77, p));
    const reassemble = smooth(0.78, 0.98, p);
    const phase = t * 0.76 + state.project * 0.3;
    const counts = { input: 0, attention: 0, features: 0, output: 0, fans: 0, bridges: 0, merges: 0 };
    const countNames = { input: 'input', attention: 'attention', feature: 'features', output: 'output', fan: 'fans', bridge: 'bridges', merge: 'merges' };
    revealedPaths.forEach(({ mesh, geometry, reveal, count, tube }) => {
      const amount = clamp(reveal.amount);
      mesh.visible = amount > 0;
      geometry.setDrawRange(0, tube ? Math.floor(count * amount / 6) * 6 : Math.floor(count * amount));
    });
    gates.forEach(({ group, reveal }) => {
      const amount = clamp(reveal.amount);
      group.visible = amount > 0;
      group.scale.y = amount;
    });
    cells.forEach((item) => {
      let x = item.x, y = item.y, z = item.z, scale = item.size, brightness = 1;
      const reveal = clamp(item.motion.appear);
      item.reveal = reveal;
      if (reveal > 0) counts[countNames[item.kind]]++;
      if (item.path) {
        item.path.getPoint(wrap(item.phase + t * item.speed + p * 0.19), pos);
        x = pos.x; y = pos.y; z = pos.z;
        if (item.kind === 'input') brightness = 0.98;
        if (item.kind === 'output' || item.kind === 'merge') { brightness = 0.82 + reassemble * 0.18; scale *= 1 + reassemble * 0.14; }
      } else if (item.kind === 'attention') {
        const beat = Math.sin(phase + item.seed * 1.83 + item.group);
        x += interact * Math.sin(item.seed * 2.13 + phase * 0.5) * 0.37;
        y += interact * Math.cos(item.seed * 1.47 - phase * 0.6) * 0.29;
        z = interact * beat * 0.65;
        scale *= 1 + interact * beat * 0.11;
        brightness = 0.85 + 0.15 * Math.sin(phase * 2 - item.col * 0.5 + item.row);
      } else if (item.kind === 'feature') {
        x += (item.col - 5.5) * 0.009 * featureMotion;
        y += featureMotion * Math.sin(phase * 1.4 + item.col * 0.65) * 0.1;
        z = featureMotion * Math.cos(phase + item.col * 0.7 + item.row) * 0.2;
        scale *= 1 + featureMotion * Math.sin(phase - item.col * 0.45) * 0.1;
        brightness = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(phase * 2 - item.col * 0.62));
      }
      const sourceX = item.kind === 'input' ? -8.25 : item.kind === 'attention' || item.kind === 'fan' ? leftGate : item.kind === 'feature' || item.kind === 'bridge' ? -0.8 : item.kind === 'merge' ? 4.05 : rightGate;
      x = sourceX + (x - sourceX) * item.motion.travel;
      z = z * reveal + item.motion.lift * (item.kind === 'attention' ? 0.6 : 0.3);
      scale *= reveal > 0.00001 ? Math.max(0, item.motion.settle) : 0;
      actual[item.index].set(x, y, z);
      dummy.position.set(x, y, z);
      dummy.rotation.set((item.kind === 'attention' ? interact * Math.sin(item.seed + phase) * 0.18 : 0.025) - item.motion.lift * 0.28, 0.09 + item.motion.lift * 0.55, item.kind === 'attention' ? interact * Math.cos(item.seed * 2 + phase) * 0.14 : 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix(); cubes.setMatrixAt(item.index, dummy.matrix);
      if (item.kind === 'attention' || item.kind === 'feature') {
        color.copy(gridStarts[item.group]).lerp(gridEnds[item.group], item.row / 4).lerp(charcoal, 1 - brightness);
      } else {
        color.copy(charcoal).lerp(colors[item.lane], brightness);
      }
      cubes.setColorAt(item.index, color);
    });
    cubes.instanceMatrix.needsUpdate = true;
    if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;
    let core = 0;
    exchanges.forEach(({ group, n, geometry, line }) => {
      const routeShift = Math.floor(phase * 0.37 + group + state.project) % 5;
      const from = attention[group * 25 + ((n * 4 + routeShift) % 25)];
      const to = attention[group * 25 + ((n * 7 + 8 + routeShift) % 25)];
      const a = actual[from.index], b = actual[to.index];
      const connectionReveal = Math.min(from.reveal, to.reveal) * smooth(0.385 + group * 0.012, 0.445 + group * 0.01, p);
      line.visible = connectionReveal > 0.95;
      const buffer = geometry.attributes.position;
      for (let step = 0; step < 12; step++) {
        const q = step / 11;
        buffer.setXYZ(step, a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q + Math.sin(q * Math.PI) * 0.08, a.z + (b.z - a.z) * q + 0.19 + Math.sin(q * Math.PI) * 0.18);
      }
      buffer.needsUpdate = true;
      geometry.computeBoundingSphere();
      const q = wrap(phase * 0.58 + n * 0.19);
      dummy.position.set(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, a.z + (b.z - a.z) * q + 0.24);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(connectionReveal > 0.95 ? 0.72 + interact * 0.45 : 0); dummy.updateMatrix();
      cores.setMatrixAt(core, dummy.matrix); color.copy(colors[group * 2]).lerp(ivory, 0.88); cores.setColorAt(core++, color);
    });
    for (let i = 0; i < 15; i++) {
      const item = features[(i * 11 + Math.floor(phase * 1.3)) % features.length], a = actual[item.index];
      dummy.position.set(a.x, a.y, a.z + 0.16); dummy.scale.setScalar(item.reveal > 0.98 ? 0.55 + featureMotion * 0.4 : 0); dummy.updateMatrix();
      cores.setMatrixAt(core, dummy.matrix); color.copy(colors[item.lane]).lerp(ivory, 0.82); cores.setColorAt(core++, color);
    }
    for (let i = 0; i < 12; i++) {
      const gateX = i < 6 ? leftGate : rightGate, lane = i % 6;
      const gateReveal = i < 6 ? smooth(0.25 + lane * 0.005, 0.29 + lane * 0.005, p) : smooth(0.89 + lane * 0.004, 0.93 + lane * 0.004, p);
      dummy.position.set(gateX, laneY[lane], 0.22); dummy.scale.setScalar((0.8 + Math.sin(phase * 2 - lane) * 0.12) * gateReveal); dummy.updateMatrix();
      cores.setMatrixAt(core, dummy.matrix); color.copy(colors[lane]).lerp(ivory, 0.6); cores.setColorAt(core++, color);
    }
    cores.instanceMatrix.needsUpdate = true;
    if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
    coreGlows.instanceColor = cores.instanceColor;
    const revealCounts = JSON.stringify(counts);
    if (revealCounts !== lastRevealCounts) { canvas.dataset.revealCounts = revealCounts; lastRevealCounts = revealCounts; }
    renderer.render(scene, camera);
  }
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); last = now;
    if (hidden) return;
    if (!paused && !reducedMotion) time += dt;
    if (now - lastRender < 1000 / 60 - 0.5) return;
    if (dirty || (!paused && !reducedMotion)) { draw(); dirty = false; lastRender = now; }
  }
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; dirty = true; });
  requestAnimationFrame(tick);
  return {
    setState(next) {
      if ('progress' in next) state.progress = clamp(next.progress);
      if ('project' in next) state.project = Math.max(0, Math.min(7, Number(next.project) || 0));
      dirty = true;
    },
    setPaused(value) { paused = Boolean(value); dirty = true; },
    setReducedMotion(value) { reducedMotion = Boolean(value); dirty = true; },
    resize,
  };
}
