/* ==========================================================================
   BANNERFALL - screens, input, saving, sound
   Flow: Legion select -> World map -> Battle -> (win/lose) -> World map
   Everything is saved on the device with localStorage. No network calls at all.
   ========================================================================== */
(function () {
  'use strict';
  const BF = globalThis.BF;
  const G = BF.GRID;
  const $ = (s, r) => (r || document).querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------------- save data ---------------- */
  const KEY = 'bannerfall.save.v1';
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 1) return s;
    } catch (e) { /* first run or storage blocked */ }
    return { v: 1, sound: true, last: null, hintSeen: false, camps: {} };
  }
  let save = loadSave();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  function camp(fid) {
    if (!save.camps[fid]) save.camps[fid] = { conquered: {}, glory: 0, upg: { treasury: 0, barracks: 0, walls: 0 }, won: false };
    return save.camps[fid];
  }

  /* ---------------- sound (tiny synthesised tones, no files) ---------------- */
  const Sound = {
    ctx: null,
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); } catch (e) { /* no audio */ }
    },
    tone(f, d, type, v, slide, delay) {
      if (!save.sound || !this.ctx) return;
      const t = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      g.gain.setValueAtTime(v || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + d);
    },
    play(n) {
      switch (n) {
        case 'place': this.tone(240, 0.12, 'triangle', 0.07, 90); break;
        case 'sell': this.tone(300, 0.14, 'triangle', 0.05, -120); break;
        case 'coin': this.tone(880, 0.07, 'sine', 0.025, 220); break;
        case 'deny': this.tone(120, 0.16, 'square', 0.03); break;
        case 'leak': this.tone(110, 0.3, 'sawtooth', 0.06, -50); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.06, 0, i * 0.13)); break;
        case 'lose': [330, 262, 196, 147].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.05, 0, i * 0.18)); break;
        case 'ui': this.tone(520, 0.06, 'sine', 0.04); break;
      }
    },
  };
  document.addEventListener('pointerdown', () => Sound.unlock(), { passive: true });

  /* ---------------- helpers ---------------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
  }
  const modalEl = $('#modal');
  function openModal(html, opts) {
    opts = opts || {};
    modalEl.className = 'modal' + (opts.center ? ' center' : '');
    modalEl.innerHTML = '<div class="card">' + html + '</div>';
    modalEl.onclick = (e) => { if (e.target === modalEl && opts.dismiss !== false) closeModal(); };
    return $('.card', modalEl);
  }
  function closeModal() { modalEl.className = 'modal hidden'; modalEl.innerHTML = ''; modalEl.onclick = null; }
  const pips = (n, of) => '<span class="pips">' + Array.from({ length: of }, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span>';
  const coin = '<span class="coin"></span>';
  const campaignOf = () => BF.buildCampaign(save.last);
  const conqueredCount = (c) => Object.keys(c.conquered).length;

  /* ======================= 1. LEGION SELECT ======================= */
  let pick = save.last || 'men';
  function renderLegions() {
    const root = $('#screen-legion');
    const total = BF.TERRITORY_TEMPLATES.length;
    root.innerHTML =
      '<div class="title"><h1>BANNERFALL</h1><p>Choose your legion. Conquer the world.</p></div>' +
      '<div class="legions">' +
      BF.FACTIONS.map((f) => {
        const c = save.camps[f.id];
        const done = c ? conqueredCount(c) : 0;
        return (
          '<button class="legion' + (f.id === pick ? ' sel' : '') + '" data-id="' + f.id + '" style="--c:' + f.color + '">' +
          (done ? '<span class="progress">' + done + ' / ' + total + ' conquered</span>' : '') +
          '<h3>' + f.name + '</h3><div class="tag">' + f.tagline + '</div>' +
          '<ul>' + f.perks.map((p) => '<li>' + p + '</li>').join('') + '</ul>' +
          '<div class="roster">' +
          BF.ROLES.map((r) => '<div>' + f.units[r].name + '<b>' + f.units[r].cost + '</b></div>').join('') +
          '</div></button>'
        );
      }).join('') +
      '</div><div class="foot"><button class="btn" id="go-map"></button></div>';
    const label = () => { $('#go-map').textContent = 'Lead the ' + BF.factionById(pick).short; };
    label();
    root.querySelectorAll('.legion').forEach((b) =>
      b.addEventListener('click', () => {
        pick = b.dataset.id;
        root.querySelectorAll('.legion').forEach((x) => x.classList.toggle('sel', x === b));
        label(); Sound.play('ui');
      })
    );
    $('#go-map').addEventListener('click', () => { save.last = pick; persist(); Sound.play('ui'); renderMap(); show('map'); });
  }

  /* ======================= 2. WORLD MAP ======================= */
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const unlocked = (c, t) => t.index === 0 || !!c.conquered[BF.TERRITORY_TEMPLATES[t.index - 1].id];

  function renderMap() {
    const f = BF.factionById(save.last);
    const c = camp(f.id);
    const terrs = campaignOf();
    const root = $('#screen-map');
    root.innerHTML =
      '<div class="topbar">' +
      '<button class="icon-btn" id="back" aria-label="Change legion">‹</button>' +
      '<div class="mid"><h2>' + f.name + '</h2><div class="sub">' + conqueredCount(c) + ' of ' + terrs.length + ' lands conquered</div></div>' +
      '<div class="glory">✦ <span id="glory">' + c.glory + '</span></div>' +
      '<button class="icon-btn' + (save.sound ? ' on' : '') + '" id="snd" aria-label="Sound">♪</button>' +
      '</div>' +
      '<div class="mapwrap"><svg id="mapsvg" viewBox="0 0 360 500" preserveAspectRatio="xMidYMid meet"></svg></div>' +
      '<div class="mapbar"><button class="btn ghost" id="council">War Council</button></div>';

    const svg = $('#mapsvg');
    // faint land texture
    const defs = svgEl('defs', {}, svg);
    const rg = svgEl('radialGradient', { id: 'vig', cx: '50%', cy: '45%', r: '70%' }, defs);
    svgEl('stop', { offset: '0', 'stop-color': '#1c2231' }, rg);
    svgEl('stop', { offset: '1', 'stop-color': '#0f1218' }, rg);
    svgEl('rect', { x: 0, y: 0, width: 360, height: 500, fill: 'url(#vig)' }, svg);
    for (let k = 0; k < 6; k++) {
      svgEl('path', { d: 'M-10 ' + (60 + k * 80) + ' C 90 ' + (20 + k * 80) + ', 230 ' + (110 + k * 80) + ', 380 ' + (50 + k * 80), fill: 'none', stroke: 'rgba(232,220,192,.045)', 'stroke-width': 1.4 }, svg);
    }

    // road
    const pts = [BF.HOME].concat(terrs.map((t) => ({ x: t.x, y: t.y })));
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
    svgEl('path', { d, fill: 'none', stroke: 'rgba(232,220,192,.18)', 'stroke-width': 3, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round' }, svg);
    let upto = 0;
    terrs.forEach((t) => { if (c.conquered[t.id]) upto = t.index + 1; });
    if (upto > 0) {
      const d2 = pts.slice(0, upto + 1).map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
      svgEl('path', { d: d2, fill: 'none', stroke: f.color, 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0.85 }, svg);
    }

    // home
    const home = svgEl('g', {}, svg);
    svgEl('circle', { cx: BF.HOME.x, cy: BF.HOME.y, r: 16, fill: '#151922', stroke: f.color, 'stroke-width': 3 }, home);
    svgEl('path', { d: 'M' + (BF.HOME.x - 6) + ' ' + (BF.HOME.y + 7) + ' V' + (BF.HOME.y - 8) + ' H' + (BF.HOME.x + 7) + ' L' + (BF.HOME.x + 3) + ' ' + (BF.HOME.y - 3) + ' L' + (BF.HOME.x + 7) + ' ' + (BF.HOME.y + 2) + ' H' + (BF.HOME.x - 6), fill: f.accent }, home);
    const hl = svgEl('text', { x: BF.HOME.x, y: BF.HOME.y + 33, 'text-anchor': 'middle', fill: '#9aa0ad', 'font-size': 10 }, home);
    hl.textContent = 'Homeland';

    // territories
    terrs.forEach((t) => {
      const won = c.conquered[t.id];
      const open = unlocked(c, t);
      const owner = BF.factionById(t.owner);
      const g = svgEl('g', { class: 'node', 'data-i': t.index }, svg);
      const r = t.final ? 21 : 16;
      if (open && !won) svgEl('circle', { cx: t.x, cy: t.y, r: 17, fill: 'none', stroke: '#e8c566', 'stroke-width': 2, class: 'pulse' }, g);
      svgEl('circle', { cx: t.x, cy: t.y, r: r + 8, fill: 'transparent' }, g); // bigger tap area
      svgEl('circle', {
        cx: t.x, cy: t.y, r,
        fill: won ? f.color : open ? '#1b202b' : '#12151c',
        stroke: won ? f.accent : open ? owner.color : '#2b3140', 'stroke-width': t.final ? 4 : 3,
      }, g);
      if (t.final) {
        svgEl('path', { d: 'M' + (t.x - 9) + ' ' + (t.y + 5) + ' L' + (t.x - 11) + ' ' + (t.y - 7) + ' L' + (t.x - 4) + ' ' + (t.y - 1) + ' L' + t.x + ' ' + (t.y - 10) + ' L' + (t.x + 4) + ' ' + (t.y - 1) + ' L' + (t.x + 11) + ' ' + (t.y - 7) + ' L' + (t.x + 9) + ' ' + (t.y + 5) + ' Z', fill: won ? '#fff' : open ? '#e8c566' : '#3a4152' }, g);
      } else {
        const n = svgEl('text', { x: t.x, y: t.y + 5, 'text-anchor': 'middle', fill: won ? '#fff' : open ? '#ece4d0' : '#4a5163', 'font-size': 14, 'font-weight': 700 }, g);
        n.textContent = t.index + 1;
      }
      if (won) {
        const s = svgEl('text', { x: t.x, y: t.y + r + 13, 'text-anchor': 'middle', fill: '#e8c566', 'font-size': 11, 'letter-spacing': 2 }, g);
        s.textContent = '★'.repeat(won);
      } else if (open || t.final) {
        const l = svgEl('text', { x: t.x, y: t.y + r + 14, 'text-anchor': 'middle', fill: open ? '#c9c2ad' : '#4a5163', 'font-size': 10 }, g);
        l.textContent = t.name;
      }
      g.addEventListener('click', () => onNode(t));
    });

    $('#back').addEventListener('click', () => { Sound.play('ui'); renderLegions(); show('legion'); });
    $('#snd').addEventListener('click', (e) => { save.sound = !save.sound; persist(); e.currentTarget.classList.toggle('on', save.sound); Sound.play('ui'); });
    $('#council').addEventListener('click', openCouncil);
  }

  function onNode(t) {
    const f = BF.factionById(save.last), c = camp(f.id);
    Sound.play('ui');
    if (!unlocked(c, t)) {
      const prev = BF.TERRITORY_TEMPLATES[t.index - 1];
      const card = openModal('<h2>Out of reach</h2><p class="dim">Conquer <b class="gold">' + prev.name + '</b> first.</p><div class="row"><button class="btn" id="ok">Understood</button></div>', { center: true });
      $('#ok', card).onclick = closeModal;
      return;
    }
    const owner = BF.factionById(t.owner);
    const best = c.conquered[t.id] || 0;
    const reward = (6 + 3 * t.index) * 3;
    const card = openModal(
      '<h2>' + t.name + '</h2>' +
      '<div class="owner" style="--c:' + owner.color + '"><i></i>Held by ' + owner.name + '</div>' +
      '<div style="margin-top:12px">' +
      '<div class="kv"><span class="dim">Threat</span>' + pips(Math.ceil(((t.index + 1) / BF.TERRITORY_TEMPLATES.length) * 5), 5) + '</div>' +
      '<div class="kv"><span class="dim">Waves</span><b>' + t.waves + '</b></div>' +
      '<div class="kv"><span class="dim">Glory (up to)</span><b class="gold">✦ ' + reward + '</b></div>' +
      '<div class="kv"><span class="dim">Best result</span><b class="gold">' + (best ? '★'.repeat(best) : '—') + '</b></div>' +
      (t.final ? '<p class="dim" style="margin:10px 0 0">A warlord guards the throne. Bring everything you have.</p>' : '') +
      '</div>' +
      '<div class="row"><button class="btn ghost" id="close">Not yet</button><button class="btn" id="march">' + (best ? 'Fight again' : 'March') + '</button></div>'
    );
    $('#close', card).onclick = closeModal;
    $('#march', card).onclick = () => { closeModal(); startBattle(t); };
  }

  function openCouncil() {
    const f = BF.factionById(save.last), c = camp(f.id);
    const draw = () => {
      const card = openModal(
        '<h2>War Council</h2><p class="dim" style="margin:0 0 6px">Spend Glory on permanent upgrades for the ' + f.short + '. You have <b class="gold">✦ ' + c.glory + '</b>.</p>' +
        BF.UPGRADES.map((u) => {
          const lv = c.upg[u.id];
          const cost = BF.upgradeCost(lv);
          return (
            '<div class="upg"><div class="info"><b>' + u.name + '</b><small>' + u.desc + '</small>' + pips(lv, u.max) + '</div>' +
            (lv >= u.max ? '<span class="dim">Max</span>' : '<button class="btn small" data-u="' + u.id + '"' + (c.glory < cost ? ' disabled' : '') + '>✦ ' + cost + '</button>') +
            '</div>'
          );
        }).join('') +
        '<div class="row"><button class="btn ghost small" id="reset">Reset campaign</button><button class="btn" id="done">Done</button></div>'
      );
      card.querySelectorAll('[data-u]').forEach((b) =>
        b.addEventListener('click', () => {
          const u = BF.UPGRADES.find((x) => x.id === b.dataset.u);
          const cost = BF.upgradeCost(c.upg[u.id]);
          if (c.glory >= cost && c.upg[u.id] < u.max) { c.glory -= cost; c.upg[u.id]++; persist(); Sound.play('coin'); draw(); $('#glory').textContent = c.glory; }
        })
      );
      $('#done', card).onclick = closeModal;
      $('#reset', card).onclick = () => {
        const cf = openModal('<h2>Reset campaign?</h2><p class="dim">This erases all conquests, Glory and upgrades for the ' + f.name + '.</p><div class="row"><button class="btn ghost" id="no">Keep it</button><button class="btn" id="yes" style="background:linear-gradient(180deg,#ec8a84,#c0463f);color:#fff">Reset</button></div>', { center: true });
        $('#no', cf).onclick = draw;
        $('#yes', cf).onclick = () => { delete save.camps[f.id]; persist(); closeModal(); renderMap(); };
      };
    };
    draw();
  }

  /* ======================= 3. BATTLE ======================= */
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  let B = null, terr = null, uiS = null, speed = 1, paused = false, raf = 0, last = 0, drawScale = 1, resultShown = false, lastWave = 0;

  function fit() {
    const box = $('#field');
    const w = box.clientWidth - 8, h = box.clientHeight - 8;
    if (w <= 0 || h <= 0) return;
    const s = Math.min(w / G.cw, h / G.ch);
    const cssW = Math.floor(G.cw * s), cssH = Math.floor(G.ch * s);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    drawScale = cv.width / G.cw;
  }
  window.addEventListener('resize', () => { if ($('#screen-battle').classList.contains('active')) fit(); });

  function buildTray() {
    const f = B.faction;
    const tray = $('#tray');
    tray.innerHTML = '<button class="sellbtn" id="sell"><span>✕</span>Dismiss</button>';
    BF.ROLES.forEach((r) => {
      const u = f.units[r];
      const b = document.createElement('button');
      b.className = 'ucard'; b.dataset.role = r;
      b.innerHTML = '<canvas width="76" height="76"></canvas><div class="nm">' + u.name + '</div><div class="cs">' + coin + u.cost + '</div>';
      const c2 = $('canvas', b).getContext('2d');
      c2.scale(2, 2);
      BF.drawToken(c2, 19, 19, 16, f, r, false, 0);
      b.addEventListener('click', () => {
        uiS.sell = false;
        uiS.selected = uiS.selected === r ? null : r;
        Sound.play('ui'); syncTray();
      });
      tray.appendChild(b);
    });
    $('#sell').addEventListener('click', () => { uiS.sell = !uiS.sell; if (uiS.sell) uiS.selected = null; Sound.play('ui'); syncTray(); });
  }
  function syncTray() {
    $('#sell').classList.toggle('on', uiS.sell);
    document.querySelectorAll('.ucard').forEach((c) => {
      c.classList.toggle('sel', uiS.selected === c.dataset.role);
      c.classList.toggle('poor', B.gold < B.faction.units[c.dataset.role].cost);
    });
  }

  function startBattle(t) {
    const f = BF.factionById(save.last), c = camp(f.id);
    terr = t;
    B = new BF.Battle({ factionId: f.id, territory: t, upgrades: c.upg, tribute: conqueredCount(c) });
    uiS = { selected: null, sell: false, inspect: null, inspectUntil: 0, banner: { text: 'Defend the gate', t: 2.2 }, gateFlash: 0 };
    speed = 1; paused = false; resultShown = false; lastWave = 0;
    $('#btn-speed').textContent = '1×';
    buildTray();
    show('battle');
    fit();
    const hint = $('#hint');
    if (!save.hintSeen) { hint.classList.remove('hidden'); } else { hint.classList.add('hidden'); }
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * G.cw;
    const y = ((e.clientY - r.top) / r.height) * G.ch;
    const col = Math.floor(x / G.cell), row = Math.floor(y / G.cell);
    if (col < 0 || col >= G.cols || row < 0 || row >= G.rows) return null;
    return { col, row };
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!B || B.over || paused) return;
    e.preventDefault();
    const cell = cellAt(e);
    if (!cell) return;
    const there = B.grid[cell.col][cell.row];
    if (uiS.sell) {
      if (there && B.sell(cell.col, cell.row)) { /* sound via events */ }
    } else if (uiS.selected) {
      if (there) { uiS.inspect = there; uiS.inspectUntil = B.time + 3; return; }
      const res = B.place(uiS.selected, cell.col, cell.row);
      if (res.ok) {
        if (!save.hintSeen) { save.hintSeen = true; persist(); $('#hint').classList.add('hidden'); }
      } else if (res.reason === 'gold') {
        Sound.play('deny');
        const g = $('.hud-gold'); g.classList.remove('deny'); void g.offsetWidth; g.classList.add('deny');
      }
    } else if (there) {
      uiS.inspect = there; uiS.inspectUntil = B.time + 3;
    }
  });

  function updateHud() {
    $('#hud-gold').textContent = Math.floor(B.gold);
    const w = Math.max(1, B.waveNow());
    $('#hud-wave-text').textContent = (terr.final ? 'The Citadel · ' : '') + 'Wave ' + w + ' / ' + terr.waves;
    $('#hud-wave-fill').style.width = Math.round((B.next / B.schedule.length) * 100) + '%';
    syncTray();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!B) return;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!paused) {
      if (!B.over) {
        const total = dt * speed;
        const n = Math.max(1, Math.ceil(total / 0.0334));
        for (let i = 0; i < n; i++) B.step(total / n);
      }
      for (const ev of B.events) {
        if (ev === 'leak') uiS.gateFlash = 0.5;
        Sound.play(ev);
      }
      B.events.length = 0;
      const w = B.waveNow();
      if (w !== lastWave && w > 0) {
        lastWave = w;
        uiS.banner = { text: w === terr.waves ? 'Final wave' : 'Wave ' + w, t: 1.8 };
      }
      if (uiS.banner.t > 0) uiS.banner.t -= dt;
      if (uiS.gateFlash > 0) uiS.gateFlash -= dt;
      if (uiS.inspect && B.time > uiS.inspectUntil) uiS.inspect = null;
    }
    BF.renderBattle(ctx, B, uiS, drawScale);
    updateHud();
    if (B.over && !resultShown) { resultShown = true; setTimeout(showResult, 700); }
  }

  $('#btn-speed').addEventListener('click', (e) => {
    speed = speed === 1 ? 2 : 1;
    e.currentTarget.textContent = speed + '×';
    Sound.play('ui');
  });
  $('#btn-pause').addEventListener('click', openPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && B && !B.over && !paused && $('#screen-battle').classList.contains('active')) openPause(); });

  function openPause() {
    if (!B || B.over || paused) return;
    paused = true;
    const card = openModal(
      '<h2 class="center-t">Paused</h2>' +
      '<div class="row" style="flex-direction:column"><button class="btn" id="resume">Resume</button>' +
      '<button class="btn ghost" id="restart">Restart battle</button><button class="btn ghost" id="retreat">Retreat to map</button></div>',
      { center: true, dismiss: false }
    );
    $('#resume', card).onclick = () => { closeModal(); paused = false; last = performance.now(); };
    $('#restart', card).onclick = () => { closeModal(); startBattle(terr); };
    $('#retreat', card).onclick = leaveBattle;
  }

  function leaveBattle() {
    closeModal(); paused = false; B = null; cancelAnimationFrame(raf);
    renderMap(); show('map');
  }

  function showResult() {
    if (!B) return;
    const f = BF.factionById(save.last), c = camp(f.id);
    if (B.over === 'win') {
      const prev = c.conquered[terr.id] || 0;
      const gain = Math.max(0, B.stars - prev);
      const reward = (6 + 3 * terr.index) * gain;
      const firstFinal = terr.final && !c.won;
      c.conquered[terr.id] = Math.max(prev, B.stars);
      c.glory += reward;
      if (terr.final) c.won = true;
      persist();
      const card = openModal(
        '<h2 class="center-t gold">' + (terr.final ? 'The world is yours' : 'Territory conquered') + '</h2>' +
        '<div class="center-t dim">' + terr.name + '</div>' +
        '<div class="stars">' + '<b>' + '★'.repeat(B.stars) + '</b>' + '★'.repeat(3 - B.stars) + '</div>' +
        '<div class="kv"><span class="dim">Enemies defeated</span><b>' + B.kills + '</b></div>' +
        '<div class="kv"><span class="dim">Gate remaining</span><b>' + Math.round((B.baseHp / B.baseMax) * 100) + '%</b></div>' +
        '<div class="kv"><span class="dim">Glory earned</span><b class="gold">✦ ' + reward + '</b></div>' +
        (firstFinal ? '<p class="center-t gold" style="margin:12px 0 0">The Obsidian Citadel has fallen. Every legion bends the knee.</p>' : '') +
        (gain === 0 && prev ? '<p class="center-t dim" style="margin:10px 0 0">Beat your best star rating to earn more Glory.</p>' : '') +
        '<div class="row"><button class="btn" id="cont">Continue</button></div>',
        { center: true, dismiss: false }
      );
      $('#cont', card).onclick = leaveBattle;
    } else {
      const card = openModal(
        '<h2 class="center-t" style="color:var(--danger)">The gate has fallen</h2>' +
        '<div class="center-t dim" style="margin-top:6px">' + terr.name + '</div>' +
        '<div class="kv" style="margin-top:12px"><span class="dim">Enemies defeated</span><b>' + B.kills + '</b></div>' +
        '<div class="kv"><span class="dim">Reached wave</span><b>' + Math.max(1, B.waveNow()) + ' / ' + terr.waves + '</b></div>' +
        '<p class="center-t dim" style="margin:12px 0 0">Tip: keep a tough fighter in front and archers one or two tiles behind.</p>' +
        '<div class="row"><button class="btn ghost" id="retreat">Retreat</button><button class="btn" id="retry">Try again</button></div>',
        { center: true, dismiss: false }
      );
      $('#retreat', card).onclick = leaveBattle;
      $('#retry', card).onclick = () => { closeModal(); startBattle(terr); };
    }
  }

  /* ======================= start ======================= */
  if (save.last && BF.factionById(save.last)) { renderMap(); show('map'); renderLegions(); } else { renderLegions(); show('legion'); }

  // Handy for debugging from the browser console / tests
  BF.app = { get save() { return save; }, startBattle, renderMap, renderLegions, get battle() { return B; } };
})();
