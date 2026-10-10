/* ==========================================================================
   BANNERFALL - drawing
   All art is drawn with code (canvas paths), so the app has no image files to
   load and stays tiny and fully offline. Swap in sprites here later if you like.
   ========================================================================== */
(function () {
  'use strict';
  const BF = (globalThis.BF = globalThis.BF || {});
  const G = BF.GRID;
  const TAU = Math.PI * 2;

  // ---- unit glyphs, drawn inside a 40x40 box centred on 0,0 (facing up) ----
  function glyph(ctx, role, color, flip) {
    ctx.save();
    if (flip) ctx.scale(1, -1); // enemies face down the board
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    switch (role) {
      case 'spear':
        ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-5, -6); ctx.lineTo(5, -6); ctx.closePath(); ctx.fill();
        break;
      case 'sword':
        ctx.beginPath();
        ctx.moveTo(0, -15); ctx.lineTo(3, -9); ctx.lineTo(3, 5); ctx.lineTo(-3, 5); ctx.lineTo(-3, -9);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-8, 6.5); ctx.lineTo(8, 6.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 13); ctx.stroke();
        break;
      case 'archer':
        ctx.save();
        ctx.rotate(-Math.PI / 2);                 // bow faces up
        ctx.beginPath(); ctx.arc(-6, 0, 14, -1.15, 1.15); ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-6 + 14 * Math.cos(-1.15), 14 * Math.sin(-1.15));
        ctx.lineTo(-6 + 14 * Math.cos(1.15), 14 * Math.sin(1.15));
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(13, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(10, -3.5); ctx.lineTo(10, 3.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      case 'mage':
        ctx.beginPath(); ctx.moveTo(-6, 14); ctx.lineTo(4, -6); ctx.stroke();
        ctx.beginPath(); ctx.arc(6, -10, 5, 0, TAU); ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(6, -19); ctx.lineTo(6, -16.5); ctx.moveTo(14, -10); ctx.lineTo(11.5, -10); ctx.moveTo(-2, -10); ctx.lineTo(0.5, -10); ctx.stroke();
        break;
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

  // A round shield for your units, a hexagon for the enemy
  function token(ctx, x, y, r, f, role, enemy, hit) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.88, r * 0.85, r * 0.28, 0, 0, TAU); ctx.fill();
    if (enemy) hexPath(ctx, r); else { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); }
    const g = ctx.createRadialGradient(0, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#2d3342'); g.addColorStop(1, '#141821');
    ctx.fillStyle = g; ctx.fill();
    if (enemy) { ctx.fillStyle = 'rgba(190,40,40,.16)'; ctx.fill(); }
    ctx.lineWidth = Math.max(2, r * 0.15);
    ctx.strokeStyle = f.color; ctx.stroke();
    ctx.scale(r / 20, r / 20);
    const base = role === 'champion' || role === 'warlord' ? 'sword' : role;
    glyph(ctx, base, enemy ? '#f2dccf' : f.accent, enemy);
    if (role === 'champion' || role === 'warlord') {   // crown / horns
      ctx.fillStyle = '#e8c566';
      ctx.beginPath();
      if (role === 'champion') {
        ctx.moveTo(-9, 24); ctx.lineTo(-9, 28); ctx.lineTo(-5, 25); ctx.lineTo(0, 30); ctx.lineTo(5, 25); ctx.lineTo(9, 28); ctx.lineTo(9, 24);
      } else {
        ctx.moveTo(-14, 22); ctx.lineTo(-20, 32); ctx.lineTo(-9, 25); ctx.lineTo(9, 25); ctx.lineTo(20, 32); ctx.lineTo(14, 22);
      }
      ctx.closePath(); ctx.fill();
    }
    if (hit > 0) {
      ctx.globalAlpha = Math.min(0.65, hit * 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  BF.drawToken = token;

  function bar(ctx, x, y, w, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, Math.max(0, w * frac), 4);
  }

  // ---- the whole battlefield ----
  BF.renderBattle = function (ctx, b, ui, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, G.cw, G.ch);
    const me = b.faction, foe = b.owner;

    // ground
    const bg = ctx.createLinearGradient(0, 0, 0, G.h);
    bg.addColorStop(0, '#171a22'); bg.addColorStop(1, '#10131a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, G.cw, G.ch);
    for (let c = 0; c < G.cols; c++) {
      if (c % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(c * G.cell, 0, G.cell, G.h); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let r = 1; r < G.rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * G.cell); ctx.lineTo(G.cw, r * G.cell); ctx.stroke(); }
    // enemy side glow
    const eg = ctx.createLinearGradient(0, 0, 0, 90);
    eg.addColorStop(0, hexA(foe.color, 0.28)); eg.addColorStop(1, hexA(foe.color, 0));
    ctx.fillStyle = eg; ctx.fillRect(0, 0, G.cw, 90);

    // range band of an inspected unit
    if (ui.inspect && !ui.inspect.dead) {
      const d = ui.inspect;
      ctx.fillStyle = 'rgba(232,197,102,.09)';
      ctx.fillRect(d.col * G.cell + 3, d.y - d.range, G.cell - 6, d.range + 4);
      ctx.strokeStyle = 'rgba(232,197,102,.45)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(d.col * G.cell + 3, d.y - d.range, G.cell - 6, d.range + 4);
    }

    // placement hints
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

    // defenders
    for (const d of b.defenders) {
      const lunge = d.atk > 0 && !d.ranged ? -5 * (d.atk / 0.18) : 0;
      token(ctx, d.x, d.y + lunge, 22, me, d.type, false, d.hit);
      if (d.hp < d.maxHp - 0.5) bar(ctx, d.x, d.y - 31, 34, d.hp / d.maxHp, '#7fcf86');
    }

    // enemies (drawn top to bottom so lower ones overlap)
    const foes = b.enemies.slice().sort((a, c) => a.y - c.y);
    for (const e of foes) {
      const r = 18 * e.size;
      const lunge = e.atk > 0 && !e.ranged ? 5 * (e.atk / 0.18) : 0;
      token(ctx, e.x, e.y + lunge, r, foe, e.role, true, e.hit);
      if (e.hp < e.maxHp - 0.5) bar(ctx, e.x, e.y - r - 9, 32 * Math.min(1.4, e.size), e.hp / e.maxHp, '#e0605a');
    }

    // projectiles
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

    // gate
    const f = b.baseHp / b.baseMax;
    ctx.fillStyle = '#242a36'; ctx.fillRect(0, G.h, G.cw, G.ch - G.h);
    ctx.fillStyle = '#323a49';
    for (let x = 0; x < G.cw; x += 24) ctx.fillRect(x + 2, G.h, 14, 7);
    const gc = f > 0.5 ? '#7fcf86' : f > 0.25 ? '#e8c566' : '#e0605a';
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(10, G.h + 9, G.cw - 20, 5);
    ctx.fillStyle = gc; ctx.fillRect(10, G.h + 9, (G.cw - 20) * f, 5);
    if (ui.gateFlash > 0) { ctx.fillStyle = 'rgba(224,96,90,' + Math.min(0.35, ui.gateFlash) + ')'; ctx.fillRect(0, G.h - 40, G.cw, 40 + (G.ch - G.h)); }

    // floating text
    ctx.textAlign = 'center';
    ctx.font = '700 13px "Avenir Next","Segoe UI",system-ui,sans-serif';
    for (const t of b.floats) {
      const k = t.t / t.dur;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(t.text, t.x + 1, t.y - k * 26 + 1);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y - k * 26);
      ctx.globalAlpha = 1;
    }

    // wave banner
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
