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
    for (const key in c.starUpg) {
      const lv = c.starUpg[key];
      spent += BF.starUpgTotalSpent(lv);
    }
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
    if (t.id === c.homeId) return false;
    // Citadel requires conquering 3 of 4 enemy faction home territories
    if (t.final) {
      const playerId = Object.keys(BF.FACTION_HOME).find(fid => BF.FACTION_HOME[fid] === c.homeId);
      const enemyHomes = BF.enemyHomes(playerId);
      let conquered = 0;
      for (const hid of enemyHomes) { if (c.conquered[hid]) conquered++; }
      return conquered >= 3;
    }
    return t.adj.some((adjId) => adjId === c.homeId || !!c.conquered[adjId]);
  }

  /* ======================= 0. HOME SCREEN ======================= */
  const MODES = [
    { id: 'novice',    label: 'Novice',    desc: 'More gold, weaker foes' },
    { id: 'veteran',   label: 'Veteran',   desc: 'The standard challenge' },
    { id: 'legendary', label: 'Legendary', desc: 'Brutal enemies, scarce gold' },
  ];
  if (!save.mode) save.mode = 'veteran';

  /* ---- animated home background (canvas particles + floating banners) ---- */
  var _homeAnim = null;
  function _startHomeAnim(root) {
    if (_homeAnim) { cancelAnimationFrame(_homeAnim.raf); _homeAnim = null; }
    var cv = root.querySelector('#home-cv');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;

    var particles = [];
    for (var i = 0; i < 40; i++) {
      particles.push({
        x: M.random(), y: M.random(),
        vx: (M.random() - 0.5) * 0.0003,
        vy: -0.0002 - M.random() * 0.0004,
        r: 1 + M.random() * 2.5,
        a: 0.15 + M.random() * 0.35,
        hue: M.random() < 0.6 ? 42 : (M.random() < 0.5 ? 20 : 55),
      });
    }
    var banners = [];
    var bannerColors = ['#4a78c2', '#3f9a6a', '#b5482f', '#a3a93a', '#c08a3e'];
    for (var b = 0; b < 6; b++) {
      banners.push({
        x: 0.08 + M.random() * 0.84,
        y: M.random(),
        speed: 0.0001 + M.random() * 0.0003,
        size: 10 + M.random() * 14,
        color: bannerColors[b % bannerColors.length],
        phase: M.random() * M.PI * 2,
        a: 0.06 + M.random() * 0.08,
      });
    }

    function resize() {
      var w = root.clientWidth, h = root.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
    }
    resize();
    var last = performance.now();

    function frame(ts) {
      _homeAnim.raf = requestAnimationFrame(frame);
      var dt = M.min(0.05, (ts - last) / 1000); last = ts;
      var w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);

      var T = ts * 0.001;
      // Subtle radial glow
      var grd = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, w * 0.6);
      grd.addColorStop(0, 'rgba(232,197,102,.04)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      // Drifting banners
      for (var b = 0; b < banners.length; b++) {
        var bn = banners[b];
        bn.y -= bn.speed * dt * 60;
        if (bn.y < -0.1) { bn.y = 1.1; bn.x = 0.08 + M.random() * 0.84; }
        var bx = bn.x * w + M.sin(T * 0.5 + bn.phase) * 20 * dpr;
        var by = bn.y * h;
        var sz = bn.size * dpr;
        ctx.globalAlpha = bn.a;
        ctx.fillStyle = bn.color;
        ctx.beginPath();
        ctx.moveTo(bx - sz * 0.3, by - sz);
        ctx.lineTo(bx + sz * 0.3, by - sz);
        ctx.lineTo(bx + sz * 0.3, by + sz * 0.4);
        ctx.lineTo(bx, by + sz * 0.1);
        ctx.lineTo(bx - sz * 0.3, by + sz * 0.4);
        ctx.closePath();
        ctx.fill();
        // Banner pole
        ctx.strokeStyle = 'rgba(255,255,255,.08)';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath(); ctx.moveTo(bx - sz * 0.3, by - sz * 1.2); ctx.lineTo(bx - sz * 0.3, by + sz * 0.4); ctx.stroke();
      }

      // Floating particles
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        if (p.y < -0.05) { p.y = 1.05; p.x = M.random(); }
        if (p.x < -0.05) p.x = 1.05;
        if (p.x > 1.05) p.x = -0.05;
        var px = p.x * w, py = p.y * h;
        var flicker = 0.5 + 0.5 * M.sin(T * 1.8 + i * 1.3);
        ctx.globalAlpha = p.a * flicker;
        ctx.fillStyle = 'hsl(' + p.hue + ',70%,70%)';
        ctx.beginPath(); ctx.arc(px, py, p.r * dpr, 0, M.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    _homeAnim = { raf: requestAnimationFrame(frame) };
  }
  function _stopHomeAnim() {
    if (_homeAnim) { cancelAnimationFrame(_homeAnim.raf); _homeAnim = null; }
  }

  function renderHome() {
    _stopHomeAnim();
    const root = $('#screen-home');
    const hasSave = save.last && BF.factionById(save.last);
    root.innerHTML =
      '<canvas id="home-cv" class="home-bg-cv"></canvas>' +
      '<div class="home">' +
      '<img class="home-logo" src="img/logo.svg" alt="Bannerfall" width="180" height="180">' +
      '<h1>BANNERFALL</h1>' +
      '<p class="subtitle">A Medieval Strategy</p>' +
      '<div class="home-menu">' +
      (hasSave ? '<button class="btn" id="home-continue">Continue</button>' : '') +
      '<button class="btn' + (hasSave ? ' ghost' : '') + '" id="home-new">New Game</button>' +
      '<button class="btn ghost" id="home-zombie">Zombie Mode</button>' +
      '<button class="btn ghost" id="home-options">Options</button>' +
      '</div>' +
      '<div class="home-mode">' +
      '<span class="tag">Difficulty:</span>' +
      MODES.map(function (m) {
        return '<button class="mode-btn' + (save.mode === m.id ? ' on' : '') + '" data-m="' + m.id + '" title="' + m.desc + '">' + m.label + '</button>';
      }).join('') +
      '</div>' +
      '<span class="home-ver">v1.0</span>' +
      '</div>';

    _startHomeAnim(root);

    if (hasSave) {
      addRipple($('#home-continue'));
      $('#home-continue').addEventListener('click', function () {
        _stopHomeAnim();
        Sound.play('ui'); renderMap(); renderLegions(); show('map');
      });
    }

    addRipple($('#home-new'));
    $('#home-new').addEventListener('click', function () {
      _stopHomeAnim();
      Sound.play('ui'); zombieMode = false; renderLegions(); show('legion');
    });

    addRipple($('#home-zombie'));
    $('#home-zombie').addEventListener('click', function () {
      _stopHomeAnim();
      Sound.play('ui'); zombieMode = true; renderLegions(); show('legion');
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
  let zombieMode = false;

  /* ---- faction-themed background gradient for legion screen ---- */
  const FACTION_BG = {
    men:     { a: 'rgba(30,48,90,.55)',  b: 'rgba(15,17,23,.95)', accent: '#4a78c2' },
    elves:   { a: 'rgba(20,70,45,.55)',  b: 'rgba(15,17,23,.95)', accent: '#3f9a6a' },
    orcs:    { a: 'rgba(80,24,12,.55)',  b: 'rgba(15,17,23,.95)', accent: '#b5482f' },
    goblins: { a: 'rgba(50,55,18,.55)',  b: 'rgba(15,17,23,.95)', accent: '#a3a93a' },
    dwarves: { a: 'rgba(75,55,20,.55)',  b: 'rgba(15,17,23,.95)', accent: '#c08a3e' },
  };
  var _legAnim = null;
  function _startLegAnim(root) {
    if (_legAnim) { cancelAnimationFrame(_legAnim.raf); _legAnim = null; }
    var cv = root.querySelector('#leg-cv');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var curFaction = pick;
    var fadeFrom = null, fadeTo = pick, fadeT = 1;

    var sparks = [];
    for (var i = 0; i < 24; i++) {
      sparks.push({
        x: M.random(), y: M.random(),
        vx: (M.random() - 0.5) * 0.0004,
        vy: -0.0003 - M.random() * 0.0005,
        r: 1.5 + M.random() * 2,
        phase: M.random() * M.PI * 2,
      });
    }
    function resize() {
      var w = root.clientWidth, h = root.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
    }
    resize();
    var last = performance.now();

    function frame(ts) {
      _legAnim.raf = requestAnimationFrame(frame);
      var dt = M.min(0.05, (ts - last) / 1000); last = ts;
      var w = cv.width, h = cv.height;
      var T = ts * 0.001;

      // Detect faction change
      if (pick !== curFaction) {
        fadeFrom = curFaction; fadeTo = pick; fadeT = 0;
        curFaction = pick;
      }
      if (fadeT < 1) fadeT = M.min(1, fadeT + dt * 1.8);

      ctx.clearRect(0, 0, w, h);

      // Draw faction-colored gradient background
      function drawFactionBg(fid, alpha) {
        var fb = FACTION_BG[fid] || FACTION_BG.men;
        ctx.globalAlpha = alpha;
        var grd = ctx.createRadialGradient(w * 0.5, h * 0.2, 0, w * 0.5, h * 0.5, w * 0.7);
        grd.addColorStop(0, fb.a);
        grd.addColorStop(1, fb.b);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        // Accent glow at top
        var glow = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.5);
        glow.addColorStop(0, BF.hexA(fb.accent, 0.12));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h * 0.5);
      }

      if (fadeT < 1 && fadeFrom) {
        drawFactionBg(fadeFrom, 1 - fadeT);
        drawFactionBg(fadeTo, fadeT);
      } else {
        drawFactionBg(fadeTo, 1);
      }

      // Floating sparks in faction color
      var fb = FACTION_BG[curFaction] || FACTION_BG.men;
      for (var i = 0; i < sparks.length; i++) {
        var s = sparks[i];
        s.x += s.vx * dt * 60;
        s.y += s.vy * dt * 60;
        if (s.y < -0.05) { s.y = 1.05; s.x = M.random(); }
        if (s.x < -0.05) s.x = 1.05;
        if (s.x > 1.05) s.x = -0.05;
        var flicker = 0.5 + 0.5 * M.sin(T * 2 + s.phase);
        ctx.globalAlpha = 0.25 * flicker;
        ctx.fillStyle = fb.accent;
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r * dpr, 0, M.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    _legAnim = { raf: requestAnimationFrame(frame) };
  }
  function _stopLegAnim() {
    if (_legAnim) { cancelAnimationFrame(_legAnim.raf); _legAnim = null; }
  }

  function renderLegions() {
    _stopLegAnim();
    const root = $('#screen-legion');
    const N = BF.FACTIONS.length;
    const STEP = 360 / N;
    const PERSPECTIVE = 500;
    root.innerHTML =
      '<canvas id="leg-cv" class="leg-bg-cv"></canvas>' +
      '<div class="leg-header"><button class="icon-btn" id="leg-back">←</button><div><h1>BANNERFALL</h1><p>Choose your legion</p></div><div style="min-width:36px"></div></div>' +
      '<div class="leg-carousel-wrap" id="leg-carousel-wrap">' +
      BF.FACTIONS.map(function (f, i) {
        var c = save.camps[f.id];
        var done = c ? conqueredCount(c) : 0;
        return (
          '<div class="lcard" data-id="' + f.id + '" data-idx="' + i + '" style="--c:' + f.color + '">' +
          '<div class="lcard-head">' +
            '<img class="lcard-icon" src="img/icon-' + f.id + '.svg" alt="">' +
            '<h3>' + f.name + '</h3>' +
            (done ? '<span class="lcard-prog">' + done + '/' + totalTerritories + '</span>' : '') +
          '</div>' +
          '<p class="lcard-tagline">' + f.tagline + '</p>' +
          '<div class="lcard-btns">' +
            '<button class="btn lcard-go" data-id="' + f.id + '">Lead the ' + f.short + '</button>' +
            '<button class="btn ghost lcard-info" data-id="' + f.id + '">Details</button>' +
          '</div>' +
          '</div>'
        );
      }).join('') +
      '</div>';

    _startLegAnim(root);

    var wrap = $('#leg-carousel-wrap');
    var cards = wrap.querySelectorAll('.lcard');
    var selIdx = BF.FACTIONS.findIndex(function (f) { return f.id === pick; });
    if (selIdx < 0) selIdx = 0;

    var radius = M.max(130, M.min(wrap.clientWidth * 0.35, 320));
    var angle = -selIdx * STEP;
    var targetAngle = angle;
    var velocity = 0;
    var animId = 0;
    var dragStartX = null, dragStartAngle = 0, lastX = 0, lastTime = 0, totalDrag = 0;

    function layout() {
      cards.forEach(function (card, i) {
        var deg = angle + i * STEP;
        var rad = deg * M.PI / 180;
        var x = M.sin(rad) * radius;
        var z = M.cos(rad) * radius;
        var zDepth = radius - z;
        var sc = PERSPECTIVE / (PERSPECTIVE + zDepth);
        var projX = x * sc;
        card.style.transform = 'translate(-50%,-50%) translateX(' + projX.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
        var opac = M.max(0.15, (z + radius) / (2 * radius));
        card.style.opacity = opac.toFixed(2);
        card.style.zIndex = M.round(100 + z);
      });
      var frontIdx = (((- M.round(angle / STEP)) % N) + N) % N;
      cards.forEach(function (card, i) {
        card.classList.toggle('sel', i === frontIdx);
      });
      if (BF.FACTIONS[frontIdx] && BF.FACTIONS[frontIdx].id !== pick) {
        pick = BF.FACTIONS[frontIdx].id;
      }
    }

    function animateTo(tgt) {
      targetAngle = tgt;
      cancelAnimationFrame(animId);
      (function tick() {
        var diff = targetAngle - angle;
        if (M.abs(diff) < 0.3) {
          angle = targetAngle;
          layout();
          Sound.play('ui');
          return;
        }
        angle += diff * 0.14;
        layout();
        animId = requestAnimationFrame(tick);
      })();
    }

    function snapNearest() {
      var snap = M.round(angle / STEP) * STEP;
      animateTo(snap);
    }

    layout();

    wrap.addEventListener('pointerdown', function (e) {
      totalDrag = 0;
      if (e.target.closest('.lcard-go') || e.target.closest('.lcard-info')) return;
      cancelAnimationFrame(animId);
      dragStartX = e.clientX;
      dragStartAngle = angle;
      lastX = e.clientX;
      lastTime = Date.now();
      velocity = 0;
      totalDrag = 0;
      try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    });

    wrap.addEventListener('pointermove', function (e) {
      if (dragStartX == null) return;
      var dx = e.clientX - dragStartX;
      totalDrag = M.max(totalDrag, M.abs(dx));
      var sensitivity = STEP / (radius * 1.2);
      angle = dragStartAngle + dx * sensitivity;
      layout();
      var now = Date.now();
      var dt = now - lastTime;
      if (dt > 0) { velocity = (e.clientX - lastX) / dt; }
      lastX = e.clientX;
      lastTime = now;
    });

    function endDrag(e) {
      if (dragStartX == null) return;
      dragStartX = null;
      var sensitivity = STEP / (radius * 1.2);
      if (M.abs(velocity) > 0.3) {
        angle += velocity * 180 * sensitivity;
      }
      snapNearest();
    }
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);

    cards.forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (totalDrag > 8) return;
        if (e.target.closest('.lcard-go') || e.target.closest('.lcard-info')) return;
        var idx = parseInt(card.dataset.idx, 10);
        animateTo(-idx * STEP);
      });
    });

    wrap.querySelectorAll('.lcard-go').forEach(function (btn) {
      addRipple(btn);
      btn.addEventListener('click', function (e) {
        if (totalDrag > 8) { e.stopPropagation(); return; }
        pick = btn.dataset.id; save.last = pick; persist();
        _stopLegAnim();
        Sound.play('ui');
        if (zombieMode) {
          startZombieBattle();
        } else {
          renderMap(); show('map');
        }
      });
    });

    wrap.querySelectorAll('.lcard-info').forEach(function (btn) {
      addRipple(btn);
      btn.addEventListener('click', function (e) {
        if (totalDrag > 8) { e.stopPropagation(); return; }
        Sound.play('ui');
        openLegionDetail(btn.dataset.id);
      });
    });

    window.addEventListener('resize', function onResize() {
      if (!$('#screen-legion').classList.contains('active')) {
        window.removeEventListener('resize', onResize);
        return;
      }
      radius = M.max(100, M.min(wrap.clientWidth * 0.30, 260));
      layout();
    });

    addRipple($('#leg-back'));
    $('#leg-back').addEventListener('click', function () { _stopLegAnim(); Sound.play('ui'); renderHome(); show('home'); });
  }

  function openLegionDetail(fid) {
    var f = BF.factionById(fid);
    var mx = BF.TIER1_MATRIX;
    var html =
      '<div class="legion-detail-card">' +
      '<div class="lcard-head">' +
        '<img class="lcard-icon" src="img/icon-' + f.id + '.svg" alt="">' +
        '<h3>' + f.name + '</h3>' +
      '</div>' +
      '<p class="lcard-tagline">' + f.tagline + '</p>' +
      (f.lore ? '<p class="lcard-lore">' + f.lore.goal + '</p>' : '') +
      '<div class="legion-detail-body">' +
        (f.lore ? '<p class="lcard-crisis">' + f.lore.crisis + '</p>' : '') +
        '<div class="lcard-perks">' +
          f.perks.map((p) => '<span class="lcard-perk">' + p + '</span>').join('') +
        '</div>' +
        '<h4 style="font-size:clamp(12px,3vw,15px);color:var(--text);margin:0 0 6px">Units</h4>' +
        '<div class="lcard-roster">' +
          BF.ROLES.map((r) => {
            var u = f.units[r]; if (!u) return '';
            var m = mx[r] || { strong: [], weak: [] };
            return '<div class="lcard-unit">' +
              '<canvas width="76" height="76"></canvas>' +
              '<div class="lcard-unit-info">' +
                '<b>' + u.name + '</b>' +
                '<span class="lcard-role">' + r + '</span>' +
                '<span class="lcard-matchup"><span class="ok">▲ ' + m.strong.join(', ') + '</span><span class="bad">▼ ' + m.weak.join(', ') + '</span></span>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<button class="btn" id="legion-detail-close" style="width:100%;margin-top:8px">Close</button>' +
      '</div>';
    var card = openModal(html);
    card.classList.add('slow-pop');
    modalEl.classList.add('slow-bg');
    card.querySelectorAll('.lcard-unit canvas').forEach((cv, i) => {
      var c2 = cv.getContext('2d');
      c2.setTransform(2, 0, 0, 2, 0, 0);
      c2.clearRect(0, 0, 38, 38);
      BF.drawToken(c2, 19, 19, 16, f, BF.ROLES[i], false, 0);
    });
    addRipple($('#legion-detail-close'));
    $('#legion-detail-close').addEventListener('click', closeModal);
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
      '<div class="mapwrap"><svg id="mapsvg" preserveAspectRatio="xMidYMid meet"></svg></div>' +
      '<div class="mapbar"><button class="btn ghost" id="council">War Council</button><button class="btn ghost" id="barracks">★ Barracks</button><button class="btn ghost" id="stats">Stats</button></div>';

    const svg = $('#mapsvg');
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    terrs.forEach(function(t) {
      var tx = t.mapX != null ? t.mapX : t.x, ty = t.mapY != null ? t.mapY : t.y;
      if (tx < minX) minX = tx; if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
    });
    var pad = 80;
    var vbX = Math.floor(minX - pad), vbY = Math.floor(minY - pad);
    var vbW = Math.ceil(maxX - minX + pad * 2), vbH = Math.ceil(maxY - minY + pad * 2);
    svg.setAttribute('viewBox', vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH);
    const defs = svgEl('defs', {}, svg);

    // ── Helper: get rotated position for a territory ──
    function tPos(t) {
      var tc = terrMap[t.id] || t;
      return { x: tc.mapX != null ? tc.mapX : tc.x, y: tc.mapY != null ? tc.mapY : tc.y };
    }

    // ── Group territories by original faction owner ──
    var factionGroups = {};
    var FACTION_COLORS = { elves:'#7dd4a0', orcs:'#e8946a', dwarves:'#a8c0e0', men:'#f0d080', goblins:'#c8d868', citadel:'#c8a0f0' };
    var FACTION_COLORS2 = { elves:'#4db87a', orcs:'#d05a30', dwarves:'#7090c0', men:'#c8a040', goblins:'#90a830', citadel:'#a070d8' };
    var FACTION_LABELS = { elves:'SYLVANMERE', orcs:'ASHEN WASTES', dwarves:'KARAK DUN', men:'ALDERMERE', goblins:'GLOOMHOLLOW' };
    var FACTION_LABEL_COLORS = { elves:'#287048', orcs:'#a03820', dwarves:'#506890', men:'#3a60a0', goblins:'#607020' };
    BF.TERRITORIES.forEach(function(t) {
      if (t.final) return;
      if (!factionGroups[t.owner]) factionGroups[t.owner] = [];
      factionGroups[t.owner].push(t);
    });

    // ── Convex hull for continent boundary (Graham scan) ──
    var hullPts = terrs.map(function(t) { var p = tPos(t); return [p.x, p.y]; });
    function cross(O, A, B) { return (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]); }
    hullPts.sort(function(a,b) { return a[0]-b[0] || a[1]-b[1]; });
    var lower = [];
    for (var i = 0; i < hullPts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], hullPts[i]) <= 0) lower.pop();
      lower.push(hullPts[i]);
    }
    var upper = [];
    for (var i = hullPts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], hullPts[i]) <= 0) upper.pop();
      upper.push(hullPts[i]);
    }
    lower.pop(); upper.pop();
    var hull = lower.concat(upper);

    // Expand hull outward with irregular offsets for organic coastline
    var hcx = 0, hcy = 0;
    hull.forEach(function(p) { hcx += p[0]; hcy += p[1]; });
    hcx /= hull.length; hcy /= hull.length;
    var expandedHull = hull.map(function(p, i) {
      var dx = p[0] - hcx, dy = p[1] - hcy;
      var d = Math.sqrt(dx*dx + dy*dy);
      var wobble = 50 + 18 * Math.sin(i * 2.3) + 12 * Math.sin(i * 5.1 + 1.7);
      var nx = dx / d, ny = dy / d;
      return [p[0] + nx * wobble, p[1] + ny * wobble];
    });

    // Build smooth continent path with quadratic curves
    var coastD = 'M' + Math.round(expandedHull[0][0]) + ' ' + Math.round(expandedHull[0][1]);
    for (var i = 0; i < expandedHull.length; i++) {
      var cur = expandedHull[i];
      var nxt = expandedHull[(i + 1) % expandedHull.length];
      var mx = Math.round((cur[0] + nxt[0]) / 2), my = Math.round((cur[1] + nxt[1]) / 2);
      coastD += ' Q' + Math.round(cur[0]) + ' ' + Math.round(cur[1]) + ', ' + mx + ' ' + my;
    }
    coastD += ' Z';

    svgEl('path', { d: coastD, fill: '#f5e6c8', stroke: '#c9a86c', 'stroke-width': 3 }, svg);
    svgEl('path', { d: coastD, fill: 'none', stroke: '#e8d5a8', 'stroke-width': 8, opacity: '0.5' }, svg);

    // ── Faction territory colored blobs (computed from actual territory positions) ──
    Object.keys(factionGroups).forEach(function(fid) {
      var pts = factionGroups[fid].map(function(t) { return tPos(t); });
      if (pts.length < 2) return;
      // Compute centroid
      var fcx = 0, fcy = 0;
      pts.forEach(function(p) { fcx += p.x; fcy += p.y; });
      fcx /= pts.length; fcy /= pts.length;
      // Sort points by angle from centroid
      pts.sort(function(a, b) {
        return Math.atan2(a.y - fcy, a.x - fcx) - Math.atan2(b.y - fcy, b.x - fcx);
      });
      // Build blob path with expansion
      var expand = 55;
      var blobPts = pts.map(function(p) {
        var dx = p.x - fcx, dy = p.y - fcy;
        var d = Math.sqrt(dx*dx + dy*dy) || 1;
        return { x: p.x + (dx/d) * expand, y: p.y + (dy/d) * expand };
      });
      var bD = 'M' + Math.round(blobPts[0].x) + ' ' + Math.round(blobPts[0].y);
      for (var j = 0; j < blobPts.length; j++) {
        var cur = blobPts[j];
        var nxt = blobPts[(j + 1) % blobPts.length];
        var mx = Math.round((cur.x + nxt.x) / 2), my = Math.round((cur.y + nxt.y) / 2);
        bD += ' Q' + Math.round(cur.x) + ' ' + Math.round(cur.y) + ', ' + mx + ' ' + my;
      }
      bD += ' Z';
      svgEl('path', { d: bD, fill: FACTION_COLORS[fid] || '#aaa', opacity: '0.45' }, svg);
      svgEl('path', { d: bD, fill: FACTION_COLORS2[fid] || '#888', opacity: '0.25' }, svg);
    });

    // Citadel territory — purple glow around Citadel position
    var citT = terrMap['t_citadel'];
    if (citT) {
      var citX = citT.mapX != null ? citT.mapX : citT.x, citY = citT.mapY != null ? citT.mapY : citT.y;
      svgEl('ellipse', { cx: citX, cy: citY, rx: 55, ry: 45, fill: '#c8a0f0', opacity: '0.5' }, svg);
      svgEl('ellipse', { cx: citX, cy: citY, rx: 40, ry: 32, fill: '#a070d8', opacity: '0.35' }, svg);
    }

    // ── Decorative elements placed relative to faction territory centroids ──
    function factionCentroid(fid) {
      var pts = (factionGroups[fid] || []).map(function(t) { return tPos(t); });
      if (!pts.length) return { x: hcx, y: hcy };
      var cx2 = 0, cy2 = 0;
      pts.forEach(function(p) { cx2 += p.x; cy2 += p.y; });
      return { x: cx2 / pts.length, y: cy2 / pts.length };
    }

    // Elf forest: trees near elf territory
    var elfC = factionCentroid('elves');
    var elfPts = (factionGroups['elves'] || []).map(function(t) { return tPos(t); });
    var forestG = svgEl('g', {}, svg);
    elfPts.forEach(function(p) {
      for (var k = 0; k < 3; k++) {
        var fx = p.x + (k - 1) * 22 + Math.sin(k * 3.7) * 10;
        var fy = p.y + Math.cos(k * 2.1) * 12 - 20;
        var r = 10 + Math.sin(k * 1.5) * 6;
        svgEl('rect', { x: fx - 2, y: fy, width: 4, height: r * 0.7, fill: '#7a5a30', rx: 1 }, forestG);
        svgEl('circle', { cx: fx, cy: fy - r * 0.1, r: r, fill: '#40b868' }, forestG);
        svgEl('circle', { cx: fx - r * 0.25, cy: fy - r * 0.3, r: r * 0.5, fill: '#60d080' }, forestG);
      }
    });

    // Orc volcanic terrain near orc territory
    var orcC = factionCentroid('orcs');
    var orcPts = (factionGroups['orcs'] || []).map(function(t) { return tPos(t); });
    var volcG = svgEl('g', {}, svg);
    orcPts.forEach(function(p, idx) {
      if (idx % 2 === 0) {
        var vx = p.x + Math.sin(idx * 2.3) * 15, vy = p.y + Math.cos(idx * 1.7) * 10;
        var vs = 16 + idx * 3;
        svgEl('path', { d: 'M'+(vx-vs)+' '+(vy+vs*0.5)+' L'+vx+' '+(vy-vs*0.4)+' L'+(vx+vs)+' '+(vy+vs*0.5)+' Z',
          fill: '#8b4028' }, volcG);
        svgEl('path', { d: 'M'+(vx-vs*0.3)+' '+(vy-vs*0.1)+' L'+vx+' '+(vy-vs*0.4)+' L'+(vx+vs*0.3)+' '+(vy-vs*0.1)+' Z',
          fill: '#d04020' }, volcG);
        svgEl('circle', { cx: vx, cy: vy - vs*0.3, r: vs*0.15, fill: '#ff8830' }, volcG);
      }
    });
    // Lava flows between orc territories
    for (var oi = 0; oi < orcPts.length - 1; oi++) {
      var a = orcPts[oi], b = orcPts[oi + 1];
      svgEl('path', {
        d: 'M'+a.x+' '+a.y+' Q'+(a.x+b.x)/2+' '+(a.y+b.y)/2+', '+b.x+' '+b.y,
        fill: 'none', stroke: '#ff6030', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: '0.6'
      }, volcG);
    }

    // Dwarf mountains near dwarf territory
    var dwarfPts = (factionGroups['dwarves'] || []).map(function(t) { return tPos(t); });
    var mtnG = svgEl('g', {}, svg);
    dwarfPts.forEach(function(p, idx) {
      var mx = p.x + Math.sin(idx * 1.9) * 12, base = p.y + 8;
      var h = 28 + idx * 4;
      svgEl('path', { d: 'M'+(mx-h*0.8)+' '+base+' L'+mx+' '+(base-h)+' L'+(mx+h*0.8)+' '+base+' Z',
        fill: '#8095b8' }, mtnG);
      svgEl('path', { d: 'M'+(mx-h*0.3)+' '+(base-h*0.55)+' L'+mx+' '+(base-h)+' L'+(mx+h*0.3)+' '+(base-h*0.55)+' Z',
        fill: '#e8f0ff' }, mtnG);
      svgEl('path', { d: 'M'+(mx-h*0.15)+' '+(base-h*0.7)+' L'+mx+' '+(base-h)+' L'+(mx+h*0.15)+' '+(base-h*0.7)+' Z',
        fill: '#fff', opacity: '0.8' }, mtnG);
    });

    // Men golden fields near men territory
    var menPts = (factionGroups['men'] || []).map(function(t) { return tPos(t); });
    var fieldG = svgEl('g', {}, svg);
    menPts.forEach(function(p, idx) {
      if (idx % 2 === 0) {
        var ex = p.x + Math.sin(idx * 2.5) * 15, ey = p.y + Math.cos(idx * 1.3) * 10;
        var w = 18 + idx * 2, eh = 10 + idx;
        svgEl('ellipse', { cx: ex, cy: ey, rx: w, ry: eh, fill: '#e8c860', opacity: '0.5' }, fieldG);
        for (var wi = -2; wi <= 2; wi++) {
          svgEl('line', { x1: ex + wi*5, y1: ey + eh*0.3, x2: ex + wi*5, y2: ey - eh*0.6,
            stroke: '#c8a030', 'stroke-width': 1.5, opacity: '0.7' }, fieldG);
          svgEl('circle', { cx: ex + wi*5, cy: ey - eh*0.6, r: 2, fill: '#e8b830', opacity: '0.7' }, fieldG);
        }
      }
    });

    // Goblin swamp near goblin territory
    var gobPts = (factionGroups['goblins'] || []).map(function(t) { return tPos(t); });
    var swampG = svgEl('g', {}, svg);
    gobPts.forEach(function(p, idx) {
      var sx = p.x + Math.sin(idx * 3.1) * 18, sy = p.y + Math.cos(idx * 2.3) * 12;
      var rx = 16 + idx * 3, ry = 8 + idx * 1.5;
      svgEl('ellipse', { cx: sx, cy: sy, rx: rx, ry: ry, fill: '#68c048', opacity: '0.4', stroke: '#509030', 'stroke-width': 1.5 }, swampG);
      // Mushroom
      if (idx % 2 === 0) {
        svgEl('rect', { x: sx + rx - 2, y: sy - 8, width: 3, height: 8, fill: '#c0a870', rx: 1 }, swampG);
        svgEl('ellipse', { cx: sx + rx, cy: sy - 9, rx: 6, ry: 4, fill: '#e04040' }, swampG);
        svgEl('circle', { cx: sx + rx - 2, cy: sy - 10, r: 1.5, fill: '#fff', opacity: '0.7' }, swampG);
      }
      // Dead tree
      if (idx % 3 === 1) {
        svgEl('line', { x1: sx - rx, y1: sy, x2: sx - rx, y2: sy - 16, stroke: '#6a5a40', 'stroke-width': 2.5 }, swampG);
        svgEl('line', { x1: sx - rx, y1: sy - 10, x2: sx - rx - 7, y2: sy - 17, stroke: '#6a5a40', 'stroke-width': 1.5 }, swampG);
      }
    });

    // ── Rivers between faction regions ──
    // Draw rivers along boundaries between adjacent factions
    var riverPairs = [['elves','orcs'],['elves','dwarves'],['dwarves','men'],['dwarves','goblins'],['orcs','dwarves']];
    riverPairs.forEach(function(pair) {
      var c1 = factionCentroid(pair[0]), c2 = factionCentroid(pair[1]);
      var mx = (c1.x + c2.x) / 2, my = (c1.y + c2.y) / 2;
      var dx = c2.x - c1.x, dy = c2.y - c1.y;
      var len = Math.sqrt(dx*dx + dy*dy);
      var nx = -dy / len * 60, ny = dx / len * 60;
      var rD = 'M'+(mx - nx)+' '+(my - ny)+' Q'+mx+' '+my+', '+(mx + nx)+' '+(my + ny);
      svgEl('path', { d: rD, fill: 'none', stroke: '#4098d0', 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
      svgEl('path', { d: rD, fill: 'none', stroke: '#80c8f0', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: '0.5' }, svg);
    });

    // ── Mountain ridges between orc/dwarf and elf/dwarf borders ──
    var mtnPairs = [['orcs','dwarves'],['elves','men']];
    mtnPairs.forEach(function(pair) {
      var c1 = factionCentroid(pair[0]), c2 = factionCentroid(pair[1]);
      var mx = (c1.x + c2.x) / 2, my = (c1.y + c2.y) / 2;
      for (var ri = -1; ri <= 1; ri++) {
        var dx = c2.x - c1.x, dy = c2.y - c1.y;
        var len = Math.sqrt(dx*dx + dy*dy);
        var px = mx + (-dy / len) * ri * 30, py = my + (dx / len) * ri * 30;
        var mh = 22 + Math.abs(ri) * 8;
        svgEl('path', { d: 'M'+(px-mh*0.7)+' '+(py+mh*0.4)+' L'+px+' '+(py-mh*0.4)+' L'+(px+mh*0.7)+' '+(py+mh*0.4)+' Z',
          fill: '#8095b8', opacity: '0.6' }, svg);
        svgEl('path', { d: 'M'+(px-mh*0.25)+' '+(py-mh*0.1)+' L'+px+' '+(py-mh*0.4)+' L'+(px+mh*0.25)+' '+(py-mh*0.1)+' Z',
          fill: '#e8f0ff', opacity: '0.7' }, svg);
      }
    });

    // Animated biome particles near faction centroids
    var particleG = svgEl('g', {}, svg);
    var particleDefs = [
      { fid: 'elves', fill: '#40e878', count: 4 },
      { fid: 'orcs', fill: '#ff7040', count: 3 },
      { fid: 'dwarves', fill: '#c0d8f0', count: 3 },
      { fid: 'goblins', fill: '#60ff70', count: 3 },
      { fid: 'men', fill: '#f0d060', count: 3 },
    ];
    particleDefs.forEach(function(pd) {
      var fc = factionCentroid(pd.fid);
      for (var pi = 0; pi < pd.count; pi++) {
        var px = fc.x + Math.sin(pi * 2.7 + 1.3) * 60;
        var py = fc.y + Math.cos(pi * 3.1 + 0.7) * 40;
        svgEl('circle', { cx: Math.round(px), cy: Math.round(py), r: 2 + pi * 0.3, fill: pd.fill, class: 'map-particle' }, particleG);
      }
    });
    if (citT) {
      svgEl('circle', { cx: citX, cy: citY, r: 3, fill: '#b080e0', class: 'map-particle' }, particleG);
    }

    // Region labels placed at faction centroids
    Object.keys(FACTION_LABELS).forEach(function(fid) {
      var fc = factionCentroid(fid);
      var el = svgEl('text', { x: Math.round(fc.x), y: Math.round(fc.y - 30), 'text-anchor': 'middle',
        fill: FACTION_LABEL_COLORS[fid] || '#666', 'font-size': 11, 'font-weight': 700, opacity: 0.6, 'letter-spacing': 2.5 }, svg);
      el.textContent = FACTION_LABELS[fid];
    });
    // Citadel label
    if (citT) {
      var voidEl = svgEl('text', { x: citX, y: citY - 30, 'text-anchor': 'middle',
        fill: '#7050a0', 'font-size': 11, 'font-weight': 700, opacity: 0.6, 'letter-spacing': 2.5 }, svg);
      voidEl.textContent = 'THE VOID';
    }

    // Homeland marker (use rotated position from campaign data)
    const homeRaw = BF.territoryById(c.homeId);
    const homeCamp = terrMap[c.homeId];
    const home = homeCamp ? { x: homeCamp.mapX, y: homeCamp.mapY, name: homeRaw.name } : homeRaw;
    if (home) {
      const hg = svgEl('g', {}, svg);
      // Home pulse ring
      svgEl('circle', { cx: home.x, cy: home.y, r: 38, fill: 'none', stroke: f.color, 'stroke-width': 2.5, class: 'pulse', opacity: 0.6 }, hg);
      // Home territory circle (filled with player color)
      svgEl('circle', { cx: home.x, cy: home.y, r: 28, fill: f.color, stroke: f.accent, 'stroke-width': 3 }, hg);
      // Castle/flag icon path
      const hx = home.x, hy = home.y;
      svgEl('path', {
        d: 'M'+(hx-8)+' '+(hy+10)+' V'+(hy-10)+' H'+(hx+10)+' L'+(hx+5)+' '+(hy-3)+' L'+(hx+10)+' '+(hy+5)+' H'+(hx-8),
        fill: '#fff',
      }, hg);
      const hl = svgEl('text', { x: home.x, y: home.y + 42, 'text-anchor': 'middle', fill: f.accent, 'font-size': 11, 'font-weight': 700 }, hg);
      hl.textContent = home.name;
    }

    // Territory nodes
    BF.TERRITORIES.forEach((rawT) => {
      if (rawT.id === c.homeId) return;
      const t = terrMap[rawT.id] || rawT;
      const tx = t.mapX != null ? t.mapX : t.x;
      const ty = t.mapY != null ? t.mapY : t.y;
      const won = c.conquered[t.id];
      const open = unlocked(c, t);
      const owner = BF.factionById(t.owner) || BF.FACTIONS[0];
      const isFinal = !!t.final;
      const r = isFinal ? 30 : 24;

      const g = svgEl('g', { class: open || won ? 'node' : 'node locked', 'data-id': t.id }, svg);

      // Pulse ring for attackable territories
      if (open && !won) {
        svgEl('circle', { cx: tx, cy: ty, r: r + 10, fill: 'none', stroke: '#e8c566', 'stroke-width': 2.5, class: 'pulse' }, g);
      }

      // Tap area
      svgEl('circle', { cx: tx, cy: ty, r: r + 12, fill: 'transparent' }, g);

      // Territory circle — filled with faction color, opacity based on ownership
      let fillColor, strokeColor, fillOp;
      if (won) {
        fillColor = f.color; strokeColor = f.accent; fillOp = 1;
      } else if (open) {
        fillColor = owner.color; strokeColor = owner.color; fillOp = 0.35;
      } else {
        fillColor = owner.color; strokeColor = owner.color; fillOp = 0.12;
      }
      svgEl('circle', { cx: tx, cy: ty, r, fill: fillColor, opacity: fillOp }, g);
      svgEl('circle', { cx: tx, cy: ty, r, fill: 'none', stroke: strokeColor, 'stroke-width': isFinal ? 4 : 2.5,
        opacity: won ? 1 : open ? 0.9 : 0.4 }, g);

      // Citadel crown symbol
      if (isFinal) {
        const cx2 = tx, cy2 = ty;
        svgEl('path', {
          d: 'M'+(cx2-14)+' '+(cy2+8)+' L'+(cx2-17)+' '+(cy2-10)+' L'+(cx2-6)+' '+(cy2-2)+' L'+cx2+' '+(cy2-15)+' L'+(cx2+6)+' '+(cy2-2)+' L'+(cx2+17)+' '+(cy2-10)+' L'+(cx2+14)+' '+(cy2+8)+' Z',
          fill: won ? '#fff' : open ? '#e8c566' : '#3a4152',
        }, g);
      } else {
        const difficulty = Math.ceil(((t.index || 0) + 1) / 2);
        const numEl = svgEl('text', {
          x: tx, y: ty + 6, 'text-anchor': 'middle',
          fill: won ? '#fff' : open ? '#ece4d0' : '#4a5163',
          'font-size': 15, 'font-weight': 700,
        }, g);
        numEl.textContent = won ? '★'.repeat(Math.min(won, 3)) : (open ? String(difficulty) : '');
      }

      // Territory name label
      if (won || open) {
        const lbl = svgEl('text', {
          x: tx, y: ty + r + 16, 'text-anchor': 'middle',
          fill: won ? f.accent : open ? '#c9c2ad' : '#4a5163',
          'font-size': won ? 11 : 10,
        }, g);
        lbl.textContent = t.name;
        if (won) {
          const oLbl = svgEl('text', { x: tx, y: ty + r + 28, 'text-anchor': 'middle', fill: f.color, 'font-size': 9, opacity: 0.8 }, g);
          oLbl.textContent = '✦ ' + BF.factionById(save.last).short;
        }
      }

      if (open || won) g.addEventListener('click', () => onNode(t));
    });

    // Pinch-to-zoom and pan on the map SVG
    (function() {
      const wrap = $('.mapwrap');
      const VB_BASE = { x: vbX, y: vbY, w: vbW, h: vbH };
      const MIN_ZOOM = 1, MAX_ZOOM = 3;

      // Start zoomed in on home territory
      var initZoom = 2.2;
      var homeZoomX = home ? home.x - (vbW / initZoom) / 2 : vbX;
      var homeZoomY = home ? home.y - (vbH / initZoom) / 2 : vbY;
      let vb = { x: homeZoomX, y: homeZoomY, w: vbW / initZoom, h: vbH / initZoom };
      let zoom = initZoom;

      function clampVB() {
        vb.w = VB_BASE.w / zoom;
        vb.h = VB_BASE.h / zoom;
        vb.x = M.max(VB_BASE.x, M.min(VB_BASE.x + VB_BASE.w - vb.w, vb.x));
        vb.y = M.max(VB_BASE.y, M.min(VB_BASE.y + VB_BASE.h - vb.h, vb.y));
      }
      clampVB();

      function applyVB() {
        svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      }
      applyVB();

      function svgPt(e) {
        const r = svg.getBoundingClientRect();
        return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
      }

      let pointers = {};
      let lastDist = 0, lastMid = null, dragging = false;

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
        } else if (pts.length === 1) {
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

      // Double-tap to zoom out to full map (or back to home if already zoomed out)
      let lastTap = 0;
      wrap.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
          if (zoom > 1.1) {
            zoom = 1; vb.x = VB_BASE.x; vb.y = VB_BASE.y; clampVB(); applyVB();
          } else if (home) {
            zoom = initZoom;
            vb.x = home.x - (VB_BASE.w / zoom) / 2;
            vb.y = home.y - (VB_BASE.h / zoom) / 2;
            clampVB(); applyVB();
          }
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
      (t.final ? '<p class="dim" style="margin:10px 0 0">The Demon God guards the throne. Conquer 3 of 4 enemy legions to unlock. Bring everything you have.</p>' : '') +
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
    if (!c.starUpg || typeof c.starUpg !== 'object') c.starUpg = {};
    // Migrate old format (e.g. { spear: 2 }) to new format ({ 'spear:atkSpd': 2 })
    for (const r of BF.ROLES) {
      if (typeof c.starUpg[r] === 'number') {
        const old = c.starUpg[r];
        delete c.starUpg[r];
        if (old > 0) c.starUpg[r + ':atkSpd'] = old;
      }
    }
    const draw = () => {
      const avail = availableStars(c);
      let html = '<div class="modal-icon">🏰</div>' +
        '<h2 class="center-t">Barracks</h2>' +
        '<p class="dim center-t" style="margin:0 0 8px">Upgrade your units. You have <b class="gold">★ ' + avail + '</b> stars.</p>';

      BF.ROLES.forEach((r) => {
        const u = f.units[r];
        html += '<div class="bk-unit"><div class="bk-unit-head"><canvas width="76" height="76" class="bk-cv" data-role="' + r + '"></canvas><b>' + u.name + '</b></div>';
        html += '<div class="bk-grid">';
        BF.UPGRADE_ATTRS.forEach((attr) => {
          const key = r + ':' + attr.id;
          const lv = c.starUpg[key] || 0;
          const cost = BF.starUpgCost(lv);
          const atMax = lv >= attr.max;
          const bonus = Math.round(lv * attr.perLv * 100);
          html += '<div class="bk-tile">' +
            '<div class="bk-tile-name">' + attr.name + '</div>' +
            '<div class="bk-tile-val">' + (bonus > 0 ? (attr.id === 'goldReduc' ? '-' : '+') + bonus + '%' : '—') + '</div>' +
            pips(lv, attr.max) +
            (atMax ? '<span class="dim" style="font-size:9px">Max</span>' : '<button class="btn small bk-buy" data-key="' + key + '"' + (avail < cost ? ' disabled' : '') + '>★ ' + cost + '</button>') +
            '</div>';
        });
        html += '</div></div>';
      });
      // Castle upgrades section
      html += '<div class="bk-unit"><div class="bk-unit-head"><div class="bk-castle-icon">🏰</div><b>Castle Defences</b></div>';
      html += '<div class="bk-grid">';
      BF.CASTLE_UPGRADE_ATTRS.forEach((attr) => {
        const key = 'castle:' + attr.id;
        const lv = c.starUpg[key] || 0;
        const cost = BF.starUpgCost(lv);
        const atMax = lv >= attr.max;
        const bonus = lv > 0 ? (4 + lv) + '×' : '—';
        html += '<div class="bk-tile">' +
          '<div class="bk-tile-name">' + attr.name + '</div>' +
          '<div class="bk-tile-val">' + bonus + '</div>' +
          pips(lv, attr.max) +
          (atMax ? '<span class="dim" style="font-size:9px">Max</span>' : '<button class="btn small bk-buy" data-key="' + key + '"' + (avail < cost ? ' disabled' : '') + '>★ ' + cost + '</button>') +
          '</div>';
      });
      html += '</div></div>';

      html += '<div class="row"><button class="btn" id="done">Done</button></div>';

      const card = openModal(html);

      // Draw unit tokens on canvases
      card.querySelectorAll('.bk-cv').forEach((cv) => {
        const ctx2 = cv.getContext('2d');
        ctx2.scale(2, 2);
        BF.drawToken(ctx2, 19, 19, 16, f, cv.dataset.role, false, 0);
      });

      card.querySelectorAll('.bk-buy').forEach((b) =>
        b.addEventListener('click', () => {
          const key = b.dataset.key;
          const lv = c.starUpg[key] || 0;
          const cost = BF.starUpgCost(lv);
          const attr = BF.UPGRADE_ATTRS.find(a => key.endsWith(':' + a.id))
            || BF.CASTLE_UPGRADE_ATTRS.find(a => key.endsWith(':' + a.id));
          if (attr && lv < attr.max && availableStars(c) >= cost) {
            c.starUpg[key] = lv + 1; persist(); Sound.play('coin'); draw();
          }
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
    const oldH = G.h, oldSky = G.sky;
    BF.reflow(bw, bh);
    if (B && oldH > 0) {
      // Rescale Y positions proportionally when field size changes
      const scale = G.h / oldH;
      for (const d of B.defenders) d.y = G.sky + (d.y - oldSky) * scale;
      for (const e of B.enemies) e.y = G.sky + (e.y - oldSky) * scale;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.style.width = bw + 'px'; cv.style.height = bh + 'px';
    cv.width = Math.round(bw * dpr); cv.height = Math.round(bh * dpr);
    drawScale = Math.min(cv.width / (G.viewW || G.cw), cv.height / G.ch);
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

    // Action circle buttons (compact ring icons)
    var circR = 18;
    function circBtn(id, iconSvg, barId, extra) {
      return '<button id="' + id + '" class="footer-btn" ' + (extra || '') + '>' +
        '<svg class="footer-ring" viewBox="0 0 40 40">' +
          '<circle class="fr-track" cx="20" cy="20" r="' + circR + '"/>' +
          '<circle class="fr-fill" id="' + barId + '" cx="20" cy="20" r="' + circR + '"/>' +
        '</svg>' +
        '<span class="footer-icon-svg">' + iconSvg + '</span>' +
      '</button>';
    }
    var swordIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/></svg>';
    var daggerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L15 9l-3 3-3-3z"/><path d="M12 14v8"/><path d="M9 18h6"/></svg>';
    var hammerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 15l4-4"/><path d="M15 5l-3 3 4 4 3-3z"/><path d="M2 22l5-5"/></svg>';
    var boltIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>';

    // Unit cards sorted by ascending cost
    var sortedRoles = BF.ROLES.slice().sort((a, b) => B.unitCost(a) - B.unitCost(b));
    sortedRoles.forEach((r) => {
      const u = f.units[r];
      const cost = B.unitCost(r);
      const b = document.createElement('button');
      b.className = 'ucard'; b.dataset.role = r;
      b.innerHTML = '<canvas width="76" height="76"></canvas><div class="cs">' + coin + cost + '</div>';
      const c2 = $('canvas', b).getContext('2d');
      c2.scale(2, 2);
      BF.drawToken(c2, 19, 19, 16, f, r, false, 0);
      b.addEventListener('click', () => {
        if (uiS.selected === 'reinforce') {
          if (B.manualRecruit(r)) { Sound.play('reinforce'); uiS.selected = null; syncTray(); }
          return;
        }
        // Direct spawn on card tap (open field - no row selection)
        const res = B.spawn(r);
        if (res.ok) {
          if (!save.hintSeen) { save.hintSeen = true; persist(); $('#hint').classList.add('hidden'); }
          Sound.play('place'); syncTray();
        } else if (res.reason === 'gold') {
          Sound.play('deny'); flashGold();
        }
      });
      tray.appendChild(b);
    });

    const og = f.units.og;
    if (og) {
      const b = document.createElement('button');
      b.className = 'ucard og-card'; b.dataset.role = 'og';
      b.innerHTML = '<canvas width="76" height="76"></canvas><div class="cs">' + coin + og.cost + '</div>';
      const c2 = $('canvas', b).getContext('2d');
      c2.scale(2, 2);
      BF.drawToken(c2, 19, 19, 16, f, 'og', false, 0);
      b.addEventListener('click', () => {
        // OG is ability-gated, not gold-spawned; keep as selection
        uiS.selected = uiS.selected === 'og' ? null : 'og';
        Sound.play('ui'); syncTray();
      });
      tray.appendChild(b);
    }

    // Separator
    var sep = document.createElement('div');
    sep.className = 'tray-sep';
    tray.appendChild(sep);

    // Action circle buttons inline
    const actHtml =
      circBtn('btn-recruit', swordIcon, 'recruit-bar', '') +
      circBtn('btn-merc', daggerIcon, 'merc-bar', '') +
      circBtn('btn-repair', hammerIcon, 'repair-bar', '') +
      circBtn('btn-ability', boltIcon, 'ability-bar-fill', 'style="--c:' + f.color + '"');
    const actFrag = document.createElement('div');
    actFrag.innerHTML = actHtml;
    while (actFrag.firstChild) tray.appendChild(actFrag.firstChild);

    // Separator
    sep = document.createElement('div');
    sep.className = 'tray-sep';
    tray.appendChild(sep);

    // HUD section: gold + wave info
    const hudSection = document.createElement('div');
    hudSection.className = 'hud-section';
    hudSection.innerHTML =
      '<div class="hud-gold"><span class="coin"></span><b id="hud-gold">0</b></div>' +
      '<div class="hud-wave-compact">' +
        '<span id="hud-wave-text" class="hud-wave-label">W1</span>' +
        '<div class="hud-wave-bar"><i id="hud-wave-fill"></i></div>' +
      '</div>';
    tray.appendChild(hudSection);

    // Separator
    sep = document.createElement('div');
    sep.className = 'tray-sep';
    tray.appendChild(sep);

    // Stance buttons + control buttons
    const ctrlSection = document.createElement('div');
    ctrlSection.className = 'hud-btns';
    ctrlSection.innerHTML =
      '<button id="btn-attack" class="icon-btn stance-btn on" aria-label="Attack" title="Attack: advance">⚔</button>' +
      '<button id="btn-defend" class="icon-btn stance-btn" aria-label="Defend" title="Defend: hold near gate">🛡</button>' +
      '<button id="btn-retreat" class="icon-btn stance-btn" aria-label="Retreat" title="Retreat: fall back to castle">🏰</button>' +
      '<button id="btn-sell" class="icon-btn" aria-label="Sell">$</button>' +
      '<button id="btn-speed" class="icon-btn" aria-label="Speed">' + speed + '×</button>' +
      '<button id="btn-pause" class="icon-btn" aria-label="Pause">❚❚</button>';
    tray.appendChild(ctrlSection);

    // Wire up action button events
    $('#btn-recruit').addEventListener('click', () => {
      if (!B || B.over || B.autoRecruitCd > 0) return;
      uiS.selected = uiS.selected === 'reinforce' ? null : 'reinforce';
      uiS.sellMode = false; $('#btn-sell').classList.remove('on');
      Sound.play('ui'); syncTray();
    });
    $('#btn-ability').addEventListener('click', () => {
      if (!B || B.over || B.abilityCd > 0) return;
      // Direct activation (no row targeting in open field)
      if (B.useAbility()) {
        Sound.play('ability'); uiS.selected = null; syncTray();
      }
    });
    $('#btn-repair').addEventListener('click', () => {
      if (!B || B.over) return;
      const res = B.repairGate();
      if (res.ok) Sound.play('coin');
      syncTray();
    });
    $('#btn-merc').addEventListener('click', () => {
      if (!B || B.over || B.mercCd > 0) return;
      // Direct hire (no row targeting in open field)
      const res = B.hireMerc();
      if (res.ok) { Sound.play('place'); syncTray(); }
    });
    // Wire up control button events
    $('#btn-sell').addEventListener('click', (e) => {
      uiS.sellMode = !uiS.sellMode;
      e.currentTarget.classList.toggle('on', uiS.sellMode);
      if (uiS.sellMode) { uiS.selected = null; syncTray(); }
      Sound.play('ui');
    });
    $('#btn-speed').addEventListener('click', (e) => { speed = speed === 1 ? 2 : 1; e.currentTarget.textContent = speed + '×'; Sound.play('ui'); });
    $('#btn-pause').addEventListener('click', openPause);
    function updateStanceBtns(s) {
      var ab = $('#btn-attack'), db = $('#btn-defend'), rb = $('#btn-retreat');
      if (ab) { ab.classList.toggle('on', s === 'attack'); }
      if (db) { db.classList.toggle('on', s === 'defend'); }
      if (rb) { rb.classList.toggle('on', s === 'retreat'); }
    }
    $('#btn-attack').addEventListener('click', () => {
      if (!B || B.over) return; B.setStance('attack'); updateStanceBtns('attack'); Sound.play('ui');
    });
    $('#btn-defend').addEventListener('click', () => {
      if (!B || B.over) return; B.setStance('defend'); updateStanceBtns('defend'); Sound.play('ui');
    });
    $('#btn-retreat').addEventListener('click', () => {
      if (!B || B.over) return; B.setStance('retreat'); updateStanceBtns('retreat'); Sound.play('ui');
    });
  }
  function syncActBtns() {
    if (!B) return;
    const repairBtn = $('#btn-repair');
    const mercBtn   = $('#btn-merc');
    if (repairBtn) {
      const ready = B.repairCd <= 0;
      repairBtn.disabled = !ready || !!B.over;
      repairBtn.classList.toggle('ready', ready);
      const bar = $('#repair-bar');
      if (bar) { var p = ready ? 1 : (1 - B.repairCd / BF.REPAIR_CD); bar.style.strokeDashoffset = (113.1 * (1 - p)).toFixed(1); }
    }
    if (mercBtn) {
      const ready = B.mercCd <= 0;
      mercBtn.disabled = !ready || !!B.over;
      mercBtn.classList.toggle('ready', ready);
      mercBtn.classList.toggle('sel', uiS.selected === 'merc');
      const bar = $('#merc-bar');
      if (bar) { var p = ready ? 1 : (1 - B.mercCd / BF.MERC_CD); bar.style.strokeDashoffset = (113.1 * (1 - p)).toFixed(1); }
    }
  }

  function syncTray() {
    const isReinforce = uiS.selected === 'reinforce';
    document.querySelectorAll('.ucard').forEach((c) => {
      const role = c.dataset.role;
      c.classList.toggle('sel', false);
      c.classList.toggle('poor', B.gold < B.unitCost(role));
      c.classList.toggle('reinforce-pick', isReinforce && B.gold >= B.unitCost(role));
    });
    const abilBtn = $('#btn-ability');
    if (abilBtn) abilBtn.classList.toggle('sel', uiS.selected === 'ability');
    const recruitBtn = $('#btn-recruit');
    if (recruitBtn) recruitBtn.classList.toggle('sel', isReinforce);
    syncActBtns();
  }

  function lockLandscape() {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){}); } catch(e) {}
  }
  lockLandscape();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) lockLandscape(); });

  function startBattle(t) {
    const f = BF.factionById(save.last), c = camp(f.id);
    terr = t;
    var mm = save.mode === 'novice' ? 0.65 : save.mode === 'legendary' ? 1.5 : 1;
    var goldMult = save.mode === 'novice' ? 1.3 : save.mode === 'legendary' ? 0.75 : 1;
    B = new BF.Battle({ factionId: f.id, territory: t, upgrades: c.upg, tribute: conqueredCount(c), starUpg: c.starUpg, modeMult: mm, goldMult: goldMult });
    uiS = { selected: null, sellMode: false, inspect: null, inspectUntil: 0, banner: { text: B.zombie ? 'Survive!' : 'March to victory!', t: 2.2 }, gateFlash: 0, abilityFlash: 0, siegeFlash: 0, cam: { x: 0, target: 0 } };
    speed = 1; paused = false; resultShown = false; lastWave = 0;
    buildTray();
    var skipBtn = $('#btn-skip');
    if (skipBtn) skipBtn.onclick = function() {
      if (!B || B.over) return;
      var reward = B.skipWave();
      if (reward) { var c2 = camp(save.last); c2.stats.skipGold += reward; persist(); Sound.play('coin'); syncTray(); }
    };
    show('battle');
    lockLandscape();
    fit();
    const hint = $('#hint');
    if (!save.hintSeen) hint.classList.remove('hidden'); else hint.classList.add('hidden');
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  let _lastSpawnT = 0;
  let _panState = { active: false, startX: 0, startCamX: 0, totalDrag: 0 };
  cv.addEventListener('pointerdown', (e) => {
    if (!B || paused) return;
    e.preventDefault();
    _panState.active = true;
    _panState.startX = e.clientX;
    _panState.startCamX = uiS ? uiS.cam.x : 0;
    _panState.totalDrag = 0;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cv.addEventListener('pointermove', (e) => {
    if (!_panState.active || !B || !uiS) return;
    const dx = e.clientX - _panState.startX;
    _panState.totalDrag = Math.max(_panState.totalDrag, Math.abs(dx));
    if (_panState.totalDrag > 8) {
      const r = cv.getBoundingClientRect();
      const worldDx = dx / r.width * (G.viewW || G.cw);
      uiS.cam.x = Math.max(0, Math.min(G.cw - (G.viewW || G.cw), _panState.startCamX - worldDx));
      uiS.cam.target = uiS.cam.x;
    }
  });
  cv.addEventListener('pointerup', (e) => {
    if (!_panState.active) return;
    const wasDrag = _panState.totalDrag > 8;
    _panState.active = false;
    if (wasDrag || !B || B.over || paused) return;
    var now = performance.now();
    if (now - _lastSpawnT < 120) return;
    _lastSpawnT = now;
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / r.width;
    const cx = ((e.clientX - r.left) * dpr - BF.drawOffset.x) / drawScale;
    const cy = ((e.clientY - r.top) * dpr - BF.drawOffset.y) / drawScale;
    if (cy < G.sky || cy > G.sky + G.h) return;

    if (uiS.sellMode) {
      const near = B.unitNear(cx, cy);
      if (near) {
        B.sellUnit(near.id); Sound.play('sell');
        uiS.sellMode = false; $('#btn-sell').classList.remove('on');
        syncTray();
      }
      return;
    }
    if (uiS.selected === 'merc') {
      const res = B.hireMerc(cy);
      if (res.ok) { Sound.play('place'); uiS.selected = null; syncTray(); }
      return;
    }
    if (uiS.selected === 'ability') {
      if (B.useAbility()) { Sound.play('place'); uiS.selected = null; syncTray(); }
      return;
    }
    if (uiS.selected && uiS.selected !== 'og') {
      const res = B.spawn(uiS.selected, cy);
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
  cv.addEventListener('pointercancel', () => { _panState.active = false; });

  function updateHud() {
    var goldEl = $('#hud-gold');
    if (goldEl) goldEl.textContent = Math.floor(B.gold);
    const w = Math.max(1, B.waveNow());
    var waveTextEl = $('#hud-wave-text');
    if (waveTextEl) waveTextEl.textContent = B.zombie ? 'W' + w : w + '/' + terr.waves;
    var waveFillEl = $('#hud-wave-fill');
    if (waveFillEl) waveFillEl.style.width = Math.round((B.next / B.schedule.length) * 100) + '%';
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
      const ROLE_ICON = { spear: '🗡', sword: '⚔', archer: '🏹', mage: '✨', warlock: '🔥', healer: '💚', champion: '👑', warlord: '💀' };
      fcEl.innerHTML = upcoming.length ? upcoming.map(function(r) {
        return '<span class="fc-pip" title="' + r + '">' + (ROLE_ICON[r] || '⚔') + '</span>';
      }).join('') : '';
    }
    syncActBtns();
    // Recruit bar (visual only, no text countdown)
    const recruitBar = $('#recruit-bar');
    if (recruitBar) {
      const interval = BF.AUTO_RECRUIT ? BF.AUTO_RECRUIT.interval : 50;
      const rReady = B.autoRecruitCd <= 0;
      const frac = rReady ? 100 : M.round((1 - B.autoRecruitCd / interval) * 100);
      recruitBar.style.strokeDashoffset = (113.1 * (1 - frac / 100)).toFixed(1);
      const btn = $('#btn-recruit');
      if (btn) { btn.classList.toggle('ready', rReady); btn.disabled = !!B.over; }
    }
    // Ability cooldown bar
    const ab = BF.ABILITIES[B.faction.id];
    const abilBtn = $('#btn-ability');
    if (ab && abilBtn) {
      const cd = B.abilityCd;
      const aReady = cd <= 0;
      abilBtn.classList.toggle('ready', aReady);
      abilBtn.disabled = !aReady || !!B.over;
      const fill = $('#ability-bar-fill');
      if (fill) { var p = aReady ? 1 : (1 - cd / ab.cooldown); fill.style.strokeDashoffset = (113.1 * (1 - p)).toFixed(1); }
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
      if (w !== lastWave && w > 0) { lastWave = w; uiS.banner = { text: B.zombie ? 'Wave ' + w : (w === terr.waves ? 'Final wave' : 'Wave ' + w), t: 1.8 }; }
      if (uiS.banner.t > 0) uiS.banner.t -= dt;
      if (uiS.gateFlash > 0) uiS.gateFlash -= dt;
      if (uiS.siegeFlash > 0) uiS.siegeFlash -= dt;
      if (uiS.abilityFlash > 0) uiS.abilityFlash -= dt;
      if (uiS.inspect && B.time > uiS.inspectUntil) uiS.inspect = null;
      uiS.cam.x += (uiS.cam.target - uiS.cam.x) * 0.06;
    }
    BF.renderBattle(ctx, B, uiS, drawScale, uiS.cam.x);
    updateHud();
    if (B.over && !resultShown) { resultShown = true; setTimeout(B.zombie ? showZombieResult : showResult, 700); }
  }

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
    $('#restart', card).onclick = () => { closeModal(); if (B && B.zombie) startZombieBattle(); else startBattle(terr); };
    $('#retreat', card).onclick = () => { if (B && B.zombie) { closeModal(); paused = false; B = null; cancelAnimationFrame(raf); renderHome(); show('home'); } else leaveBattle(); };
  }

  function leaveBattle() { closeModal(); paused = false; B = null; cancelAnimationFrame(raf); renderMap(); show('map'); }

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

  /* ======================= ZOMBIE MODE ======================= */
  function startZombieBattle() {
    const f = BF.factionById(save.last), c = camp(f.id);
    const zombieTerr = {
      id: 'zombie', name: 'The Endless Horde', owner: 'citadel',
      waves: 3, final: false, index: 4,
      hpScale: 1.2, dmgScale: 1.1, countScale: 1.3,
    };
    terr = zombieTerr;
    var mm = save.mode === 'novice' ? 0.65 : save.mode === 'legendary' ? 1.5 : 1;
    var goldMult = save.mode === 'novice' ? 1.3 : save.mode === 'legendary' ? 0.75 : 1;
    B = new BF.Battle({ factionId: f.id, territory: zombieTerr, upgrades: c.upg, tribute: conqueredCount(c), starUpg: c.starUpg, modeMult: mm, goldMult: goldMult, zombie: true });
    uiS = { selected: null, sellMode: false, inspect: null, inspectUntil: 0, banner: { text: 'Survive!', t: 2.2 }, gateFlash: 0, abilityFlash: 0, siegeFlash: 0, cam: { x: 0, target: 0 } };
    speed = 1; paused = false; resultShown = false; lastWave = 0;
    buildTray();
    var skipBtn = $('#btn-skip');
    if (skipBtn) skipBtn.onclick = function() {
      if (!B || B.over) return;
      var reward = B.skipWave();
      if (reward) { Sound.play('coin'); syncTray(); }
    };
    show('battle');
    lockLandscape();
    fit();
    $('#hint').classList.add('hidden');
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function showZombieResult() {
    if (!B) return;
    const f = BF.factionById(save.last), c = camp(f.id);
    if (!c.zombieBest) c.zombieBest = { wave: 0, kills: 0 };
    const waveReached = Math.max(1, B.waveNow());
    const kills = B.zombieKills;
    const isNewBest = waveReached > c.zombieBest.wave || (waveReached === c.zombieBest.wave && kills > c.zombieBest.kills);
    if (isNewBest) {
      c.zombieBest.wave = waveReached;
      c.zombieBest.kills = kills;
    }
    persist();
    const card = openModal(
      '<div class="modal-icon">💀</div>' +
      '<h2 class="center-t" style="color:var(--danger)">Overrun!</h2>' +
      '<div class="center-t dim" style="margin-top:6px">Zombie Mode — ' + f.short + '</div>' +
      (isNewBest ? '<div class="center-t gold" style="margin:8px 0">★ New Personal Best! ★</div>' : '') +
      '<div class="kv" style="margin-top:12px"><span class="dim">Waves survived</span><b>' + waveReached + '</b></div>' +
      '<div class="kv"><span class="dim">Enemies defeated</span><b>' + kills + '</b></div>' +
      '<div class="kv"><span class="dim">Best wave</span><b class="gold">' + c.zombieBest.wave + '</b></div>' +
      '<div class="kv"><span class="dim">Best kills</span><b class="gold">' + c.zombieBest.kills + '</b></div>' +
      '<div class="row"><button class="btn ghost" id="z-home">Home</button><button class="btn" id="z-retry">Try Again</button></div>',
      { center: true, dismiss: false }
    );
    $('#z-home', card).onclick = function() { closeModal(); paused = false; B = null; cancelAnimationFrame(raf); renderHome(); show('home'); };
    $('#z-retry', card).onclick = function() { closeModal(); startZombieBattle(); };
  }

  /* ======================= start (splash → home) ======================= */
  (function runSplash() {
    var splash = $('#screen-splash');
    var fill = $('#splash-fill');
    var label = $('#splash-label');
    splash.classList.add('fade-in');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { splash.classList.add('fade-in-go'); });
    });
    var pct = 0;
    var steps = [
      { at: 20, text: 'Forging blades…' },
      { at: 50, text: 'Raising banners…' },
      { at: 80, text: 'Marshalling legions…' },
      { at: 100, text: 'Ready' },
    ];
    var si = 0;
    var iv = setInterval(function () {
      pct = Math.min(100, pct + 1.2 + Math.random() * 2);
      fill.style.width = Math.round(pct) + '%';
      while (si < steps.length && pct >= steps[si].at) { label.textContent = steps[si].text; si++; }
      if (pct >= 100) {
        clearInterval(iv);
        setTimeout(function () {
          splash.classList.add('fade-out');
          setTimeout(function () {
            splash.classList.remove('active', 'fade-out', 'fade-in', 'fade-in-go');
            renderHome(); show('home');
          }, 1000);
        }, 600);
      }
    }, 120);
  })();
  BF.app = { get save() { return save; }, startBattle, startZombieBattle, renderMap, renderLegions, renderHome, get battle() { return B; } };
})();
