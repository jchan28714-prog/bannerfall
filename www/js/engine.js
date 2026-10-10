/* ==========================================================================
   BANNERFALL - battle engine
   Pure game logic: no drawing, no DOM. That is what lets tools/balance-check.js
   play thousands of battles in Node to test the balance.

   Board: 5 columns x 6 rows. Enemies march DOWN a column and stop to fight the
   first defender in their way. Anything that reaches the bottom damages your gate.
   ========================================================================== */
(function () {
  'use strict';
  const BF = (globalThis.BF = globalThis.BF || {});
  const G = BF.GRID;

  // Small seeded random generator (same seed = same battle, handy for testing)
  BF.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  BF.ENEMY_RANGED_STOP = 70; // how far from your front line enemy archers and mages stand

  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  BF.Battle = class Battle {
    constructor(opts) {
      this.faction = BF.factionById(opts.factionId);
      this.terr = opts.territory;
      this.owner = BF.factionById(this.terr.owner);
      this.up = Object.assign({ treasury: 0, barracks: 0, walls: 0 }, opts.upgrades || {});
      this.rand = BF.rng(opts.seed != null ? opts.seed : (Math.random() * 2147483647) | 0);
      this.fx = opts.fx !== false; // set false for fast headless tests

      const m = this.faction.mods;
      this.gold = BF.ECON.startGold + 40 * this.up.treasury;
      this.tribute = opts.tribute || 0; // territories already conquered
      this.income = BF.ECON.baseIncome * m.income * (1 + 0.04 * this.up.treasury) * (1 + BF.ECON.tribute * this.tribute);
      this.baseMax = Math.round((BF.ECON.baseHp + 15 * this.up.walls) * m.baseHp);
      this.baseHp = this.baseMax;
      this.defMult = 1 + 0.06 * this.up.barracks;

      this.time = 0;
      this.defenders = [];
      this.enemies = [];
      this.shots = [];
      this.floats = [];
      this.rings = [];
      this.grid = Array.from({ length: G.cols }, () => Array(G.rows).fill(null));
      this.schedule = this._buildSchedule();
      this.next = 0;
      this.over = null; // null | 'win' | 'lose'
      this.stars = 0;
      this.kills = 0;
      this.leaked = 0;
      this.nid = 1;
      this.events = []; // short strings for the UI to play sounds from ('hit', 'coin', ...)
    }

    // ---------- enemy wave plan ----------
    _pickRole(w) {
      const i = this.terr.index;
      const wt = {
        spear: Math.max(0.35, 1 - 0.06 * w),
        sword: 0.45 + 0.12 * w + 0.04 * i,
        archer: w >= 1 || i >= 1 ? 0.2 + 0.06 * w + 0.05 * i : 0,
        mage: i >= 2 && w >= 2 ? 0.1 + 0.03 * w + 0.03 * i : 0,
      };
      let total = 0;
      for (const k in wt) total += wt[k];
      let r = this.rand() * total;
      for (const k in wt) {
        r -= wt[k];
        if (r <= 0) return k;
      }
      return 'spear';
    }

    _buildSchedule() {
      const T = this.terr, i = T.index, r = this.rand, out = [];
      let t = 5;
      for (let w = 0; w < T.waves; w++) {
        const n = Math.round((2 + 1.3 * w) * T.countScale);
        const gap = Math.max(0.8, 2.4 - 0.07 * w - 0.05 * i);
        const focus = [Math.floor(r() * G.cols), Math.floor(r() * G.cols)];
        for (let k = 0; k < n; k++) {
          const col = r() < 0.6 ? focus[r() < 0.5 ? 0 : 1] : Math.floor(r() * G.cols);
          out.push({ t, col, role: this._pickRole(w), wave: w });
          t += gap * (0.7 + 0.6 * r());
        }
        if (w === T.waves - 1) {
          const champs = T.final ? 2 : i >= 1 ? 1 + Math.floor(i / 3) : 0;
          for (let c = 0; c < champs; c++) {
            out.push({ t: t + 1 + c * 2.5, col: Math.floor(r() * G.cols), role: 'champion', wave: w });
          }
          if (T.final) out.push({ t: t + 4, col: 2, role: 'warlord', wave: w });
        }
        t += 7;
      }
      return out.sort((a, b) => a.t - b.t);
    }

    waveNow() {
      if (this.next === 0) return 0;
      return this.schedule[this.next - 1].wave + 1;
    }

    _spawn(s) {
      const T = this.terr;
      const big = s.role === 'champion' || s.role === 'warlord';
      const roleKey = big ? 'sword' : s.role;
      const u = this.owner.units[roleKey];
      // Normalise so every legion's enemies have the same raw strength as Men's at the same
      // territory. Difficulty then depends only on how far you have pushed, while each legion
      // keeps its own shape (tanky orcs, fragile goblins, ...).
      const core = (x) => Math.sqrt(x.dmg * x.rate * (x.aoe ? 1.5 : 1) * x.hp);
      const norm = core(BF.factionById('men').units[roleKey]) / core(u);
      const menCost = BF.factionById('men').units[roleKey].cost;
      const e = {
        id: this.nid++, side: 'enemy', role: s.role, col: s.col,
        x: s.col * G.cell + G.cell / 2, y: -20, cd: 0.5, hit: 0, atk: 0, dead: false,
        aoe: 0, size: 1,
      };
      if (s.role === 'champion') {
        Object.assign(e, { hp: u.hp * norm * 3.5 * T.hpScale, dmg: u.dmg * norm * 1.7 * T.dmgScale, rate: u.rate * 0.8, range: 46, speed: 15, leak: 18, bounty: Math.round(menCost * 0.5), size: 1.35 });
      } else if (s.role === 'warlord') {
        Object.assign(e, { hp: u.hp * norm * 10 * T.hpScale, dmg: u.dmg * norm * 2.2 * T.dmgScale, rate: u.rate * 0.8, range: 48, speed: 12, leak: 40, bounty: 300, size: 1.7 });
      } else {
        const melee = s.role === 'spear' || s.role === 'sword';
        Object.assign(e, {
          hp: u.hp * norm * T.hpScale, dmg: u.dmg * norm * T.dmgScale, rate: u.rate,
          range: melee ? 40 : BF.ENEMY_RANGED_STOP, // ranged enemies close in so they can be answered
           speed: BF.ROLE[s.role].speed, leak: BF.ROLE[s.role].leak,
          bounty: Math.round(menCost * BF.ECON.bountyRate), aoe: u.aoe || 0,
        });
      }
      e.maxHp = e.hp;
      e.ranged = e.range > 90;
      this.enemies.push(e);
    }

    // ---------- player actions ----------
    canPlace(col, row) {
      return col >= 0 && col < G.cols && row >= 0 && row < G.rows && !this.grid[col][row];
    }

    place(type, col, row) {
      const u = this.faction.units[type];
      if (!u) return { ok: false, reason: 'unknown' };
      if (!this.canPlace(col, row)) return { ok: false, reason: 'blocked' };
      if (this.gold < u.cost) return { ok: false, reason: 'gold' };
      this.gold -= u.cost;
      const m = this.defMult;
      const d = {
        id: this.nid++, side: 'def', type, col, row,
        x: col * G.cell + G.cell / 2, y: row * G.cell + G.cell / 2,
        hp: u.hp * m, maxHp: u.hp * m, dmg: u.dmg * m, rate: u.rate, range: u.range,
        aoe: u.aoe || 0, ranged: u.range > 120, cost: u.cost, cd: 0.3, hit: 0, atk: 0, dead: false,
      };
      this.grid[col][row] = d;
      this.defenders.push(d);
      this.events.push('place');
      return { ok: true, unit: d };
    }

    sell(col, row) {
      const d = this.grid[col] && this.grid[col][row];
      if (!d) return false;
      this.gold += Math.round(d.cost * BF.ECON.sellRefund);
      this._killDef(d);
      this.events.push('sell');
      return true;
    }

    // ---------- combat helpers ----------
    _float(x, y, text, color) {
      if (this.fx) this.floats.push({ x, y, text, color, t: 0, dur: 1.1 });
    }
    _shot(x1, y1, x2, y2, kind, color, dur) {
      if (this.fx) this.shots.push({ x1, y1, x2, y2, kind, color, t: 0, dur });
    }
    _ring(x, y, r, color) {
      if (this.fx) this.rings.push({ x, y, r, color, t: 0, dur: 0.35 });
    }

    _killDef(d) {
      d.dead = true;
      if (this.grid[d.col][d.row] === d) this.grid[d.col][d.row] = null;
    }

    _hurtEnemy(e, dmg) {
      if (e.dead) return;
      e.hp -= dmg;
      e.hit = 0.12;
      if (e.hp <= 0) {
        e.dead = true;
        this.kills++;
        const g = Math.round(e.bounty * this.faction.mods.bounty);
        this.gold += g;
        this._float(e.x, Math.max(10, e.y - 16), '+' + g, '#e8c566');
        this.events.push('coin');
      }
    }

    _hurtDef(d, dmg) {
      if (d.dead) return;
      d.hp -= dmg * (1 - this.faction.mods.armor);
      d.hit = 0.12;
      if (d.hp <= 0) this._killDef(d);
    }

    _defAttack(d, tgt) {
      d.atk = 0.18;
      if (d.ranged) {
        this._shot(d.x, d.y - 10, tgt.x, tgt.y, d.aoe ? 'orb' : 'arrow', d.aoe ? '#c9a6ff' : '#e8dcc0', 0.16);
      }
      if (d.aoe) {
        this._ring(tgt.x, tgt.y, d.aoe, '#c9a6ff');
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dd = dist(e.x, e.y, tgt.x, tgt.y);
          if (dd <= d.aoe) this._hurtEnemy(e, e === tgt ? d.dmg : d.dmg * 0.6);
        }
      } else {
        this._hurtEnemy(tgt, d.dmg);
      }
    }

    _enemyAttack(e, tgt) {
      e.atk = 0.18;
      if (e.ranged) this._shot(e.x, e.y + 8, tgt.x, tgt.y, e.aoe ? 'orb' : 'arrow', e.aoe ? '#ff9a7a' : '#d9b8a8', 0.16);
      if (e.aoe) {
        this._ring(tgt.x, tgt.y, e.aoe, '#ff9a7a');
        for (const d of this.defenders) {
          if (d.dead) continue;
          if (dist(d.x, d.y, tgt.x, tgt.y) <= e.aoe) this._hurtDef(d, d === tgt ? e.dmg : e.dmg * 0.6);
        }
      } else {
        this._hurtDef(tgt, e.dmg);
      }
    }

    // ---------- main tick ----------
    step(dt) {
      if (this.over) return;
      const mods = this.faction.mods;
      this.time += dt;
      this.gold += this.income * dt;

      while (this.next < this.schedule.length && this.schedule[this.next].t <= this.time) {
        this._spawn(this.schedule[this.next++]);
      }

      // Defenders: pick the nearest enemy in their column that is in range
      for (const d of this.defenders) {
        if (d.dead) continue;
        const regen = Math.max(1, mods.regen); // everyone mends slowly, elves faster
        if (d.hp < d.maxHp) d.hp = Math.min(d.maxHp, d.hp + regen * dt);
        d.cd -= dt;
        d.hit = Math.max(0, d.hit - dt);
        d.atk = Math.max(0, d.atk - dt);
        if (d.cd > 0) continue;
        let tgt = null, best = -1e9;
        for (const e of this.enemies) {
          if (e.dead || e.col !== d.col) continue;
          const gap = d.y - e.y;
          if (gap > -6 && gap <= d.range && e.y > best) { best = e.y; tgt = e; }
        }
        if (tgt) {
          const wild = mods.berserk && !d.ranged && d.hp < d.maxHp * 0.5;
          d.cd = 1 / (d.rate * (wild ? 1.25 : 1));
          this._defAttack(d, tgt);
        }
      }

      // Enemies: fight the first defender ahead, otherwise keep marching
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.cd -= dt;
        e.hit = Math.max(0, e.hit - dt);
        e.atk = Math.max(0, e.atk - dt);
        let tgt = null, best = 1e9;
        for (const d of this.defenders) {
          if (d.dead || d.col !== e.col) continue;
          const gap = d.y - e.y;
          if (gap > -20 && gap < best) { best = gap; tgt = d; }
        }
        if (tgt && best <= e.range) {
          if (e.cd <= 0) { e.cd = 1 / e.rate; this._enemyAttack(e, tgt); }
        } else {
          // Enemies queue single-file: they cannot walk through the one ahead of them
          let blocked = false;
          for (const o of this.enemies) {
            if (o === e || o.dead || o.col !== e.col) continue;
            const g = o.y - e.y;
            if ((g > 0 || (g === 0 && o.id < e.id)) && g < 26 + 8 * Math.max(e.size, o.size)) { blocked = true; break; }
          }
          if (!blocked) e.y += e.speed * dt;
          if (e.y >= G.h + 6) {
            e.dead = true;
            this.leaked++;
            this.baseHp -= e.leak;
            this._float(e.x, G.h - 6, '-' + e.leak, '#ff6b5e');
            this.events.push('leak');
          }
        }
      }

      this.enemies = this.enemies.filter((e) => !e.dead);
      this.defenders = this.defenders.filter((d) => !d.dead);

      if (this.fx) {
        for (const list of [this.shots, this.floats, this.rings]) {
          for (const o of list) o.t += dt;
        }
        this.shots = this.shots.filter((o) => o.t < o.dur);
        this.floats = this.floats.filter((o) => o.t < o.dur);
        this.rings = this.rings.filter((o) => o.t < o.dur);
      }

      if (this.baseHp <= 0) {
        this.baseHp = 0;
        this.over = 'lose';
        this.events.push('lose');
      } else if (this.next >= this.schedule.length && this.enemies.length === 0) {
        const f = this.baseHp / this.baseMax;
        this.stars = f >= 0.8 ? 3 : f >= 0.4 ? 2 : 1;
        this.over = 'win';
        this.events.push('win');
      }
    }
  };

  if (typeof module !== 'undefined') module.exports = BF;
})();
