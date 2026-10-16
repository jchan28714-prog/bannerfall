/* ==========================================================================
   BANNERFALL - drawing
   Canvas-only sprites: filled bodies, faction racial art, animated limbs.
   Walk cycle driven by b.time; attack swing driven by unit.atk.
   Castle gate replaces the plain left wall.
   ========================================================================== */
(function () {
  'use strict';
  const BF = (globalThis.BF = globalThis.BF || {});
  const G = BF.GRID;
  const TAU = Math.PI * 2;
  const M = Math;

  // ── faction skin palettes ──────────────────────────────────────────────────
  const SKIN = {
    men:     '#d4906a',
    elves:   '#c8d898',
    orcs:    '#587838',
    goblins: '#8a9828',
    dwarves: '#c07848',
  };

  /* ==========================================================================
     HEAD – faction-specific race features drawn after the base head circle
     ctx already translated to token centre, scaled to r/20
  ========================================================================== */
  function _head(ctx, fid, hR, hY, accentColor) {
    const sin = M.sin, cos = M.cos, pi = M.PI;
    if (fid === 'men') {
      // Iron nasal helmet
      ctx.fillStyle = '#7a8ca0';
      ctx.beginPath(); ctx.ellipse(0, hY - hR * 0.38, hR * 0.9, hR * 0.6, 0, pi, TAU); ctx.fill();
      ctx.lineWidth = 1.8; ctx.strokeStyle = '#9aaab8';
      ctx.beginPath(); ctx.moveTo(0, hY - hR * 0.38); ctx.lineTo(0, hY + hR * 0.45); ctx.stroke();
    } else if (fid === 'elves') {
      // Leaf circlet
      ctx.strokeStyle = '#90c060'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, hY, hR + 2.5, pi * 1.1, pi * 1.9); ctx.stroke();
      // Pointed ears (filled triangles)
      ctx.fillStyle = SKIN.elves;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hR * 0.85, hY - hR * 0.25);
        ctx.lineTo(s * hR * 2.0,  hY - hR * 1.6);
        ctx.lineTo(s * hR * 0.55, hY - hR * 0.8);
        ctx.closePath(); ctx.fill();
      }
    } else if (fid === 'orcs') {
      // Skull-plate helmet
      ctx.fillStyle = '#38302a';
      ctx.beginPath(); ctx.ellipse(0, hY - hR * 0.45, hR * 0.95, hR * 0.62, 0, pi, TAU); ctx.fill();
      // Tusks
      ctx.strokeStyle = '#e0d8b0'; ctx.lineWidth = 2.5;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 2.5, hY + hR * 0.52); ctx.lineTo(s * 4.5, hY + hR * 1.45); ctx.stroke();
      }
    } else if (fid === 'goblins') {
      // Big bat ears (filled)
      ctx.fillStyle = SKIN.goblins;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hR * 0.85, hY - hR * 0.2);
        ctx.lineTo(s * hR * 2.4,  hY - hR * 1.4);
        ctx.lineTo(s * hR * 0.58, hY + hR * 0.45);
        ctx.closePath(); ctx.fill();
      }
      // Glowing yellow eyes
      ctx.fillStyle = '#ffdd00';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(s * 1.9, hY - 0.4, 1.5, 0, TAU); ctx.fill();
      }
    } else if (fid === 'dwarves') {
      // Horned helmet
      ctx.fillStyle = '#b87a2c'; ctx.strokeStyle = '#d8a050'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, hY - hR * 0.42, hR * 0.95, hR * 0.64, 0, pi, TAU);
      ctx.fill(); ctx.stroke();
      // Horns
      ctx.fillStyle = '#d4b050';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hR * 0.75, hY - hR * 0.88);
        ctx.lineTo(s * hR * 1.85, hY - hR * 2.6);
        ctx.lineTo(s * hR * 0.2,  hY - hR * 0.66);
        ctx.closePath(); ctx.fill();
      }
      // Beard
      ctx.strokeStyle = '#a07838'; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.arc(0, hY + hR * 0.2, hR * 0.85, 0.35, pi - 0.35); ctx.stroke();
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 2.5, hY + hR * 0.9);
        ctx.lineTo(i * 2.0, hY + hR * 2.1); ctx.stroke();
      }
    }
  }

  /* ==========================================================================
     WEAPON – role-specific weapon drawn from the elbow position outward
  ========================================================================== */
  function _weapon(ctx, role, accentColor, ex, ey, armDir, ap, bw, bh, walkPhase) {
    const sin = M.sin, cos = M.cos, pi = M.PI;

    switch (role) {
      case 'spear': {
        // Two-handed: spear angled forward, thrusts during attack
        const sDir = armDir - 0.25 + sin(ap * pi) * 0.45;
        const shaft = 30;
        const tx = ex + cos(sDir) * shaft, ty = ey + sin(sDir) * shaft;
        const bx = ex - cos(sDir) * 14,   by = ey - sin(sDir) * 14;
        ctx.strokeStyle = '#7a5a28'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
        // Blade tip
        ctx.fillStyle = '#c8d8e0';
        ctx.beginPath();
        ctx.moveTo(tx + cos(sDir)*9, ty + sin(sDir)*9);
        ctx.lineTo(tx - cos(sDir+pi/2)*3, ty - sin(sDir+pi/2)*3);
        ctx.lineTo(tx - cos(sDir-pi/2)*3, ty - sin(sDir-pi/2)*3);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'sword': {
        // Shield on off-hand
        ctx.fillStyle = '#253050'; ctx.strokeStyle = accentColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-bw / 2 - 12, -3, 9, 14, [0, 0, 4, 4]); ctx.fill(); ctx.stroke();
        // Shield cross emblem
        ctx.strokeStyle = '#e8c566'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-bw/2-7, 0); ctx.lineTo(-bw/2-7, 7);
        ctx.moveTo(-bw/2-11, 3.5); ctx.lineTo(-bw/2-3, 3.5);
        ctx.stroke();
        // Sword blade (swings during attack)
        const sd = armDir - pi * 0.1;
        const bl = 19;
        ctx.strokeStyle = '#d0e2f8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + cos(sd)*bl, ey + sin(sd)*bl); ctx.stroke();
        // Crossguard
        ctx.strokeStyle = '#9090b8'; ctx.lineWidth = 2.5;
        const cg = 5;
        ctx.beginPath();
        ctx.moveTo(ex + cos(sd)*5 + cos(sd+pi/2)*cg, ey + sin(sd)*5 + sin(sd+pi/2)*cg);
        ctx.lineTo(ex + cos(sd)*5 - cos(sd+pi/2)*cg, ey + sin(sd)*5 - sin(sd+pi/2)*cg);
        ctx.stroke();
        // Blade edge highlight
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ex + cos(sd+0.15)*3, ey + sin(sd+0.15)*3);
        ctx.lineTo(ex + cos(sd+0.1)*bl*0.9, ey + sin(sd+0.1)*bl*0.9);
        ctx.stroke();
        break;
      }
      case 'archer': {
        // Bow positioned at elbow
        const bowR = 13;
        ctx.strokeStyle = '#7a5520'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ex, ey, bowR, pi * 0.48, pi * 1.52); ctx.stroke();
        // Draw string, pulled back based on ap
        const pull = ap * 10;
        const strMidX = ex - bowR - pull;
        const p1 = { x: ex + bowR * cos(pi * 0.48), y: ey + bowR * sin(pi * 0.48) };
        const p2 = { x: ex + bowR * cos(pi * 1.52), y: ey + bowR * sin(pi * 1.52) };
        ctx.strokeStyle = '#c8b880'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(strMidX, ey); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        // Arrow (disappears at release)
        if (ap < 0.82) {
          ctx.strokeStyle = '#7a4e18'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(strMidX, ey); ctx.lineTo(ex + bowR + 4, ey); ctx.stroke();
          ctx.fillStyle = '#a0b8c8';
          ctx.beginPath();
          ctx.moveTo(ex + bowR + 12, ey);
          ctx.lineTo(ex + bowR + 6, ey - 3);
          ctx.lineTo(ex + bowR + 6, ey + 3);
          ctx.closePath(); ctx.fill();
        }
        // Draw-back arm (left hand)
        ctx.lineWidth = 3; ctx.strokeStyle = accentColor;
        ctx.beginPath(); ctx.moveTo(-bw / 2 + 1, -bh / 2 + 3); ctx.lineTo(strMidX, ey); ctx.stroke();
        break;
      }
      case 'mage': {
        // Robe flare
        ctx.fillStyle = accentColor; ctx.globalAlpha = 0.38;
        ctx.beginPath(); ctx.roundRect(-bw/2-3, -bh/2, bw+6, bh+10, [2,2,8,8]); ctx.fill();
        ctx.globalAlpha = 1;
        // Staff (off-hand)
        const sTop = { x: -bw/2 - 6, y: -bh/2 - 18 };
        ctx.strokeStyle = '#5a3a14'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-bw/2 - 4, bh/2 + 2); ctx.lineTo(sTop.x, sTop.y); ctx.stroke();
        // Orb – pulses with walk cycle
        const orbPulse = 0.7 + 0.3 * sin(walkPhase * 1.3);
        ctx.fillStyle = '#7a40d0';
        ctx.beginPath(); ctx.arc(sTop.x, sTop.y - 5, 5, 0, TAU); ctx.fill();
        ctx.globalAlpha = orbPulse * 0.42;
        ctx.fillStyle = '#b080ff';
        ctx.beginPath(); ctx.arc(sTop.x, sTop.y - 5, 10, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        // Off-hand arm to staff
        ctx.lineWidth = 3; ctx.strokeStyle = accentColor;
        ctx.beginPath(); ctx.moveTo(-bw/2 + 1, -bh/2 + 3); ctx.lineTo(-bw/2 - 5, -bh/2 - 1); ctx.stroke();
        // Casting sparks during attack
        if (ap > 0.06) {
          ctx.globalAlpha = M.min(1, ap * 2);
          ctx.strokeStyle = '#d0a0ff'; ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(ex, ey); ctx.lineTo(ex + 8, ey - 5);
          ctx.moveTo(ex, ey); ctx.lineTo(ex + 7, ey + 4);
          ctx.moveTo(ex, ey); ctx.lineTo(ex + 11, ey);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        break;
      }
    }
  }

  /* ==========================================================================
     GLYPH – full sprite with walk + attack animation
     Drawn in a ~40×40 unit box centred at 0,0; scaled to token size via r/20.
     enemy=true mirrors horizontally (face left).
  ========================================================================== */
  function glyph(ctx, role, accentColor, enemy, fid, atkPhase, walkPhase) {
    const sin = M.sin, cos = M.cos, pi = M.PI;
    const ap = M.min(1, atkPhase || 0);
    const wp = walkPhase || 0;

    const skin = SKIN[fid] || SKIN.men;
    // Body proportions per race
    const BW = { men:9, elves:7, orcs:13, goblins:7, dwarves:13 }[fid] || 9;
    const BH = 12;
    const hR = { men:5.5, elves:5, orcs:6.5, goblins:4, dwarves:5.5 }[fid] || 5.5;
    const hY = -BH / 2 - hR - 1;
    const legLen = { men:12, elves:13, orcs:11, goblins:10, dwarves:10 }[fid] || 12;
    const legW  = { men:4, elves:3.5, orcs:5.5, goblins:3.5, dwarves:5.5 }[fid] || 4;

    ctx.save();
    if (enemy) ctx.scale(-1, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Walk swing (halted during heavy attack)
    const walkStrength = ap > 0.2 ? M.max(0, 1 - ap * 2) : 1;
    const legSwingA = sin(wp) * 0.3 * walkStrength;
    const legSwingB = sin(wp + pi) * 0.3 * walkStrength;

    // ── BACK LEG ─────────────────────────────────────────────────────
    ctx.lineWidth = legW; ctx.strokeStyle = '#1a1f32';
    ctx.beginPath();
    ctx.moveTo(-2.5, BH * 0.5);
    ctx.lineTo(-2.5 + sin(legSwingA) * legLen, BH * 0.5 + cos(legSwingA) * legLen);
    ctx.stroke();

    // ── FRONT LEG ────────────────────────────────────────────────────
    ctx.lineWidth = legW + 0.5; ctx.strokeStyle = '#242840';
    ctx.beginPath();
    ctx.moveTo(2.5, BH * 0.5);
    ctx.lineTo(2.5 + sin(legSwingB) * legLen, BH * 0.5 + cos(legSwingB) * legLen);
    ctx.stroke();

    // ── TORSO ────────────────────────────────────────────────────────
    ctx.fillStyle = accentColor;
    ctx.beginPath(); ctx.roundRect(-BW/2, -BH/2, BW, BH, [4,4,2,2]); ctx.fill();
    // Armor sheen
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.roundRect(-BW/2+1, -BH/2+1, BW-2, BH*0.42, [3,3,0,0]); ctx.fill();
    // Leg-join shadow
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.roundRect(-BW/2, BH/2-3, BW, 3, [0,0,2,2]); ctx.fill();

    // ── HEAD ─────────────────────────────────────────────────────────
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, hY, hR, 0, TAU); ctx.fill();
    _head(ctx, fid, hR, hY, accentColor);

    // ── OFF-HAND ARM ─────────────────────────────────────────────────
    if (role !== 'archer' && role !== 'mage') { // archer/mage handle their own off-hand
      const baSwing = sin(wp + pi * 0.5) * 0.18 * walkStrength;
      ctx.lineWidth = 3; ctx.strokeStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(-BW/2 + 1, -BH/2 + 3);
      ctx.lineTo(-BW/2 - 4 + sin(baSwing) * 2, -BH/2 + 3 + cos(baSwing) * 6);
      ctx.stroke();
    }

    // ── WEAPON ARM ───────────────────────────────────────────────────
    // Attack phase drives a forward swing; idle state has gentle sway
    const swingAng = ap > 0
      ? sin(ap * pi) * 1.2
      : sin(wp + pi) * 0.18 * walkStrength;
    const armDir = -pi * 0.55 + swingAng;
    const armLen = 7;
    const elbowX = BW/2 - 1 + cos(armDir) * armLen;
    const elbowY = -BH/2 + 3 + sin(armDir) * armLen;

    if (role !== 'archer') { // archer overrides arm in _weapon
      ctx.lineWidth = 3.5; ctx.strokeStyle = accentColor;
      ctx.beginPath(); ctx.moveTo(BW/2 - 1, -BH/2 + 3); ctx.lineTo(elbowX, elbowY); ctx.stroke();
    }

    // ── WEAPON DRAWING ────────────────────────────────────────────────
    _weapon(ctx, role, accentColor, elbowX, elbowY, armDir, ap, BW, BH, wp);

    ctx.restore();
  }
  BF.drawGlyph = glyph;

  /* ==========================================================================
     TOKEN – circle (defender) or hexagon (enemy) badge with the glyph inside
  ========================================================================== */
  function hexPath(ctx, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -M.PI / 2 + (k * TAU) / 6;
      if (k === 0) ctx.moveTo(M.cos(a) * r, M.sin(a) * r);
      else         ctx.lineTo(M.cos(a) * r, M.sin(a) * r);
    }
    ctx.closePath();
  }

  function token(ctx, x, y, r, f, role, enemy, hit, atkPhase, walkPhase) {
    ctx.save();
    ctx.translate(x, y);
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.85, r * 0.7, r * 0.2, 0, 0, TAU); ctx.fill();
    // Figure (no badge circle — drawn directly)
    ctx.scale(r / 20, r / 20);
    const base = (role === 'champion' || role === 'warlord') ? 'sword' : role;
    glyph(ctx, base, enemy ? f.color : f.accent, enemy, f.id, atkPhase || 0, walkPhase || 0);
    // Champion crown / warlord horns
    if (role === 'champion' || role === 'warlord') {
      ctx.fillStyle = '#e8c566';
      ctx.beginPath();
      if (role === 'champion') {
        ctx.moveTo(-8,-17); ctx.lineTo(-8,-21); ctx.lineTo(-4,-18);
        ctx.lineTo(0,-23); ctx.lineTo(4,-18); ctx.lineTo(8,-21); ctx.lineTo(8,-17);
      } else {
        ctx.moveTo(-12,-17); ctx.lineTo(-20,-30); ctx.lineTo(-8,-21);
        ctx.lineTo(8,-21); ctx.lineTo(20,-30); ctx.lineTo(12,-17);
      }
      ctx.closePath(); ctx.fill();
    }
    // Hit flash
    if (hit > 0) {
      ctx.globalAlpha = M.min(0.55, hit * 5);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  BF.drawToken = token;

  /* ==========================================================================
     CASTLE GATE – drawn over-top of units that enter it (siege visual)
  ========================================================================== */
  function drawCastle(ctx, h, baseHp, baseMax, gateFlash, factionColor) {
    const f = baseHp / baseMax;
    const cw = BF.CASTLE_W;
    const pi = M.PI;

    // Stone fill
    const STONE_A = '#1d2336', STONE_B = '#111624', STONE_LITE = '#242d44';
    ctx.fillStyle = STONE_A;
    ctx.fillRect(0, 0, cw, h);

    // Brick pattern
    const BW = 20, BH = 11;
    ctx.lineWidth = 0.5;
    for (let row = 0; row * BH < h; row++) {
      const yy = row * BH;
      const offset = (row % 2) * (BW / 2);
      for (let col = -1; col * BW + offset < cw + BW; col++) {
        const xx = col * BW + offset;
        ctx.fillStyle = row % 4 === 1 ? STONE_LITE : STONE_A;
        ctx.fillRect(xx + 1, yy + 1, BW - 2, BH - 2);
        ctx.strokeStyle = STONE_B;
        ctx.strokeRect(xx + 0.5, yy + 0.5, BW - 1, BH - 1);
      }
    }

    // Gate arch opening
    const archCX = 27;
    const archR   = 20;
    const archTop = M.round(h * 0.22);
    const archBot = M.round(h * 0.78);
    ctx.fillStyle = '#050608';
    ctx.beginPath();
    ctx.moveTo(archCX - archR, archBot);
    ctx.lineTo(archCX - archR, archTop + archR);
    ctx.arc(archCX, archTop + archR, archR, pi, 0);
    ctx.lineTo(archCX + archR, archBot);
    ctx.closePath(); ctx.fill();

    // Arch voussoirs (stone wedges framing the arch)
    ctx.strokeStyle = STONE_LITE; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(archCX, archTop + archR, archR + 3, pi, 0);
    ctx.stroke();
    // Keystone
    ctx.fillStyle = STONE_LITE;
    ctx.beginPath();
    ctx.moveTo(archCX - 5, archTop); ctx.lineTo(archCX + 5, archTop);
    ctx.lineTo(archCX + 3.5, archTop + 9); ctx.lineTo(archCX - 3.5, archTop + 9);
    ctx.closePath(); ctx.fill();

    // Portcullis bars – fill from top, height scales with HP
    const archOpenTop = archTop + archR;
    const portMax = archBot - archOpenTop;
    const portH = M.round(f * portMax);
    const barColor = '#3a4858';
    for (let i = 0; i < 5; i++) {
      const bx = archCX - archR + 3 + i * 7.5;
      ctx.fillStyle = barColor;
      ctx.fillRect(bx, archOpenTop, 3, portH);
    }
    // Portcullis crossbar
    if (portH > 6) {
      ctx.fillStyle = '#2a3545';
      ctx.fillRect(archCX - archR + 3, archOpenTop + portH - 5, archR * 2 - 6, 5);
    }

    // ── Battlements top ──────────────────────────────────────────────
    ctx.fillStyle = STONE_LITE;
    ctx.fillRect(0, 0, cw, 28);
    let mx = 0;
    while (mx + 8 <= cw) {
      ctx.fillStyle = STONE_A;
      ctx.fillRect(mx, 0, 7, 15);
      mx += 7 + 5;
    }

    // ── Battlements bottom ────────────────────────────────────────────
    ctx.fillStyle = STONE_LITE;
    ctx.fillRect(0, h - 28, cw, 28);
    mx = 0;
    while (mx + 8 <= cw) {
      ctx.fillStyle = STONE_A;
      ctx.fillRect(mx, h - 15, 7, 15);
      mx += 7 + 5;
    }

    // Faction banner (top-left of tower)
    const flagX = 6, flagY = 15;
    ctx.fillStyle = factionColor;
    ctx.fillRect(flagX, flagY - 1, 2, 24);
    ctx.beginPath();
    ctx.moveTo(flagX + 2, flagY);
    ctx.lineTo(flagX + 18, flagY + 7);
    ctx.lineTo(flagX + 2, flagY + 14);
    ctx.closePath(); ctx.fill();

    // Right-edge cast shadow
    const rg = ctx.createLinearGradient(cw, 0, cw + 14, 0);
    rg.addColorStop(0, 'rgba(0,0,0,.55)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(cw, 0, 14, h);

    // HP bar (thin vertical strip on the right wall)
    const barH = h - 20;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(cw - 7, 10, 4, barH);
    const barC = f > 0.5 ? '#7fcf86' : f > 0.25 ? '#e8c566' : '#e0605a';
    ctx.fillStyle = barC; ctx.fillRect(cw - 7, 10 + barH * (1 - f), 4, barH * f);

    // Gate flash
    if (gateFlash > 0) {
      ctx.fillStyle = 'rgba(224,96,90,' + M.min(0.48, gateFlash) + ')';
      ctx.fillRect(0, 0, cw + 22, h);
    }
  }

  /* ==========================================================================
     HP BAR helper
  ========================================================================== */
  function bar(ctx, x, y, w, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, M.max(0, w * frac), 4);
  }

  /* ==========================================================================
     RENDER BATTLE – full frame
  ========================================================================== */
  BF.renderBattle = function (ctx, b, ui, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, G.cw, G.ch);
    const me = b.faction, foe = b.owner;
    const T = b.time; // game time drives all animations

    // Background
    const bg = ctx.createLinearGradient(0, 0, G.cw, 0);
    bg.addColorStop(0, '#0e1118'); bg.addColorStop(1, '#161920');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, G.cw, G.ch);

    // Alternating lane shading
    for (let r = 0; r < G.rows; r++) {
      if (r % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,.022)';
        ctx.fillRect(0, r * G.cell, G.cw, G.cell);
      }
    }

    // Defender-side spawn glow (castle exit)
    const dg = ctx.createLinearGradient(BF.SPAWN_X + 20, 0, BF.SPAWN_X + 70, 0);
    dg.addColorStop(0, hexA(me.color, 0.18)); dg.addColorStop(1, hexA(me.color, 0));
    ctx.fillStyle = dg; ctx.fillRect(BF.SPAWN_X + 20, 0, 50, G.h);

    // Enemy-spawn glow (right edge)
    const eg = ctx.createLinearGradient(G.cw, 0, G.cw - 90, 0);
    eg.addColorStop(0, hexA(foe.color, 0.28)); eg.addColorStop(1, hexA(foe.color, 0));
    ctx.fillStyle = eg; ctx.fillRect(G.cw - 90, 0, 90, G.h);

    // Lane tap hints when a unit type is selected
    if (ui.selected) {
      for (let r = 0; r < G.rows; r++) {
        ctx.fillStyle = 'rgba(232,197,102,.06)';
        ctx.fillRect(0, r * G.cell + 2, G.cw, G.cell - 4);
        ctx.fillStyle = 'rgba(232,197,102,.45)';
        ctx.beginPath(); ctx.arc(BF.SPAWN_X + 12, r * G.cell + G.cell / 2, 4, 0, TAU); ctx.fill();
      }
    }

    // Range band for inspected unit
    if (ui.inspect && !ui.inspect.dead) {
      const d = ui.inspect;
      ctx.fillStyle = 'rgba(232,197,102,.08)';
      ctx.fillRect(d.x + 3, d.row * G.cell + 3, d.range, G.cell - 6);
      ctx.strokeStyle = 'rgba(232,197,102,.4)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x + 3, d.row * G.cell + 3, d.range, G.cell - 6);
    }

    // ── DEFENDERS ──────────────────────────────────────────────────────
    for (const d of b.defenders) {
      const ap = d.atk / 0.18;
      const wp = T * 4; // walk phase
      const lunge = d.atk > 0 && !d.ranged ? 5 * (d.atk / 0.18) : 0;
      const dx = d.x + lunge, dy = d.y;

      // Frenzy aura (orcs Blood Frenzy)
      if (d.frenzied) {
        const pulse = 0.5 + 0.5 * M.sin(T * 10);
        ctx.globalAlpha = 0.22 + pulse * 0.18;
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.ellipse(dx, dy, 26, 18, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Shield aura (dwarves Ironclad)
      if (d.ironclad) {
        const pulse = 0.5 + 0.5 * M.sin(T * 6);
        ctx.globalAlpha = 0.18 + pulse * 0.14;
        ctx.fillStyle = '#60a0e8';
        ctx.beginPath(); ctx.ellipse(dx, dy, 26, 18, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Shield Wall aura (spear touch ability)
      if (d.shielded) {
        const pulse = 0.5 + 0.5 * M.sin(T * 6);
        ctx.globalAlpha = 0.2 + pulse * 0.15;
        ctx.fillStyle = '#60c8e8';
        ctx.beginPath(); ctx.ellipse(dx, dy, 26, 18, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Rally aura (sword touch ability)
      if (d.rallied) {
        const pulse = 0.5 + 0.5 * M.sin(T * 8 + d.id);
        ctx.globalAlpha = 0.18 + pulse * 0.14;
        ctx.fillStyle = '#e8c566';
        ctx.beginPath(); ctx.ellipse(dx, dy, 26, 18, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Sell mode overlay
      if (ui.sellMode) {
        const pulse = 0.5 + 0.5 * M.sin(T * 5 + d.id);
        ctx.globalAlpha = 0.28 + pulse * 0.18;
        ctx.fillStyle = '#e0605a';
        ctx.beginPath(); ctx.ellipse(dx, dy, 24, 17, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        const refund = M.round(d.cost * BF.ECON.sellRefund);
        ctx.fillStyle = '#ff9a8a'; ctx.textAlign = 'center';
        ctx.font = '700 10px "Avenir Next",system-ui,sans-serif';
        ctx.fillText('+' + refund, dx, dy - 28);
      }

      // Touch-ability ready: golden pulse ring; shrinking arc when on cooldown
      if (BF.TOUCH_ABILITIES[d.type]) {
        if (d.touchCd === 0) {
          const pulse = 0.5 + 0.5 * M.sin(T * 4 + d.id * 0.8);
          ctx.globalAlpha = 0.28 + pulse * 0.22;
          ctx.strokeStyle = '#e8c566'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(dx, dy, 26 + pulse * 3, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          const ab = BF.TOUCH_ABILITIES[d.type];
          const frac = 1 - d.touchCd / ab.cooldown;
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = '#e8c566'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(dx, dy, 26, -M.PI / 2, -M.PI / 2 + TAU * frac); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      token(ctx, dx, dy, 22, me, d.type, false, d.hit, ap, wp);
      if (d.hp < d.maxHp - 0.5) bar(ctx, d.x, d.y - 31, 34, d.hp / d.maxHp, '#7fcf86');
    }

    // ── ENEMIES (sorted rightmost first so frontrunners draw on top) ───
    const foes = b.enemies.slice().sort((a, c) => c.x - a.x);
    for (const e of foes) {
      const r = 18 * e.size;
      const ap = e.atk / 0.18;
      const wp = T * 4.2;
      const lunge = e.atk > 0 && !e.ranged ? -5 * (e.atk / 0.18) : 0;
      token(ctx, e.x + lunge, e.y, r, foe, e.role, true, e.hit, ap, wp);
      if (e.hp < e.maxHp - 0.5) bar(ctx, e.x, e.y - r - 9, 32 * M.min(1.4, e.size), e.hp / e.maxHp, '#e0605a');
    }

    // ── PROJECTILES ────────────────────────────────────────────────────
    for (const s of b.shots) {
      const k = M.min(1, s.t / s.dur);
      const x = s.x1 + (s.x2 - s.x1) * k, y = s.y1 + (s.y2 - s.y1) * k;
      ctx.fillStyle = s.color; ctx.strokeStyle = s.color;
      if (s.kind === 'orb') {
        ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;    ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      } else {
        const a = M.atan2(s.y2 - s.y1, s.x2 - s.x1);
        ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x - M.cos(a) * 9, y - M.sin(a) * 9); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    // AoE rings
    for (const rg of b.rings) {
      const k = rg.t / rg.dur;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.strokeStyle = rg.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r * (0.4 + 0.6 * k), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── CASTLE GATE (draws over enemies that enter it) ─────────────────
    drawCastle(ctx, G.h, b.baseHp, b.baseMax, ui.gateFlash, me.color);

    // Bottom decorative strip
    ctx.fillStyle = '#0e1018'; ctx.fillRect(0, G.h, G.cw, G.ch - G.h);
    ctx.fillStyle = '#1a1e2c';
    for (let x = 0; x < G.cw; x += 22) ctx.fillRect(x + 2, G.h, 14, 6);

    // ── FLOATING DAMAGE / GOLD NUMBERS ────────────────────────────────
    ctx.textAlign = 'center';
    ctx.font = '700 13px "Avenir Next","Segoe UI",system-ui,sans-serif';
    for (const t of b.floats) {
      const k = t.t / t.dur;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(t.text, t.x + 1, t.y - k * 28 + 1);
      ctx.fillStyle = t.color;          ctx.fillText(t.text, t.x,     t.y - k * 28);
      ctx.globalAlpha = 1;
    }

    // ── WAVE BANNER ────────────────────────────────────────────────────
    if (ui.banner && ui.banner.t > 0) {
      ctx.globalAlpha = M.max(0, M.min(1, ui.banner.t / 0.6));
      ctx.fillStyle = 'rgba(10,12,18,.65)'; ctx.fillRect(0, G.h / 2 - 28, G.cw, 56);
      ctx.fillStyle = '#e8c566';
      ctx.font = '600 24px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
      ctx.fillText(ui.banner.text, G.cw / 2, G.h / 2 + 8);
      ctx.globalAlpha = 1;
    }
  };

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  BF.hexA = hexA;
})();
