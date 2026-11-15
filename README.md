# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/tapetelo/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/tapetelo/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

EMBER YARD — Dusk Shift: a round-based tactical FPS in a dusk container yard, built on three.js 0.187.0. You are EMBERS — plant the charge at the Foundry (A) or the Crane Dock (B), or eliminate HARBOR WATCH. Win rounds, earn money, buy better guns. First to 5 rounds takes the yard.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

No build step, no network requests: every sound is synthesised with WebAudio and every texture is painted in code. Single-player against bots.

## How it plays

- First-person view, mouse look (pointer lock, drag fallback), WASD movement with acceleration, crouch, jump, walk-quiet
- Weapons: P9 Sparrow pistol, R9 Rook SMG, VK Ember rifle, L7 Longshot sniper, frag grenades — bought with round money in the buy menu (B)
- Gunplay: hits checked against head/body spheres with headshot multipliers, recoil and spread that punish firing on the move — stopping to aim pays
- Objective: plant (hold E on a site, 3s) and defend the charge through its 35s fuse, or defuse it; rounds also end by elimination or timeout
- Bots: route over a waypoint graph, hold angles, react to what they see and hear, strafe in firefights, plant and defuse
- HUD: health, ammunition, round timer, score, money, alive counts, kill feed, minimap, bomb status, round banners

## Screenshot presets

Open the game with `?view=spawn | mid | site-a | end` (with `?auto=1`) to jump straight to a staged moment — buy phase, a mid-lane firefight, a live charge at the Foundry, a round-end banner. `window.__ember` exposes the sim for headless play-tests.

## Layout

- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `game/index.html` — the HUD shell and import map
- `game/src/` — one module per job: `state` (tuning + match state), `world` (map + collision), `actors` (movement physics), `weapons` (hits, recoil, grenades), `bots` (AI), `rounds` (match flow + economy), `effects` (tracers, sparks), `audio` (synthesised sounds), `hud` (DOM readouts + minimap), `input` (keyboard/mouse), `main` (bootstrap + fixed-step loop)
- `game/vendor/three/` — three.js 0.187.0, byte for byte from npm via the kit
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged
- `screenshots/` — real renders of this game's own code

---

<sub>Entered on [make.fun](https://make.fun/?ref=csjd625h&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
