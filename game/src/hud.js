// hud.js — every DOM readout: health, ammo, timer, score, money, kill feed,
// round banners, the buy menu and the minimap. The sim never touches the DOM;
// main.js calls update() once per frame with the fresh state.

import { WEAPONS, BUY_ITEMS, fmtTime, aliveOf, CFG } from './state.js';

export function createHud(world) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hpNum: $('hp-num'), hpFill: $('hp-fill'), money: $('money'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammoBox: $('ammo'),
    weaponName: $('weapon-name'), grenades: $('grenades'),
    timer: $('timer'), roundLabel: $('round-label'),
    scoreEmber: $('score-ember'), scoreWatch: $('score-watch'),
    alive: $('alive'), bombStatus: $('bomb-status'), prompt: $('prompt'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    dmg: $('dmg'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    buy: $('buy'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    minimap: $('minimap'),
  };
  const mm = el.minimap.getContext('2d');
  let lastFeedLen = 0;
  let hitUntil = 0;

  function drawMinimap(state) {
    const W = el.minimap.width, H = el.minimap.height;
    const sx = (x) => ((x + CFG.mapHalfX + 2) / (CFG.mapHalfX * 2 + 4)) * W;
    const sy = (z) => ((z + CFG.mapHalfZ + 2) / (CFG.mapHalfZ * 2 + 4)) * H;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = 'rgba(20,24,34,0.9)';
    mm.fillRect(0, 0, W, H);
    // containers as blocks
    mm.fillStyle = '#4a4038';
    for (const b of world.colliders) {
      if (b.y1 > 5.2) continue;
      mm.fillRect(sx(b.x0), sy(b.z0), Math.max(2, sx(b.x1) - sx(b.x0)), Math.max(2, sy(b.z1) - sy(b.z0)));
    }
    // sites
    for (const [key, s] of Object.entries(world.sites)) {
      mm.fillStyle = key === 'A' ? '#ff7a2f' : '#35c4b5';
      mm.beginPath(); mm.arc(sx(s.x), sy(s.z), 7, 0, Math.PI * 2); mm.fill();
      mm.fillStyle = '#10141d'; mm.font = 'bold 9px sans-serif'; mm.textAlign = 'center'; mm.textBaseline = 'middle';
      mm.fillText(key, sx(s.x), sy(s.z));
    }
    // bomb
    if (state.bomb.state === 'planted' || state.bomb.state === 'dropped') {
      mm.fillStyle = '#ff3b30';
      mm.beginPath(); mm.arc(sx(state.bomb.x), sy(state.bomb.z), 4, 0, Math.PI * 2); mm.fill();
    }
    // actors (hidden bots stay off the minimap in hero staging)
    for (const a of state.actors) {
      if (!a.alive || a.hidden) continue;
      mm.fillStyle = a.team === 'ember' ? '#ff7a2f' : '#35c4b5';
      mm.beginPath(); mm.arc(sx(a.x), sy(a.z), a.isPlayer ? 4.5 : 3, 0, Math.PI * 2); mm.fill();
      if (a.isPlayer) {
        mm.strokeStyle = '#f2ede2'; mm.lineWidth = 1.5;
        mm.beginPath(); mm.moveTo(sx(a.x), sy(a.z));
        mm.lineTo(sx(a.x) - Math.sin(a.yaw) * 9, sy(a.z) - Math.cos(a.yaw) * 9); mm.stroke();
      }
    }
  }

  function renderFeed(state) {
    if (state.events.length === lastFeedLen) return;
    lastFeedLen = state.events.length;
    el.killfeed.innerHTML = '';
    for (const e of state.events.slice(-4)) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="${e.aTeam === 'ember' ? 'e' : 'w'}">${e.a}</span> ${e.headshot ? '<span class="hs">⌖</span> ' : '✕ '}<span class="${e.bTeam === 'ember' ? 'e' : 'w'}">${e.b}</span>`;
      el.killfeed.appendChild(div);
    }
  }

  return {
    showHit(kill, now) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', kill);
      hitUntil = now + 0.14;
    },
    update(state, player, spread, now) {
      // health
      el.hpNum.textContent = Math.max(0, Math.ceil(player.hp));
      el.hpFill.style.width = `${Math.max(0, player.hp)}%`;
      el.hpFill.classList.toggle('low', player.hp <= 30);
      el.dmg.classList.toggle('lowhp', player.alive && player.hp <= 30);
      // ammo
      const w = WEAPONS[player.weapon];
      el.weaponName.textContent = w.name + (player.reloadUntil > now ? ' — reloading…' : '');
      el.ammoMag.textContent = player.mag;
      el.ammoReserve.textContent = `/ ${player.reserve}`;
      el.ammoBox.classList.toggle('empty', player.mag === 0);
      el.grenades.textContent = `◉ Grenades: ${player.grenades} · G to throw`;
      el.money.innerHTML = `$${player.money} <small>· B to buy</small>`;
      // timer + score
      const t = state.phase === 'buy' ? state.phaseT : state.phaseT;
      el.timer.textContent = state.phase === 'matchEnd' ? '—' : fmtTime(t);
      el.timer.classList.toggle('low', (state.phase === 'live' || state.phase === 'planted') && state.phaseT <= 10);
      el.scoreEmber.textContent = state.score.ember;
      el.scoreWatch.textContent = state.score.watch;
      el.roundLabel.textContent = state.phase === 'matchEnd'
        ? 'Match over'
        : `Round ${state.round} · First to ${CFG.roundsToWin}` + (state.phase === 'buy' ? ' · Buy phase' : state.phase === 'planted' ? ' · Charge live' : '');
      el.alive.innerHTML = `<span class="e">▲ EMBERS ${aliveOf(state, 'ember')}</span><span class="w">▼ WATCH ${aliveOf(state, 'watch')}</span>`;
      // bomb status
      if (state.bomb.state === 'planted') {
        el.bombStatus.textContent = `☢ CHARGE LIVE — ${fmtTime(state.bomb.fuse)} · ${world.sites[state.bomb.site].name}`;
      } else if (state.bomb.state === 'dropped') {
        el.bombStatus.textContent = '☢ Charge dropped — pick it up (walk over it)';
      } else if (state.bomb.state === 'carried' && state.bomb.carrierId === state.playerId && (state.phase === 'buy' || state.phase === 'live')) {
        el.bombStatus.textContent = '☢ You carry the charge — reach A or B, hold E to plant';
      } else {
        el.bombStatus.textContent = '';
      }
      // crosshair spread
      el.crosshair.style.setProperty('--gap', `${4 + spread * 260}px`);
      if (now > hitUntil) el.hitmarker.classList.remove('on');
      // banner
      if (state.banner && now < state.banner.until) {
        el.banner.classList.add('show');
        el.bannerTitle.textContent = state.banner.title;
        el.bannerTitle.className = state.banner.team || '';
        el.bannerSub.textContent = state.banner.sub;
      } else {
        el.banner.classList.remove('show');
      }
      renderFeed(state);
      drawMinimap(state);
    },
    setPrompt(text) {
      if (text) { el.prompt.hidden = false; el.prompt.textContent = text; }
      else el.prompt.hidden = true;
    },
    flashDamage() {
      el.dmg.style.opacity = '0.85';
      setTimeout(() => { el.dmg.style.opacity = ''; }, 130);
    },
    buildBuyMenu(state, player, onBuy) {
      el.buyMoney.textContent = `$${player.money}`;
      el.buyList.innerHTML = '';
      for (const item of BUY_ITEMS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'buy-item';
        if (item.weapon) {
          const w = WEAPONS[item.weapon];
          const owned = player.weapon === item.weapon;
          const afford = player.money >= w.price;
          btn.disabled = owned || !afford;
          btn.innerHTML = `<span class="key">${item.key}</span><span class="name">${w.name}</span><span class="desc">${item.desc}</span>${owned ? '<span class="owned">OWNED</span>' : `<span class="price">$${w.price}</span>`}`;
          btn.addEventListener('click', () => onBuy(item));
        } else {
          const afford = player.money >= 300 && player.grenades < 2;
          btn.disabled = !afford;
          btn.innerHTML = `<span class="key">${item.key}</span><span class="name">FRAG GRENADE</span><span class="desc">${item.desc}</span>${player.grenades >= 2 ? '<span class="owned">MAX 2</span>' : '<span class="price">$300</span>'}`;
          btn.addEventListener('click', () => onBuy(item));
        }
        el.buyList.appendChild(btn);
      }
    },
    showBuy(show) { el.buy.hidden = !show; },
    isBuyOpen() { return !el.buy.hidden; },
  };
}
