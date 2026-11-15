// actors.js — movement physics shared by the player and the bots.
// Acceleration, friction, crouching, jumping and AABB collision, all in the
// fixed-step sim. The renderer only copies x/z/yaw/pitch onto meshes.

import { CFG } from './state.js';
import { resolveCircle } from './world.js';

// wish: {fx, fz} unit wish direction in world space, {crouch, jump, walk}
// Returns nothing; mutates the actor.
export function stepMovement(a, wish, dt, colliders) {
  const speed = a.crouch ? CFG.crouchSpeed : (wish.walk ? CFG.walkSpeed : CFG.runSpeed);
  const accel = a.onGround ? CFG.accel : CFG.accel * 0.35;
  a.vx += wish.fx * accel * dt;
  a.vz += wish.fz * accel * dt;
  // friction when no input, or clamp to top speed
  const sp = Math.hypot(a.vx, a.vz);
  if (wish.fx === 0 && wish.fz === 0 && a.onGround) {
    const f = Math.max(0, sp - CFG.friction * dt);
    if (sp > 0) { a.vx *= f / sp; a.vz *= f / sp; }
  } else if (sp > speed) {
    a.vx *= speed / sp; a.vz *= speed / sp;
  }
  // integrate + collide
  let nx = a.x + a.vx * dt;
  let nz = a.z + a.vz * dt;
  nx = Math.max(-CFG.mapHalfX + 0.6, Math.min(CFG.mapHalfX - 0.6, nx));
  nz = Math.max(-CFG.mapHalfZ + 0.6, Math.min(CFG.mapHalfZ - 0.6, nz));
  const height = a.crouch ? 1.25 : 1.75;
  const r = resolveCircle(nx, nz, CFG.playerRadius, a.y, height, colliders);
  // sliding: if the push moved us sideways, kill the velocity into the wall
  if (Math.abs(r.x - nx) > 0.001) a.vx = 0;
  if (Math.abs(r.z - nz) > 0.001) a.vz = 0;
  a.x = r.x; a.z = r.z;
  a.speed2d = Math.hypot(a.vx, a.vz);
  a.moving = a.speed2d > 0.6;

  // vertical: jump + gravity, ground is y=0 everywhere (flat yard)
  if (wish.jump && a.onGround && !a.crouch) {
    a.vy = CFG.jumpSpeed; a.onGround = false;
  }
  if (!a.onGround) {
    a.vy -= CFG.gravity * dt;
    a.y += a.vy * dt;
    if (a.y <= 0) { a.y = 0; a.vy = 0; a.onGround = true; }
  }
  // recoil and bloom decay
  a.recoilPitch *= Math.pow(0.0001, dt); // fast decay toward zero
  a.spreadBloom = Math.max(0, a.spreadBloom - dt * 0.09);
}

// Wish direction from yaw + input axes. forward/strafe are -1..1.
export function wishFromYaw(yaw, forward, strafe) {
  const fx = -Math.sin(yaw) * forward + Math.cos(yaw) * strafe;
  const fz = -Math.cos(yaw) * forward - Math.sin(yaw) * strafe;
  const len = Math.hypot(fx, fz) || 1;
  return { fx: fx / len, fz: fz / len };
}

// Line of sight between two actors' eyes, blocked by wall boxes.
export function hasLOS(ax, ay, az, bx, by, bz, colliders) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 0.01) return true;
  // sample a few points along the segment against every box (cheap, few boxes)
  const steps = Math.ceil(d / 0.8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
    for (const b of colliders) {
      if (px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1 && py > b.y0 && py < b.y1) return false;
    }
  }
  return true;
}

export function dist2d(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

// Yaw that faces from (ax,az) toward (bx,bz), matching aimDir's convention.
export function yawTo(ax, az, bx, bz) {
  return Math.atan2(-(bx - ax), -(bz - az));
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
