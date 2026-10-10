/* ==========================================================================
   BANNERFALL - drawing
   All art is drawn with code (canvas paths). Enemies march from RIGHT to LEFT.
   Defenders face right; enemies face left (mirrored horizontally).
   ========================================================================== */
(function () {
  'use strict';
  const BF = (globalThis.BF = globalThis.BF || {});
  const G = BF.GRID;
  const TAU = Math.PI * 2;

  /* ---------- person glyphs (drawn in a 40×40 box centred on 0,0) ----------
     enemy=false → figure faces RIGHT (defender toward incoming enemies)
     enemy=true  → figure faces LEFT  (enemy marching toward gate)          */
  function glyph(ctx, role, color, enemy) {
    ctx.save();
    if (enemy) ctx.scale(-1, 1); // mirror: face left
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Head (all roles)
    ctx.beginPath(); ctx.arc(0, -12, 5, 0, TAU); ctx.fill();

    switch (role) {
      case 'spear': {
        // Torso
        ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 6); ctx.stroke();
        // Back arm (left)
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(-6, 2); ctx.stroke();
        // Forward arm gripping spear
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(7, -7); ctx.stroke();
        // Spear shaft (long diagonal)
        ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-4, 15); ctx.lineTo(13, -15); ctx.stroke();
        // Spear tip
        ctx.beginPath(); ctx.moveTo(13, -15); ctx.lineTo(9, -11); ctx.lineTo(17, -13); ctx.closePath(); ctx.fill();
        // Legs
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-4, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(4, 18); ctx.stroke();
        break;
      }
      case 'sword': {
        // Torso
        ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 6); ctx.stroke();
        // Shield on back arm (to the left of the body)
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(-8, 0); ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(-15, -5, 8, 13, 2);
        ctx.fill();
        // Sword arm (raised right)
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(8, -10); ctx.stroke();
        // Sword blade
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(8, -10); ctx.lineTo(18, -20); ctx.stroke();
        // Crossguard
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(12, -13); ctx.stroke();
        // Legs
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-4, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(4, 18); ctx.stroke();
        break;
      }
      case 'archer': {
        // Torso (slightly lean forward)
        ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-1, 6); ctx.stroke();
        // Bow (arc to the right)
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(10, -3, 12, Math.PI * 0.68, Math.PI * 1.32); ctx.stroke();
        // Bowstring
        const bx1 = 10 + 12 * Math.cos(Math.PI * 0.68), by1 = -3 + 12 * Math.sin(Math.PI * 0.68);
        const bx2 = 10 + 12 * Math.cos(Math.PI * 1.32), by2 = -3 + 12 * Math.sin(Math.PI * 1.32);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(-3, -3); ctx.lineTo(bx2, by2); ctx.stroke();
        // Arrow
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(7, -3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, -3); ctx.lineTo(4, -6); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
        // Arms
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(7, -7); ctx.stroke(); // upper arm to bow
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3, -3); ctx.stroke(); // drawing arm
        // Legs
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-1, 6); ctx.lineTo(-4, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-1, 6); ctx.lineTo(3, 18); ctx.stroke();
        break;
      }
      case 'mage': {
        // Wide robe body
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 8); ctx.stroke();
        ctx.lineWidth = 1.5;
        // Robe hem
        ctx.beginPath(); ctx.moveTo(-7, 8); ctx.lineTo(-5, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, 8); ctx.lineTo(5, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, 8); ctx.lineTo(7, 8); ctx.stroke();
        // Staff (held on the left)
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9, 16); ctx.lineTo(-7, -16); ctx.stroke();
        // Orb on staff
        ctx.beginPath(); ctx.arc(-7, -18, 4.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(-7, -18, 8, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        // Arm holding staff
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(-8, -3); ctx.stroke();
        // Right arm (casting)
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(10, -7); ctx.stroke();
        // Magic sparks from fingertips
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(10, -7); ctx.lineTo(15, -4);
        ctx.moveTo(11, -9); ctx.lineTo(17, -7);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
  BF.drawGlyph = glyph;

  function hexPath(ctx, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k * TAU) / 6;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function token(ctx, x, y, r, f, role, enemy, hit) {
    ctx.save();
    ctx.translate(x, y);
    // Shadow below unit
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.88, r * 0.85, r * 0.28, 0, 0, TAU); ctx.fill();
    // Token shape: circle for defenders, hexagon for enemies
    if (enemy) hexPath(ctx, r); else { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); }
    const g = ctx.createRadialGradient(0, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#2d3342'); g.addColorStop(1, '#141821');
    ctx.fillStyle = g; ctx.fill();
    if (enemy) { ctx.fillStyle = 'rgba(190,40,40,.18)'; ctx.fill(); }
    ctx.lineWidth = Math.max(2, r * 0.15);
    ctx.strokeStyle = f.color; ctx.stroke();
    // Person figure scaled to fit the token
    ctx.scale(r / 20, r / 20);
    const base = role === 'champion' || role === 'warlord' ? 'sword' : role;
    glyph(ctx, base, enemy ? '#f2dccf' : f.accent, enemy);
    // Champion crown / warlord horns (drawn above head)
    if (role === 'champion' || role === 'warlord') {
      ctx.fillStyle = '#e8c566';
      ctx.beginPath();
      if (role === 'champion') {
        // Crown above head (y ≈ -17)
        ctx.moveTo(-8, -17); ctx.lineTo(-8, -21); ctx.lineTo(-4, -18);
        ctx.lineTo(0, -23); ctx.lineTo(4, -18); ctx.lineTo(8, -21); ctx.lineTo(8, -17);
      } else {
        // Warlord horns (wider, more dramatic)
        ctx.moveTo(-12, -17); ctx.lineTo(-18, -28); ctx.lineTo(-8, -21);
        ctx.lineTo(8, -21); ctx.lineTo(18, -28); ctx.lineTo(12, -17);
      }
      ctx.closePath(); ctx.fill();
    }
    // Hit flash
    if (hit > 0) {
      ctx.globalAlpha = Math.min(0.65, hit * 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  BF.drawToken = token;

  function bar(ctx, x, y, w, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, Math.max(0, w * frac), 4);
  }

  // ---- the whole battlefield ----
  BF.renderBattle = function (ctx, b, ui, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, G.cw, G.ch);
    const me = b.faction, foe = b.owner;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, G.cw, 0);
    bg.addColorStop(0, '#10141e'); bg.addColorStop(1, '#171a22');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, G.cw, G.ch);

    // Alternating lane shading (horizontal rows)
    for (let r = 0; r < G.rows; r++) {
      if (r % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(0, r * G.cell, G.cw, G.cell); }
    }
    // Vertical column dividers
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let c = 1; c < G.cols; c++) {
      ctx.beginPath(); ctx.moveTo(c * G.cell, 0); ctx.lineTo(c * G.cell, G.h); ctx.stroke();
    }
    // Enemy-spawn glow on the RIGHT side
    const eg = ctx.createLinearGradient(G.cw, 0, G.cw - 88, 0);
    eg.addColorStop(0, hexA(foe.color, 0.28)); eg.addColorStop(1, hexA(foe.color, 0));
    ctx.fillStyle = eg; ctx.fillRect(G.cw - 88, 0, 88, G.h);

    // Range band of an inspected unit (extends to the RIGHT)
    if (ui.inspect && !ui.inspect.dead) {
      const d = ui.inspect;
      ctx.fillStyle = 'rgba(232,197,102,.09)';
      ctx.fillRect(d.x + 3, d.row * G.cell + 3, d.range, G.cell - 6);
      ctx.strokeStyle = 'rgba(232,197,102,.45)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x + 3, d.row * G.cell + 3, d.range, G.cell - 6);
    }

    // Placement / sell hints
    if (ui.selected || ui.sell) {
      for (let c = 0; c < G.cols; c++) {
        for (let r = 0; r < G.rows; r++) {
          const d = b.grid[c][r];
          const cx = c * G.cell + G.cell / 2, cy = r * G.cell + G.cell / 2;
          if (ui.sell) {
            if (d) { ctx.strokeStyle = 'rgba(255,107,94,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 27, 0, TAU); ctx.stroke(); }
          } else if (!d) {
            ctx.fillStyle = 'rgba(232,197,102,.35)';
            ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, TAU); ctx.fill();
          }
        }
      }
    }

    // Defenders (lunge RIGHT toward incoming enemies when attacking)
    for (const d of b.defenders) {
      const lunge = d.atk > 0 && !d.ranged ? 5 * (d.atk / 0.18) : 0;
      token(ctx, d.x + lunge, d.y, 22, me, d.type, false, d.hit);
      if (d.hp < d.maxHp - 0.5) bar(ctx, d.x, d.y - 31, 34, d.hp / d.maxHp, '#7fcf86');
    }

    // Enemies (sorted rightmost first so most-advanced appear on top)
    const foes = b.enemies.slice().sort((a, c) => c.x - a.x);
    for (const e of foes) {
      const r = 18 * e.size;
      // Enemies lunge LEFT (toward defenders) when attacking
      const lunge = e.atk > 0 && !e.ranged ? -5 * (e.atk / 0.18) : 0;
      token(ctx, e.x + lunge, e.y, r, foe, e.role, true, e.hit);
      if (e.hp < e.maxHp - 0.5) bar(ctx, e.x, e.y - r - 9, 32 * Math.min(1.4, e.size), e.hp / e.maxHp, '#e0605a');
    }

    // Projectiles
    for (const s of b.shots) {
      const k = Math.min(1, s.t / s.dur);
      const x = s.x1 + (s.x2 - s.x1) * k, y = s.y1 + (s.y2 - s.y1) * k;
      ctx.fillStyle = s.color; ctx.strokeStyle = s.color;
      if (s.kind === 'orb') {
        ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      } else {
        const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    for (const rg of b.rings) {
      const k = rg.t / rg.dur;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.strokeStyle = rg.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r * (0.4 + 0.6 * k), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // LEFT GATE WALL (what enemies are trying to reach)
    const f = b.baseHp / b.baseMax;
    const wallW = 14;
    ctx.fillStyle = '#242a36'; ctx.fillRect(0, 0, wallW, G.h);
    // Battlement crenellations along the left edge
    for (let gy = 4; gy < G.h - 10; gy += 22) ctx.fillRect(0, gy, wallW - 3, 14);
    // Gate HP bar (vertical, just right of the wall)
    const gc = f > 0.5 ? '#7fcf86' : f > 0.25 ? '#e8c566' : '#e0605a';
    const barH = G.h - 24;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(wallW + 2, 12, 5, barH);
    ctx.fillStyle = gc; ctx.fillRect(wallW + 2, 12 + barH * (1 - f), 5, barH * f);
    // Gate flash when an enemy leaks through
    if (ui.gateFlash > 0) {
      ctx.fillStyle = 'rgba(224,96,90,' + Math.min(0.38, ui.gateFlash) + ')';
      ctx.fillRect(0, 0, wallW + 30, G.h);
    }

    // Bottom strip (below grid – decorative terrain border)
    ctx.fillStyle = '#10131a'; ctx.fillRect(0, G.h, G.cw, G.ch - G.h);
    ctx.fillStyle = '#1c2030';
    for (let x = 0; x < G.cw; x += 22) ctx.fillRect(x + 2, G.h, 14, 6);

    // Floating damage / gold numbers
    ctx.textAlign = 'center';
    ctx.font = '700 13px "Avenir Next","Segoe UI",system-ui,sans-serif';
    for (const t of b.floats) {
      const k = t.t / t.dur;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(t.text, t.x + 1, t.y - k * 26 + 1);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y - k * 26);
      ctx.globalAlpha = 1;
    }

    // Wave banner
    if (ui.banner && ui.banner.t > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, ui.banner.t / 0.6));
      ctx.fillStyle = 'rgba(10,12,18,.62)'; ctx.fillRect(0, G.h / 2 - 28, G.cw, 56);
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
