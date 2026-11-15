// rounds.js — the match flow: buy phase, live round, planted fuse, round end.
// Win conditions: eliminate the other team, detonate the planted charge, or
// defuse it; if time runs out with no plant, the defenders win. Money flows
// after every round and the carrier is picked fresh each round.

import { CFG, WEAPONS, aliveOf, otherTeam } from './state.js';
import { assignRoles } from './bots.js';

export function startMatch(state, world) {
  state.score = { ember: 0, watch: 0 };
  state.round = 1;
  state.winner = null;
  for (const a of state.actors) {
    a.money = CFG.startMoney;
    a.kills = 0; a.deaths = 0;
    resetLoadout(a);
  }
  startRound(state, world);
}

export function resetLoadout(a) {
  a.weapon = 'pistol';
  a.mag = WEAPONS.pistol.mag;
  a.reserve = WEAPONS.pistol.reserveMax;
  a.grenades = 0;
  a.reloadUntil = -1;
}

function spawnAll(state, world) {
  state.actors.forEach((a, i) => {
    const spawn = world.spawns[a.team][i % 3];
    a.x = spawn.x; a.z = spawn.z; a.y = 0;
    a.vx = 0; a.vz = 0; a.vy = 0;
    a.yaw = spawn.yaw; a.pitch = 0;
    a.hp = 100; a.alive = true; a.crouch = false;
    a.recoilPitch = 0; a.spreadBloom = 0;
    if (a.bot) { a.bot.state = 'route'; a.bot.targetId = -1; }
  });
}

export function startRound(state, world) {
  spawnAll(state, world);
  for (const a of state.actors) resetLoadout(a);
  // the carrier is the player when they are alive to carry, else a bot
  const carrier = state.actors.find((a) => a.team === 'ember' && a.isPlayer) || state.actors.find((a) => a.team === 'ember');
  state.bomb = { state: 'carried', carrierId: carrier ? carrier.id : -1, site: null, x: 0, z: 0, fuse: 0, plantT: 0, defuseT: 0, defuserId: -1 };
  state.grenades = [];
  state.phase = 'buy';
  state.phaseT = CFG.buyTime;
  assignRoles(state, world);
  setBanner(state, `Round ${state.round}`, state.bomb.carrierId === state.playerId ? 'You carry the charge — take it to A or B' : `${nameOf(state, state.bomb.carrierId)} carries the charge`, null, 3);
}

export function nameOf(state, id) {
  const a = state.actors.find((x) => x.id === id);
  return a ? a.name : '—';
}

export function setBanner(state, title, sub, team, seconds) {
  state.banner = { title, sub: sub || '', team: team || null, until: state.time + (seconds || 2.5) };
}

export function buyWeaponFor(state, actor, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w || w.price === 0) return false;
  if (actor.money < w.price || actor.weapon === weaponId) return false;
  if (state.phase !== 'buy') return false;
  actor.money -= w.price;
  actor.weapon = weaponId;
  actor.mag = w.mag; actor.reserve = w.reserveMax;
  return true;
}

export function buyGrenadeFor(state, actor) {
  if (state.phase !== 'buy' || actor.money < 300 || actor.grenades >= 2) return false;
  actor.money -= 300;
  actor.grenades += 1;
  return true;
}

// Called when an actor's hp reaches 0. Awards money, feeds the kill feed,
// and checks the elimination win.
export function onKill(state, world, victim, attacker, headshot) {
  victim.alive = false;
  victim.deaths += 1;
  victim.hp = 0;
  if (attacker && attacker.id !== victim.id) {
    attacker.kills += 1;
    attacker.money += CFG.killReward;
    if (attacker.isPlayer) state.stats.kills += 1;
  }
  if (victim.isPlayer) state.stats.deaths += 1;
  state.events.push({
    a: attacker ? attacker.name : '—', b: victim.name, headshot,
    aTeam: attacker ? attacker.team : 'ember', bTeam: victim.team,
  });
  if (state.events.length > 5) state.events.shift();
  // the charge drops where its carrier fell
  if (state.bomb.state === 'carried' && state.bomb.carrierId === victim.id) {
    state.bomb.state = 'dropped';
    state.bomb.x = victim.x; state.bomb.z = victim.z;
  }
  checkElimination(state, world);
}

function checkElimination(state, world) {
  if (state.phase !== 'live' && state.phase !== 'planted') return;
  if (aliveOf(state, 'ember') === 0) endRound(state, world, 'watch', 'HARBOR WATCH eliminated EMBERS');
  else if (aliveOf(state, 'watch') === 0) endRound(state, world, 'ember', 'EMBERS eliminated HARBOR WATCH');
}

export function plantBomb(state, world, siteKey) {
  const site = world.sites[siteKey];
  state.bomb.state = 'planted';
  state.bomb.site = siteKey;
  state.bomb.x = site.x; state.bomb.z = site.z;
  state.bomb.fuse = CFG.fuseTime;
  state.bomb.plantT = 0; state.bomb.defuseT = 0;
  state.phase = 'planted';
  state.phaseT = CFG.fuseTime;
  const carrier = state.actors.find((a) => a.id === state.bomb.carrierId);
  if (carrier) carrier.money += CFG.plantReward;
  if (carrier && carrier.isPlayer) state.stats.plants += 1;
  setBanner(state, 'Charge planted', `Detonation in ${CFG.fuseTime}s — defend ${site.name}`, 'ember', 3);
}

export function defuseBomb(state, world, defuser) {
  if (defuser.isPlayer) state.stats.defuses += 1;
  endRound(state, world, 'watch', `${defuser.name} defused the charge`);
}

export function endRound(state, world, winnerTeam, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.score[winnerTeam] += 1;
  for (const a of state.actors) {
    a.money += a.team === winnerTeam ? CFG.winReward : CFG.lossReward;
    if (a.money > 9000) a.money = 9000;
  }
  const title = winnerTeam === 'ember' ? 'EMBERS win the round' : 'HARBOR WATCH win the round';
  setBanner(state, title, reason, winnerTeam, 4);
  state.phase = 'roundEnd';
  state.phaseT = 4;
  state.roundWinner = winnerTeam;
  if (state.score[winnerTeam] >= CFG.roundsToWin || state.round >= CFG.maxRounds) {
    state.pendingMatchEnd = winnerTeam;
  }
}

export function advanceRound(state, world) {
  if (state.pendingMatchEnd) {
    state.phase = 'matchEnd';
    state.winner = state.pendingMatchEnd;
    state.phaseT = 0;
    return;
  }
  state.round += 1;
  startRound(state, world);
}

// The fixed-step driver for round timing. Called every tick.
export function tickRounds(state, world, dt) {
  if (state.phase === 'menu' || state.phase === 'matchEnd') return;
  state.phaseT -= dt;
  if (state.phase === 'buy' && state.phaseT <= 0) {
    state.phase = 'live';
    state.phaseT = CFG.roundTime;
    setBanner(state, 'Go — take a site', 'Plant the charge or eliminate HARBOR WATCH', null, 2);
  } else if (state.phase === 'live' && state.phaseT <= 0) {
    // time out with no plant: defenders hold the yard
    endRound(state, world, 'watch', 'Time ran out — the charge never went down');
  } else if (state.phase === 'planted') {
    state.bomb.fuse = state.phaseT;
    if (state.phaseT <= 0) {
      endRound(state, world, 'ember', 'The charge detonated at ' + world.sites[state.bomb.site].name);
    }
  } else if (state.phase === 'roundEnd' && state.phaseT <= 0) {
    advanceRound(state, world);
  }
}
