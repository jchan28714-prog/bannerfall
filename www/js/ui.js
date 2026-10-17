/* ==========================================================================
   BANNERFALL - screens, input, saving, sound
   Flow: Legion select → World map (Risk-style) → Battle → map
   ========================================================================== */
(function () {
  'use strict';
  const BF = globalThis.BF;
  const G = BF.GRID;
  const $ = (s, r) => (r || document).querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------------- save data ---------------- */
  const KEY = 'bannerfall.save.v2';
  function loadSave() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 2) return s; } catch (e) {}
    return { v: 2, sound: true, last: null, hintSeen: false, mode: 'veteran', camps: {} };
  }
  let save = loadSave();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  // camp() initialises save data for a faction, recording its home territory
  function camp(fid) {
    if (!save.camps[fid]) {
      save.camps[fid] = {
        homeId: BF.FACTION_HOME[fid],
        conquered: {},
        glory: 0,
        upg: { treasury: 0, barracks: 0, walls: 0 },
        starUpg: {},
        won: false,
        stats: { sieged: 0, killed: 0, threeStars: 0, skipGold: 0 },
      };
    }
    if (!save.camps[fid].starUpg) save.camps[fid].starUpg = {};
    if (!save.camps[fid].stats) save.camps[fid].stats = { sieged: 0, killed: 0, threeStars: 0, skipGold: 0 };
    return save.camps[fid];
  }
  function availableStars(c) {
    let earned = 0;
    for (const tid in c.conquered) earned += c.conquered[tid];
    let spent = 0;
    for (const r in c.starUpg) spent += c.starUpg[r];
    return earned - spent;
  }
  // Territories conquered (home is not in the list)
  const conqueredCount = (c) => Object.keys(c.conquered).length;
  const totalTerritories = BF.TERRITORIES.length - 1; // excludes home

  /* ---------------- ripple effect on all buttons ---------------- */
  function addRipple(btn) {
    btn.addEventListener('pointerdown', (e) => {
      const r = btn.getBoundingClientRect();
      const size = M.max(r.width, r.height);
      const el = document.createElement('span');
      el.className = 'ripple';
      el.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (e.clientX - r.left - size/2) + 'px;top:' + (e.clientY - r.top - size/2) + 'px';
      btn.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    });
  }
  const M = Math;
  document.querySelectorAll('.btn, .icon-btn').forEach(addRipple);

  /* ---------------- sound ---------------- */
  const Sound = {
    ctx: null,
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); } catch (e) {}
    },
    tone(f, d, type, v, slide, delay) {
      if (!save.sound || !this.ctx) return;
      const t = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      g.gain.setValueAtTime(v || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d);
    },
    play(n) {
      switch (n) {
        case 'place':   this.tone(240, 0.12, 'triangle', 0.07, 90); break;
        case 'sell':    this.tone(300, 0.14, 'triangle', 0.05, -120); break;
        case 'coin':    this.tone(880, 0.07, 'sine', 0.025, 220); break;
        case 'deny':    this.tone(120, 0.16, 'square', 0.03); break;
        case 'leak':    this.tone(110, 0.3, 'sawtooth', 0.06, -50); break;
        case 'ability': [440,554,659].forEach((f,i) => this.tone(f,0.2,'sine',0.05,60,i*0.07)); break;
        case 'win':      [523,659,784,1047].forEach((f,i) => this.tone(f,0.28,'triangle',0.06,0,i*0.13)); break;
        case 'lose':     [330,262,196,147].forEach((f,i) => this.tone(f,0.35,'sawtooth',0.05,0,i*0.18)); break;
        case 'reinforce': [330,440,550].forEach((f,i) => this.tone(f,0.22,'triangle',0.05,40,i*0.08)); break;
        case 'ui':      this.tone(520, 0.06, 'sine', 0.04); break;
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
    modalEl.className = 'modal';
    modalEl.innerHTML = '<div class="card">' + html + '</div>';
    modalEl.onclick = (e) => { if (e.target === modalEl && opts.dismiss !== false) closeModal(); };
    return $('.card', modalEl);
  }
  function closeModal() { modalEl.className = 'modal hidden'; modalEl.innerHTML = ''; modalEl.onclick = null; }
  const pips = (n, of) => '<span class="pips">' + Array.from({length:of},(_,i)=>'<i class="'+(i<n?'on':'')+'"></i>').join('') + '</span>';
  const coin = '<span class="coin"></span>';

  /* ---------------- adjacency unlock check ---------------- */
  // A territory is available to attack if it borders the player's homeland OR
  // any territory they have already conquered.
  function unlocked(c, t) {
    if (t.id === c.homeId) return false; // home is not attackable
    return t.adj.some((adjId) => adjId === c.homeId || !!c.conquered[adjId]);
  }

  /* ======================= 0. HOME SCREEN ======================= */
  const MODES = [
    { id: 'novice',    label: 'Novice' },
    { id: 'veteran',   label: 'Veteran' },
    { id: 'legendary', label: 'Legendary' },
  ];
  if (!save.mode) save.mode = 'veteran';

  function renderHome() {
    const root = $('#screen-home');
    const hasSave = save.last && BF.factionById(save.last);
    root.innerHTML =
      '<div class="home">' +
      '<h1>BANNERFALL</h1>' +
      '<p class="subtitle">A Medieval Strategy</p>' +
      '<div class="home-menu">' +
      (hasSave ? '<button class="btn" id="home-continue">Continue</button>' : '') +
      '<button class="btn' + (hasSave ? ' ghost' : '') + '" id="home-new">New Game</button>' +
      '<button class="btn ghost" id="home-options">Options</button>' +
      '</div>' +
      '<div class="home-mode">' +
      '<span class="tag">Difficulty:</span>' +
      MODES.map(function (m) {
        return '<button class="mode-btn' + (save.mode === m.id ? ' on' : '') + '" data-m="' + m.id + '">' + m.label + '</button>';
      }).join('') +
      '</div>' +
      '<span class="home-ver">v1.0</span>' +
      '</div>';

    if (hasSave) {
      addRipple($('#home-continue'));
      $('#home-continue').addEventListener('click', function () {
        Sound.play('ui'); renderMap(); renderLegions(); show('map');
      });
    }

    addRipple($('#home-new'));
    $('#home-new').addEventListener('click', function () {
      Sound.play('ui'); renderLegions(); show('legion');
    });

    addRipple($('#home-options'));
    $('#home-options').addEventListener('click', function () {
      Sound.play('ui');
      var card = openModal(
        '<div class="modal-icon">⚙️</div>' +
        '<h2 class="center-t">Options</h2>' +
        '<div class="kv"><span>Sound effects</span><button class="btn small ghost" id="opt-sound">' + (save.sound ? 'On' : 'Off') + '</button></div>' +
        '<div class="row"><button class="btn" id="opt-close">Done</button></div>'
      );
      $('#opt-sound', card).addEventListener('click', function () {
        save.sound = !save.sound; persist();
        this.textContent = save.sound ? 'On' : 'Off';
      });
      $('#opt-close', card).addEventListener('click', closeModal);
    });

    root.querySelectorAll('.mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        save.mode = b.dataset.m; persist(); Sound.play('ui');
        root.querySelectorAll('.mode-btn').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    });
  }

  /* ======================= 1. LEGION SELECT ======================= */
  let pick = save.last || 'men';


  function renderLegions() {
    const root = $('#screen-legion');
    const mx = BF.TIER1_MATRIX;
    root.innerHTML =
      '<div class="leg-header"><button class="icon-btn" id="leg-back">←</button><div><h1>BANNERFALL</h1><p>Choose your legion</p></div><div style="min-width:36px"></div></div>' +
      '<div class="leg-scroll" id="leg-scroll">' +
      BF.FACTIONS.map((f) => {
        const c = save.camps[f.id];
        const done = c ? conqueredCount(c) : 0;
        return (
          '<div class="lcard' + (f.id === pick ? ' sel' : '') + '" data-id="' + f.id + '" style="--c:' + f.color + '">' +
          '<div class="lcard-head">' +
            '<img class="lcard-icon" src="img/icon-' + f.id + '.svg" alt="">' +
            '<div class="lcard-title">' +
              '<h3>' + f.name + '</h3>' +
              '<span class="lcard-tag">' + f.tagline + '</span>' +
            '</div>' +
            (done ? '<span class="lcard-prog">' + done + '/' + totalTerritories + '</span>' : '') +
          '</div>' +
          '<div class="lcard-perks">' +
            f.perks.map((p) => '<span class="lcard-perk">' + p + '</span>').join('') +
          '</div>' +
          '<div class="lcard-roster">' +
            BF.ROLES.map((r) => {
              var u = f.units[r], m = mx[r];
              return '<div class="lcard-unit">' +
                '<canvas width="76" height="76"></canvas>' +
                '<div class="lcard-unit-info">' +
                  '<b>' + u.name + '</b>' +
                  '<span class="lcard-role">' + r + '</span>' +
                  '<span class="lcard-matchup"><span class="ok">▲ ' + m.strong.join(', ') + '</span> <span class="bad">▼ ' + m.weak.join(', ') + '</span></span>' +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div class="lcard-deep">' +
            (f.lore ? '<p class="lcard-lore">' + f.lore.goal + '</p><p class="lcard-crisis">' + f.lore.crisis + '</p>' : '') +
          '</div>' +
          '<button class="btn lcard-go" data-id="' + f.id + '">Lead the ' + f.short + '</button>' +
          '</div>'
        );
      }).join('') +
      '</div>';

    // Draw unit tokens
    root.querySelectorAll('.lcard').forEach((card) => {
      const fid = card.dataset.id;
      const f = BF.factionById(fid);
      card.querySelectorAll('.lcard-unit canvas').forEach((cv, i) => {
        const c2 = cv.getContext('2d');
        c2.scale(2, 2);
        BF.drawToken(c2, 19, 19, 16, f, BF.ROLES[i], false, 0);
      });
    });

    // Scroll snap picks the selected card
    const scroll = $('#leg-scroll');
    const selIdx = BF.FACTIONS.findIndex((f) => f.id === pick);
    requestAnimationFrame(() => {
      const cards = scroll.querySelectorAll('.lcard');
      if (cards[selIdx]) cards[selIdx].scrollIntoView({ inline: 'center', block: 'nearest' });
    });

    // Tap card to select
    scroll.querySelectorAll('.lcard').forEach((b) => {
      b.addEventListener('click', (e) => {
        if (e.target.closest('.lcard-go')) return;
        pick = b.dataset.id;
        scroll.querySelectorAll('.lcard').forEach((x) => x.classList.toggle('sel', x.dataset.id === pick));
        Sound.play('ui');
      });
    });

    // Scroll-snap auto-select
    let scrollTimer;
    scroll.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const cards = scroll.querySelectorAll('.lcard');
        const cx = scroll.scrollLeft + scroll.clientWidth / 2;
        let closest = null, bestD = 1e9;
        cards.forEach((c) => {
          const mid = c.offsetLeft + c.offsetWidth / 2;
          const d = M.abs(mid - cx);
          if (d < bestD) { bestD = d; closest = c; }
        });
        if (closest && closest.dataset.id !== pick) {
          pick = closest.dataset.id;
          cards.forEach((x) => x.classList.toggle('sel', x.dataset.id === pick));
          Sound.play('ui');
        }
      }, 80);
    }, { passive: true });

    // "Lead the X" buttons
    scroll.querySelectorAll('.lcard-go').forEach((btn) => {
      addRipple(btn);
      btn.addEventListener('click', () => {
        pick = btn.dataset.id; save.last = pick; persist();
        Sound.play('ui'); renderMap(); show('map');
      });
    });

    addRipple($('#leg-back'));
    $('#leg-back').addEventListener('click', () => { Sound.play('ui'); show('home'); });
  }

  /* ======================= 2. WORLD MAP (Risk-style) ======================= */
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function renderMap() {
    const f = BF.factionById(save.last);
    const c = camp(f.id);
    const terrs = BF.buildCampaign(save.last); // array mirroring BF.TERRITORIES with difficulty
    const terrMap = {}; terrs.forEach((t) => { terrMap[t.id] = t; });
    const root = $('#screen-map');
    const done = conqueredCount(c);
    const allDone = done >= totalTerritories;

    root.innerHTML =
      '<div class="topbar">' +
      '<button class="icon-btn" id="back" aria-label="Change legion">‹</button>' +
      '<div class="mid"><h2>' + f.name + '</h2>' +
      '<div class="sub">' + done + ' of ' + totalTerritories + ' territories conquered</div></div>' +
      '<div class="glory">✦ <span id="glory">' + c.glory + '</span></div>' +
      '<button class="icon-btn' + (save.sound ? ' on' : '') + '" id="snd" aria-label="Sound">♪</button>' +
      '</div>' +
      '<div class="mapwrap"><svg id="mapsvg" viewBox="0 0 900 520" preserveAspectRatio="xMidYMid meet"></svg></div>' +
      '<div class="mapbar"><button class="btn ghost" id="council">War Council</button><button class="btn ghost" id="barracks">★ Barracks</button><button class="btn ghost" id="stats">Stats</button></div>';

    const svg = $('#mapsvg');
    const defs = svgEl('defs', {}, svg);

    // Land gradient
    const landGrad = svgEl('radialGradient', { id: 'land', cx: '50%', cy: '45%', r: '65%' }, defs);
    svgEl('stop', { offset: '0', 'stop-color': '#1c2535' }, landGrad);
    svgEl('stop', { offset: '1', 'stop-color': '#0f1420' }, landGrad);

    // Continent silhouette (landscape 900×520 viewBox)
    svgEl('path', {
      d: 'M54 58 L22 144 L36 246 L22 332 L72 433 L180 491 L360 513 L576 506 L774 477 L855 390 L864 289 L873 188 L846 101 L756 43 L558 22 L324 18 L144 33 Z',
      fill: 'url(#land)', stroke: 'rgba(232,220,192,.10)', 'stroke-width': 2,
    }, svg);

    // Biome region fills — colored terrain areas per faction
    const biomeLayer = svgEl('g', { opacity: '0.12' }, svg);
    svgEl('ellipse', { cx: 396, cy: 72, rx: 396, ry: 79, fill: '#40c070' }, biomeLayer);
    svgEl('ellipse', { cx: 171, cy: 217, rx: 198, ry: 94, fill: '#c03020' }, biomeLayer);
    svgEl('ellipse', { cx: 468, cy: 274, rx: 288, ry: 72, fill: '#6090c0' }, biomeLayer);
    svgEl('ellipse', { cx: 792, cy: 274, rx: 180, ry: 144, fill: '#d0a040' }, biomeLayer);
    svgEl('ellipse', { cx: 396, cy: 419, rx: 360, ry: 72, fill: '#408030' }, biomeLayer);
    svgEl('ellipse', { cx: 432, cy: 498, rx: 144, ry: 36, fill: '#6020a0' }, biomeLayer);

    // Mountain ridges (dwarf region)
    const mtnG = svgEl('g', { opacity: '0.2' }, svg);
    svgEl('path', { d: 'M252 246 L306 217 L360 238 L414 209 L468 231 L522 206 L576 228 L630 213 L684 238',
      fill: 'none', stroke: '#8098b0', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, mtnG);
    svgEl('path', { d: 'M180 289 L234 267 L279 285 L333 260 L378 278',
      fill: 'none', stroke: '#8098b0', 'stroke-width': 2, 'stroke-linejoin': 'round' }, mtnG);

    // Forest canopy dots (elf region)
    const forestG = svgEl('g', { opacity: '0.18', fill: '#308050' }, svg);
    [[216,43],[324,33],[504,40],[612,58],[288,79],[180,94],[540,72],[720,69],[450,51]].forEach(([fx,fy]) => {
      svgEl('circle', { cx: fx, cy: fy, r: 12 + (fx % 7) }, forestG);
    });

    // River paths
    svgEl('path', { d: 'M450 116 C432 159, 360 202, 324 253 S252 318, 234 368',
      fill: 'none', stroke: 'rgba(80,160,220,.18)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    svgEl('path', { d: 'M684 123 C720 166, 738 224, 711 289',
      fill: 'none', stroke: 'rgba(80,160,220,.14)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);

    // Animated biome particles
    const particleG = svgEl('g', {}, svg);
    const biomeParticles = [
      { cx: 288, cy: 51, fill: '#60ff90', r: 2 }, { cx: 504, cy: 61, fill: '#60ff90', r: 1.5 },
      { cx: 180, cy: 40, fill: '#80ffa0', r: 2.5 }, { cx: 630, cy: 47, fill: '#60ff90', r: 1.8 },
      { cx: 90, cy: 181, fill: '#ff6030', r: 2 }, { cx: 126, cy: 231, fill: '#ff8040', r: 2.5 },
      { cx: 72, cy: 260, fill: '#ff5020', r: 1.5 },
      { cx: 360, cy: 238, fill: '#a0c0e0', r: 2 }, { cx: 558, cy: 253, fill: '#90b8d8', r: 1.8 },
      { cx: 180, cy: 412, fill: '#40ff60', r: 2 }, { cx: 450, cy: 426, fill: '#60e080', r: 1.5 },
      { cx: 630, cy: 419, fill: '#80ff60', r: 2 },
    ];
    biomeParticles.forEach((p) => {
      const c = svgEl('circle', { cx: p.cx, cy: p.cy, r: p.r, fill: p.fill, class: 'map-particle' }, particleG);
    });

    // Terrain texture lines
    for (let k = 0; k < 10; k++) {
      svgEl('path', {
        d: 'M-10 ' + (36 + k * 51) + ' C 180 ' + (14 + k * 51) + ', 630 ' + (65 + k * 51) + ', 940 ' + (33 + k * 51),
        fill: 'none', stroke: 'rgba(232,220,192,.03)', 'stroke-width': 1.3,
      }, svg);
    }

    // Region labels
    const regions = [
      { label: 'ALDERMERE', x: 810, y: 231, color: BF.factionById('men').color },
      { label: 'SYLVANMERE', x: 396, y: 14, color: BF.factionById('elves').color },
      { label: 'ASHEN WASTES', x: 144, y: 144, color: BF.factionById('orcs').color },
      { label: 'KARAK DUN', x: 450, y: 253, color: BF.factionById('dwarves').color },
      { label: 'GLOOMHOLLOW', x: 387, y: 368, color: BF.factionById('goblins').color },
      { label: 'THE VOID', x: 432, y: 466, color: '#8040c0' },
    ];
    regions.forEach(({ label, x, y, color }) => {
      const el = svgEl('text', { x, y, 'text-anchor': 'middle', fill: color, 'font-size': 11, 'font-weight': 700, opacity: 0.25, 'letter-spacing': 2.5 }, svg);
      el.textContent = label;
    });

    // Adjacency roads (draw all unique pairs)
    const drawnEdges = new Set();
    BF.TERRITORIES.forEach((t) => {
      t.adj.forEach((adjId) => {
        const key = [t.id, adjId].sort().join('|');
        if (drawnEdges.has(key)) return;
        drawnEdges.add(key);
        const adj = BF.territoryById(adjId);
        if (!adj) return;
        const tConq = c.conquered[t.id] || t.id === c.homeId;
        const aConq = c.conquered[adjId] || adjId === c.homeId;
        const roadColor = (tConq && aConq) ? hexA(f.color, 0.5) : 'rgba(232,220,192,.13)';
        const roadW = (tConq && aConq) ? 3 : 1.8;
        svgEl('line', { x1: t.x, y1: t.y, x2: adj.x, y2: adj.y,
          stroke: roadColor, 'stroke-width': roadW, 'stroke-linecap': 'round',
          'stroke-dasharray': (tConq && aConq) ? '' : '3 6' }, svg);
      });
    });

    // Homeland marker
    const home = BF.territoryById(c.homeId);
    if (home) {
      const hg = svgEl('g', {}, svg);
      // Home pulse ring
      svgEl('circle', { cx: home.x, cy: home.y, r: 26, fill: 'none', stroke: f.color, 'stroke-width': 2, class: 'pulse', opacity: 0.6 }, hg);
      // Home territory circle (filled with player color)
      svgEl('circle', { cx: home.x, cy: home.y, r: 18, fill: f.color, stroke: f.accent, 'stroke-width': 2.5 }, hg);
      // Castle/flag icon path
      const hx = home.x, hy = home.y;
      svgEl('path', {
        d: 'M'+(hx-5)+' '+(hy+6)+' V'+(hy-6)+' H'+(hx+6)+' L'+(hx+3)+' '+(hy-2)+' L'+(hx+6)+' '+(hy+3)+' H'+(hx-5),
        fill: '#fff',
      }, hg);
      const hl = svgEl('text', { x: home.x, y: home.y + 30, 'text-anchor': 'middle', fill: f.accent, 'font-size': 9.5, 'font-weight': 700 }, hg);
      hl.textContent = home.name;
    }

    // Territory nodes
    BF.TERRITORIES.forEach((rawT) => {
      if (rawT.id === c.homeId) return; // homeland handled above
      const t = terrMap[rawT.id] || rawT;
      const won = c.conquered[t.id];
      const open = unlocked(c, t);
      const owner = BF.factionById(t.owner) || BF.FACTIONS[0];
      const isFinal = !!t.final;
      const r = isFinal ? 21 : 15;

      const g = svgEl('g', { class: open || won ? 'node' : 'node locked', 'data-id': t.id }, svg);

      // Pulse ring for attackable territories
      if (open && !won) {
        svgEl('circle', { cx: t.x, cy: t.y, r: r + 8, fill: 'none', stroke: '#e8c566', 'stroke-width': 2, class: 'pulse' }, g);
      }

      // Tap area
      svgEl('circle', { cx: t.x, cy: t.y, r: r + 10, fill: 'transparent' }, g);

      // Territory circle — filled with faction color, opacity based on ownership
      let fillColor, strokeColor, fillOp;
      if (won) {
        fillColor = f.color; strokeColor = f.accent; fillOp = 1;
      } else if (open) {
        fillColor = owner.color; strokeColor = owner.color; fillOp = 0.35;
      } else {
        fillColor = owner.color; strokeColor = owner.color; fillOp = 0.12;
      }
      // Draw fill as a separate element so we can control opacity independently
      svgEl('circle', { cx: t.x, cy: t.y, r, fill: fillColor, opacity: fillOp }, g);
      svgEl('circle', { cx: t.x, cy: t.y, r, fill: 'none', stroke: strokeColor, 'stroke-width': isFinal ? 4 : 2.5,
        opacity: won ? 1 : open ? 0.9 : 0.4 }, g);

      // Citadel crown symbol
      if (isFinal) {
        const cx2 = t.x, cy2 = t.y;
        svgEl('path', {
          d: 'M'+(cx2-10)+' '+(cy2+6)+' L'+(cx2-12)+' '+(cy2-7)+' L'+(cx2-4)+' '+(cy2-1)+' L'+cx2+' '+(cy2-11)+' L'+(cx2+4)+' '+(cy2-1)+' L'+(cx2+12)+' '+(cy2-7)+' L'+(cx2+10)+' '+(cy2+6)+' Z',
          fill: won ? '#fff' : open ? '#e8c566' : '#3a4152',
        }, g);
      } else {
        // Territory number for non-final
        const difficulty = Math.ceil(((t.index || 0) + 1) / 2);
        const skull = isFinal ? '☠' : '';
        const numEl = svgEl('text', {
          x: t.x, y: t.y + 4.5, 'text-anchor': 'middle',
          fill: won ? '#fff' : open ? '#ece4d0' : '#4a5163',
          'font-size': 11, 'font-weight': 700,
        }, g);
        numEl.textContent = won ? '★'.repeat(Math.min(won, 3)) : (open ? String(difficulty) : '');
      }

      // Territory name label
      if (won || open) {
        const lbl = svgEl('text', {
          x: t.x, y: t.y + r + 14, 'text-anchor': 'middle',
          fill: won ? f.accent : open ? '#c9c2ad' : '#4a5163',
          'font-size': won ? 9.5 : 9,
        }, g);
        lbl.textContent = t.name;
        if (won) {
          // Faction owner label
          const oLbl = svgEl('text', { x: t.x, y: t.y + r + 24, 'text-anchor': 'middle', fill: f.color, 'font-size': 8, opacity: 0.8 }, g);
          oLbl.textContent = '✦ ' + BF.factionById(save.last).short;
        }
      }

      if (open || won) g.addEventListener('click', () => onNode(t));
    });

    // Pinch-to-zoom and pan on the map SVG
    (function() {
      const wrap = $('.mapwrap');
      let vb = { x: 0, y: 0, w: 900, h: 520 };
      const VB_BASE = { x: 0, y: 0, w: 900, h: 520 };
      const MIN_ZOOM = 1, MAX_ZOOM = 3;
      let zoom = 1;
      let pointers = {};
      let lastDist = 0, lastMid = null, dragging = false;

      function applyVB() {
        svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      }
      function clampVB() {
        vb.w = VB_BASE.w / zoom;
        vb.h = VB_BASE.h / zoom;
        vb.x = M.max(VB_BASE.x, M.min(VB_BASE.x + VB_BASE.w - vb.w, vb.x));
        vb.y = M.max(VB_BASE.y, M.min(VB_BASE.y + VB_BASE.h - vb.h, vb.y));
      }
      function svgPt(e) {
        const r = svg.getBoundingClientRect();
        return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
      }

      wrap.addEventListener('pointerdown', (e) => {
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        const pts = Object.values(pointers);
        if (pts.length === 1) { dragging = false; lastMid = { x: e.clientX, y: e.clientY }; }
        if (pts.length === 2) {
          dragging = true;
          lastDist = M.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          lastMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          wrap.setPointerCapture(e.pointerId);
        }
      }, { passive: true });

      wrap.addEventListener('pointermove', (e) => {
        if (!pointers[e.pointerId]) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        const pts = Object.values(pointers);
        if (pts.length === 2) {
          const dist = M.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          if (lastDist > 0) {
            const scale = dist / lastDist;
            const focusBefore = svgPt({ clientX: mid.x, clientY: mid.y });
            zoom = M.max(MIN_ZOOM, M.min(MAX_ZOOM, zoom * scale));
            clampVB();
            const focusAfter = svgPt({ clientX: mid.x, clientY: mid.y });
            vb.x += focusBefore.x - focusAfter.x;
            vb.y += focusBefore.y - focusAfter.y;
            clampVB(); applyVB();
          }
          if (lastMid) {
            const dx = (mid.x - lastMid.x) / svg.getBoundingClientRect().width * vb.w;
            const dy = (mid.y - lastMid.y) / svg.getBoundingClientRect().height * vb.h;
            vb.x -= dx; vb.y -= dy;
            clampVB(); applyVB();
          }
          lastDist = dist; lastMid = mid;
        } else if (pts.length === 1 && zoom > 1) {
          const dx = e.clientX - lastMid.x, dy = e.clientY - lastMid.y;
          if (!dragging && M.hypot(dx, dy) > 5) {
            dragging = true;
            try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
          }
          if (dragging) {
            const svgDx = dx / svg.getBoundingClientRect().width * vb.w;
            const svgDy = dy / svg.getBoundingClientRect().height * vb.h;
            vb.x -= svgDx; vb.y -= svgDy;
            clampVB(); applyVB();
            lastMid = { x: e.clientX, y: e.clientY };
          }
        }
      });

      function ptrUp(e) {
        delete pointers[e.pointerId];
        const pts = Object.values(pointers);
        if (pts.length < 2) lastDist = 0;
        if (pts.length === 0) dragging = false;
        if (pts.length === 1) lastMid = { x: pts[0].x, y: pts[0].y };
      }
      wrap.addEventListener('pointerup', ptrUp);
      wrap.addEventListener('pointercancel', ptrUp);

      // Double-tap to reset zoom
      let lastTap = 0;
      wrap.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastTap < 300 && zoom > 1) {
          zoom = 1; vb.x = VB_BASE.x; vb.y = VB_BASE.y; clampVB(); applyVB();
        }
        lastTap = now;
      });
    })();

    $('#back').addEventListener('click', () => { Sound.play('ui'); renderHome(); show('home'); });
    $('#snd').addEventListener('click', (e) => { save.sound = !save.sound; persist(); e.currentTarget.classList.toggle('on', save.sound); Sound.play('ui'); });
    $('#council').addEventListener('click', openCouncil);
    $('#barracks').addEventListener('click', openBarracks);
    $('#stats').addEventListener('click', openStats);
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function onNode(t) {
    const f = BF.factionById(save.last), c = camp(f.id);
    Sound.play('ui');
    if (!unlocked(c, t)) {
      const card = openModal('<div class="modal-icon">🔒</div><h2 class="center-t">Out of reach</h2><p class="dim center-t">Conquer an adjacent territory first.</p><div class="row"><button class="btn" id="ok">Understood</button></div>');
      $('#ok', card).onclick = closeModal;
      return;
    }
    const owner = BF.factionById(t.owner);
    const best = c.conquered[t.id] || 0;
    const reward = (6 + 3 * (t.index || 0)) * 3;
    const card = openModal(
      '<div class="modal-icon">⚔️</div>' +
      '<h2 class="center-t">' + t.name + '</h2>' +
      (owner ? '<div class="owner" style="--c:' + owner.color + ';justify-content:center;margin-top:4px"><i></i>Held by ' + owner.name + '</div>' : '') +
      '<div style="margin-top:12px">' +
      '<div class="kv"><span class="dim">Threat</span>' + pips(Math.min(5, Math.ceil(((t.index || 0) + 1) / 1.5)), 5) + '</div>' +
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
        '<div class="modal-icon">🏛️</div>' +
        '<h2 class="center-t">War Council</h2><p class="dim center-t" style="margin:0 0 6px">Spend Glory on permanent upgrades for the ' + f.short + '. You have <b class="gold">✦ ' + c.glory + '</b>.</p>' +
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
        const cf = openModal('<div class="modal-icon">⚠️</div><h2 class="center-t">Reset campaign?</h2><p class="dim center-t">This erases all conquests, Glory and upgrades for the ' + f.name + '.</p><div class="row"><button class="btn ghost" id="no">Keep it</button><button class="btn" id="yes" style="background:linear-gradient(180deg,#ec8a84,#c0463f);color:#fff">Reset</button></div>');
        $('#no', cf).onclick = draw;
        $('#yes', cf).onclick = () => { delete save.camps[f.id]; persist(); closeModal(); renderMap(); };
      };
    };
    draw();
  }

  function openBarracks() {
    const f = BF.factionById(save.last), c = camp(f.id);
    const draw = () => {
      const avail = availableStars(c);
      const card = openModal(
        '<div class="modal-icon">🏰</div>' +
        '<h2 class="center-t">Barracks</h2><p class="dim center-t" style="margin:0 0 6px">Spend earned stars to boost attack speed. You have <b class="gold">★ ' + avail + '</b> available.</p>' +
        BF.ROLES.map((r) => {
          const u = f.units[r];
          const lv = c.starUpg[r] || 0;
          const bonus = Math.round((BF.STAR_RATE_BONUS[lv] || 0) * 100);
          return (
            '<div class="upg"><div class="info"><b>' + u.name + '</b><small>Attack speed +' + bonus + '%' +
            (lv < 3 ? ' → +' + Math.round((BF.STAR_RATE_BONUS[lv + 1] || 0) * 100) + '%' : '') +
            '</small>' + pips(lv, 3) + '</div>' +
            (lv >= 3 ? '<span class="dim">Max</span>' : '<button class="btn small" data-r="' + r + '"' + (avail < 1 ? ' disabled' : '') + '>★ 1</button>') +
            '</div>'
          );
        }).join('') +
        '<div class="row"><button class="btn" id="done">Done</button></div>'
      );
      card.querySelectorAll('[data-r]').forEach((b) =>
        b.addEventListener('click', () => {
          const r = b.dataset.r;
          const lv = c.starUpg[r] || 0;
          if (lv < 3 && availableStars(c) >= 1) { c.starUpg[r] = lv + 1; persist(); Sound.play('coin'); draw(); }
        })
      );
      $('#done', card).onclick = closeModal;
    };
    draw();
  }

  function openStats() {
    const f = BF.factionById(save.last), c = camp(f.id);
    const s = c.stats;
    const card = openModal(
      '<div class="modal-icon">📊</div>' +
      '<h2 class="center-t">Legion Statistics</h2>' +
      '<p class="dim center-t" style="margin:0 0 8px">' + f.name + '</p>' +
      '<div class="kv"><span class="dim">Territories sieged</span><b>' + s.sieged + '</b></div>' +
      '<div class="kv"><span class="dim">Enemies defeated</span><b>' + s.killed + '</b></div>' +
      '<div class="kv"><span class="dim">3-star victories</span><b class="gold">' + s.threeStars + '</b></div>' +
      '<div class="kv"><span class="dim">Gold from wave skips</span><b class="gold">' + s.skipGold + '</b></div>' +
      '<div class="kv"><span class="dim">Territories conquered</span><b>' + conqueredCount(c) + ' / ' + totalTerritories + '</b></div>' +
      '<div class="kv"><span class="dim">Glory earned</span><b class="gold">✦ ' + c.glory + '</b></div>' +
      '<div class="row"><button class="btn" id="done">Done</button></div>'
    );
    $('#done', card).onclick = closeModal;
  }

  /* ======================= 3. BATTLE ======================= */
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  let B = null, terr = null, uiS = null, speed = 1, paused = false, raf = 0, last = 0, drawScale = 1, resultShown = false, lastWave = 0;

  function fit() {
    const box = $('#field');
    const bw = box.clientWidth, bh = box.clientHeight;
    if (bw <= 0 || bh <= 0) return;
    BF.reflow(bw, bh);
    if (B) {
      for (const d of B.defenders) d.y = G.sky + d.row * G.cell + G.cell / 2;
      for (const e of B.enemies) e.y = G.sky + e.row * G.cell + G.cell / 2;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.style.width = bw + 'px'; cv.style.height = bh + 'px';
    cv.width = Math.round(bw * dpr); cv.height = Math.round(bh * dpr);
    drawScale = cv.width / G.cw;
  }
  window.addEventListener('resize', () => { if ($('#screen-battle').classList.contains('active')) fit(); });

  function flashGold() {
    const g = $('.hud-gold'); g.classList.remove('deny'); void g.offsetWidth; g.classList.add('deny');
  }

  function buildTray() {
    const f = B.faction;
    const ab = BF.ABILITIES[f.id];
    const tray = $('#tray');
    tray.innerHTML = '';

    // Units section (60% width)
    const unitsDiv = document.createElement('div');
    unitsDiv.className = 'tray-units';
    BF.ROLES.forEach((r) => {
      const u = f.units[r];
      const b = document.createElement('button');
      b.className = 'ucard'; b.dataset.role = r;
      b.innerHTML = '<canvas width="76" height="76"></canvas><div class="nm">' + u.name + '</div><div class="cs">' + coin + u.cost + '</div>';
      const c2 = $('canvas', b).getContext('2d');
      c2.scale(2, 2);
      BF.drawToken(c2, 19, 19, 16, f, r, false, 0);
      b.addEventListener('click', () => {
        uiS.selected = uiS.selected === r ? null : r;
        Sound.play('ui'); syncTray();
      });
      unitsDiv.appendChild(b);
    });

    // OG Force card (elite purchasable unit)
    const og = f.units.og;
    if (og) {
      const b = document.createElement('button');
      b.className = 'ucard og-card'; b.dataset.role = 'og';
      b.innerHTML = '<canvas width="76" height="76"></canvas><div class="nm">' + og.name + '</div><div class="cs">' + coin + og.cost + '</div>';
      const c2 = $('canvas', b).getContext('2d');
      c2.scale(2, 2);
      BF.drawToken(c2, 19, 19, 16, f, 'og', false, 0);
      b.addEventListener('click', () => {
        uiS.selected = uiS.selected === 'og' ? null : 'og';
        Sound.play('ui'); syncTray();
      });
      unitsDiv.appendChild(b);
    }
    tray.appendChild(unitsDiv);

    // Actions section (40% width): recruit + ability + repair + merc
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'tray-actions';

    const actBar = document.createElement('div');
    actBar.id = 'act-bar';
    actBar.innerHTML =
      '<button id="btn-recruit" class="recruit-circ ready" aria-label="Reinforce all lanes">' +
        '<svg class="recruit-svg" viewBox="0 0 44 44"><circle class="rc-track" cx="22" cy="22" r="18"/><circle class="rc-fill" id="recruit-arc" cx="22" cy="22" r="18"/></svg>' +
        '<span id="recruit-icon">⚔</span><span class="recruit-label">Reinforce</span><span id="recruit-cd" class="recruit-cd2"></span>' +
      '</button>' +
      '<button class="act-btn" id="btn-repair"><span class="act-icon">🔨</span><span id="repair-label">Repair</span></button>' +
      '<button class="act-btn" id="btn-merc"><span class="act-icon">⚔</span><span id="merc-label">Merc</span></button>';

    const abilBtn = document.createElement('button');
    abilBtn.id = 'btn-ability';
    abilBtn.className = 'ability-btn';
    abilBtn.style.cssText = '--c:' + f.color;
    abilBtn.setAttribute('aria-label', ab ? ab.name : 'Ability');
    abilBtn.innerHTML =
      '<span id="ability-name">' + (ab ? ab.name : '—') + '</span>' +
      '<span id="ability-desc" class="ability-desc-text">' + (ab ? ab.desc : '') + '</span>' +
      '<span id="ability-cd" class="ability-cd-text">READY</span>' +
      '<span class="ability-bar"><i id="ability-bar-fill"></i></span>';

    actionsDiv.appendChild(abilBtn);
    actionsDiv.appendChild(actBar);
    tray.appendChild(actionsDiv);

    $('#btn-recruit', actBar).addEventListener('click', () => {
      if (!B || B.over) return;
      if (B.manualRecruit()) { Sound.play('reinforce'); syncTray(); }
    });
    $('#btn-ability', actBar).addEventListener('click', () => {
      if (!B || B.over || B.abilityCd > 0) return;
      uiS.selected = uiS.selected === 'ability' ? null : 'ability';
      uiS.sellMode = false; $('#btn-sell').classList.remove('on');
      Sound.play('ui'); syncTray();
    });
    $('#btn-repair', actBar).addEventListener('click', () => {
      if (!B || B.over) return;
      const res = B.repairGate();
      if (res.ok) Sound.play('coin');
      syncTray();
    });
    $('#btn-merc', actBar).addEventListener('click', () => {
      if (!B || B.over || B.mercCd > 0) return;
      uiS.selected = uiS.selected === 'merc' ? null : 'merc';
      uiS.sellMode = false; $('#btn-sell').classList.remove('on');
      Sound.play('ui'); syncTray();
    });
  }
  function syncActBtns() {
    if (!B) return;
    const repairBtn = $('#btn-repair');
    const mercBtn   = $('#btn-merc');
    if (repairBtn) {
      const ready = B.repairCd <= 0;
      const label = $('#repair-label');
      if (label) label.textContent = ready ? 'Repair' : M.ceil(B.repairCd) + 's';
      repairBtn.disabled = !ready || !!B.over;
      repairBtn.classList.toggle('ready', ready);
      repairBtn.classList.remove('poor');
    }
    if (mercBtn) {
      const ready = B.mercCd <= 0;
      const label = $('#merc-label');
      if (label) label.textContent = ready ? 'Merc' : M.ceil(B.mercCd) + 's';
      mercBtn.disabled = !ready || !!B.over;
      mercBtn.classList.toggle('ready', ready);
      mercBtn.classList.toggle('sel', uiS.selected === 'merc');
      mercBtn.classList.remove('poor');
    }
  }

  function syncTray() {
    document.querySelectorAll('.ucard').forEach((c) => {
      c.classList.toggle('sel', uiS.selected === c.dataset.role);
      c.classList.toggle('poor', B.gold < B.faction.units[c.dataset.role].cost);
    });
    const abilBtn = $('#btn-ability');
    if (abilBtn) abilBtn.classList.toggle('sel', uiS.selected === 'ability');
    syncActBtns();
  }

  function lockLandscape() {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){}); } catch(e) {}
  }
  function unlockOrientation() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch(e) {}
  }

  function startBattle(t) {
    const f = BF.factionById(save.last), c = camp(f.id);
    terr = t;
    var mm = save.mode === 'novice' ? 0.7 : save.mode === 'legendary' ? 1.4 : 1;
    B = new BF.Battle({ factionId: f.id, territory: t, upgrades: c.upg, tribute: conqueredCount(c), starUpg: c.starUpg, modeMult: mm });
    uiS = { selected: null, sellMode: false, inspect: null, inspectUntil: 0, banner: { text: 'Siege the fortress!', t: 2.2 }, gateFlash: 0, abilityFlash: 0, siegeFlash: 0 };
    speed = 1; paused = false; resultShown = false; lastWave = 0;
    $('#btn-speed').textContent = '1×';
    $('#btn-sell').classList.remove('on');
    buildTray();
    show('battle');
    lockLandscape();
    fit();
    const hint = $('#hint');
    if (!save.hintSeen) hint.classList.remove('hidden'); else hint.classList.add('hidden');
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  cv.addEventListener('pointerdown', (e) => {
    if (!B || B.over || paused) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * G.cw;
    const cy = ((e.clientY - r.top) / r.height) * G.ch;
    const row = Math.floor((cy - G.sky) / G.cell);
    if (row < 0 || row >= G.rows) return;

    if (uiS.sellMode) {
      const near = B.unitNear(cx, cy);
      if (near) {
        B.sellUnit(near.id); Sound.play('sell');
        uiS.sellMode = false; $('#btn-sell').classList.remove('on'); // snap to purchase mode
        syncTray();
      }
      return;
    }
    if (uiS.selected === 'merc') {
      const res = B.hireMerc(row);
      if (res.ok) { Sound.play('place'); uiS.selected = null; syncTray(); }
      return;
    }
    if (uiS.selected === 'ability') {
      if (B.useAbility(row)) { Sound.play('place'); uiS.selected = null; syncTray(); }
      return;
    }
    if (uiS.selected) {
      const res = B.spawn(uiS.selected, row);
      if (res.ok) {
        if (!save.hintSeen) { save.hintSeen = true; persist(); $('#hint').classList.add('hidden'); }
        Sound.play('place');
      } else if (res.reason === 'gold') {
        Sound.play('deny'); flashGold();
      }
    } else {
      const near = B.unitNear(cx, cy);
      if (near) {
        // Try touch ability first; fall back to unit inspection
        if (B.useTouchAbility(near.id)) {
          Sound.play('ability');
          syncTray();
        } else {
          uiS.inspect = near; uiS.inspectUntil = B.time + 3;
        }
      }
    }
  });

  function updateHud() {
    $('#hud-gold').textContent = Math.floor(B.gold);
    const w = Math.max(1, B.waveNow());
    $('#hud-wave-text').textContent = (terr.final ? 'The Citadel · ' : '') + 'Wave ' + w + ' / ' + terr.waves;
    $('#hud-wave-fill').style.width = Math.round((B.next / B.schedule.length) * 100) + '%';
    // Wave countdown between waves
    const cdEl = $('#hud-countdown');
    if (cdEl) {
      const cd = B.waveCountdown();
      const show = cd > 0.8 && B.enemies.length === 0 && !B.over;
      cdEl.textContent = show ? 'Next wave in ' + Math.ceil(cd) + 's' : '';
    }
    // Wave forecast — show upcoming enemy types
    const fcEl = $('#wave-forecast');
    if (fcEl) {
      const upcoming = [];
      const seen = {};
      for (let i = B.next; i < B.schedule.length && upcoming.length < 6; i++) {
        const role = B.schedule[i].role;
        if (!seen[role]) { seen[role] = true; upcoming.push(role); }
      }
      const ROLE_ICON = { spear: '🗡', sword: '⚔', archer: '🏹', mage: '✨', champion: '👑', warlord: '💀' };
      fcEl.innerHTML = upcoming.length ? upcoming.map(function(r) {
        return '<span class="fc-pip" title="' + r + '">' + (ROLE_ICON[r] || '⚔') + '</span>';
      }).join('') : '';
    }
    syncActBtns();
    // Manual recruit circular button (now in tray)
    const arc = $('#recruit-arc');
    if (arc) {
      const interval = BF.AUTO_RECRUIT ? BF.AUTO_RECRUIT.interval : 30;
      const circ = 2 * M.PI * 18;
      const rReady = B.autoRecruitCd <= 0;
      const frac = rReady ? 1 : M.max(0, 1 - B.autoRecruitCd / interval);
      arc.style.strokeDashoffset = (circ * (1 - frac)).toFixed(2);
      const btn = $('#btn-recruit');
      if (btn) { btn.classList.toggle('ready', rReady); btn.disabled = !!B.over; }
      const cdR = $('#recruit-cd');
      if (cdR) cdR.textContent = rReady ? '' : M.ceil(B.autoRecruitCd) + 's';
    }
    // Ability cooldown (now in tray)
    const ab = BF.ABILITIES[B.faction.id];
    const abilBtn = $('#btn-ability');
    if (ab && abilBtn) {
      const cd = B.abilityCd;
      const aReady = cd <= 0;
      abilBtn.classList.toggle('ready', aReady);
      abilBtn.disabled = !aReady || !!B.over;
      const cdA = $('#ability-cd');
      if (cdA) cdA.textContent = aReady ? 'READY' : M.ceil(cd) + 's';
      const fill = $('#ability-bar-fill');
      if (fill) fill.style.width = (aReady ? 100 : M.round((1 - cd / ab.cooldown) * 100)) + '%';
    }
    // Wave skip button
    const skipBtn = $('#btn-skip');
    if (skipBtn) {
      const canSkip = !B.over && B.enemies.length === 0 && B.next < B.schedule.length;
      const skipped = canSkip ? B.schedule[B.next].t - B.time : 0;
      const showSkip = canSkip && skipped > 1;
      skipBtn.classList.toggle('hidden', !showSkip);
      if (showSkip) {
        const reward = M.max(10, M.round(12 * skipped * (1 + 0.08 * (terr.index || 0))));
        const sr = $('#skip-reward');
        if (sr) sr.textContent = '+' + reward + 'g';
      }
    }
    syncTray();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!B) return;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (!paused) {
      if (!B.over) {
        const total = dt * speed;
        const n = Math.max(1, Math.ceil(total / 0.0334));
        for (let i = 0; i < n; i++) B.step(total / n);
      }
      for (const ev of B.events) {
        if (ev === 'leak') uiS.gateFlash = 0.5;
        if (ev === 'siegeHit') uiS.siegeFlash = 0.3;
        if (ev === 'ability') { uiS.abilityFlash = 0.4; }
        if (ev === 'reinforce') { uiS.banner = { text: '⚔ Reinforcements Deployed!', t: 1.4 }; }
        if (ev === 'aiReinforce') { uiS.banner = { text: '⚠ Enemy Reinforcements Incoming!', t: 1.6 }; Sound.play('leak'); }
        if (ev === 'recruitReady') { uiS.banner = { text: '⚔ Reinforce Ready!', t: 1.2 }; }
        if (ev === 'skip') { uiS.banner = { text: '⏭ Wave Skipped!', t: 1.0 }; }
        Sound.play(ev);
      }
      B.events.length = 0;
      const w = B.waveNow();
      if (w !== lastWave && w > 0) { lastWave = w; uiS.banner = { text: w === terr.waves ? 'Final wave' : 'Wave ' + w, t: 1.8 }; }
      if (uiS.banner.t > 0) uiS.banner.t -= dt;
      if (uiS.gateFlash > 0) uiS.gateFlash -= dt;
      if (uiS.siegeFlash > 0) uiS.siegeFlash -= dt;
      if (uiS.abilityFlash > 0) uiS.abilityFlash -= dt;
      if (uiS.inspect && B.time > uiS.inspectUntil) uiS.inspect = null;
    }
    BF.renderBattle(ctx, B, uiS, drawScale);
    updateHud();
    if (B.over && !resultShown) { resultShown = true; setTimeout(showResult, 700); }
  }

  $('#btn-sell').addEventListener('click', (e) => {
    uiS.sellMode = !uiS.sellMode;
    e.currentTarget.classList.toggle('on', uiS.sellMode);
    if (uiS.sellMode) { uiS.selected = null; syncTray(); }
    Sound.play('ui');
  });
  $('#btn-skip').addEventListener('click', () => {
    if (!B || B.over) return;
    const reward = B.skipWave();
    if (reward) {
      const c = camp(save.last);
      c.stats.skipGold += reward;
      persist();
      Sound.play('coin'); syncTray();
    }
  });
  $('#btn-speed').addEventListener('click', (e) => { speed = speed === 1 ? 2 : 1; e.currentTarget.textContent = speed + '×'; Sound.play('ui'); });
  $('#btn-pause').addEventListener('click', openPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && B && !B.over && !paused && $('#screen-battle').classList.contains('active')) openPause(); });

  function openPause() {
    if (!B || B.over || paused) return;
    paused = true;
    const card = openModal(
      '<div class="modal-icon">⏸️</div>' +
      '<h2 class="center-t">Paused</h2>' +
      '<div class="row" style="flex-direction:column"><button class="btn" id="resume">Resume</button>' +
      '<button class="btn ghost" id="restart">Restart battle</button><button class="btn ghost" id="retreat">Retreat to map</button></div>',
      { dismiss: false }
    );
    $('#resume', card).onclick = () => { closeModal(); paused = false; last = performance.now(); };
    $('#restart', card).onclick = () => { closeModal(); startBattle(terr); };
    $('#retreat', card).onclick = leaveBattle;
  }

  function leaveBattle() { closeModal(); paused = false; B = null; cancelAnimationFrame(raf); unlockOrientation(); renderMap(); show('map'); }

  function showResult() {
    if (!B) return;
    const f = BF.factionById(save.last), c = camp(f.id);
    if (B.over === 'win') {
      const prev = c.conquered[terr.id] || 0;
      const gain = Math.max(0, B.stars - prev);
      const reward = (6 + 3 * (terr.index || 0)) * gain;
      const firstFinal = terr.final && !c.won;
      c.conquered[terr.id] = Math.max(prev, B.stars);
      c.glory += reward;
      if (terr.final) c.won = true;
      c.stats.sieged++;
      c.stats.killed += B.kills;
      if (B.stars === 3) c.stats.threeStars++;
      persist();
      const card = openModal(
        '<div class="modal-icon">' + (terr.final ? '👑' : '🏆') + '</div>' +
        '<h2 class="center-t gold">' + (terr.final ? 'The world is yours' : 'Territory conquered') + '</h2>' +
        '<div class="center-t dim">' + terr.name + '</div>' +
        '<div class="stars"><b>' + '★'.repeat(B.stars) + '</b>' + '★'.repeat(3 - B.stars) + '</div>' +
        '<div class="kv"><span class="dim">Enemies defeated</span><b>' + B.kills + '</b></div>' +
        '<div class="kv"><span class="dim">Gate remaining</span><b>' + Math.round((B.baseHp / B.baseMax) * 100) + '%</b></div>' +
        '<div class="kv"><span class="dim">Glory earned</span><b class="gold">✦ ' + reward + '</b></div>' +
        (firstFinal ? '<p class="center-t gold" style="margin:12px 0 0">The Obsidian Citadel has fallen. All kneel before you.</p>' : '') +
        (gain === 0 && prev ? '<p class="center-t dim" style="margin:10px 0 0">Beat your best star rating to earn more Glory.</p>' : '') +
        '<div class="row"><button class="btn" id="cont">Continue</button></div>',
        { center: true, dismiss: false }
      );
      $('#cont', card).onclick = leaveBattle;
    } else {
      const card = openModal(
        '<div class="modal-icon">💀</div>' +
        '<h2 class="center-t" style="color:var(--danger)">The gate has fallen</h2>' +
        '<div class="center-t dim" style="margin-top:6px">' + terr.name + '</div>' +
        '<div class="kv" style="margin-top:12px"><span class="dim">Enemies defeated</span><b>' + B.kills + '</b></div>' +
        '<div class="kv"><span class="dim">Reached wave</span><b>' + Math.max(1, B.waveNow()) + ' / ' + terr.waves + '</b></div>' +
        '<p class="center-t dim" style="margin:12px 0 0">Tip: kill enemies early to fund your front line.</p>' +
        '<div class="row"><button class="btn ghost" id="retreat">Retreat</button><button class="btn" id="retry">Try again</button></div>',
        { center: true, dismiss: false }
      );
      $('#retreat', card).onclick = leaveBattle;
      $('#retry', card).onclick = () => { closeModal(); startBattle(terr); };
    }
  }

  /* ======================= start ======================= */
  renderHome(); show('home');
  BF.app = { get save() { return save; }, startBattle, renderMap, renderLegions, renderHome, get battle() { return B; } };
})();
