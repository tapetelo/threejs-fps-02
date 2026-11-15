// state.js — one place for every tunable number and the whole match state.
// The simulation (actors, rounds, bots) reads and writes this object only;
// rendering reads it and never mutates it. No three.js import here, so the
// sim stays testable apart from the renderer.

export const CFG = {
  tickHz: 60,
  roundTime: 100, // seconds of live play per round
  buyTime: 15, // seconds of buy phase before each round
  fuseTime: 35, // seconds from plant to detonation
  plantTime: 3, // seconds holding E to plant
  defuseTime: 5, // seconds holding E to defuse
  roundsToWin: 5,
  maxRounds: 9,
  startMoney: 800,
  killReward: 300,
  winReward: 325,
  lossReward: 250,
  plantReward: 300,
  eyeHeight: 1.62,
  crouchEye: 1.15,
  playerRadius: 0.38,
  walkSpeed: 4.6,
  runSpeed: 5.6,
  crouchSpeed: 2.4,
  accel: 42,
  friction: 11,
  gravity: 18,
  jumpSpeed: 6.2,
  mapHalfX: 32,
  mapHalfZ: 22,
};

// Weapons. spread is in radians at rest; moving, airborne and repeated fire
// add to it, so stopping to aim is always the accurate choice.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 SPARROW', price: 0, auto: false,
    damage: 26, headMult: 2.0, range: 46, rpm: 320,
    mag: 12, reserveMax: 48, reload: 1.15,
    spread: 0.011, moveSpread: 0.030, airSpread: 0.045, recoil: 0.011, kick: 0.55,
    tracer: 0xffe9a8, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'R9 ROOK', price: 1500, auto: true,
    damage: 19, headMult: 1.9, range: 34, rpm: 780,
    mag: 28, reserveMax: 112, reload: 1.9,
    spread: 0.016, moveSpread: 0.034, airSpread: 0.05, recoil: 0.008, kick: 0.4,
    tracer: 0xffd27a, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'VK EMBER', price: 2700, auto: true,
    damage: 33, headMult: 2.2, range: 70, rpm: 600,
    mag: 25, reserveMax: 75, reload: 2.3,
    spread: 0.007, moveSpread: 0.028, airSpread: 0.042, recoil: 0.011, kick: 0.8,
    tracer: 0xffb14d, sound: 'rifle',
  },
  sniper: {
    id: 'sniper', name: 'L7 LONGSHOT', price: 4100, auto: false,
    damage: 88, headMult: 2.0, range: 120, rpm: 52,
    mag: 5, reserveMax: 15, reload: 3.1,
    spread: 0.002, moveSpread: 0.05, airSpread: 0.06, recoil: 0.05, kick: 2.2,
    tracer: 0x9be8ff, sound: 'sniper',
  },
};

export const GRENADE = { price: 300, damage: 95, radius: 6.5, fuse: 1.6 };

export const BUY_ITEMS = [
  { key: '1', weapon: 'smg', desc: 'Fast close-quarters spray, 28-round mag' },
  { key: '2', weapon: 'rifle', desc: 'Hard-hitting all-rounder, best stopped and aimed' },
  { key: '3', weapon: 'sniper', desc: 'One-shot body threat at long sightlines' },
  { key: '4', grenade: true, desc: 'Frag grenade — bounces once, then bursts' },
];

export const BOT_NAMES = {
  ember: ['Ash', 'Cinder'],
  watch: ['Harbor', 'Kelpie', 'Tide'],
};

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | planted | roundEnd | matchEnd
    phaseT: 0, // seconds left in the current phase
    round: 1,
    score: { ember: 0, watch: 0 },
    time: 0, // total sim seconds
    tick: 0,
    actors: [],
    grenades: [],
    roundWinner: null,
    pendingMatchEnd: null,
    playerId: 0,
    bomb: { state: 'carried', carrierId: 0, site: null, x: 0, z: 0, fuse: 0, plantT: 0, defuseT: 0, defuserId: -1 },
    events: [], // kill feed entries {a, b, headshot, aTeam, bTeam, text}
    banner: null, // {title, sub, team, until}
    lastShot: null, // {x, z, team} — bots hear this and investigate
    winner: null,
    stats: { shots: 0, hits: 0, kills: 0, deaths: 0, plants: 0, defuses: 0 },
    log: [], // short text log for the debug hook
  };
}

export function makeActor(id, name, team, isPlayer, spawn) {
  return {
    id, name, team, isPlayer,
    x: spawn.x, z: spawn.z, y: 0,
    vx: 0, vz: 0, vy: 0,
    yaw: spawn.yaw, pitch: 0,
    hp: 100, alive: true,
    weapon: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserveMax,
    grenades: 0, money: CFG.startMoney,
    kills: 0, deaths: 0,
    crouch: false, onGround: true,
    moving: false, speed2d: 0,
    lastShotAt: -10, reloadUntil: -1, spreadBloom: 0,
    recoilPitch: 0,
    // bot brain, unused for the player
    bot: isPlayer ? null : {
      state: 'route', // route | hold | engage | plant | defuse | investigate | dead
      wp: 0, route: [], holdUntil: 0, reactAt: 0, burstLeft: 0,
      nextShotAt: 0, targetId: -1, strafeDir: 1, strafeUntil: 0,
      stuckT: 0, lastX: 0, lastZ: 0, assignedSite: 'A', role: 'attack',
      plantT: 0, defuseT: 0, thinkAt: 0,
    },
    // rendering handles, filled by main.js
    mesh: null, headMesh: null, gunMesh: null, nameSprite: null,
  };
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function aliveOf(state, team) {
  let n = 0;
  for (const a of state.actors) if (a.team === team && a.alive) n++;
  return n;
}

export function otherTeam(team) { return team === 'ember' ? 'watch' : 'ember'; }
