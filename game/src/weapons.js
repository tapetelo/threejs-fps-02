// weapons.js — firing, recoil and spread, hit resolution, grenades.
// Hits are checked against actor bodies in plain numbers: a ray from the
// shooter's eye against head/body spheres, blocked by wall boxes. Headshots
// deal the weapon's head multiplier. Spread grows with movement, airtime and
// sustained fire, and decays when still — stopping to aim always pays.

import { WEAPONS, GRENADE, CFG } from './state.js';
import { rayWalls } from './world.js';

export function eyePos(a) {
  return { x: a.x, y: a.crouch ? CFG.crouchEye : CFG.eyeHeight, z: a.z };
}

export function aimDir(a, spread) {
  // Spread jitters the aim direction; recoilPitch lifts it after each shot.
  const yaw = a.yaw + (Math.random() - 0.5) * 2 * spread;
  const pitch = a.pitch + a.recoilPitch + (Math.random() - 0.5) * 2 * spread;
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

export function currentSpread(a) {
  const w = WEAPONS[a.weapon];
  let s = w.spread + a.spreadBloom;
  if (a.speed2d > 0.5) s += w.moveSpread * Math.min(1, a.speed2d / CFG.runSpeed);
  if (!a.onGround) s += w.airSpread;
  if (a.crouch) s *= 0.75;
  return s;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

// Resolve one shot. Returns {hit, victim, headshot, dist, point} or a miss
// with the wall distance. Walls block; the nearest actor sphere wins.
export function resolveShot(shooter, state, colliders) {
  const w = WEAPONS[shooter.weapon];
  const eye = eyePos(shooter);
  const dir = aimDir(shooter, currentSpread(shooter));
  const wallDist = rayWalls(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, colliders, w.range);
  let best = null;
  for (const t of state.actors) {
    if (t.id === shooter.id || !t.alive) continue;
    // head centre sits ~1.52 above feet (1.06 crouched); body centre ~0.95 (0.62)
    const headY = t.crouch ? 1.06 : 1.52;
    const bodyY = t.crouch ? 0.62 : 0.95;
    const ht = raySphere(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, t.x, headY, t.z, 0.26);
    const bt = raySphere(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, t.x, bodyY, t.z, 0.45);
    let hitT = Infinity, head = false;
    if (ht < bt) { hitT = ht; head = true; } else { hitT = bt; }
    if (hitT < wallDist && (!best || hitT < best.dist)) {
      best = { victim: t, headshot: head, dist: hitT };
    }
  }
  if (best) {
    const d = best.dist;
    const falloff = d > w.range * 0.6 ? 0.75 : 1;
    return {
      hit: true, victim: best.victim, headshot: best.headshot, dist: d,
      damage: Math.round(w.damage * (best.headshot ? w.headMult : 1) * falloff),
      point: { x: eye.x + dir.x * d, y: eye.y + dir.y * d, z: eye.z + dir.z * d },
      end: { x: eye.x + dir.x * d, y: eye.y + dir.y * d, z: eye.z + dir.z * d },
    };
  }
  const end = wallDist === Infinity || wallDist >= w.range
    ? { x: eye.x + dir.x * w.range, y: eye.y + dir.y * w.range, z: eye.z + dir.z * w.range }
    : { x: eye.x + dir.x * wallDist, y: eye.y + dir.y * wallDist, z: eye.z + dir.z * wallDist };
  return { hit: false, dist: wallDist, end };
}

// Can this actor fire right now? Handles mag, fire rate and reload timing.
export function canFire(a, now) {
  const w = WEAPONS[a.weapon];
  if (!a.alive) return false;
  if (a.reloadUntil > now) return false;
  if (a.mag <= 0) return false;
  return now - a.lastShotAt >= 60 / w.rpm;
}

export function startReload(a, now) {
  const w = WEAPONS[a.weapon];
  if (a.mag >= w.mag || a.reserve <= 0 || a.reloadUntil > now) return false;
  a.reloadUntil = now + w.reload;
  return true;
}

export function finishReload(a) {
  const w = WEAPONS[a.weapon];
  const need = w.mag - a.mag;
  const take = Math.min(need, a.reserve);
  a.mag += take; a.reserve -= take;
  a.reloadUntil = -1;
}

export function applyRecoil(a) {
  const w = WEAPONS[a.weapon];
  a.recoilPitch += w.recoil * (0.7 + Math.random() * 0.6);
  if (a.recoilPitch > 0.09) a.recoilPitch = 0.09;
  a.spreadBloom = Math.min(0.05, a.spreadBloom + w.recoil * 0.55);
}

// ---- grenades: thrown by the player or a bot, simulated in the fixed step ----
export function throwGrenade(a, state) {
  if (a.grenades <= 0) return null;
  a.grenades--;
  const dir = aimDir(a, 0.004);
  const eye = eyePos(a);
  const g = {
    x: eye.x + dir.x * 0.6, y: eye.y - 0.15, z: eye.z + dir.z * 0.6,
    vx: dir.x * 13 + a.vx * 0.4, vy: dir.y * 13 + 3.2, vz: dir.z * 13 + a.vz * 0.4,
    fuse: GRENADE.fuse, ownerId: a.id, bounced: 0,
  };
  state.grenades.push(g);
  return g;
}

export function updateGrenades(state, dt, colliders, onExplode) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.fuse -= dt;
    g.vy -= 14 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    // ground bounce
    if (g.y < 0.12) { g.y = 0.12; g.vy = Math.abs(g.vy) * 0.45; g.vx *= 0.7; g.vz *= 0.7; g.bounced++; }
    // wall bounce: sample the box the grenade sits in
    for (const b of colliders) {
      if (g.y < b.y0 || g.y > b.y1) continue;
      if (g.x > b.x0 - 0.12 && g.x < b.x1 + 0.12 && g.z > b.z0 - 0.12 && g.z < b.z1 + 0.12) {
        const pl = g.x - (b.x0 - 0.12), pr = (b.x1 + 0.12) - g.x;
        const pt = g.z - (b.z0 - 0.12), pb = (b.z1 + 0.12) - g.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl || m === pr) g.vx = -g.vx * 0.5; else g.vz = -g.vz * 0.5;
        g.bounced++;
      }
    }
    if (g.fuse <= 0) {
      state.grenades.splice(i, 1);
      onExplode(g);
    }
  }
}

// Damage from an explosion: falls off with distance, blocked by walls.
export function explosionDamage(g, target, colliders) {
  const dx = target.x - g.x, dz = target.z - g.z, dy = 0.9 - g.y;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d > GRENADE.radius) return 0;
  const wall = rayWalls(g.x, g.y, g.z, dx / (d || 1), dy / (d || 1), dz / (d || 1), colliders, d);
  if (wall < d - 0.2) return 0; // a container took the blast
  return Math.round(GRENADE.damage * (1 - (d / GRENADE.radius) * 0.65));
}
