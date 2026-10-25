extends Node2D

# ==========================================================================
# BANNERFALL — Battle Engine (Godot port of www/js/engine.js)
# Pure game logic + rendering. Enemies march left, defenders march right.
# ==========================================================================

signal battle_over(result: String, stars: int)
signal gold_changed(amount: int)
signal event_fired(event_name: String)

var faction: Dictionary
var territory: Dictionary
var owner_faction: Dictionary
var upgrades := { "treasury": 0, "barracks": 0, "walls": 0 }
var star_upg := {}

var gold: int = 0
var base_hp: int = 0
var base_max: int = 0
var enemy_base_hp: int = 0
var enemy_base_max: int = 0
var bounty_mult: float = 1.0
var def_mult: float = 1.0
var mode_mult: float = 1.0

var time: float = 0.0
var defenders: Array[Dictionary] = []
var enemies: Array[Dictionary] = []
var schedule: Array[Dictionary] = []
var next_spawn: int = 0
var over: String = ""
var stars: int = 0
var kills: int = 0
var leaked: int = 0
var nid: int = 1

var ability_cd: float = 30.0
var ability_buff: float = 0.0
var auto_recruit_cd: float = 30.0
var repair_cd: float = 0.0
var merc_cd: float = 20.0
var _gold_timer: float = 0.0

var _ai_thresholds := [0.50, 0.25]
var _ai_fired := [false, false]

var _rng_state: int = 0

func _rng() -> float:
	_rng_state = (_rng_state + 0x6d2b79f5) & 0x7FFFFFFF
	var t: int = _rng_state ^ (_rng_state >> 15)
	t = (t * (1 | _rng_state)) & 0x7FFFFFFF
	t = (t + ((t ^ (t >> 7)) * (61 | t))) ^ t
	return float((t ^ (t >> 14)) & 0x7FFFFFFF) / 2147483648.0

func init_battle(opts: Dictionary) -> void:
	faction = Data.faction_by_id(opts.get("factionId", "men"))
	territory = opts.get("territory", {})
	owner_faction = Data.faction_by_id(territory.get("owner", "men"))
	upgrades = opts.get("upgrades", { "treasury": 0, "barracks": 0, "walls": 0 })
	star_upg = opts.get("starUpg", {})
	mode_mult = opts.get("modeMult", 1.0)
	_rng_state = opts.get("seed", randi()) & 0x7FFFFFFF

	var m: Dictionary = faction.mods
	gold = Data.ECON.startGold + 40 * upgrades.treasury \
		+ roundi(Data.ECON.startGold * Data.ECON.tribute * opts.get("tribute", 0))
	bounty_mult = m.bounty * (1.0 + 0.08 * upgrades.treasury)
	base_max = roundi((Data.ECON.baseHp + 15 * upgrades.walls) * m.baseHp)
	base_hp = base_max
	def_mult = 1.0 + 0.06 * upgrades.barracks

	var tidx: int = territory.get("index", 0)
	enemy_base_max = roundi(600.0 + 200.0 * tidx)
	enemy_base_hp = enemy_base_max

	time = 0.0
	defenders.clear()
	enemies.clear()
	schedule.clear()
	next_spawn = 0
	over = ""
	stars = 0
	kills = 0
	leaked = 0
	nid = 1
	ability_cd = 30.0
	ability_buff = 0.0
	auto_recruit_cd = 30.0
	repair_cd = 0.0
	merc_cd = 20.0
	_gold_timer = 0.0
	_ai_fired = [false, false]

	_build_schedule()

func _star_lv(type: String, attr: String) -> int:
	return star_upg.get(type + ":" + attr, 0)

# ---- Wave scheduling ----
func _pick_role(w: int) -> String:
	var idx: int = territory.get("index", 0)
	if idx <= 1 and w < Data.WAVE_DESIGN.size():
		var mix: Dictionary = Data.WAVE_DESIGN[w].mix
		var total := 0.0
		for k in mix:
			total += mix[k]
		var r := _rng() * total
		for k in mix:
			r -= mix[k]
			if r <= 0:
				return k
		return "spear"

	var wt := {
		"spear": maxf(0.35, 1.0 - 0.06 * w),
		"sword": 0.45 + 0.12 * w + 0.04 * idx,
		"archer": (0.2 + 0.06 * w + 0.05 * idx) if (w >= 1 or idx >= 1) else 0.0,
		"mage": (0.1 + 0.03 * w + 0.03 * idx) if (idx >= 2 and w >= 2) else 0.0,
	}
	var total := 0.0
	for k in wt:
		total += wt[k]
	var r := _rng() * total
	for k in wt:
		r -= wt[k]
		if r <= 0:
			return k
	return "spear"

func _build_schedule() -> void:
	schedule.clear()
	var T := territory
	var idx: int = T.get("index", 0)
	var W: int = T.get("waves", 5)
	var wave_gaps := [0, 15, 15, 20, 20, 20, 25]
	var has_boss := idx >= 2
	var mm := mode_mult
	var mode_m := 1.4 if mm < 1 else (0.85 if mm > 1 else 1.0)

	var cum_t := 3.0
	for w in W:
		if w > 0:
			cum_t += wave_gaps[mini(w, wave_gaps.size() - 1)]
		var wave_t := cum_t
		var wd = Data.WAVE_DESIGN[w] if (idx <= 1 and w < Data.WAVE_DESIGN.size()) else null
		var base_count: int
		if wd != null:
			base_count = roundi(wd.count * T.get("countScale", 1.0) * 1.6 * mode_m)
		else:
			base_count = roundi((6.0 + 3.0 * w) * T.get("countScale", 1.0) * mode_m)
		var n := maxi(5, base_count)
		var gap := maxf(0.4, 1.2 - 0.03 * w - 0.02 * idx)
		var focus := [floori(_rng() * Data.GRID.rows), floori(_rng() * Data.GRID.rows), floori(_rng() * Data.GRID.rows)]
		var t := wave_t
		for k in n:
			var row: int
			if _rng() < 0.55:
				row = focus[floori(_rng() * 3)]
			else:
				row = floori(_rng() * Data.GRID.rows)
			schedule.append({ "t": t, "row": row, "role": _pick_role(w), "wave": w })
			t += gap * (0.7 + 0.6 * _rng())

		if w == W - 1 and not has_boss:
			var champs: int = 2 if T.get("final", false) else (1 + idx / 3 if idx >= 1 else 0)
			for c in champs:
				schedule.append({ "t": t + 1.0 + c * 2.5, "row": floori(_rng() * Data.GRID.rows), "role": "champion", "wave": w })
			if T.get("final", false):
				schedule.append({ "t": t + 4.0, "row": Data.GRID.rows / 2, "role": "warlord", "wave": w })

	if has_boss:
		var boss_t := cum_t + 10.0
		var br := floori(_rng() * Data.GRID.rows)
		var n := 1 + idx / 3
		for c in n:
			schedule.append({ "t": boss_t + c * 1.5, "row": (br + c * 2) % Data.GRID.rows, "role": "champion", "wave": W - 1 })
		if T.get("final", false):
			schedule.append({ "t": boss_t + 1.5, "row": Data.GRID.rows / 2, "role": "warlord", "wave": W - 1 })

	schedule.sort_custom(func(a, b): return a.t < b.t)

func wave_now() -> int:
	if next_spawn == 0:
		return 0
	return schedule[next_spawn - 1].wave + 1

# ---- Spawning ----
func _spawn_enemy(s: Dictionary) -> void:
	var G := Data.GRID
	var big := s.role == "champion" or s.role == "warlord"
	var role_key := "sword" if big else s.role
	var u: Dictionary = owner_faction.units[role_key]
	var men_u: Dictionary = Data.faction_by_id("men").units[role_key]

	var core_fn := func(x: Dictionary) -> float:
		return sqrt(x.dmg * x.rate * (1.5 if x.get("aoe", 0) > 0 else 1.0) * x.hp)
	var norm := core_fn.call(men_u) / core_fn.call(u)
	var men_cost: int = men_u.cost

	var e := {
		"id": nid, "side": "enemy", "role": s.role, "row": s.row,
		"x": float(G.cw + 20), "y": float(G.sky + s.row * G.cell + G.cell / 2),
		"cd": 0.5, "hit": 0.0, "atk": 0.0, "dead": false, "aoe": 0.0,
		"size": 1.0, "slow_dur": 0.0, "ranged": false,
	}
	nid += 1
	var mm := mode_mult

	if s.role == "champion":
		e.merge({
			"hp": u.hp * norm * 3.5 * territory.hpScale * mm,
			"dmg": u.dmg * norm * 1.7 * territory.dmgScale * mm,
			"rate": u.rate * 0.8, "range": 32.0, "speed": 11.0,
			"leak": 18, "bounty": roundi(men_cost * 0.5), "size": 1.5,
		})
	elif s.role == "warlord":
		e.merge({
			"hp": u.hp * norm * 10.0 * territory.hpScale * mm,
			"dmg": u.dmg * norm * 2.2 * territory.dmgScale * mm,
			"rate": u.rate * 0.8, "range": 34.0, "speed": 9.0,
			"leak": 40, "bounty": 300, "size": 2.0,
		})
	else:
		var melee := s.role == "spear" or s.role == "sword"
		e.merge({
			"hp": u.hp * norm * territory.hpScale * mm,
			"dmg": u.dmg * norm * territory.dmgScale * mm,
			"rate": u.rate,
			"range": 28.0 if melee else Data.ENEMY_RANGED_STOP,
			"speed": Data.ROLE[s.role].speed,
			"leak": Data.ROLE[s.role].leak,
			"bounty": roundi(men_cost * Data.ECON.bountyRate),
			"aoe": u.get("aoe", 0.0),
		})

	var boosted: int = s.get("boosted", 0)
	if boosted == 1:
		e.hp *= 2.0; e.dmg *= 1.5; e.size = maxf(e.size, 1.5)
	elif boosted == 2:
		e.hp *= 3.5; e.dmg *= 2.2; e.size = maxf(e.size, 1.8)

	e.bounty = maxi(e.bounty, roundi(e.hp * 0.12))
	e.max_hp = e.hp
	e.ranged = e.range > 90.0
	enemies.append(e)

func spawn_defender(type: String, row: int) -> Dictionary:
	var u: Dictionary = faction.units.get(type, {})
	if u.is_empty():
		return { "ok": false, "reason": "unknown" }
	var G := Data.GRID
	if row < 0 or row >= G.rows:
		return { "ok": false, "reason": "invalid" }
	var unit_cost := _unit_cost(type)
	if gold < unit_cost:
		return { "ok": false, "reason": "gold" }
	gold -= unit_cost
	gold_changed.emit(gold)

	var spd := Data.MARCH_SPD + (-2.0 if type == "archer" else (-4.0 if type == "mage" else (-1.0 if type == "sword" else (3.0 if type == "spear" else 0.0))))
	var atk_spd_bonus := 1.0 + _star_lv(type, "atkSpd") * 0.08
	var atk_str_bonus := 1.0 + _star_lv(type, "atkStr") * 0.08
	var def_bonus := 1.0 - _star_lv(type, "def") * 0.06
	var mov_bonus := 1.0 + _star_lv(type, "moveSpd") * 0.06

	var d := {
		"id": nid, "side": "def", "type": type, "row": row,
		"x": float(Data.SPAWN_X), "y": float(G.sky + row * G.cell + G.cell / 2),
		"march_speed": spd * mov_bonus,
		"hp": u.hp * def_mult, "max_hp": u.hp * def_mult,
		"dmg": u.dmg * def_mult * atk_str_bonus, "rate": u.rate * atk_spd_bonus,
		"range": u.range, "aoe": u.get("aoe", 0.0),
		"ranged": u.range > 120.0, "cost": unit_cost,
		"cd": 0.35, "hit": 0.0, "atk": 0.0, "dead": false,
		"touch_cd": 0.0, "shielded": false, "shield_dur": 0.0,
		"rallied": false, "rally_dur": 0.0, "star_def_mod": def_bonus,
		"frozen_dur": 0.0,
	}
	nid += 1
	defenders.append(d)
	event_fired.emit("place")
	return { "ok": true, "unit": d }

func _unit_cost(type: String) -> int:
	var u: Dictionary = faction.units.get(type, {})
	if u.is_empty():
		return 0
	var reduc := _star_lv(type, "goldReduc") * 0.05
	return maxi(10, roundi(u.cost * (1.0 - reduc)))

# ---- Main tick ----
func step(dt: float) -> void:
	if over != "":
		return
	var G := Data.GRID
	var mods := faction.mods
	time += dt

	if ability_cd > 0:
		ability_cd = maxf(0.0, ability_cd - dt)
	if auto_recruit_cd > 0:
		auto_recruit_cd = maxf(0.0, auto_recruit_cd - dt)
		if auto_recruit_cd == 0:
			event_fired.emit("recruitReady")
	if repair_cd > 0:
		repair_cd = maxf(0.0, repair_cd - dt)
	if merc_cd > 0:
		merc_cd = maxf(0.0, merc_cd - dt)

	_gold_timer += dt
	if _gold_timer >= 10.0:
		_gold_timer -= 10.0
		gold += 50
		gold_changed.emit(gold)

	# Spawn enemies from schedule
	while next_spawn < schedule.size() and schedule[next_spawn].t <= time:
		_spawn_enemy(schedule[next_spawn])
		next_spawn += 1

	# Defenders march and fight
	for d in defenders:
		if d.dead:
			continue
		var regen_rate := maxf(1.0, mods.regen)
		if d.hp < d.max_hp:
			d.hp = minf(d.max_hp, d.hp + regen_rate * dt)
		d.cd -= dt
		d.hit = maxf(0.0, d.hit - dt)
		d.atk = maxf(0.0, d.atk - dt)
		if d.frozen_dur > 0:
			d.frozen_dur = maxf(0.0, d.frozen_dur - dt)
			continue

		var tgt = null
		var best := 1e9
		for e in enemies:
			if e.dead or e.row != d.row:
				continue
			var gap: float = e.x - d.x
			if gap > -6.0 and gap <= d.range and e.x < best:
				best = e.x
				tgt = e

		if tgt != null:
			if d.cd <= 0:
				var wild: bool = (mods.berserk and not d.ranged and d.hp < d.max_hp * 0.5) or d.get("frenzied", false)
				var speed_mult := (1.75 if wild else 1.0) * (1.5 if d.rallied else 1.0)
				d.cd = 1.0 / (d.rate * speed_mult)
				_def_attack(d, tgt)
		else:
			var castle_wall: float = G.cw - Data.CASTLE_W
			var siege_thresh: float = castle_wall - (2.0 * G.cell if d.ranged else 0.0)
			if not d.shielded:
				d.x = minf(siege_thresh, d.x + d.march_speed * dt)
			if d.x >= siege_thresh - 5.0 and d.cd <= 0 and enemy_base_hp > 0:
				d.cd = 1.0 / d.rate
				var dmg := roundi(d.dmg)
				enemy_base_hp = maxi(0, enemy_base_hp - dmg)
				d.atk = 0.18

	# Enemies march and fight
	for e in enemies:
		if e.dead:
			continue
		e.cd -= dt
		e.hit = maxf(0.0, e.hit - dt)
		e.atk = maxf(0.0, e.atk - dt)
		if e.slow_dur > 0:
			e.slow_dur = maxf(0.0, e.slow_dur - dt)

		var tgt = null
		var best := 1e9
		for d in defenders:
			if d.dead or d.row != e.row:
				continue
			var gap: float = e.x - d.x
			if gap > -20.0 and gap < best:
				best = gap
				tgt = d

		if tgt != null and best <= e.range:
			if e.cd <= 0:
				e.cd = 1.0 / e.rate
				_enemy_attack(e, tgt)
		else:
			e.x -= e.speed * (0.25 if e.slow_dur > 0 else 1.0) * dt
			if e.x <= 10.0:
				e.dead = true
				leaked += 1
				base_hp -= e.leak
				event_fired.emit("leak")

	# Remove dead
	enemies = enemies.filter(func(e): return not e.dead)
	defenders = defenders.filter(func(d): return not d.dead)

	# AI reinforcements
	if enemy_base_max > 0:
		var e_ratio := float(enemy_base_hp) / float(enemy_base_max)
		for ti in _ai_thresholds.size():
			if not _ai_fired[ti] and e_ratio <= _ai_thresholds[ti]:
				_ai_fired[ti] = true
				var wave := maxi(0, wave_now() - 1)
				if ti == 1:
					for rw in G.rows:
						schedule.append({ "t": time + 0.2 + rw * 0.3, "row": rw, "role": "champion", "wave": wave, "boosted": 2 })
					schedule.append({ "t": time + 0.1, "row": G.rows / 2, "role": "warlord", "wave": wave, "boosted": 2 })
				else:
					for rw in G.rows:
						schedule.append({ "t": time + 0.3 + rw * 0.4, "row": rw, "role": "champion", "wave": wave, "boosted": 1 })
				schedule.sort_custom(func(a, b): return a.t < b.t)
				var freeze_dur := 3.0 + ti * 2.0
				var push_dist := 8.0 * G.cell
				var castle_x: float = G.cw - Data.CASTLE_W
				for d in defenders:
					if not d.dead:
						d.frozen_dur = freeze_dur
						if d.x >= castle_x - 3.0 * G.cell:
							d.x = maxf(Data.SPAWN_X, d.x - push_dist)
				event_fired.emit("aiReinforce")

	# Win / lose check
	if enemy_base_hp <= 0 and over == "":
		enemy_base_hp = 0
		for e in enemies:
			e.dead = true
		enemies.clear()
		var f := float(base_hp) / float(base_max)
		stars = 3 if f >= 0.8 else (2 if f >= 0.4 else 1)
		over = "win"
		battle_over.emit("win", stars)
	elif base_hp <= 0:
		base_hp = 0
		over = "lose"
		battle_over.emit("lose", 0)
	elif next_spawn >= schedule.size() and enemies.size() == 0:
		var f := float(base_hp) / float(base_max)
		stars = 3 if f >= 0.8 else (2 if f >= 0.4 else 1)
		over = "win"
		battle_over.emit("win", stars)

# ---- Combat helpers ----
func _def_attack(d: Dictionary, tgt: Dictionary) -> void:
	d.atk = 0.18
	var mult := Data.dmg_mult(d.type, Data.base_role(tgt.role))
	var panic_mult := 0.5 if (d.type == "archer" and absf(tgt.x - d.x) < 35.0) else 1.0
	var dmg: float = d.dmg * mult * panic_mult
	if d.aoe > 0:
		for e in enemies:
			if e.dead:
				continue
			var dist := Vector2(e.x, e.y).distance_to(Vector2(tgt.x, tgt.y))
			if dist <= d.aoe:
				_hurt_enemy(e, dmg if e == tgt else d.dmg * 0.6)
	else:
		_hurt_enemy(tgt, dmg)

func _enemy_attack(e: Dictionary, tgt: Dictionary) -> void:
	e.atk = 0.18
	var mult := Data.dmg_mult(Data.base_role(e.role), tgt.type)
	var dmg: float = e.dmg * mult
	if e.aoe > 0:
		for d in defenders:
			if d.dead:
				continue
			var dist := Vector2(d.x, d.y).distance_to(Vector2(tgt.x, tgt.y))
			if dist <= e.aoe:
				_hurt_def(d, dmg if d == tgt else e.dmg * 0.6)
	else:
		_hurt_def(tgt, dmg)

func _hurt_enemy(e: Dictionary, dmg: float) -> void:
	if e.dead:
		return
	e.hp -= dmg
	e.hit = 0.12
	if e.hp <= 0:
		e.dead = true
		kills += 1
		var g := roundi(e.bounty * bounty_mult)
		gold += g
		gold_changed.emit(gold)

func _hurt_def(d: Dictionary, dmg: float) -> void:
	if d.dead:
		return
	var iron_reduce := 0.4 if d.get("ironclad", false) else 1.0
	var shield_reduce := 0.4 if d.shielded else 1.0
	var star_def: float = d.get("star_def_mod", 1.0)
	d.hp -= dmg * (1.0 - faction.mods.armor) * iron_reduce * shield_reduce * star_def
	d.hit = 0.12
	if d.hp <= 0:
		d.dead = true
