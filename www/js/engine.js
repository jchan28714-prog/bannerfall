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
      this.modeMult = opts.modeMult || 1;

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
      this.abilityCd = 30;  // 30s initial charge before first use
      this.abilityBuff = 0; // seconds remaining for the active timed buff
      this.autoRecruitCd = 30; // 30s initial charge before first use
      this.repairCd = 0;
      this.mercCd = 20;     // 20s initial charge before first use
      this.starUpg = opts.starUpg || {};
      this._starLv = (type, attr) => this.starUpg[type + ':' + attr] || 0;
      const tidx = this.terr.index || 0;
      this.enemyBaseMax = Math.round(600 + 200 * tidx);
      this.enemyBaseHp = this.enemyBaseMax;
      this._aiThresholds = [0.50, 0.25];
      this._aiFired = [false, false];
      this._goldTimer = 0;
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
      const T = this.terr, idx = T.index, r = this.rand, out = [];
      const W = T.waves;
      const waveGaps = [0, 15, 15, 20, 20, 20, 25]; // wave 1 instant, 2-3: 15s, 4-6: 20s, 7+: 25s
      const hasBoss = idx >= 2;
      const mm = this.modeMult;
      // More units in easy mode, fewer in hard
      const modeMult = mm < 1 ? 1.4 : mm > 1 ? 0.85 : 1;

      var cumT = 3;
      for (let w = 0; w < W; w++) {
        if (w > 0) cumT += (waveGaps[Math.min(w, waveGaps.length - 1)] || 25);
        const waveT = cumT;
        const wd = (idx <= 1 && BF.WAVE_DESIGN[w]) ? BF.WAVE_DESIGN[w] : null;
        const baseCount = wd
          ? Math.round(wd.count * T.countScale * 1.6 * modeMult)
          : Math.round((6 + 3 * w) * T.countScale * modeMult);
        const n = Math.max(5, baseCount);
        const gap = Math.max(0.4, 1.2 - 0.03 * w - 0.02 * idx);
        const focus = [Math.floor(r() * G.rows), Math.floor(r() * G.rows), Math.floor(r() * G.rows)];
        let t = waveT;
        for (let k = 0; k < n; k++) {
          const row = r() < 0.55 ? focus[Math.floor(r() * 3)] : Math.floor(r() * G.rows);
          out.push({ t, row, role: this._pickRole(w), wave: w });
          t += gap * (0.7 + 0.6 * r());
        }
        if (w === W - 1 && !hasBoss) {
          const champs = T.final ? 2 : idx >= 1 ? 1 + Math.floor(idx / 3) : 0;
          for (let c = 0; c < champs; c++) {
            out.push({ t: t + 1 + c * 2.5, row: Math.floor(r() * G.rows), role: 'champion', wave: w });
          }
          if (T.final) out.push({ t: t + 4, row: Math.floor(G.rows / 2), role: 'warlord', wave: w });
        }
      }
      if (hasBoss) {
        const bossT = cumT + 10;
        const br = Math.floor(r() * G.rows);
        const n = 1 + Math.floor(idx / 3);
        for (let c = 0; c < n; c++) {
          out.push({ t: bossT + c * 1.5, row: (br + c * 2) % G.rows, role: 'champion', wave: W - 1 });
        }
        if (T.final) out.push({ t: bossT + 1.5, row: Math.floor(G.rows / 2), role: 'warlord', wave: W - 1 });
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
      e.y = G.sky + s.row * G.cell + G.cell / 2;
      e.cd = 0.5; e.hit = 0; e.atk = 0; e.dead = false; e.aoe = 0; e.size = 1; e.slowDur = 0;
      const mm = this.modeMult;
      if (s.role === 'champion') {
        Object.assign(e, { hp: u.hp * norm * 3.5 * T.hpScale * mm, dmg: u.dmg * norm * 1.7 * T.dmgScale * mm, rate: u.rate * 0.8, range: 32, speed: 11, leak: 18, bounty: Math.round(menCost * 0.5), size: 1.5 });
      } else if (s.role === 'warlord') {
        Object.assign(e, { hp: u.hp * norm * 10 * T.hpScale * mm, dmg: u.dmg * norm * 2.2 * T.dmgScale * mm, rate: u.rate * 0.8, range: 34, speed: 9, leak: 40, bounty: 300, size: 2.0 });
      } else {
        const melee = s.role === 'spear' || s.role === 'sword';
        Object.assign(e, {
          hp: u.hp * norm * T.hpScale * mm, dmg: u.dmg * norm * T.dmgScale * mm, rate: u.rate,
          range: melee ? 28 : BF.ENEMY_RANGED_STOP,
          speed: BF.ROLE[s.role].speed, leak: BF.ROLE[s.role].leak,
          bounty: Math.round(menCost * BF.ECON.bountyRate), aoe: u.aoe || 0,
        });
      }
      if (s.boosted === 1) { e.hp *= 2; e.dmg *= 1.5; e.size = Math.max(e.size, 1.5); }
      else if (s.boosted === 2) { e.hp *= 3.5; e.dmg *= 2.2; e.size = Math.max(e.size, 1.8); }
      e.bounty = Math.max(e.bounty, Math.round(e.hp * 0.12));
      e.maxHp = e.hp;
      e.ranged = e.range > 90;
      this.enemies.push(e);
    }

    // ---------- player action: spawn a unit in a lane ----------
    unitCost(type) {
      const u = this.faction.units[type];
      if (!u) return 0;
      const reduc = this._starLv(type, 'goldReduc') * 0.05;
      return Math.max(10, Math.round(u.cost * (1 - reduc)));
    }

    spawn(type, row) {
      const u = this.faction.units[type];
      if (!u) return { ok: false, reason: 'unknown' };
      if (row < 0 || row >= G.rows) return { ok: false, reason: 'invalid' };
      const cost = this.unitCost(type);
      if (this.gold < cost) return { ok: false, reason: 'gold' };
      this.gold -= cost;
      const m = this.defMult;
      const spd = BF.MARCH_SPD + (type === 'archer' ? -2 : type === 'mage' ? -4 : type === 'sword' ? -1 : type === 'spear' ? 3 : 0);
      const atkSpdBonus = 1 + this._starLv(type, 'atkSpd') * 0.08;
      const atkStrBonus = 1 + this._starLv(type, 'atkStr') * 0.08;
      const defBonus    = 1 - this._starLv(type, 'def') * 0.06;
      const movBonus    = 1 + this._starLv(type, 'moveSpd') * 0.06;
      const d = {
        id: this.nid++, side: 'def', type, row,
        x: BF.SPAWN_X, y: G.sky + row * G.cell + G.cell / 2,
        marchSpeed: spd * movBonus,
        hp: u.hp * m, maxHp: u.hp * m, dmg: u.dmg * m * atkStrBonus,
        rate: u.rate * atkSpdBonus,
        range: u.range,
        aoe: u.aoe || 0, ranged: u.range > 120, cost, cd: 0.35, hit: 0, atk: 0, dead: false,
        touchCd: 0, shielded: false, shieldDur: 0, rallied: false, rallyDur: 0,
        starDefMod: defBonus, frozenDur: 0,
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

    // ---------- spawn a free unit (ability / auto-recruit) ----------
    _spawnFreeUnit(type, row) {
      const u = this.faction.units[type];
      if (!u) return;
      const spd = BF.MARCH_SPD + (type === 'archer' ? -2 : type === 'mage' ? -4 : type === 'sword' ? -1 : type === 'spear' ? 3 : type === 'og' ? -3 : 0);
      const atkSpdBonus = 1 + this._starLv(type, 'atkSpd') * 0.08;
      const atkStrBonus = 1 + this._starLv(type, 'atkStr') * 0.08;
      const defBonus    = 1 - this._starLv(type, 'def') * 0.06;
      const movBonus    = 1 + this._starLv(type, 'moveSpd') * 0.06;
      this.defenders.push({
        id: this.nid++, side: 'def', type, row,
        x: BF.SPAWN_X, y: G.sky + row * G.cell + G.cell / 2,
        marchSpeed: spd * movBonus,
        hp: u.hp * this.defMult, maxHp: u.hp * this.defMult,
        dmg: u.dmg * this.defMult * atkStrBonus, rate: u.rate * atkSpdBonus, range: u.range,
        aoe: u.aoe || 0, ranged: u.range > 120, cost: u.cost,
        cd: 0.35, hit: 0, atk: 0, dead: false, isOg: type === 'og',
        touchCd: 0, shielded: false, shieldDur: 0, rallied: false, rallyDur: 0,
        starDefMod: defBonus, frozenDur: 0,
      });
    }

    useAbility(targetRow) {
      if (this.abilityCd > 0 || this.over) return false;
      const ab = BF.ABILITIES[this.faction.id];
      if (!ab) return false;
      this.abilityCd = ab.cooldown;
      const fid = this.faction.id;

      // Use player-chosen lane or fall back to most-threatened
      let ogRow = targetRow;
      if (ogRow == null || ogRow < 0 || ogRow >= G.rows) {
        const rowScore = Array(G.rows).fill(0);
        for (const e of this.enemies) if (!e.dead) rowScore[e.row] += e.hp;
        ogRow = rowScore.indexOf(Math.max(...rowScore));
      }

      this._spawnFreeUnit('og', ogRow);

      if (fid === 'men') {
        // Holy Smite: targeted damage — bolt strikes front enemy in every lane
        for (let r = 0; r < G.rows; r++) {
          let front = null, minX = 1e9;
          for (const e of this.enemies) { if (!e.dead && e.row === r && e.x < minX) { minX = e.x; front = e; } }
          if (front) {
            this._shot(front.x, front.y - 88, front.x, front.y, 'bolt', '#e8e0a8', 0.30);
            this._hurtEnemy(front, 30 + this.waveNow() * 3);
            this._ring(front.x, front.y, 32, '#e8e0a8');
          }
        }
      } else if (fid === 'elves') {
        // Hurricane: stun — all enemies slowed 4s
        for (const e of this.enemies) {
          if (!e.dead) {
            e.slowDur = 4;
            this._ring(e.x, e.y, 30, '#60c040');
          }
        }
        this._ring(G.cw * 0.5, G.sky + G.h * 0.5, G.cw * 0.42, '#60c040');
      } else if (fid === 'orcs') {
        // Eruption: targeted damage — scorches all enemies
        for (const e of this.enemies) {
          if (!e.dead) {
            this._hurtEnemy(e, 28 + this.waveNow() * 2.5);
            this._ring(e.x, e.y, 40, '#e05020');
          }
        }
      } else if (fid === 'goblins') {
        // Acid Rain: targeted damage — melts all enemies
        for (const e of this.enemies) {
          if (!e.dead) {
            this._hurtEnemy(e, 22 + this.waveNow() * 2);
            this._ring(e.x, e.y, 28, '#80c828');
          }
        }
      } else if (fid === 'dwarves') {
        // Earthquake: stun — all enemies slowed 4s
        for (const e of this.enemies) {
          if (!e.dead) {
            e.slowDur = 4;
            this._ring(e.x, e.y, 36, '#c89020');
          }
        }
        this._ring(G.cw * 0.5, G.sky + G.h * 0.5, G.cw * 0.38, '#d0a030');
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
    _shot(x1, y1, x2, y2, kind, color, dur, arc) { if (this.fx) this.shots.push({ x1, y1, x2, y2, kind, color, t: 0, dur, arc: arc || 0 }); }
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
      const ironReduce   = d.ironclad ? 0.4 : 1;
      const shieldReduce = d.shielded ? 0.4 : 1;
      const starDef      = d.starDefMod != null ? d.starDefMod : 1;
      d.hp -= dmg * (1 - this.faction.mods.armor) * ironReduce * shieldReduce * starDef;
      d.hit = 0.12;
      if (d.hp <= 0) this._killDef(d);
    }

    _defAttack(d, tgt) {
      d.atk = 0.18;
      if (d.ranged) {
        const arcH = !d.aoe ? 20 : 0;
        this._shot(d.x + 10, d.y, tgt.x, tgt.y, d.aoe ? 'orb' : 'arrow', d.aoe ? '#c9a6ff' : '#e8dcc0', 0.16, arcH);
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
        const arcH = !e.aoe ? 15 : 0;
        this._shot(e.x - 8, e.y, tgt.x, tgt.y, e.aoe ? 'orb' : 'arrow', e.aoe ? '#ff9a7a' : '#d9b8a8', 0.16, arcH);
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

      // Manual recruit cooldown countdown (fires only when player triggers)
      if (this.autoRecruitCd > 0) {
        this.autoRecruitCd = Math.max(0, this.autoRecruitCd - dt);
        if (this.autoRecruitCd === 0) this.events.push('recruitReady');
      }
      if (this.repairCd > 0) this.repairCd = Math.max(0, this.repairCd - dt);
      if (this.mercCd > 0) this.mercCd = Math.max(0, this.mercCd - dt);
      this._goldTimer += dt;
      if (this._goldTimer >= 10) {
        this._goldTimer -= 10;
        this.gold += 50;
        this._float(G.cw * 0.5, G.sky + 20, '+50', '#e8c566');
        this.events.push('coin');
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
        if (d.frozenDur > 0) d.frozenDur = Math.max(0, d.frozenDur - dt);

        // Frozen defenders cannot move or attack
        if (d.frozenDur > 0) continue;

        // Target: nearest enemy in same lane within range (to the right of defender)
        let tgt = null, best = 1e9;
        for (const e of this.enemies) {
          if (e.dead || e.row !== d.row) continue;
          const gap = e.x - d.x;
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
          const castleWall = G.cw - BF.CASTLE_W;
          const siegeThresh = d.ranged ? castleWall - 2 * G.cell : castleWall;
          if (!d.shielded) d.x = Math.min(siegeThresh, d.x + d.marchSpeed * dt);
          if (d.x >= siegeThresh - 5 && d.cd <= 0 && this.enemyBaseHp > 0) {
            d.cd = 1 / d.rate;
            const dmg = Math.round(d.dmg);
            this.enemyBaseHp = Math.max(0, this.enemyBaseHp - dmg);
            this._float(castleWall + 10, d.y - 10, '-' + dmg, '#ff6b5e');
            d.atk = 0.18;
            this.events.push('siegeHit');
          }
        }
      }

      // Enemies: march left; fight first defender blocking their lane
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.cd -= dt;
        e.hit = Math.max(0, e.hit - dt);
        e.atk = Math.max(0, e.atk - dt);
        if (e.slowDur > 0) e.slowDur = Math.max(0, e.slowDur - dt);
        let tgt = null, best = 1e9;
        for (const d of this.defenders) {
          if (d.dead || d.row !== e.row) continue;
          const gap = e.x - d.x; // positive = defender is to the left (ahead of enemy)
          if (gap > -20 && gap < best) { best = gap; tgt = d; }
        }
        if (tgt && best <= e.range) {
          if (e.cd <= 0) { e.cd = 1 / e.rate; this._enemyAttack(e, tgt); }
        } else {
          e.x -= e.speed * (e.slowDur > 0 ? 0.25 : 1) * dt;
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

      // AI reinforcements at health thresholds — spawn elite units + freeze player
      const eRatio = this.enemyBaseHp / this.enemyBaseMax;
      for (let ti = 0; ti < this._aiThresholds.length; ti++) {
        if (!this._aiFired[ti] && eRatio <= this._aiThresholds[ti]) {
          this._aiFired[ti] = true;
          const wave = Math.max(0, this.waveNow() - 1);
          if (ti === 1) {
            // 25%: heavily boosted champions + warlord
            for (let rw = 0; rw < G.rows; rw++) {
              this.schedule.push({ t: this.time + 0.2 + rw * 0.3, row: rw, role: 'champion', wave, boosted: 2 });
            }
            this.schedule.push({ t: this.time + 0.1, row: Math.floor(G.rows / 2), role: 'warlord', wave, boosted: 2 });
          } else {
            // 50%: boosted champions in every row
            for (let rw = 0; rw < G.rows; rw++) {
              this.schedule.push({ t: this.time + 0.3 + rw * 0.4, row: rw, role: 'champion', wave, boosted: 1 });
            }
          }
          this.schedule.sort((a, b) => a.t - b.t);
          // Freeze all defenders and push back those near the castle by 8 cells
          const freezeDur = 3 + ti * 2;
          const pushDist = 8 * G.cell;
          const castleX = G.cw - BF.CASTLE_W;
          for (const d of this.defenders) {
            if (!d.dead) {
              d.frozenDur = freezeDur;
              if (d.x >= castleX - 3 * G.cell) {
                d.x = Math.max(BF.SPAWN_X, d.x - pushDist);
                this._ring(d.x, d.y, 24, '#ff6040');
              } else {
                this._ring(d.x, d.y, 18, '#60c8ff');
              }
            }
          }
          this.events.push('aiReinforce');
        }
      }

      if (this.enemyBaseHp <= 0 && !this.over) {
        this.enemyBaseHp = 0;
        for (const e of this.enemies) if (!e.dead) { e.dead = true; this.enemyPool.release(e); }
        this.enemies = [];
        const f = this.baseHp / this.baseMax;
        this.stars = f >= 0.8 ? 3 : f >= 0.4 ? 2 : 1;
        this.over = 'win'; this.events.push('win');
      } else if (this.baseHp <= 0) {
        this.baseHp = 0; this.over = 'lose'; this.events.push('lose');
      }
    }

    manualRecruit(type) {
      if (this.autoRecruitCd > 0 || this.over) return false;
      var role = type && this.faction.units[type] ? type : 'spear';
      var cost = this.unitCost(role);
      if (this.gold < cost) role = 'spear';
      cost = this.unitCost(role);
      if (this.gold < cost) { this._autoRecruit(); } else {
        this.gold -= cost;
        for (let row = 0; row < G.rows; row++) this._spawnFreeUnit(role, row);
      }
      this.autoRecruitCd = BF.AUTO_RECRUIT ? BF.AUTO_RECRUIT.interval : 30;
      this.events.push('reinforce');
      return true;
    }

    // ---------- skip to next wave early: risk vs. reward gold bonus ----------
    skipWave() {
      if (this.over || this.enemies.length > 0 || this.next >= this.schedule.length) return null;
      const nextT = this.schedule[this.next].t;
      const skipped = nextT - this.time;
      if (skipped <= 1) return null;
      const reward = Math.max(10, Math.round(12 * skipped * (1 + 0.08 * (this.terr.index || 0))));
      this.gold += reward;
      this.time = nextT - 0.05;
      this._float(G.cw * 0.5, G.sky + G.h * 0.4, '+' + reward, '#e8c566');
      this.events.push('skip');
      return reward;
    }

    _autoRecruit() {
      for (let row = 0; row < G.rows; row++) {
        this._spawnFreeUnit('spear', row);
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
            this._shot(d.x + 10, d.y, tgt.x, tgt.y, 'arrow', '#e8dcc0', 0.06 + i * 0.04, 20);
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

    repairGate() {
      if (this.repairCd > 0 || this.over) return { ok: false, reason: this.repairCd > 0 ? 'cooldown' : 'over' };
      this.repairCd = BF.REPAIR_CD;
      const heal = Math.round(this.baseMax * 0.25);
      this.baseHp = Math.min(this.baseMax, this.baseHp + heal);
      this._float(BF.CASTLE_W - 6, Math.round(G.sky + G.h * 0.5), '+' + heal, '#7fcf86');
      this.events.push('coin');
      return { ok: true };
    }

    hireMerc(targetRow) {
      if (this.mercCd > 0 || this.over) return { ok: false, reason: this.mercCd > 0 ? 'cooldown' : 'over' };
      let row = targetRow;
      if (row == null || row < 0 || row >= G.rows) {
        const rowCount = Array(G.rows).fill(0);
        for (const d of this.defenders) if (!d.dead) rowCount[d.row]++;
        row = rowCount.indexOf(Math.min(...rowCount));
      }
      this.mercCd = BF.MERC_CD;
      this._spawnFreeUnit('sword', row);
      this.events.push('place');
      return { ok: true };
    }
  };

  if (typeof module !== 'undefined') module.exports = BF;
})();
