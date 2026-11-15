// bots.js — the bot brain. Bots route over the waypoint graph, hold angles,
// engage what they see, plant the charge, defuse it, and investigate noise.
// They never stand still: every state ends in movement, a hold with a timer,
// or a firefight. All decisions run in the fixed step; aiming error and
// reaction time keep them fair instead of aimbot-perfect.

import { CFG, WEAPONS, otherTeam } from './state.js';
import { stepMovement, wishFromYaw, hasLOS, dist2d, yawTo, angleDiff } from './actors.js';
import { canFire } from './weapons.js';

function nearestNode(wp, x, z) {
  let best = 0, bd = Infinity;
  wp.nodes.forEach((n, i) => {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function bfs(wp, from, to) {
  if (from === to) return [to];
  const adj = wp.nodes.map(() => []);
  for (const [a, b] of wp.edges) {
    if (a >= wp.nodes.length || b >= wp.nodes.length) continue; // tolerate a stale edge
    adj[a].push(b); adj[b].push(a);
  }
  const prev = new Array(wp.nodes.length).fill(-1);
  const q = [from];
  prev[from] = from;
  while (q.length) {
    const n = q.shift();
    for (const m of adj[n]) {
      if (prev[m] === -1) { prev[m] = n; if (m === to) { const path = [to]; let c = to; while (c !== from) { c = prev[c]; path.unshift(c); } return path; } q.push(m); }
    }
  }
  return [to];
}

function pickSiteNode(wp, site, rng) {
  // goal node nearest the site, with a little variety
  const nodes = wp.nodes.map((n, i) => ({ i, d: dist2d(n.x, n.z, site.x, site.z) }));
  nodes.sort((a, b) => a.d - b.d);
  return nodes[Math.floor(rng() * 2)].i;
}

export function assignRoles(state, world) {
  const rng = Math.random;
  const siteKeys = ['A', 'B'];
  const emberBots = state.actors.filter((a) => a.team === 'ember' && !a.isPlayer);
  const watchBots = state.actors.filter((a) => a.team === 'watch');
  // Attackers: the carrier and one mate push a site; the other pressures mid.
  const pushSite = siteKeys[Math.floor(rng() * 2)];
  emberBots.forEach((b, i) => {
    b.bot.assignedSite = i === 0 ? pushSite : (rng() < 0.5 ? pushSite : siteKeys[1 - siteKeys.indexOf(pushSite)]);
    b.bot.role = 'attack';
    // bots spend their money: rifle if they can, else smg, sometimes a grenade
    if (b.money >= WEAPONS.rifle.price && rng() < 0.7) buyWeapon(b, 'rifle');
    else if (b.money >= WEAPONS.smg.price && rng() < 0.8) buyWeapon(b, 'smg');
    if (b.money >= 300 && rng() < 0.4) { b.money -= 300; b.grenades += 1; }
    const goal = pickSiteNode(world.waypoints, world.sites[b.bot.assignedSite], rng);
    b.bot.route = bfs(world.waypoints, nearestNode(world.waypoints, b.x, b.z), goal);
    b.bot.wp = 0; b.bot.state = 'route'; b.bot.targetId = -1;
  });
  // Defenders: split the sites, one floats mid.
  watchBots.forEach((b, i) => {
    b.bot.assignedSite = i === 2 ? (rng() < 0.5 ? 'A' : 'B') : siteKeys[i % 2];
    b.bot.role = 'defend';
    if (b.money >= WEAPONS.rifle.price && rng() < 0.6) buyWeapon(b, 'rifle');
    else if (b.money >= WEAPONS.smg.price && rng() < 0.8) buyWeapon(b, 'smg');
    if (b.money >= 300 && rng() < 0.35) { b.money -= 300; b.grenades += 1; }
    const goal = pickSiteNode(world.waypoints, world.sites[b.bot.assignedSite], rng);
    b.bot.route = bfs(world.waypoints, nearestNode(world.waypoints, b.x, b.z), goal);
    b.bot.wp = 0; b.bot.state = 'route'; b.bot.targetId = -1;
  });
}

function buyWeapon(b, id) {
  const w = WEAPONS[id];
  b.money -= w.price;
  b.weapon = id; b.mag = w.mag; b.reserve = w.reserveMax;
}

// Visible enemy with the best (nearest) threat, or null.
function scanTargets(bot, state, world) {
  const eyeY = bot.crouch ? CFG.crouchEye : CFG.eyeHeight;
  let best = null, bd = Infinity;
  for (const t of state.actors) {
    if (t.team === bot.team || !t.alive) continue;
    const d = dist2d(bot.x, bot.z, t.x, t.z);
    if (d > 55) continue;
    // peripheral vision: must be roughly in front unless very close
    const toTarget = yawTo(bot.x, bot.z, t.x, t.z);
    if (d > 6 && Math.abs(angleDiff(bot.yaw, toTarget)) > 1.5) continue;
    const ty = t.crouch ? CFG.crouchEye : CFG.eyeHeight;
    if (!hasLOS(bot.x, eyeY, bot.z, t.x, ty, t.z, world.colliders)) continue;
    if (d < bd) { bd = d; best = t; }
  }
  return best ? { target: best, dist: bd } : null;
}

export function updateBot(bot, state, world, dt, hooks) {
  const b = bot.bot;
  if (!bot.alive) { b.state = 'dead'; return; }
  const now = state.time;
  b.thinkAt -= dt;

  // --- perception (a few times a second, not every tick) ---
  if (b.thinkAt <= 0) {
    b.thinkAt = 0.12 + Math.random() * 0.06;
    const seen = scanTargets(bot, state, world);
    if (seen) {
      if (b.targetId !== seen.target.id) {
        b.reactAt = now + 0.35 + Math.random() * 0.35; // reaction time
        b.burstLeft = 0;
      }
      b.targetId = seen.target.id;
      b.targetDist = seen.dist;
      if (b.state !== 'plant' && b.state !== 'defuse') b.state = 'engage';
    } else if (b.state === 'engage') {
      b.targetId = -1;
      b.state = 'route';
    }
    // bomb logic when nothing is seen
    if (!seen) {
      if (bot.team === 'ember' && state.bomb.state === 'carried' && state.bomb.carrierId === bot.id) {
        const site = world.sites[b.assignedSite];
        if (dist2d(bot.x, bot.z, site.x, site.z) < site.r) b.state = 'plant';
      }
      if (bot.team === 'watch' && state.bomb.state === 'planted') {
        const s = state.bomb;
        if (dist2d(bot.x, bot.z, s.x, s.z) < 2.5) b.state = 'defuse';
        else {
          b.state = 'route';
          b.route = bfs(world.waypoints, nearestNode(world.waypoints, bot.x, bot.z), nearestNode(world.waypoints, s.x, s.z));
          b.wp = 0;
        }
      }
      // investigate a heard shot
      if (state.lastShot && state.lastShot.team !== bot.team && now - state.lastShot.at < 3) {
        const d = dist2d(bot.x, bot.z, state.lastShot.x, state.lastShot.z);
        if (d < 26 && b.state === 'hold' && Math.random() < 0.3) {
          b.route = bfs(world.waypoints, nearestNode(world.waypoints, bot.x, bot.z), nearestNode(world.waypoints, state.lastShot.x, state.lastShot.z));
          b.wp = 0; b.state = 'route';
        }
      }
    }
  }

  // --- behaviour ---
  let wish = { fx: 0, fz: 0, crouch: false, jump: false, walk: false };
  const target = b.targetId >= 0 ? state.actors.find((a) => a.id === b.targetId) : null;

  if (b.state === 'engage' && target && target.alive) {
    // face the target, strafe, fire in bursts
    const want = yawTo(bot.x, bot.z, target.x, target.z);
    bot.yaw += Math.max(-2.6 * dt, Math.min(2.6 * dt, angleDiff(bot.yaw, want)));
    const ty = target.crouch ? 1.06 : 1.45;
    const dy = (ty - (bot.crouch ? CFG.crouchEye : CFG.eyeHeight)) / Math.max(1, b.targetDist);
    bot.pitch += Math.max(-1.8 * dt, Math.min(1.8 * dt, dy - bot.pitch));
    if (now > b.strafeUntil) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeUntil = now + 0.7 + Math.random() * 0.9; }
    if (Math.random() < 0.002) bot.crouch = !bot.crouch;
    const w = wishFromYaw(bot.yaw, 0, b.strafeDir * 0.7);
    wish = { fx: w.fx, fz: w.fz, crouch: bot.crouch, jump: false, walk: true };
    if (now >= b.reactAt && canFire(bot, now)) {
      if (b.burstLeft <= 0) b.burstLeft = 2 + Math.floor(Math.random() * 3);
      // aim error: worse far away, worse vs a moving target
      const err = 0.012 + b.targetDist * 0.0011 + (target.moving ? 0.012 : 0);
      const saveYaw = bot.yaw, savePitch = bot.pitch;
      bot.yaw += (Math.random() - 0.5) * 2 * err;
      bot.pitch += (Math.random() - 0.5) * 2 * err;
      hooks.shoot(bot);
      bot.yaw = saveYaw; bot.pitch = savePitch;
      b.burstLeft--;
      if (b.burstLeft <= 0) { b.reactAt = now + 0.25 + Math.random() * 0.45; }
    }
    // reload when the mag runs dry mid-fight
    if (bot.mag === 0) hooks.reload(bot);
  } else if (b.state === 'plant') {
    // stand on the site and channel the plant
    bot.crouch = true;
    wish = { fx: 0, fz: 0, crouch: true, jump: false, walk: false };
    state.bomb.plantT += dt;
    if (Math.floor(state.bomb.plantT * 2) !== Math.floor((state.bomb.plantT - dt) * 2)) hooks.tick(true);
    if (state.bomb.plantT >= CFG.plantTime) hooks.plant(b.assignedSite);
  } else if (b.state === 'defuse') {
    bot.crouch = true;
    wish = { fx: 0, fz: 0, crouch: true, jump: false, walk: false };
    state.bomb.defuseT += dt;
    if (Math.floor(state.bomb.defuseT * 2) !== Math.floor((state.bomb.defuseT - dt) * 2)) hooks.tick(false);
    if (state.bomb.defuseT >= CFG.defuseTime) hooks.defuse(bot);
  } else if (b.state === 'hold') {
    // hold the angle: slow scan, then move on
    bot.yaw += Math.sin(now * 0.5 + bot.id) * 0.35 * dt;
    wish = { fx: 0, fz: 0, crouch: Math.random() < 0.001, jump: false, walk: false };
    if (now >= b.holdUntil) {
      const nodes = world.waypoints.nodes;
      const goal = Math.floor(Math.random() * nodes.length);
      b.route = bfs(world.waypoints, nearestNode(world.waypoints, bot.x, bot.z), goal);
      b.wp = 0; b.state = 'route';
    }
  } else {
    // route: follow the waypoint list
    const node = world.waypoints.nodes[b.route[b.wp] ?? b.route[b.route.length - 1]];
    if (!node) { b.state = 'hold'; b.holdUntil = now + 2; return; }
    const d = dist2d(bot.x, bot.z, node.x, node.z);
    if (d < 1.2) {
      b.wp++;
      if (b.wp >= b.route.length) {
        // arrived: attackers push on to the site, defenders hold
        if (bot.team === 'ember' && state.bomb.state === 'carried' && state.bomb.carrierId === bot.id) {
          b.state = 'hold'; b.holdUntil = now + 0.5;
        } else {
          b.state = 'hold'; b.holdUntil = now + 2.5 + Math.random() * 3;
        }
        return;
      }
    } else {
      const want = yawTo(bot.x, bot.z, node.x, node.z);
      bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, angleDiff(bot.yaw, want)));
      const w = wishFromYaw(bot.yaw, 1, 0);
      wish = { fx: w.fx, fz: w.fz, crouch: false, jump: false, walk: false };
    }
    // stuck detection: no progress in 1.5 s -> re-route to a random node
    if (Math.hypot(bot.x - b.lastX, bot.z - b.lastZ) < 0.05) b.stuckT += dt; else b.stuckT = 0;
    b.lastX = bot.x; b.lastZ = bot.z;
    if (b.stuckT > 1.5) {
      b.stuckT = 0;
      const nodes = world.waypoints.nodes;
      b.route = bfs(world.waypoints, nearestNode(world.waypoints, bot.x, bot.z), Math.floor(Math.random() * nodes.length));
      b.wp = 0;
    }
    // a bot with a grenade lobs it at a distant held angle sometimes
    if (bot.grenades > 0 && Math.random() < dt * 0.02) hooks.grenade(bot);
  }

  stepMovement(bot, wish, dt, world.colliders);

  // footstep sounds for nearby bots
  if (bot.moving && Math.random() < dt * 2.2) hooks.footstep(bot);
}
