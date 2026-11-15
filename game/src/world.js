// world.js — the Ember Yard map: a dusk container yard with two bomb sites.
// Geometry is plain three.js boxes with canvas-painted textures; collision is
// a list of axis-aligned boxes the sim tests in plain numbers (no three.js
// in the collision path). Waypoints form the graph bots route over.

import * as THREE from 'three';

// One collider: {x0,z0,x1,z1,y0,y1}. y1 above head height blocks shots too.
function box(x0, z0, x1, z1, y1, y0 = 0) {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1 };
}

function paintTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function groundTexture() {
  return paintTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#23262e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${22 + Math.random() * 36 | 0},${28 + Math.random() * 34 | 0},0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5);
    }
    // faded yard lane lines
    g.strokeStyle = 'rgba(255,196,77,0.28)'; g.lineWidth = 5; g.setLineDash([26, 22]);
    g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(53,196,181,0.20)'; g.lineWidth = 3;
    g.strokeRect(14, 14, w - 28, h - 28);
  });
}

function containerTexture(base, rib) {
  return paintTexture(256, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = rib; g.fillRect(x, 0, 5, h);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 5, 0, 3, h);
    }
    for (let i = 0; i < 240; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.16})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 2 + Math.random() * 4);
    }
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, w, 5);
  });
}

function hazardTexture() {
  return paintTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#c8932a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#191919';
    for (let i = -h; i < w; i += 32) {
      g.beginPath(); g.moveTo(i, h); g.lineTo(i + 16, 0); g.lineTo(i + 32, 0); g.lineTo(i + 16, h); g.fill();
    }
  });
}

function skylineTexture() {
  return paintTexture(1024, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2b3a5e'); grad.addColorStop(0.55, '#59342e'); grad.addColorStop(1, '#1a1420');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // sun glow low on the horizon
    const glow = g.createRadialGradient(w * 0.72, h * 0.86, 4, w * 0.72, h * 0.86, 220);
    glow.addColorStop(0, 'rgba(255,140,60,0.85)'); glow.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    // city silhouette with lit windows
    g.fillStyle = '#12101c';
    let x = 0;
    while (x < w) {
      const bw = 40 + Math.random() * 70, bh = 60 + Math.random() * 120;
      g.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 8; wy < h - 8; wy += 14) {
        for (let wx = x + 6; wx < x + bw - 6; wx += 12) {
          if (Math.random() < 0.28) { g.fillStyle = Math.random() < 0.7 ? '#ffc44d' : '#7fd8ff'; g.fillRect(wx, wy, 5, 7); g.fillStyle = '#12101c'; }
        }
      }
      x += bw + 6 + Math.random() * 20;
    }
  });
}

const CONTAINER_COLORS = [
  ['#a34a22', '#7e3517'], // rust
  ['#2a6b6b', '#1d4c4c'], // teal
  ['#b98a2e', '#8a6520'], // ochre
  ['#4a5560', '#343d47'], // slate
  ['#5a6b3a', '#42502a'], // moss
  ['#7a3a3a', '#5a2a2a'], // brick
];

export function buildWorld(scene) {
  const colliders = [];
  const animated = { furnaceMat: null, lampMats: [], craneLight: null };
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky, fog, lights ----
  scene.background = new THREE.Color(0x1a2233);
  scene.fog = new THREE.FogExp2(0x2a2530, 0.016);
  const hemi = new THREE.HemisphereLight(0x8fa3c7, 0x2a1c14, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff8a3c, 1.5);
  sun.position.set(-30, 18, -24);
  scene.add(sun);
  const skyTex = skylineTexture();
  const sky = new THREE.Mesh(
    new THREE.CylinderGeometry(160, 160, 90, 24, 1, true),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  sky.position.y = 20;
  group.add(sky);

  // ---- ground ----
  const groundTex = groundTexture();
  groundTex.repeat.set(8, 6);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 66),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const addBox = (x, z, w, d, h, mat, y0 = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y0 + h / 2, z);
    group.add(m);
    colliders.push(box(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y0 + h, y0));
    return m;
  };
  const std = (opts) => new THREE.MeshStandardMaterial(opts);

  // ---- perimeter walls ----
  const wallMat = std({ color: 0x3a4152, roughness: 0.9 });
  addBox(0, -23.4, 68, 2.4, 4.2, wallMat);
  addBox(0, 23.4, 68, 2.4, 4.2, wallMat);
  addBox(-33.4, 0, 2.4, 49, 4.2, wallMat);
  addBox(33.4, 0, 2.4, 49, 4.2, wallMat);

  // ---- containers: lanes, corners, sightlines ----
  // Container size: 6 long x 2.4 wide x 2.6 high (single), some stacked.
  const cont = (x, z, w, d, ci, stack = false, rotY = 0) => {
    const [base, rib] = CONTAINER_COLORS[ci % CONTAINER_COLORS.length];
    const mat = std({ map: containerTexture(base, rib), roughness: 0.75, metalness: 0.35 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), mat);
    m.position.set(x, 1.3, z); m.rotation.y = rotY;
    group.add(m);
    const hw = (rotY === 0 ? w : d) / 2, hd = (rotY === 0 ? d : w) / 2;
    colliders.push(box(x - hw, z - hd, x + hw, z + hd, 2.6));
    if (stack) {
      const m2 = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), mat);
      m2.position.set(x, 3.9, z); m2.rotation.y = rotY;
      group.add(m2);
      colliders[colliders.length - 1].y1 = 5.2;
    }
    return m;
  };

  // Mid lane: staggered containers make a zig-zag with two gaps
  cont(-14, -6, 6, 2.4, 0, false, Math.PI / 2);
  cont(-14, 7, 6, 2.4, 1, true, Math.PI / 2);
  cont(-4, -9, 6, 2.4, 2);
  cont(-4, 9, 6, 2.4, 3);
  cont(6, -4, 6, 2.4, 4, false, Math.PI / 2);
  cont(6, 6, 6, 2.4, 5, true, Math.PI / 2);
  // A long (north lane)
  cont(-20, -16, 6, 2.4, 1);
  cont(-10, -18, 6, 2.4, 3, true);
  cont(0, -16, 6, 2.4, 0);
  cont(12, -18, 6, 2.4, 2);
  // B lane (south lane)
  cont(-20, 16, 6, 2.4, 4);
  cont(-8, 18, 6, 2.4, 5, true);
  cont(2, 16, 6, 2.4, 1);
  cont(14, 18, 6, 2.4, 3);
  // Site A cover + foundry, site B cover + crane base
  cont(24, -10, 6, 2.4, 0, false, Math.PI / 2);
  cont(18, -19, 6, 2.4, 2);
  cont(24, 10, 6, 2.4, 1, false, Math.PI / 2);
  cont(16, 19, 6, 2.4, 4);

  // ---- crates (1.1 m cover boxes) ----
  const crateMat = std({ color: 0x6b5433, roughness: 0.95 });
  const crate = (x, z, s = 1.1, h = 1.1) => addBox(x, z, s, s, h, crateMat);
  crate(-24, -2); crate(-24, 3); crate(-9, 0); crate(1, -1.5); crate(11, 0.5);
  crate(20, -6); crate(20, 6); crate(-2, -13); crate(8, 13); crate(26, -16.5, 1.4, 1.4);
  crate(26, 16.5, 1.4, 1.4); crate(-16, -12); crate(-16, 12);

  // ---- Site A: the Foundry — glowing furnace, hazard ring ----
  const furnaceMat = std({ color: 0x2a2118, roughness: 0.6, metalness: 0.4, emissive: 0xff5a00, emissiveIntensity: 0.55 });
  animated.furnaceMat = furnaceMat;
  addBox(29.5, -15, 3.4, 7, 5.2, furnaceMat);
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.8),
    new THREE.MeshBasicMaterial({ color: 0xff7a1e }),
  );
  mouth.position.set(27.7, 1.4, -15); mouth.rotation.y = -Math.PI / 2;
  group.add(mouth);
  const furnaceLight = new THREE.PointLight(0xff6a1e, 60, 22, 1.8);
  furnaceLight.position.set(26, 2.5, -15);
  group.add(furnaceLight);
  animated.craneLight = furnaceLight;

  // ---- Site B: the Crane — tall gantry with amber lamp ----
  const craneMat = std({ color: 0x8a6a2a, roughness: 0.6, metalness: 0.6 });
  addBox(29.5, 11, 1.2, 1.2, 11, craneMat);
  addBox(29.5, 19, 1.2, 1.2, 11, craneMat);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 12), craneMat);
  jib.position.set(29.5, 10.6, 15); group.add(jib);
  const craneLamp = new THREE.PointLight(0xffc44d, 40, 20, 1.8);
  craneLamp.position.set(29.5, 9.5, 15);
  group.add(craneLamp);

  // ---- lamp posts along mid ----
  const poleMat = std({ color: 0x22262e, roughness: 0.7, metalness: 0.5 });
  const lampSpots = [[-20, 0], [0, 0], [20, 0], [-28, -20], [28, 20]];
  for (const [lx, lz] of lampSpots) {
    addBox(lx, lz, 0.25, 0.25, 4.6, poleMat);
    const headMat = std({ color: 0x332211, emissive: 0xffc44d, emissiveIntensity: 1.6 });
    animated.lampMats.push(headMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), headMat);
    head.position.set(lx, 4.7, lz); group.add(head);
  }
  const midLight = new THREE.PointLight(0xffc44d, 26, 18, 1.8);
  midLight.position.set(0, 4.4, 0);
  group.add(midLight);

  // ---- hazard rings marking the bomb sites ----
  const hazTex = hazardTexture();
  const ring = (x, z) => {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 32),
      new THREE.MeshBasicMaterial({ map: hazTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.02, z);
    group.add(r);
  };
  ring(24, -15); ring(24, 15);

  // ---- site letter markers: floating A / B sprites (canvas text) ----
  const letter = (ch, x, z, color) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.font = 'bold 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(ch, 64, 70);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(2.4, 2.4, 1); s.position.set(x, 5.4, z);
    group.add(s);
    return s;
  };
  const siteA = letter('A', 24, -15, '#ff7a2f');
  const siteB = letter('B', 24, 15, '#35c4b5');

  return {
    group, colliders, animated, siteA, siteB,
    spawns: {
      ember: [
        { x: -29, z: -6, yaw: -Math.PI / 2 }, { x: -29, z: 0, yaw: -Math.PI / 2 }, { x: -29, z: 6, yaw: -Math.PI / 2 },
      ],
      watch: [
        { x: 29, z: -18, yaw: Math.PI / 2 }, { x: 29, z: 0, yaw: Math.PI / 2 }, { x: 29, z: 18, yaw: Math.PI / 2 },
      ],
    },
    sites: {
      A: { x: 24, z: -15, r: 3.2, name: 'FOUNDRY' },
      B: { x: 24, z: 15, r: 3.2, name: 'CRANE DOCK' },
    },
    // Waypoint graph: nodes on lanes, edges connect neighbours. Bots BFS over it.
    waypoints: {
      nodes: [
        { x: -28, z: 0 }, { x: -20, z: 0 }, { x: -14, z: 0 }, { x: -9, z: -3 }, { x: -9, z: 4 },
        { x: -2, z: 0 }, { x: 4, z: -3 }, { x: 4, z: 4 }, { x: 12, z: 0 }, { x: 18, z: -4 },
        { x: 18, z: 5 }, { x: 24, z: -15 }, { x: 24, z: 15 }, { x: 24, z: 0 },
        { x: -20, z: -13 }, { x: -10, z: -14 }, { x: 0, z: -13 }, { x: 10, z: -13 }, { x: 18, z: -13 },
        { x: -20, z: 13 }, { x: -8, z: 14 }, { x: 2, z: 13 }, { x: 12, z: 13 }, { x: 18, z: 13 },
        { x: 28, z: -8 }, { x: 28, z: 8 }, { x: -28, z: -10 }, { x: -28, z: 10 },
      ],
      edges: [
        [0, 1], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5], [5, 6], [5, 7], [6, 8], [7, 8],
        [8, 9], [8, 10], [9, 13], [10, 13], [9, 11], [10, 12], [13, 11], [13, 12],
        [1, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 11], [17, 9],
        [1, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 12], [22, 10],
        [25, 11], [26, 12], [0, 26], [0, 27], [26, 14], [27, 19],
      ],
    },
  };
}

// Ray vs AABB (slab test). Origin/direction are plain numbers; returns the
// distance along the ray to the first hit, or Infinity.
export function rayHitBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Distance from a point to the nearest wall along a ray (for LOS + shots).
export function rayWalls(ox, oy, oz, dx, dy, dz, colliders, maxDist) {
  let best = maxDist;
  for (const b of colliders) {
    const t = rayHitBox(ox, oy, oz, dx, dy, dz, b);
    if (t < best) best = t;
  }
  return best;
}

// Circle (x,z,r) vs colliders: push the circle out of any overlap. Returns
// true when a push happened. y is the actor's foot height; boxes below the
// feet or above the head are ignored.
export function resolveCircle(x, z, r, y, height, colliders) {
  let pushed = false;
  for (const b of colliders) {
    if (b.y1 <= y + 0.05 || b.y0 >= y + height) continue;
    const cx = Math.max(b.x0, Math.min(x, b.x1));
    const cz = Math.max(b.z0, Math.min(z, b.z1));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push; z += dz * push;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - b.x0, pr = b.x1 - x, pt = z - b.z0, pb = b.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x0 - r; else if (m === pr) x = b.x1 + r;
        else if (m === pt) z = b.z0 - r; else z = b.z1 + r;
      }
      pushed = true;
    }
  }
  return { x, z, pushed };
}
