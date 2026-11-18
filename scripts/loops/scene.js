/**
 * The clay loops, drawn with three.js in a browser page (see scripts/make-loops.mjs, which serves
 * this file and steps it one frame at a time). Nothing here runs in the app: the app only shows the
 * GIFs this produces.
 *
 * Everything is made to look modelled by hand rather than rendered: soft clay with thumb-print
 * bumps, fingers that are not perfectly round, a little wobble in every move. The shapes follow
 * src/components/PinkyFinger.tsx and the app icon (curl, tip, offset, a reach of 150) so the 3D pinkies are the
 * same pinkies as the lock gesture.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const C = window.TOKENS; // colours read from src/theme/tokens.ts by make-loops.mjs
const col = (hex) => new THREE.Color(hex);

// ---------------------------------------------------------------------------------------------
// Shared: renderer, light, clay

/** A deterministic random, so every run of the script draws the same lumps. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Thumb-print bumps: a soft noise texture used as a bump map. */
function clayBump(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) {
    const x = r() * size, y = r() * size, rad = 2 + r() * 9, v = Math.round(110 + r() * 40);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.55)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function clay(hex, seed, repeat = [6, 1]) {
  const bump = clayBump(seed);
  bump.repeat.set(repeat[0], repeat[1]);
  // A soft sheen on the edges, the way modelling clay catches light.
  return new THREE.MeshPhysicalMaterial({
    color: col(hex), roughness: 0.66, metalness: 0, bumpMap: bump, bumpScale: 1.6,
    sheen: 0.6, sheenRoughness: 0.75, sheenColor: col(C.text),
  });
}

/** A finger is fatter at the knuckle than at the tip: scale each ring of a tube about its centre. */
function taper(geometry, curve, from, to) {
  const { tubularSegments: T, radialSegments: R } = geometry.parameters;
  const pos = geometry.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let j = 0; j <= T; j++) {
    curve.getPointAt(j / T, c);
    const k = from + (to - from) * Math.pow(j / T, 3);
    for (let i = 0; i <= R; i++) {
      const n = j * (R + 1) + i;
      v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(n, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Pushes every vertex in or out a little along its normal: rolled by hand, not lathed. */
function lumpy(geometry, amount, seed) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const r = rng(seed);
  const k = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.045 + k[0]) * Math.sin(y * 0.05 + k[1]) * Math.cos(z * 0.06 + k[2]);
    const d = n * amount;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function stage(width, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = col(C.bg);

  // Lavender fill from above, the page's own night-sky indigo from below, so the clay sits in the page.
  scene.add(new THREE.HemisphereLight(col(C.textDim), col(C.bg), 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(-160, 260, 420);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0008;
  Object.assign(key.shadow.camera, { left: -340, right: 340, top: 340, bottom: -340, near: 10, far: 1600 });
  scene.add(key);
  // A pink edge from behind: the same pink as the lock.
  const rim = new THREE.DirectionalLight(col(C.pink), 0.9);
  rim.position.set(300, -120, -300);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(28, width / height, 10, 4000);
  return { renderer, scene, camera };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const span = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));

// ---------------------------------------------------------------------------------------------
// Loop 1: two pinkies slide in, hook, tug, hold, let go. No flash or ring: pink fading over
// the indigo turns muddy, and a GIF bands it.

const S = 22, CURL = 36, TIP = 44, OFF = 30, Z = 25, REACH = 150;

/**
 * One pinky as a path: a long run in from its own side, a quarter curl, then the tip. `dir` is -1
 * for theirs (from the left, curling down) and +1 for mine (from the right, curling up). The run sits
 * behind and the tip in front, so the two hooks pass over and under each other like a chain link.
 */
function pinkyPath(dir) {
  const pts = [];
  const y0 = -dir * OFF;            // theirs runs above the middle, mine below
  const xEnd = dir * (-OFF + CURL); // where the run meets the curl
  const cx = xEnd, cy = y0 + dir * CURL; // centre of the curl
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const x = dir * REACH + (xEnd - dir * REACH) * (i / N);
    pts.push(new THREE.Vector3(x, y0, -Z));
  }
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    const x = cx - dir * Math.sin(a) * CURL;
    const y = cy - dir * Math.cos(a) * CURL;
    pts.push(new THREE.Vector3(x, y, -Z + 2 * Z * smooth(0, 1, i / 24)));
  }
  const xTip = -dir * OFF;
  for (let i = 1; i <= 12; i++) {
    pts.push(new THREE.Vector3(xTip, cy + dir * TIP * (i / 12), Z));
  }
  return pts;
}

function pinky(dir, tone, crease, nailTone, seed) {
  const group = new THREE.Group();
  const pts = pinkyPath(dir);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = lumpy(taper(new THREE.TubeGeometry(curve, 320, S, 40, false), curve, 1.12, 0.94), 1.8, seed);
  const mat = clay(tone, seed, [22, 1]);
  const body = new THREE.Mesh(tube, mat);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // Both ends are rounded off: a clay finger, not a pipe cut by the edge of the picture.
  const base = new THREE.Mesh(lumpy(new THREE.SphereGeometry(S * 1.12, 40, 28), 0.8, seed + 2), mat);
  base.position.copy(pts[0]);
  base.castShadow = base.receiveShadow = true;
  group.add(base);

  // The fingertip: a ball on the end of the tube, like a pad.
  const end = pts[pts.length - 1];
  const tip = new THREE.Mesh(lumpy(new THREE.SphereGeometry(S * 0.96, 40, 28), 0.8, seed + 1), mat);
  tip.position.copy(end);
  tip.castShadow = tip.receiveShadow = true;
  group.add(tip);

  // The nail: a flattened pebble on the face of the tip.
  const nail = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), new THREE.MeshStandardMaterial({ color: col(nailTone), roughness: 0.32 }));
  nail.scale.set(0.95, 1.55, 0.42);
  nail.position.set(end.x, end.y - dir * 14, end.z + S * 0.82);
  group.add(nail);

  // Two knuckle creases on the run, pressed in with a tool.
  for (const k of [104, 120]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 1.12 + 0.6, 1.4, 10, 48), new THREE.MeshStandardMaterial({ color: col(crease), roughness: 0.8 }));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(dir * k, -dir * OFF, -Z);
    ring.scale.set(1, 1, 1);
    // only the front half of a crease shows on a real finger
    ring.material.side = THREE.FrontSide;
    group.add(ring);
  }
  return group;
}

export function pinkyLoop(width, height) {
  const { renderer, scene, camera } = stage(width, height);
  const theirs = pinky(-1, C.pink, C.pinkDeep, C.text, 7);
  const mine = pinky(1, C.gold, C.goldDeep, C.pink, 11);
  // Tilted 45 degrees, rising to the right, like the logo mark (D066). The hook still happens
  // along the fingers' own line; only the whole pair is turned.
  const pair = new THREE.Group();
  pair.add(theirs, mine);
  pair.rotation.z = Math.PI / 4;
  scene.add(pair);

  const LIFT = 46, TRAVEL = 70;
  return (p) => {
    // 0.00 to 0.30 slide in, 0.30 to 0.42 hook, 0.42 to 0.56 tug, then hold, 0.80 let go, 0.88 slide out.
    const inn = smooth(0, 0.3, p) * (1 - smooth(0.86, 1, p));
    const hook = (p < 0.3 ? 0 : p < 0.42 ? easeOutBack(span(0.3, 0.42, p)) : 1) * (1 - smooth(0.78, 0.88, p));
    const tugT = span(0.44, 0.56, p);
    const tug = p > 0.44 && p < 0.56 ? [-7, 6, -3, 0][Math.min(3, Math.floor(tugT * 4))] * (1 - (tugT * 4) % 1) + [6, -3, 0, 0][Math.min(3, Math.floor(tugT * 4))] * ((tugT * 4) % 1) : 0;
    const bob = Math.sin(p * Math.PI * 4) * 3;

    theirs.position.set(-(1 - inn) * TRAVEL + tug, (1 - hook) * LIFT + bob, 0);
    mine.position.set((1 - inn) * TRAVEL + tug, -(1 - hook) * LIFT + bob, 0);
    // A finger is not a rail: a little roll on the way in.
    theirs.rotation.x = (1 - inn) * 0.35;
    mine.rotation.x = -(1 - inn) * 0.35;

    const yaw = 0.42 * Math.sin(p * Math.PI * 2);
    const pitch = 0.2 + 0.08 * Math.cos(p * Math.PI * 2);
    const dist = 800;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
}

// ---------------------------------------------------------------------------------------------
// Loop 2: a clay padlock drops shut, squashes, and swings open again.

export function padlockLoop(width, height) {
  const { renderer, scene, camera } = stage(width, height);
  const lock = new THREE.Group();
  scene.add(lock);

  const bodyMat = clay(C.pink, 3, [3, 3]);
  const body = new THREE.Mesh(lumpy(new RoundedBoxGeometry(150, 118, 64, 6, 22), 1.4, 3), bodyMat);
  body.castShadow = body.receiveShadow = true;
  lock.add(body);

  // The keyhole: a dot and a slot pressed into the front.
  const holeMat = new THREE.MeshStandardMaterial({ color: col(C.onPink), roughness: 0.9 });
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 8, 32), holeMat);
  dot.rotation.x = Math.PI / 2;
  dot.position.set(0, 10, 30);
  const slot = new THREE.Mesh(new RoundedBoxGeometry(9, 30, 8, 2, 3), holeMat);
  slot.position.set(0, -10, 30);
  lock.add(dot, slot);

  // The shackle: a bent rod in the bone colour, one leg longer so it can swing open.
  const shackle = new THREE.Group();
  const rodMat = clay(C.gold, 5, [10, 1]);
  const R = 46, rod = 12;
  const arch = new THREE.Mesh(lumpy(new THREE.TorusGeometry(R, rod, 20, 64, Math.PI), 0.8, 5), rodMat);
  arch.position.y = 0;
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(rod, rod, 70, 24), rodMat);
  legL.position.set(-R, -35, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(rod, rod, 40, 24), rodMat);
  legR.position.set(R, -20, 0);
  for (const m of [arch, legL, legR]) { m.castShadow = m.receiveShadow = true; shackle.add(m); }
  // Pivot on the long leg: move the group so the long leg sits in its socket.
  const pivot = new THREE.Group();
  pivot.position.set(-R, 59, 0);
  shackle.position.set(R, 0, 0);
  pivot.add(shackle);
  lock.add(pivot);

  return (p) => {
    // 0 to 0.22 open and swung out, 0.22 to 0.34 swing back over the hole, 0.34 to 0.42 drop
    // and click, squash, hold, 0.78 lift, 0.9 swing out.
    const swing = (1 - smooth(0.2, 0.34, p)) + smooth(0.84, 0.98, p);
    const up = 1 - (p < 0.34 ? 0 : p < 0.44 ? easeOutBack(span(0.34, 0.44, p)) : 1) * (1 - smooth(0.74, 0.84, p));
    pivot.rotation.y = -Math.min(1, swing) * 2.1;
    pivot.position.y = 59 + up * 30;

    const click = span(0.42, 0.56, p);
    const squash = p > 0.42 && p < 0.56 ? Math.sin(click * Math.PI) * 0.09 : 0;
    lock.scale.set(1 + squash, 1 - squash, 1 + squash * 0.6);
    lock.position.y = -26 + Math.sin(p * Math.PI * 4) * 3;
    lock.rotation.z = Math.sin(p * Math.PI * 2) * 0.06;
    lock.rotation.y = Math.sin(p * Math.PI * 2) * 0.5;

    camera.position.set(0, 120, 760);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
}
