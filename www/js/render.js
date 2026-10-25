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
    citadel: '#c0b0e0',
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
    } else if (fid === 'citadel') {
      // Angelic halo
      ctx.strokeStyle = '#e8d080'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.ellipse(0, hY - hR * 1.2, hR * 1.1, hR * 0.3, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      // Glowing eyes
      ctx.fillStyle = '#e0d0ff';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(s * 2, hY - 0.5, 1.8, 0, TAU); ctx.fill();
      }
      // Ethereal hood
      ctx.fillStyle = '#6a50a8'; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(0, hY - hR * 0.3, hR * 1.0, hR * 0.7, 0, pi, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ==========================================================================
     WEAPON – role-specific weapon drawn from the elbow position outward
  ========================================================================== */
  function _weapon(ctx, role, accentColor, ex, ey, armDir, ap, bw, bh, walkPhase) {
    const sin = M.sin, cos = M.cos, pi = M.PI;

    switch (role) {
      case 'spear': {
        // Two-handed: spear held forward, thrusts linearly during attack
        const sDir = armDir - 0.25;
        const thrustDist = sin(ap * pi) * 12;
        const shaft = 30;
        const ox = cos(sDir) * thrustDist, oy = sin(sDir) * thrustDist;
        const tx = ex + ox + cos(sDir) * shaft, ty = ey + oy + sin(sDir) * shaft;
        const bx = ex + ox - cos(sDir) * 14,   by = ey + oy - sin(sDir) * 14;
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
        const bowR = 13;
        // Impactful wind-up: eased pull feels heavier and snappier
        const pull = M.pow(ap, 0.65) * 16;
        // Bow bends under tension — arc flattens as string is drawn
        const bowAngle = pi * (0.48 + ap * 0.08);
        ctx.strokeStyle = '#7a5520'; ctx.lineWidth = 2.5 + ap * 0.8;
        ctx.beginPath(); ctx.arc(ex, ey, bowR, bowAngle, pi * 2 - bowAngle); ctx.stroke();
        // Bow wood highlight
        ctx.strokeStyle = '#a07840'; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(ex, ey, bowR + 1.5, bowAngle + 0.15, pi - 0.15); ctx.stroke();
        ctx.globalAlpha = 1;
        // Draw string (pulled back)
        const strMidX = ex - bowR - pull;
        const p1x = ex + bowR * cos(bowAngle), p1y = ey + bowR * sin(bowAngle);
        const p2y = ey - bowR * sin(bowAngle); // p2x === p1x by symmetry
        ctx.strokeStyle = '#c8b880'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(strMidX, ey); ctx.lineTo(p1x, p2y); ctx.stroke();
        // Arrow shaft + feather fletching
        if (ap < 0.82) {
          ctx.strokeStyle = '#7a4e18'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(strMidX, ey); ctx.lineTo(ex + bowR + 4, ey); ctx.stroke();
          // Arrowhead
          ctx.fillStyle = '#b8ccd8';
          ctx.beginPath();
          ctx.moveTo(ex + bowR + 13, ey); ctx.lineTo(ex + bowR + 7, ey - 3.5); ctx.lineTo(ex + bowR + 7, ey + 3.5);
          ctx.closePath(); ctx.fill();
          // Feather fletching at tail
          ctx.strokeStyle = '#d8a050'; ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(strMidX + 3, ey); ctx.lineTo(strMidX + 9, ey - 4.5);
          ctx.moveTo(strMidX + 3, ey); ctx.lineTo(strMidX + 9, ey + 4.5);
          ctx.stroke();
          // Glow at max draw tension
          if (ap > 0.65) {
            const gk = (ap - 0.65) / 0.17;
            ctx.globalAlpha = gk * 0.55;
            ctx.fillStyle = '#ffe080';
            ctx.beginPath(); ctx.arc(strMidX, ey, 4.5, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        // Draw-back arm
        ctx.lineWidth = 3; ctx.strokeStyle = accentColor;
        ctx.beginPath(); ctx.moveTo(-bw / 2 + 1, -bh / 2 + 3); ctx.lineTo(strMidX, ey); ctx.stroke();
        break;
      }
      case 'mage': {
        const charge = ap > 0.05 ? M.min(1, (ap - 0.05) / 0.7) : 0;
        // Robe flare — brightens with charge
        ctx.fillStyle = accentColor; ctx.globalAlpha = 0.38 + charge * 0.22;
        ctx.beginPath(); ctx.roundRect(-bw/2-3, -bh/2, bw+6, bh+10, [2,2,8,8]); ctx.fill();
        ctx.globalAlpha = 1;
        // Staff (off-hand)
        const sTop = { x: -bw/2 - 6, y: -bh/2 - 18 };
        ctx.strokeStyle = '#5a3a14'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-bw/2 - 4, bh/2 + 2); ctx.lineTo(sTop.x, sTop.y); ctx.stroke();
        // Orb – pulses with walk cycle, glows during charge
        const orbR = 5 + charge * 3.5;
        const orbPulse = 0.7 + 0.3 * sin(walkPhase * 1.3);
        ctx.fillStyle = '#7a40d0';
        ctx.beginPath(); ctx.arc(sTop.x, sTop.y - 5, orbR, 0, TAU); ctx.fill();
        ctx.globalAlpha = orbPulse * 0.42 + charge * 0.3;
        ctx.fillStyle = '#b080ff';
        ctx.beginPath(); ctx.arc(sTop.x, sTop.y - 5, orbR * 2.1, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        // Off-hand arm to staff
        ctx.lineWidth = 3; ctx.strokeStyle = accentColor;
        ctx.beginPath(); ctx.moveTo(-bw/2 + 1, -bh/2 + 3); ctx.lineTo(-bw/2 - 5, -bh/2 - 1); ctx.stroke();
        // Orbiting rune particles during charge-up
        if (ap > 0.05) {
          for (let j = 0; j < 3; j++) {
            const a = walkPhase * 2.2 + j * (TAU / 3);
            const oR = 9 + charge * 5;
            const rx = sTop.x + cos(a) * oR;
            const ry = (sTop.y - 5) + sin(a) * oR * 0.45;
            ctx.globalAlpha = 0.3 + charge * 0.55;
            ctx.fillStyle = j === 0 ? '#c0a0ff' : j === 1 ? '#80c0ff' : '#ffc0f0';
            ctx.beginPath(); ctx.arc(rx, ry, 2 + charge * 1.2, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        // Pre-cast expanding ring at high charge
        if (ap > 0.68) {
          const rf = (ap - 0.68) / 0.32;
          ctx.globalAlpha = 0.65 * (1 - rf);
          ctx.strokeStyle = '#d0a0ff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sTop.x, sTop.y - 5, 5 + rf * 14, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
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
    const OG_GLYPH = { men:'sword', elves:'archer', orcs:'sword', goblins:'mage', dwarves:'sword', citadel:'mage' };
    const base = role === 'og' ? (OG_GLYPH[f.id] || 'sword') : (role === 'champion' || role === 'warlord') ? 'sword' : role;
    glyph(ctx, base, enemy ? f.color : f.accent, enemy, f.id, atkPhase || 0, walkPhase || 0);
    // OG Force elite crown
    if (role === 'og') {
      ctx.fillStyle = '#e8c566';
      ctx.beginPath();
      ctx.moveTo(-9, -18); ctx.lineTo(-12, -27); ctx.lineTo(-5, -22);
      ctx.lineTo(0, -30); ctx.lineTo(5, -22); ctx.lineTo(12, -27); ctx.lineTo(9, -18);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e8c566'; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
  const CASTLE_STYLES = {
    men: {
      stoneA: '#1d2336', stoneB: '#111624', stoneLite: '#242d44',
      archTrim: '#242d44', barColor: '#3a4858',
      detail(ctx, cw, h, time) {
        ctx.strokeStyle = '#e8c566'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cw * 0.5 - 6, h * 0.45); ctx.lineTo(cw * 0.5, h * 0.38); ctx.lineTo(cw * 0.5 + 6, h * 0.45);
        ctx.moveTo(cw * 0.5, h * 0.38); ctx.lineTo(cw * 0.5, h * 0.52);
        ctx.stroke();
      },
    },
    elves: {
      stoneA: '#1a2818', stoneB: '#0e1c0c', stoneLite: '#2a3c22',
      archTrim: '#60a048', barColor: '#3a5838',
      detail(ctx, cw, h, time) {
        ctx.strokeStyle = '#60a048'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const vy = h * 0.3 + i * 18;
          const sway = M.sin((time || 0) * 1.4 + i) * 4;
          ctx.beginPath();
          ctx.moveTo(cw * 0.15, vy + 12);
          ctx.quadraticCurveTo(cw * 0.25 + sway, vy, cw * 0.4, vy + 6);
          ctx.stroke();
        }
        ctx.fillStyle = '#90c060'; ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(cw * 0.3, h * 0.18, 8, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      },
    },
    orcs: {
      stoneA: '#2a1810', stoneB: '#1a0c08', stoneLite: '#3c2418',
      archTrim: '#5a2810', barColor: '#4a2818',
      detail(ctx, cw, h, time) {
        ctx.fillStyle = '#8a3010';
        ctx.beginPath();
        ctx.moveTo(cw * 0.2, h * 0.35); ctx.lineTo(cw * 0.25, h * 0.28); ctx.lineTo(cw * 0.3, h * 0.35);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#e05020'; ctx.lineWidth = 2;
        const flicker = M.sin((time || 0) * 6) * 2;
        ctx.beginPath();
        ctx.moveTo(cw * 0.25, h * 0.5 + flicker);
        ctx.lineTo(cw * 0.22, h * 0.42); ctx.lineTo(cw * 0.28, h * 0.42);
        ctx.closePath(); ctx.stroke();
      },
    },
    goblins: {
      stoneA: '#1c2010', stoneB: '#101808', stoneLite: '#2c3418',
      archTrim: '#506020', barColor: '#384818',
      detail(ctx, cw, h, time) {
        ctx.strokeStyle = '#8a9828'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const gx = 4 + i * 10, gy = h * 0.3 + (i % 2) * 14;
          ctx.beginPath();
          ctx.moveTo(gx, gy); ctx.lineTo(gx + 5, gy - 4); ctx.lineTo(gx + 8, gy + 2);
          ctx.stroke();
        }
        ctx.fillStyle = '#80c828'; ctx.globalAlpha = 0.25 + 0.15 * M.sin((time || 0) * 3);
        ctx.beginPath(); ctx.arc(cw * 0.35, h * 0.55, 5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      },
    },
    dwarves: {
      stoneA: '#2a2428', stoneB: '#181418', stoneLite: '#3c3440',
      archTrim: '#d0a030', barColor: '#5a4828',
      detail(ctx, cw, h, time) {
        ctx.fillStyle = '#d0a030'; ctx.globalAlpha = 0.6;
        for (let i = 0; i < 3; i++) {
          const rx = cw * 0.15 + i * 12, ry = h * 0.35 + (i % 2) * 10;
          ctx.fillRect(rx, ry, 6, 6);
          ctx.strokeStyle = '#e8c060'; ctx.lineWidth = 0.8;
          ctx.strokeRect(rx, ry, 6, 6);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#c89020'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cw * 0.2, h * 0.58); ctx.lineTo(cw * 0.2, h * 0.65);
        ctx.moveTo(cw * 0.17, h * 0.60); ctx.lineTo(cw * 0.23, h * 0.60);
        ctx.stroke();
      },
    },
    citadel: {
      stoneA: '#1a1430', stoneB: '#0e0a20', stoneLite: '#2a2048',
      archTrim: '#8a6ad0', barColor: '#4a3870',
      detail(ctx, cw, h, time) {
        // Floating crystal
        const bob = M.sin((time || 0) * 2) * 3;
        ctx.fillStyle = '#c8b0f0'; ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(cw * 0.3, h * 0.38 + bob);
        ctx.lineTo(cw * 0.3 - 5, h * 0.45 + bob);
        ctx.lineTo(cw * 0.3, h * 0.52 + bob);
        ctx.lineTo(cw * 0.3 + 5, h * 0.45 + bob);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(cw * 0.3, h * 0.45 + bob, 10, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        // Rune lines
        ctx.strokeStyle = '#8a6ad0'; ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4 + 0.2 * M.sin((time || 0) * 1.5);
        ctx.beginPath();
        ctx.moveTo(cw * 0.1, h * 0.3); ctx.lineTo(cw * 0.4, h * 0.3);
        ctx.moveTo(cw * 0.1, h * 0.6); ctx.lineTo(cw * 0.4, h * 0.6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      },
    },
  };

  function drawCastle(ctx, h, baseHp, baseMax, gateFlash, factionColor, time, factionId) {
    const f = baseHp / baseMax;
    const cw = BF.CASTLE_W;
    const pi = M.PI;
    const style = CASTLE_STYLES[factionId] || CASTLE_STYLES.men;
    const STONE_A = style.stoneA, STONE_B = style.stoneB, STONE_LITE = style.stoneLite;

    ctx.fillStyle = STONE_A;
    ctx.fillRect(0, 0, cw, h);

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

    // Gate arch
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

    ctx.strokeStyle = style.archTrim; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(archCX, archTop + archR, archR + 3, pi, 0);
    ctx.stroke();
    ctx.fillStyle = STONE_LITE;
    ctx.beginPath();
    ctx.moveTo(archCX - 5, archTop); ctx.lineTo(archCX + 5, archTop);
    ctx.lineTo(archCX + 3.5, archTop + 9); ctx.lineTo(archCX - 3.5, archTop + 9);
    ctx.closePath(); ctx.fill();

    // Portcullis
    const archOpenTop = archTop + archR;
    const portMax = archBot - archOpenTop;
    const portH = M.round(f * portMax);
    for (let i = 0; i < 5; i++) {
      const bx = archCX - archR + 3 + i * 7.5;
      ctx.fillStyle = style.barColor;
      ctx.fillRect(bx, archOpenTop, 3, portH);
    }
    if (portH > 6) {
      ctx.fillStyle = STONE_B;
      ctx.fillRect(archCX - archR + 3, archOpenTop + portH - 5, archR * 2 - 6, 5);
    }

    // Battlements top
    ctx.fillStyle = STONE_LITE;
    ctx.fillRect(0, 0, cw, 28);
    let mx = 0;
    while (mx + 8 <= cw) {
      ctx.fillStyle = STONE_A;
      ctx.fillRect(mx, 0, 7, 15);
      mx += 7 + 5;
    }

    // Battlements bottom
    ctx.fillStyle = STONE_LITE;
    ctx.fillRect(0, h - 28, cw, 28);
    mx = 0;
    while (mx + 8 <= cw) {
      ctx.fillStyle = STONE_A;
      ctx.fillRect(mx, h - 15, 7, 15);
      mx += 7 + 5;
    }

    // Faction-specific details
    if (style.detail) style.detail(ctx, cw, h, time);

    // Faction banner
    const flagX = 6, flagY = 15;
    ctx.fillStyle = factionColor;
    ctx.fillRect(flagX, flagY - 1, 2, 24);
    const wave = time ? M.sin(time * 2.8) * 3 : 0;
    ctx.beginPath();
    ctx.moveTo(flagX + 2, flagY);
    ctx.quadraticCurveTo(flagX + 10, flagY + 4 + wave, flagX + 18, flagY + 7);
    ctx.quadraticCurveTo(flagX + 10, flagY + 11 - wave, flagX + 2, flagY + 14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.beginPath();
    ctx.moveTo(flagX + 2, flagY);
    ctx.quadraticCurveTo(flagX + 8, flagY + 3 + wave, flagX + 14, flagY + 5);
    ctx.quadraticCurveTo(flagX + 8, flagY + 8 - wave * 0.5, flagX + 2, flagY + 7);
    ctx.closePath(); ctx.fill();

    // Right-edge shadow
    const rg = ctx.createLinearGradient(cw, 0, cw + 14, 0);
    rg.addColorStop(0, 'rgba(0,0,0,.55)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(cw, 0, 14, h);

    // HP bar
    const barH = h - 20;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(cw - 7, 10, 4, barH);
    const barC = f > 0.5 ? '#7fcf86' : f > 0.25 ? '#e8c566' : '#e0605a';
    ctx.fillStyle = barC; ctx.fillRect(cw - 7, 10 + barH * (1 - f), 4, barH * f);

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

  // ── Biome-based background system ─────────────────────────────────────────
  const BIOMES = {
    meadow:   { skyA:'#3e8cc4', skyB:'#a8d8f8', horA:'#6ab048', horB:'#3a6828', groundB:'#243e18', cloudFill:'rgba(255,255,255,.72)', particle:'#f8e060', mtnFill:'#3e6030' },
    forest:   { skyA:'#c07028', skyB:'#e8a858', horA:'#7a5430', horB:'#4c3418', groundB:'#362412', cloudFill:'rgba(240,140,60,.5)',   particle:'#f86028', mtnFill:'#4a6838' },
    scorched: { skyA:'#c03010', skyB:'#e87830', horA:'#8a3810', horB:'#501808', groundB:'#300e04', cloudFill:'rgba(200,80,40,.52)',    particle:'#f09040', mtnFill:'#481808' },
    mountain: { skyA:'#1a4878', skyB:'#60a4d8', horA:'#889aa8', horB:'#505868', groundB:'#2e3248', cloudFill:'rgba(220,240,255,.68)', particle:'#c8e0f8', mtnFill:'#505a78' },
    swamp:    { skyA:'#123820', skyB:'#3a8060', horA:'#284830', horB:'#142418', groundB:'#0c1c14', cloudFill:'rgba(40,160,90,.46)',    particle:'#30f090', mtnFill:'#1a4028' },
    dark:     { skyA:'#0c0220', skyB:'#280848', horA:'#380c3c', horB:'#1e0820', groundB:'#0c0414', cloudFill:'rgba(140,40,200,.52)',   particle:'#c040f0', mtnFill:'#280840' },
  };
  const BIOME_BY_FACTION = { men:'meadow', elves:'forest', orcs:'scorched', dwarves:'mountain', goblins:'swamp', citadel:'dark' };

  function drawBackground(ctx, terrId, foeId, T) {
    const cw = G.cw, ch = G.ch, sin = M.sin;
    const bm = terrId === 't_citadel' ? BIOMES.dark : (BIOMES[BIOME_BY_FACTION[foeId]] || BIOMES.meadow);
    const skyH = G.sky || ch * 0.20;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, skyH);
    sky.addColorStop(0, bm.skyA); sky.addColorStop(1, bm.skyB);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, skyH);

    // Ground gradient
    const gnd = ctx.createLinearGradient(0, skyH * 0.85, 0, ch);
    gnd.addColorStop(0, bm.horA); gnd.addColorStop(0.4, bm.horB); gnd.addColorStop(1, bm.groundB);
    ctx.fillStyle = gnd; ctx.fillRect(0, skyH * 0.85, cw, ch);

    // Mountain/hill silhouette
    ctx.fillStyle = bm.mtnFill; ctx.globalAlpha = 0.88;
    ctx.beginPath(); ctx.moveTo(0, skyH);
    for (let k = 0; k <= 12; k++) {
      const h = 22 + 20 * sin(k * 1.8 + 0.6) + 10 * sin(k * 3.5 + 1.1);
      ctx.lineTo(k * cw / 12, skyH - h);
    }
    ctx.lineTo(cw, skyH); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Drifting clouds (3 at different speeds)
    const CLOUDS = [[cw * 0.2, skyH * 0.28, 28, 4.0], [cw * 0.6, skyH * 0.15, 20, 6.2], [cw * 0.85, skyH * 0.35, 24, 5.0]];
    ctx.fillStyle = bm.cloudFill;
    for (const [ox, cy, r, spd] of CLOUDS) {
      const cx = ((ox + T * spd) % (cw + 120)) - 60;
      ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.ellipse(cx - 20, cy + 2, r * 0.75, r * 0.50, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx,      cy - 4, r,        r * 0.60, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 20, cy + 3, r * 0.65, r * 0.48, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Ambient particles (pollen/embers/snowflakes/fireflies per biome)
    ctx.fillStyle = bm.particle;
    for (let i = 0; i < 10; i++) {
      const px = (cw + 80 - ((T * (2 + i * 0.4) + i * 50) % (cw + 100)));
      const py = skyH * 0.12 + sin(T * 0.8 + i * 1.5) * skyH * 0.32 + i * (ch / 12);
      if (py > 0 && py < ch * 0.62) {
        ctx.globalAlpha = 0.35 + 0.35 * sin(T * 1.5 + i);
        ctx.beginPath(); ctx.arc(px, py, 1.5 + sin(i * 2.1) * 0.7, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ==========================================================================
     RENDER BATTLE – full frame
  ========================================================================== */
  BF.renderBattle = function (ctx, b, ui, scale) {
    var offsetX = (ctx.canvas.width - G.cw * scale) / 2;
    var offsetY = (ctx.canvas.height - G.ch * scale) / 2;
    if (offsetX > 0.5 || offsetY > 0.5) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0f1117';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    var ox = M.max(0, offsetX), oy = M.max(0, offsetY);
    BF.drawOffset.x = ox; BF.drawOffset.y = oy;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.clearRect(0, 0, G.cw, G.ch);
    const me = b.faction, foe = b.owner;
    const T = b.time; // game time drives all animations

    // Scaled token radii — derived from cell size so 8-row layouts stay readable
    const DR  = M.round(G.cell * 0.38);   // defender token radius (~16 for cell=42)
    const ER  = M.round(G.cell * 0.32);   // enemy token radius   (~13 for cell=42)
    const OGR = M.round(G.cell * 0.58);   // OG Force token radius — imposing elite units
    const AUR = M.round(G.cell * 0.47);   // aura/ring radius

    // Colorful biome background (sky + terrain + clouds + particles)
    drawBackground(ctx, b.terr ? b.terr.id : null, b.owner ? b.owner.id : null, T);

    // Semi-transparent battlefield overlay so units remain readable
    ctx.fillStyle = 'rgba(6,8,16,.40)';
    ctx.fillRect(0, G.sky, G.cw, G.h);

    // Alternating lane shading
    for (let r = 0; r < G.rows; r++) {
      ctx.fillStyle = r % 2 === 0 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
      ctx.fillRect(0, G.sky + r * G.cell, G.cw, G.cell);
    }

    // Defender-side spawn glow (castle exit)
    const dg = ctx.createLinearGradient(BF.SPAWN_X + 20, 0, BF.SPAWN_X + 70, 0);
    dg.addColorStop(0, hexA(me.color, 0.18)); dg.addColorStop(1, hexA(me.color, 0));
    ctx.fillStyle = dg; ctx.fillRect(BF.SPAWN_X + 20, G.sky, 50, G.h);

    // Enemy-spawn glow (right edge)
    const eg = ctx.createLinearGradient(G.cw, 0, G.cw - 90, 0);
    eg.addColorStop(0, hexA(foe.color, 0.28)); eg.addColorStop(1, hexA(foe.color, 0));
    ctx.fillStyle = eg; ctx.fillRect(G.cw - 90, G.sky, 90, G.h);

    // Lane tap targets — full-row highlight + border so players know they can tap anywhere
    if (ui.selected) {
      for (let r = 0; r < G.rows; r++) {
        const ry = G.sky + r * G.cell;
        ctx.fillStyle = 'rgba(232,197,102,.07)';
        ctx.fillRect(2, ry + 2, G.cw - 4, G.cell - 4);
        ctx.strokeStyle = 'rgba(232,197,102,.38)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(2, ry + 2, G.cw - 4, G.cell - 4);
        const cy = ry + G.cell / 2;
        ctx.fillStyle = 'rgba(232,197,102,.65)';
        ctx.beginPath(); ctx.moveTo(8, cy - 6); ctx.lineTo(22, cy); ctx.lineTo(8, cy + 6); ctx.closePath(); ctx.fill();
      }
    }
    // Visible lane separator lines (always shown)
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    for (let r = 1; r < G.rows; r++) {
      ctx.beginPath(); ctx.moveTo(BF.CASTLE_W + 2, G.sky + r * G.cell); ctx.lineTo(G.cw, G.sky + r * G.cell); ctx.stroke();
    }

    // Range band for inspected unit
    if (ui.inspect && !ui.inspect.dead) {
      const d = ui.inspect;
      ctx.fillStyle = 'rgba(232,197,102,.08)';
      ctx.fillRect(d.x + 3, G.sky + d.row * G.cell + 3, d.range, G.cell - 6);
      ctx.strokeStyle = 'rgba(232,197,102,.4)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x + 3, G.sky + d.row * G.cell + 3, d.range, G.cell - 6);
    }

    // ── DEFENDERS ──────────────────────────────────────────────────────
    for (const d of b.defenders) {
      const ap = d.atk / 0.18;
      const wp = T * 4;
      const lunge = d.atk > 0 && !d.ranged ? 5 * (d.atk / 0.18) : 0;
      const dx = d.x + lunge, dy = d.y;

      // Sell mode overlay (kept for UX)
      if (ui.sellMode) {
        const refund = M.round(d.cost * BF.ECON.sellRefund);
        ctx.fillStyle = '#ff9a8a'; ctx.textAlign = 'center';
        ctx.font = '700 10px "Avenir Next",system-ui,sans-serif';
        ctx.fillText('+' + refund, dx, dy - (DR + 12));
      }
      token(ctx, dx, dy, d.isOg ? OGR : DR, me, d.type, false, d.hit, ap, wp);
      if (d.hp < d.maxHp - 0.5) bar(ctx, d.x, d.y - (d.isOg ? OGR + 14 : DR + 11), 34, d.hp / d.maxHp, '#7fcf86');
    }

    // ── ENEMIES (sorted rightmost first so frontrunners draw on top) ───
    // Clip enemies inside the enemy fortress so they don't show through
    const fortressEdge = G.cw - BF.CASTLE_W;
    const foes = b.enemies.slice().sort((a, c) => c.x - a.x);
    for (const e of foes) {
      if (e.x > fortressEdge + 8) continue;
      const r = ER * e.size;
      const ap = e.atk / 0.18;
      const wp = T * 4.2;
      const lunge = e.atk > 0 && !e.ranged ? -5 * (e.atk / 0.18) : 0;
      token(ctx, e.x + lunge, e.y, r, foe, e.role, true, e.hit, ap, wp);
      if (e.hp < e.maxHp - 0.5) bar(ctx, e.x, e.y - r - 9, 32 * M.min(1.4, e.size), e.hp / e.maxHp, '#e0605a');
    }

    // ── PROJECTILES ────────────────────────────────────────────────────
    for (const s of b.shots) {
      const k = M.min(1, s.t / s.dur);
      const arc = s.arc || 0;
      const x = s.x1 + (s.x2 - s.x1) * k;
      const y = s.y1 + (s.y2 - s.y1) * k - arc * M.sin(k * M.PI);
      ctx.fillStyle = s.color; ctx.strokeStyle = s.color;
      if (s.kind === 'orb') {
        ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;    ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      } else if (s.kind === 'bolt') {
        // Jagged lightning bolt (Holy Smite VFX) — full path from source to target
        const flash = M.max(0, 1 - k * 1.8);
        ctx.globalAlpha = flash;
        ctx.strokeStyle = s.color; ctx.lineWidth = 2.5;
        const seg = 7, seed = (M.floor(s.t * 12) * 100003) | 0;
        const hf = (n) => { let v = ((n + seed) * 2654435761) >>> 0; return (v >>> 0) / 4294967296; };
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1);
        for (let i = 1; i < seg; i++) {
          const t2 = i / seg;
          ctx.lineTo(s.x1 + (s.x2 - s.x1) * t2 + (hf(i * 3) - 0.5) * 18,
                     s.y1 + (s.y2 - s.y1) * t2 + (hf(i * 3 + 1) - 0.5) * 14);
        }
        ctx.lineTo(s.x2, s.y2); ctx.stroke();
        ctx.globalAlpha = flash * 0.45; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        // Tangent direction follows the parabolic arc
        const ddx = s.x2 - s.x1;
        const ddy = (s.y2 - s.y1) - arc * M.PI * M.cos(k * M.PI);
        const a = M.atan2(ddy, ddx);
        // Impact flash for arced arrows near the target
        if (arc > 0 && k > 0.78) {
          const fk = (k - 0.78) / 0.22;
          ctx.globalAlpha = (1 - fk) * 0.72;
          ctx.fillStyle = '#fff8d0';
          ctx.beginPath(); ctx.arc(x, y, 6 * (1 - fk * 0.5), 0, TAU); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = s.color; ctx.strokeStyle = s.color;
        }
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
    ctx.save(); ctx.translate(0, G.sky);
    drawCastle(ctx, G.h, b.baseHp, b.baseMax, ui.gateFlash, me.color, T, me.id);
    ctx.restore();

    // ── ENEMY FORTRESS (right side, mirrored castle) ─────────────────
    ctx.save();
    ctx.translate(G.cw, G.sky);
    ctx.scale(-1, 1);
    drawCastle(ctx, G.h, b.enemyBaseHp, b.enemyBaseMax, ui.siegeFlash || 0, foe.color, T, foe.id);
    ctx.restore();

    // Bottom decorative strip
    ctx.fillStyle = '#0e1018'; ctx.fillRect(0, G.sky + G.h, G.cw, G.ch - G.sky - G.h);
    ctx.fillStyle = '#1a1e2c';
    for (let x = 0; x < G.cw; x += 22) ctx.fillRect(x + 2, G.sky + G.h, 14, 6);

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
      ctx.fillStyle = 'rgba(10,12,18,.65)'; ctx.fillRect(0, G.sky + G.h / 2 - 28, G.cw, 56);
      ctx.fillStyle = '#e8c566';
      ctx.font = '600 24px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
      ctx.fillText(ui.banner.text, G.cw / 2, G.sky + G.h / 2 + 8);
      ctx.globalAlpha = 1;
    }
  };

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  BF.hexA = hexA;
  BF.drawOffset = { x: 0, y: 0 };
})();
