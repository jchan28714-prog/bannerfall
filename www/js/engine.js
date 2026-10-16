/* ==========================================================================
   BANNERFALL - battle engine
   Pure game logic: no drawing, no DOM.

   Board: 6 lanes. Enemies march from the RIGHT, defenders from the LEFT.
   Player spawns defenders by clicking a lane; they march right until they
   engage an enemy.  Kill-only income; no passive drip.
   ========================================================================== */
(function () {
  'use strict';
  const BF = (globalThis.BF = globalThis.BF || {});
  const G = BF.GRID;

  // ---------- Object pool – reuse enemy objects to avoid GC spikes on large waves ----------
  BF.Pool = class Pool {
    constructor(prealloc) {
      this._free = [];
      for (let i = 0; i < (prealloc || 24); i++) this._free.push({});
    }
    get()          { return this._free.length ? this._free.pop() : {}; }
    release(obj)   { this._free.push(obj); }
  };

  BF.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  BF.ENEMY_RANGED_STOP = 70; // px from a defender where ranged enemies stop to shoot

  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  BF.Battle = class Battle {
    constructor(opts) {
      this.faction = BF.factionById(opts.factionId);
      this.terr = opts.territory;
      this.owner = BF.factionById(this.terr.owner);
      this.up = Object.assign({ treasury: 0, barracks: 0, walls: 0 }, opts.upgrades || {});
      this.rand = BF.rng(opts.seed != null ? opts.seed : (Math.random() * 2147483647) | 0);
      this.fx = opts.fx !== false;

      const m = this.faction.mods;
      this.gold = BF.ECON.startGold + 40 * this.up.treasury
        + Math.round(BF.ECON.startGold * BF.ECON.tribute * (opts.tribute || 0));
      this.tribute = opts.tribute || 0;
      this.bountyMult = m.bounty * (1 + 0.08 * this.up.treasury);
      this.baseMax = Math.round((BF.ECON.baseHp + 15 * this.up.walls) * m.baseHp);
      this.baseHp = this.baseMax;
      this.defMult = 1 + 0.06 * this.up.barracks;

      this.enemyPool = new BF.Pool(32); // pre-warm enough for the largest waves

      this.time = 0;
      this.defenders = [];
      this.enemies = [];
      this.shots = [];
      this.floats = [];
      this.rings = [];
      this.schedule = this._buildSchedule();
      this.next = 0;
      this.over = null;
      this.stars = 0;
      this.kills = 0;
      this.leaked = 0;
      this.nid = 1;
      this.events = [];
      this.abilityCd = 0;   // seconds until ability can be used again
      this.abilityBuff = 0; // seconds remaining for the active timed buff
    }

    // ---------- enemy wave plan ----------
    _pickRole(w) {
      const i = this.terr.index;
      // Use curated wave-design mix for early-difficulty territories
      if (i <= 1 && w < BF.WAVE_DESIGN.length) {
        const mix = BF.WAVE_DESIGN[w].mix;
        let total = 0;
        for (const k in mix) total += mix[k];
        let r = this.rand() * total;
        for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
        return 'spear';
      }
      const wt = {
        spear: Math.max(0.35, 1 - 0.06 * w),
        sword: 0.45 + 0.12 * w + 0.04 * i,
        archer: w >= 1 || i >= 1 ? 0.2 + 0.06 * w + 0.05 * i : 0,
        mage: i >= 2 && w >= 2 ? 0.1 + 0.03 * w + 0.03 * i : 0,
      };
      let total = 0; for (const k in wt) total += wt[k];
      let r = this.rand() * total;
      for (const k in wt) { r -= wt[k]; if (r <= 0) return k; }
      return 'spear';
    }

    _buildSchedule() {
      const T = this.terr, i = T.index, r = this.rand, out = [];
      let t = 5;
      for (let w = 0; w < T.waves; w++) {
        const wd = (i <= 1 && BF.WAVE_DESIGN[w]) ? BF.WAVE_DESIGN[w] : null;
        const n = wd
          ? Math.round(wd.count * T.countScale)
          : Math.round((2 + 1.3 * w) * T.countScale);
        const gap = Math.max(0.8, 2.4 - 0.07 * w - 0.05 * i);
        const focus = [Math.floor(r() * G.rows), Math.floor(r() * G.rows)];
        for (let k = 0; k < n; k++) {
          const row = r() < 0.6 ? focus[r() < 0.5 ? 0 : 1] : Math.floor(r() * G.rows);
          out.push({ t, row, role: this._pickRole(w), wave: w });
          t += gap * (0.7 + 0.6 * r());
        }
        if (w === T.waves - 1) {
          const champs = T.final ? 2 : i >= 1 ? 1 + Math.floor(i / 3) : 0;
          for (let c = 0; c < champs; c++) {
            out.push({ t: t + 1 + c * 2.5, row: Math.floor(r() * G.rows), role: 'champion', wave: w });
          }
          if (T.final) out.push({ t: t + 4, row: Math.floor(G.rows / 2), role: 'warlord', wave: w });
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
      const core = (x) => Math.sqrt(x.dmg * x.rate * (x.aoe ? 1.5 : 1) * x.hp);
      const norm = core(BF.factionById('men').units[roleKey]) / core(u);
      const menCost = BF.factionById('men').units[roleKey].cost;

      const e = this.enemyPool.get();
      e.id = this.nid++; e.side = 'enemy'; e.role = s.role; e.row = s.row;
      e.x = G.cw + 20;
      e.y = s.row * G.cell + G.cell / 2;
      e.cd = 0.5; e.hit = 0; e.atk = 0; e.dead = false; e.aoe = 0; e.size = 1;
      if (s.role === 'champion') {
        Object.assign(e, { hp: u.hp * norm * 3.5 * T.hpScale, dmg: u.dmg * norm * 1.7 * T.dmgScale, rate: u.rate * 0.8, range: 46, speed: 15, leak: 18, bounty: Math.round(menCost * 0.5), size: 1.35 });
      } else if (s.role === 'warlord') {
        Object.assign(e, { hp: u.hp * norm * 10 * T.hpScale, dmg: u.dmg * norm * 2.2 * T.dmgScale, rate: u.rate * 0.8, range: 48, speed: 12, leak: 40, bounty: 300, size: 1.7 });
      } else {
        const melee = s.role === 'spear' || s.role === 'sword';
        Object.assign(e, {
          hp: u.hp * norm * T.hpScale, dmg: u.dmg * norm * T.dmgScale, rate: u.rate,
          range: melee ? 40 : BF.ENEMY_RANGED_STOP,
          speed: BF.ROLE[s.role].speed, leak: BF.ROLE[s.role].leak,
          bounty: Math.round(menCost * BF.ECON.bountyRate), aoe: u.aoe || 0,
        });
      }
      e.maxHp = e.hp;
      e.ranged = e.range > 90;
      this.enemies.push(e);
    }

    // ---------- player action: spawn a unit in a lane ----------
    spawn(type, row) {
      const u = this.faction.units[type];
      if (!u) return { ok: false, reason: 'unknown' };
      if (row < 0 || row >= G.rows) return { ok: false, reason: 'invalid' };
      if (this.gold < u.cost) return { ok: false, reason: 'gold' };
      this.gold -= u.cost;
      const m = this.defMult;
      // March speed: faster for lighter units, slower for heavy
      const spd = BF.MARCH_SPD + (type === 'archer' ? 2 : type === 'mage' ? -3 : type === 'sword' ? -1 : 0);
      const d = {
        id: this.nid++, side: 'def', type, row,
        x: BF.SPAWN_X, y: row * G.cell + G.cell / 2,
        marchSpeed: spd,
        hp: u.hp * m, maxHp: u.hp * m, dmg: u.dmg * m, rate: u.rate, range: u.range,
        aoe: u.aoe || 0, ranged: u.range > 120, cost: u.cost, cd: 0.35, hit: 0, atk: 0, dead: false,
        touchCd: 0, shielded: false, shieldDur: 0, rallied: false, rallyDur: 0,
      };
      this.defenders.push(d);
      this.events.push('place');
      return { ok: true, unit: d };
    }

    // ---------- sell a defender for 80% refund ----------
    sellUnit(id) {
      const idx = this.defenders.findIndex((d) => d.id === id && !d.dead);
      if (idx < 0) return false;
      const d = this.defenders[idx];
      const refund = Math.round(d.cost * BF.ECON.sellRefund);
      this.gold += refund;
      this._float(d.x, d.y - 14, '+' + refund, '#e8c566');
      this.defenders.splice(idx, 1);
      return true;
    }

    // ---------- faction ability (30-second cooldown) ----------
    _spawnFreeUnit(type, row) {
      const u = this.faction.units[type];
      const spd = BF.MARCH_SPD + (type === 'archer' ? 2 : type === 'mage' ? -3 : type === 'sword' ? -1 : 0);
      this.defenders.push({
        id: this.nid++, side: 'def', type, row,
        x: BF.SPAWN_X, y: row * G.cell + G.cell / 2,
        marchSpeed: spd,
        hp: u.hp * this.defMult, maxHp: u.hp * this.defMult,
        dmg: u.dmg * this.defMult, rate: u.rate, range: u.range,
        aoe: u.aoe || 0, ranged: u.range > 120, cost: u.cost,
        cd: 0.35, hit: 0, atk: 0, dead: false,
        touchCd: 0, shielded: false, shieldDur: 0, rallied: false, rallyDur: 0,
      });
    }

    useAbility() {
      if (this.abilityCd > 0 || this.over) return false;
      const ab = BF.ABILITIES[this.faction.id];
      if (!ab) return false;
      this.abilityCd = ab.cooldown;
      const fid = this.faction.id;

      if (fid === 'men') {
        const rows = new Set(this.defenders.filter((d) => !d.dead).map((d) => d.row));
        if (rows.size === 0) { for (let r = 0; r < 3; r++) rows.add(r); }
        for (const row of rows) this._spawnFreeUnit('sword', row);
      } else if (fid === 'elves') {
        for (const d of this.defenders) {
          if (d.dead || d.type !== 'archer') continue;
          let tgt = null, best = 1e9;
          for (const e of this.enemies) {
            if (e.dead || e.row !== d.row) continue;
            const gap = e.x - d.x;
            if (gap > -6 && gap <= d.range && gap < best) { best = gap; tgt = e; }
          }
          if (!tgt) continue;
          for (let i = 0; i < 3; i++) {
            this._shot(d.x + 10, d.y, tgt.x, tgt.y, 'arrow', '#c8e8a0', 0.08 + i * 0.06);
            if (!tgt.dead) this._hurtEnemy(tgt, d.dmg * 1.3);
          }
        }
      } else if (fid === 'orcs') {
        this.abilityBuff = 8;
        for (const d of this.defenders) { if (!d.dead) d.frenzied = true; }
      } else if (fid === 'goblins') {
        const rows = new Set(this.enemies.filter((e) => !e.dead).map((e) => e.row));
        if (rows.size === 0) { for (let r = 0; r < 2; r++) rows.add(r); }
        for (const row of rows) this._spawnFreeUnit('spear', row);
      } else if (fid === 'dwarves') {
        this.abilityBuff = 8;
        for (const d of this.defenders) { if (!d.dead) d.ironclad = true; }
      }

      this.events.push('ability');
      return true;
    }

    // Find the defender closest to a canvas point (for inspect)
    unitNear(x, y) {
      let best = null, bestDist = 32;
      for (const d of this.defenders) {
        if (d.dead) continue;
        const dst = Math.hypot(x - d.x, y - d.y);
        if (dst < bestDist) { bestDist = dst; best = d; }
      }
      return best;
    }

    // ---------- combat helpers ----------
    _float(x, y, text, color) { if (this.fx) this.floats.push({ x, y, text, color, t: 0, dur: 1.1 }); }
    _shot(x1, y1, x2, y2, kind, color, dur) { if (this.fx) this.shots.push({ x1, y1, x2, y2, kind, color, t: 0, dur }); }
    _ring(x, y, r, color) { if (this.fx) this.rings.push({ x, y, r, color, t: 0, dur: 0.35 }); }

    _killDef(d) { d.dead = true; }

    _hurtEnemy(e, dmg) {
      if (e.dead) return;
      e.hp -= dmg;
      e.hit = 0.12;
      if (e.hp <= 0) {
        e.dead = true;
        this.kills++;
        const g = Math.round(e.bounty * this.bountyMult);
        this.gold += g;
        this._float(e.x, Math.max(10, e.y - 16), '+' + g, '#e8c566');
        this.events.push('coin');
      }
    }

    _hurtDef(d, dmg) {
      if (d.dead) return;
      const ironReduce   = d.ironclad ? 0.4 : 1;  // Ironclad: 60% less damage
      const shieldReduce = d.shielded ? 0.4 : 1;  // Shield Wall: 60% less damage
      d.hp -= dmg * (1 - this.faction.mods.armor) * ironReduce * shieldReduce;
      d.hit = 0.12;
      if (d.hp <= 0) this._killDef(d);
    }

    _defAttack(d, tgt) {
      d.atk = 0.18;
      if (d.ranged) {
        this._shot(d.x + 10, d.y, tgt.x, tgt.y, d.aoe ? 'orb' : 'arrow', d.aoe ? '#c9a6ff' : '#e8dcc0', 0.16);
      }
      const mult = BF.dmgMult(d.type, BF.baseRole(tgt.role));
      // Archers at point-blank range are ineffective (panic penalty)
      const panicMult = (d.type === 'archer' && Math.abs(tgt.x - d.x) < 35) ? 0.5 : 1;
      const dmg = d.dmg * mult * panicMult;
      if (d.aoe) {
        this._ring(tgt.x, tgt.y, d.aoe, '#c9a6ff');
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (dist(e.x, e.y, tgt.x, tgt.y) <= d.aoe) this._hurtEnemy(e, e === tgt ? dmg : d.dmg * 0.6);
        }
      } else {
        this._hurtEnemy(tgt, dmg);
      }
    }

    _enemyAttack(e, tgt) {
      e.atk = 0.18;
      if (e.ranged) {
        this._shot(e.x - 8, e.y, tgt.x, tgt.y, e.aoe ? 'orb' : 'arrow', e.aoe ? '#ff9a7a' : '#d9b8a8', 0.16);
      }
      const mult = BF.dmgMult(BF.baseRole(e.role), tgt.type);
      const dmg = e.dmg * mult;
      if (e.aoe) {
        this._ring(tgt.x, tgt.y, e.aoe, '#ff9a7a');
        for (const d of this.defenders) {
          if (d.dead) continue;
          if (dist(d.x, d.y, tgt.x, tgt.y) <= e.aoe) this._hurtDef(d, d === tgt ? dmg : e.dmg * 0.6);
        }
      } else {
        this._hurtDef(tgt, dmg);
      }
    }

    // ---------- main tick ----------
    step(dt) {
      if (this.over) return;
      const mods = this.faction.mods;
      this.time += dt;
      if (this.abilityCd > 0) this.abilityCd = Math.max(0, this.abilityCd - dt);
      if (this.abilityBuff > 0) {
        this.abilityBuff = Math.max(0, this.abilityBuff - dt);
        if (this.abilityBuff === 0) {
          for (const d of this.defenders) { d.frenzied = false; d.ironclad = false; }
        }
      }

      while (this.next < this.schedule.length && this.schedule[this.next].t <= this.time) {
        this._spawn(this.schedule[this.next++]);
      }

      // Defenders: march right toward enemies; stop and fight when in range
      for (const d of this.defenders) {
        if (d.dead) continue;
        const regen = Math.max(1, mods.regen);
        if (d.hp < d.maxHp) d.hp = Math.min(d.maxHp, d.hp + regen * dt);
        d.cd -= dt;
        d.hit = Math.max(0, d.hit - dt);
        d.atk = Math.max(0, d.atk - dt);
        if (d.touchCd > 0)  d.touchCd  = Math.max(0, d.touchCd  - dt);
        if (d.shielded) { d.shieldDur -= dt; if (d.shieldDur <= 0) { d.shielded = false; d.shieldDur = 0; } }
        if (d.rallied)  { d.rallyDur  -= dt; if (d.rallyDur  <= 0) { d.rallied  = false; d.rallyDur  = 0; } }

        // Target: nearest enemy in same lane within range (to the right of defender)
        let tgt = null, best = 1e9;
        for (const e of this.enemies) {
          if (e.dead || e.row !== d.row) continue;
          const gap = e.x - d.x; // positive = enemy is ahead (to the right)
          if (gap > -6 && gap <= d.range && e.x < best) { best = e.x; tgt = e; }
        }

        if (tgt) {
          if (d.cd <= 0) {
            const wild = (mods.berserk && !d.ranged && d.hp < d.maxHp * 0.5) || d.frenzied;
            const speedMult = (wild ? 1.75 : 1) * (d.rallied ? 1.5 : 1);
            d.cd = 1 / (d.rate * speedMult);
            this._defAttack(d, tgt);
          }
        } else {
          // Shielded spearmen hold ground; others march right
          let blocked = d.shielded;
          if (!blocked) {
            for (const o of this.defenders) {
              if (o === d || o.dead || o.row !== d.row) continue;
              const ahead = o.x - d.x;
              if (ahead > 0 && ahead < 30 + 6 * (o.size || 1)) { blocked = true; break; }
            }
          }
          if (!blocked) d.x = Math.min(G.cw - 20, d.x + d.marchSpeed * dt);
        }
      }

      // Enemies: march left; fight first defender blocking their lane
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.cd -= dt;
        e.hit = Math.max(0, e.hit - dt);
        e.atk = Math.max(0, e.atk - dt);
        let tgt = null, best = 1e9;
        for (const d of this.defenders) {
          if (d.dead || d.row !== e.row) continue;
          const gap = e.x - d.x; // positive = defender is to the left (ahead of enemy)
          if (gap > -20 && gap < best) { best = gap; tgt = d; }
        }
        if (tgt && best <= e.range) {
          if (e.cd <= 0) { e.cd = 1 / e.rate; this._enemyAttack(e, tgt); }
        } else {
          // Queue single-file
          let blocked = false;
          for (const o of this.enemies) {
            if (o === e || o.dead || o.row !== e.row) continue;
            const g = e.x - o.x;
            if ((g > 0 || (g === 0 && o.id < e.id)) && g < 26 + 8 * Math.max(e.size, o.size)) {
              blocked = true; break;
            }
          }
          if (!blocked) e.x -= e.speed * dt;
          if (e.x <= 10) {  // enemy has entered the castle gate
            e.dead = true;
            this.leaked++;
            this.baseHp -= e.leak;
            this._float(BF.CASTLE_W - 6, e.y, '-' + e.leak, '#ff6b5e');
            this.events.push('leak');
          }
        }
      }

      // Return dead enemies to the pool instead of allocating a new filtered array
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (this.enemies[i].dead) { this.enemyPool.release(this.enemies[i]); this.enemies.splice(i, 1); }
      }
      this.defenders = this.defenders.filter((d) => !d.dead);

      if (this.fx) {
        for (const list of [this.shots, this.floats, this.rings]) for (const o of list) o.t += dt;
        this.shots  = this.shots.filter((o) => o.t < o.dur);
        this.floats = this.floats.filter((o) => o.t < o.dur);
        this.rings  = this.rings.filter((o) => o.t < o.dur);
      }

      if (this.baseHp <= 0) {
        this.baseHp = 0; this.over = 'lose'; this.events.push('lose');
      } else if (this.next >= this.schedule.length && this.enemies.length === 0) {
        const f = this.baseHp / this.baseMax;
        this.stars = f >= 0.8 ? 3 : f >= 0.4 ? 2 : 1;
        this.over = 'win'; this.events.push('win');
      }
    }

    // ---------- seconds until next enemy spawns (0 when all waves are done) ----------
    waveCountdown() {
      if (this.over || this.next >= this.schedule.length) return 0;
      return Math.max(0, this.schedule[this.next].t - this.time);
    }

    // ---------- touch ability: tap a deployed unit to trigger its special ----------
    useTouchAbility(id) {
      const d = this.defenders.find((d) => d.id === id && !d.dead);
      if (!d || d.touchCd > 0 || this.over) return false;
      const ab = BF.TOUCH_ABILITIES[d.type];
      if (!ab) return false;
      d.touchCd = ab.cooldown;
      if (d.type === 'spear') {
        d.shielded = true; d.shieldDur = ab.dur;
      } else if (d.type === 'sword') {
        for (const o of this.defenders) {
          if (!o.dead && o.row === d.row) { o.rallied = true; o.rallyDur = ab.dur; }
        }
      } else if (d.type === 'archer') {
        let tgt = null, best = 1e9;
        for (const e of this.enemies) {
          if (e.dead || e.row !== d.row) continue;
          const gap = e.x - d.x;
          if (gap > -6 && gap < best) { best = gap; tgt = e; }
        }
        if (tgt) {
          for (let i = 0; i < 3; i++) {
            this._shot(d.x + 10, d.y, tgt.x, tgt.y, 'arrow', '#e8dcc0', 0.06 + i * 0.04);
            if (!tgt.dead) this._hurtEnemy(tgt, d.dmg * 1.2);
          }
        }
      } else if (d.type === 'mage') {
        for (const e of this.enemies) {
          if (!e.dead && e.row === d.row) this._hurtEnemy(e, d.dmg * 2);
        }
        this._ring(d.x + d.range / 2, d.y, d.range / 2, '#c9a6ff');
      }
      this.events.push('ability');
      return true;
    }

    // ---------- repair the gate (restores 25% max HP; cost scales with wave) ----------
    repairGate() {
      const w = this.waveNow();
      const cost = BF.WAVE_ECON.repairCost(w);
      if (this.gold < cost || this.over) return { ok: false, reason: this.gold < cost ? 'gold' : 'over' };
      this.gold -= cost;
      const heal = Math.round(this.baseMax * 0.25);
      this.baseHp = Math.min(this.baseMax, this.baseHp + heal);
      this._float(BF.CASTLE_W - 6, Math.round(G.ch * 0.5), '+' + heal, '#7fcf86');
      this.events.push('coin');
      return { ok: true };
    }

    // ---------- hire emergency mercenary into least-defended lane ----------
    hireMerc() {
      const w = this.waveNow();
      const cost = BF.WAVE_ECON.mercCost(w);
      if (this.gold < cost || this.over) return { ok: false, reason: this.gold < cost ? 'gold' : 'over' };
      this.gold -= cost;
      const rowCount = Array(G.rows).fill(0);
      for (const d of this.defenders) if (!d.dead) rowCount[d.row]++;
      const row = rowCount.indexOf(Math.min(...rowCount));
      this._spawnFreeUnit('sword', row);
      this.events.push('place');
      return { ok: true };
    }
  };

  if (typeof module !== 'undefined') module.exports = BF;
})();
