extends Node

# ==========================================================================
# BANNERFALL — Game Data (Godot port of www/js/data.js)
# All constants, factions, units, territories, economy.
# Autoloaded as "Data".
# ==========================================================================

# ---- Board geometry ----
var GRID := {
	"rows": 6,
	"cell": 42,
	"sky": 38,
	"w": 504,
	"h": 288,
	"cw": 504,
	"ch": 376,
}

const CASTLE_W := 54
const SPAWN_X := 66
const MARCH_SPD := 13.0

const ROLES := ["spear", "sword", "archer", "mage"]

# ---- Economy ----
const ECON := {
	"startGold": 500,
	"baseIncome": 24,
	"sellRefund": 0.8,
	"bountyRate": 0.5,
	"baseHp": 60,
	"tribute": 0.08,
}

# ---- Abilities ----
const ABILITIES := {
	"men":     { "name": "Holy Smite",  "cooldown": 45 },
	"elves":   { "name": "Hurricane",   "cooldown": 40 },
	"orcs":    { "name": "Eruption",    "cooldown": 40 },
	"goblins": { "name": "Acid Rain",   "cooldown": 40 },
	"dwarves": { "name": "Earthquake",  "cooldown": 45 },
}

# ---- Upgrades ----
const UPGRADES := [
	{ "id": "treasury", "name": "Royal Treasury", "max": 5 },
	{ "id": "barracks", "name": "Barracks", "max": 5 },
	{ "id": "walls",    "name": "Fortified Gate", "max": 5 },
]

func upgrade_cost(level: int) -> int:
	return 15 * (level + 1)

# ---- Price model ----
const COST_PER_POWER := 2.5

func power_of(u: Dictionary, armor: float = 0.0) -> float:
	var dps := u.dmg * u.rate * (1.5 if u.get("aoe", 0) > 0 else 1.0)
	var ehp := u.hp / (1.0 - armor)
	var reach := 1.0 + 0.012 * maxf(0.0, u.range - 120.0)
	return sqrt(dps * ehp) * reach

func cost_of(u: Dictionary, armor: float = 0.0) -> int:
	return maxi(10, roundi(COST_PER_POWER * power_of(u, armor) / 10.0) * 10)

# ---- Role movement/leak ----
const ROLE := {
	"spear":  { "speed": 18.0, "leak": 4 },
	"sword":  { "speed": 15.0, "leak": 6 },
	"archer": { "speed": 15.0, "leak": 5 },
	"mage":   { "speed": 13.0, "leak": 6 },
}

# ---- Damage multipliers ----
func dmg_mult(atk_role: String, def_role: String) -> float:
	if atk_role == "archer" and def_role == "sword":  return 1.75
	if atk_role == "archer" and def_role == "spear":  return 1.3
	if atk_role == "mage" and (def_role == "spear" or def_role == "sword"): return 1.6
	if (atk_role == "spear" or atk_role == "sword") and (def_role == "archer" or def_role == "mage"): return 1.3
	return 1.0

func base_role(role: String) -> String:
	if role == "champion" or role == "warlord":
		return "sword"
	return role

# ---- Factions ----
var FACTIONS: Array[Dictionary] = []
var CITADEL_FACTION: Dictionary = {}

func _ready() -> void:
	_build_factions()
	_build_territories()

func _build_factions() -> void:
	FACTIONS = [
		{
			"id": "men", "name": "Men of Aldermere", "short": "Men",
			"color": Color("#4a78c2"), "accent": Color("#a9c1ec"),
			"tagline": "Disciplined steel. The finest swordsmen in the realm.",
			"perks": ["Elite swordsmen: heavy, hard-hitting blades", "+20% gold income"],
			"mods": { "income": 1.2, "bounty": 1.0, "baseHp": 1.0, "armor": 0.0, "regen": 0.0, "berserk": false },
			"discount": "sword",
			"units": {
				"spear":  { "name": "Spearman",    "hp": 80.0,  "dmg": 8.0,  "rate": 1.0,  "range": 38.0 },
				"sword":  { "name": "Swordsman",    "hp": 190.0, "dmg": 19.0, "rate": 1.1,  "range": 30.0 },
				"archer": { "name": "Archer",       "hp": 70.0,  "dmg": 15.0, "rate": 0.85, "range": 250.0 },
				"mage":   { "name": "Battle Mage",  "hp": 75.0,  "dmg": 30.0, "rate": 0.7,  "range": 230.0, "aoe": 80.0 },
			},
		},
		{
			"id": "elves", "name": "Elves of Sylvanmere", "short": "Elves",
			"color": Color("#3f9a6a"), "accent": Color("#a6e3bf"),
			"tagline": "Slow, patient arrows that reach across the whole field.",
			"perks": ["Longest-ranged archers in the game", "Defenders regenerate 3 HP/s"],
			"mods": { "income": 1.0, "bounty": 1.0, "baseHp": 1.0, "armor": 0.0, "regen": 3.0, "berserk": false },
			"discount": "archer",
			"units": {
				"spear":  { "name": "Glade Spear",     "hp": 70.0,  "dmg": 7.0,  "rate": 1.0,  "range": 38.0 },
				"sword":  { "name": "Bladedancer",      "hp": 150.0, "dmg": 17.0, "rate": 1.2,  "range": 30.0 },
				"archer": { "name": "Longbow Ranger",   "hp": 65.0,  "dmg": 22.0, "rate": 0.55, "range": 330.0 },
				"mage":   { "name": "Moon Mage",        "hp": 65.0,  "dmg": 28.0, "rate": 0.65, "range": 240.0, "aoe": 80.0 },
			},
		},
		{
			"id": "orcs", "name": "Orcs of the Ashen Horde", "short": "Orcs",
			"color": Color("#b5482f"), "accent": Color("#f0a98e"),
			"tagline": "Brutes who grow wilder the more they bleed.",
			"perks": ["Massive health and damage in melee", "Berserk: attacks 25% faster below half health"],
			"mods": { "income": 1.1, "bounty": 1.0, "baseHp": 1.0, "armor": 0.0, "regen": 0.0, "berserk": true },
			"discount": "sword",
			"units": {
				"spear":  { "name": "Raider",     "hp": 100.0, "dmg": 9.0,  "rate": 0.9,  "range": 38.0 },
				"sword":  { "name": "Warbrute",    "hp": 260.0, "dmg": 26.0, "rate": 1.0,  "range": 30.0 },
				"archer": { "name": "Skirmisher",  "hp": 55.0,  "dmg": 11.0, "rate": 0.8,  "range": 210.0 },
				"mage":   { "name": "Shaman",      "hp": 65.0,  "dmg": 28.0, "rate": 0.6,  "range": 210.0, "aoe": 80.0 },
			},
		},
		{
			"id": "goblins", "name": "Goblins of Gloomhollow", "short": "Goblins",
			"color": Color("#a3a93a"), "accent": Color("#e3e68f"),
			"tagline": "Cheap, quick and everywhere. Win by sheer numbers.",
			"perks": ["Cheapest units in the game", "+35% gold from kills, +25% starting gold"],
			"mods": { "income": 1.25, "bounty": 1.35, "baseHp": 1.0, "armor": 0.0, "regen": 0.0, "berserk": false },
			"discount": "spear",
			"units": {
				"spear":  { "name": "Stabber",    "hp": 55.0,  "dmg": 6.0,  "rate": 1.2,  "range": 38.0 },
				"sword":  { "name": "Cutthroat",   "hp": 110.0, "dmg": 12.0, "rate": 1.3,  "range": 30.0 },
				"archer": { "name": "Slinger",     "hp": 45.0,  "dmg": 8.5,  "rate": 1.1,  "range": 240.0 },
				"mage":   { "name": "Hexer",       "hp": 50.0,  "dmg": 26.0, "rate": 0.7,  "range": 220.0, "aoe": 85.0 },
			},
		},
		{
			"id": "dwarves", "name": "Dwarves of Karak Dun", "short": "Dwarves",
			"color": Color("#c08a3e"), "accent": Color("#f1d09a"),
			"tagline": "Armoured and immovable. Nothing gets through the line.",
			"perks": ["Armour: all damage cut by 15%", "Gate has 25% more health"],
			"mods": { "income": 1.0, "bounty": 1.0, "baseHp": 1.25, "armor": 0.15, "regen": 0.0, "berserk": false },
			"discount": "spear",
			"units": {
				"spear":  { "name": "Pikeman",     "hp": 110.0, "dmg": 8.0,  "rate": 0.9,  "range": 38.0 },
				"sword":  { "name": "Axeguard",     "hp": 240.0, "dmg": 21.0, "rate": 0.9,  "range": 30.0 },
				"archer": { "name": "Crossbowman",  "hp": 80.0,  "dmg": 17.0, "rate": 0.7,  "range": 210.0 },
				"mage":   { "name": "Runesmith",    "hp": 85.0,  "dmg": 33.0, "rate": 0.6,  "range": 210.0, "aoe": 75.0 },
			},
		},
	]

	CITADEL_FACTION = {
		"id": "citadel", "name": "The Celestial Citadel", "short": "Citadel",
		"color": Color("#8a6ad0"), "accent": Color("#c8b0f0"),
		"mods": { "income": 1.1, "bounty": 1.1, "baseHp": 1.1, "armor": 0.05, "regen": 1.0, "berserk": false },
		"units": {
			"spear":  { "name": "Sentinel",      "hp": 95.0,  "dmg": 9.0,  "rate": 1.0,  "range": 38.0 },
			"sword":  { "name": "Seraph Knight",  "hp": 210.0, "dmg": 22.0, "rate": 1.05, "range": 30.0 },
			"archer": { "name": "Starbow",        "hp": 75.0,  "dmg": 18.0, "rate": 0.75, "range": 270.0 },
			"mage":   { "name": "Oracle",         "hp": 80.0,  "dmg": 32.0, "rate": 0.65, "range": 230.0, "aoe": 80.0 },
		},
	}

	# Compute costs
	for f in FACTIONS:
		for role in ROLES:
			var u: Dictionary = f.units[role]
			u["role"] = role
			u["cost"] = cost_of(u, f.mods.armor)
			if role == f.get("discount", ""):
				u["cost"] = maxi(10, roundi(u["cost"] * 0.7))
	for role in ROLES:
		var u: Dictionary = CITADEL_FACTION.units[role]
		u["role"] = role
		u["cost"] = cost_of(u, CITADEL_FACTION.mods.armor)

	# OG Forces
	var og_defs := {
		"men":     { "name": "Paladin",         "hp": 420.0, "dmg": 40.0, "rate": 0.70, "range": 52.0,  "aoe": 55.0 },
		"elves":   { "name": "Spirit Warden",   "hp": 350.0, "dmg": 28.0, "rate": 0.60, "range": 300.0, "aoe": 90.0 },
		"orcs":    { "name": "Demonic Giant",   "hp": 580.0, "dmg": 50.0, "rate": 0.80, "range": 56.0,  "aoe": 60.0 },
		"goblins": { "name": "Scrap Mech",      "hp": 260.0, "dmg": 20.0, "rate": 2.20, "range": 180.0, "aoe": 80.0 },
		"dwarves": { "name": "Runesmith Golem", "hp": 750.0, "dmg": 32.0, "rate": 0.65, "range": 58.0,  "aoe": 55.0 },
	}
	for f in FACTIONS:
		if og_defs.has(f.id):
			var og: Dictionary = og_defs[f.id]
			og["role"] = "og"
			og["cost"] = 500
			f.units["og"] = og

func faction_by_id(id: String) -> Dictionary:
	for f in FACTIONS:
		if f.id == id:
			return f
	if id == "citadel":
		return CITADEL_FACTION
	return {}

# ---- Territories ----
const FACTION_HOME := {
	"men":     "t_keep",
	"elves":   "t_sylvan",
	"orcs":    "t_ashfield",
	"dwarves": "t_karakdun",
	"goblins": "t_gloomhollow",
}

var TERRITORIES: Array[Dictionary] = []

func _build_territories() -> void:
	TERRITORIES = [
		{ "id": "t_starfall",     "name": "Starfall Pools",     "owner": "elves",   "x": 315, "y": 29,  "adj": ["t_sylvan", "t_moonveil", "t_ancient"] },
		{ "id": "t_ancient",      "name": "Ancient Canopy",     "owner": "elves",   "x": 612, "y": 36,  "adj": ["t_starfall", "t_sylvan", "t_thornwood"] },
		{ "id": "t_moonveil",     "name": "Moonveil Glade",     "owner": "elves",   "x": 144, "y": 69,  "adj": ["t_starfall", "t_sylvan", "t_whisperwood", "t_raiders"] },
		{ "id": "t_sylvan",       "name": "Sylvanmere Grove",   "owner": "elves",   "x": 405, "y": 65,  "adj": ["t_starfall", "t_moonveil", "t_ancient", "t_thornwood", "t_ashfield", "t_citadel"] },
		{ "id": "t_thornwood",    "name": "Thornwood Pass",     "owner": "elves",   "x": 711, "y": 87,  "adj": ["t_ancient", "t_sylvan", "t_scorched", "t_ironwall"] },
		{ "id": "t_whisperwood",  "name": "Whisperwood",        "owner": "elves",   "x": 171, "y": 126, "adj": ["t_moonveil", "t_raiders", "t_emberpits"] },

		{ "id": "t_emberpits",    "name": "Ember Pits",         "owner": "orcs",    "x": 99,  "y": 163, "adj": ["t_whisperwood", "t_raiders", "t_bloodforge"] },
		{ "id": "t_raiders",      "name": "Raider's Reach",     "owner": "orcs",    "x": 81,  "y": 213, "adj": ["t_moonveil", "t_whisperwood", "t_emberpits", "t_ashfield", "t_bloodforge"] },
		{ "id": "t_ashfield",     "name": "Ashfield",           "owner": "orcs",    "x": 279, "y": 188, "adj": ["t_sylvan", "t_raiders", "t_scorched", "t_warpeak", "t_frosthold", "t_karakdun", "t_citadel"] },
		{ "id": "t_scorched",     "name": "Scorched Plains",    "owner": "orcs",    "x": 549, "y": 177, "adj": ["t_thornwood", "t_ashfield", "t_ironwall", "t_ironvein"] },
		{ "id": "t_bloodforge",   "name": "Blood Forge",        "owner": "orcs",    "x": 72,  "y": 271, "adj": ["t_emberpits", "t_raiders", "t_warpeak", "t_deepmines"] },
		{ "id": "t_warpeak",      "name": "War Peak",           "owner": "orcs",    "x": 225, "y": 249, "adj": ["t_ashfield", "t_bloodforge", "t_deepmines", "t_karakdun"] },

		{ "id": "t_frosthold",    "name": "Frosthold",          "owner": "dwarves", "x": 387, "y": 228, "adj": ["t_ashfield", "t_karakdun", "t_anvil", "t_ironvein"] },
		{ "id": "t_ironvein",     "name": "Ironvein Tunnels",   "owner": "dwarves", "x": 612, "y": 224, "adj": ["t_scorched", "t_frosthold", "t_stoneforge", "t_ironwall"] },
		{ "id": "t_karakdun",     "name": "Karak Dun",          "owner": "dwarves", "x": 441, "y": 278, "adj": ["t_ashfield", "t_warpeak", "t_frosthold", "t_deepmines", "t_stoneforge", "t_anvil", "t_gloomhollow", "t_keep", "t_citadel"] },
		{ "id": "t_deepmines",    "name": "The Deepmines",      "owner": "dwarves", "x": 207, "y": 300, "adj": ["t_bloodforge", "t_warpeak", "t_karakdun", "t_mudmire"] },
		{ "id": "t_stoneforge",   "name": "Stoneforge",         "owner": "dwarves", "x": 666, "y": 282, "adj": ["t_ironvein", "t_karakdun", "t_anvil", "t_keep", "t_skullpeak"] },
		{ "id": "t_anvil",        "name": "The Anvil",          "owner": "dwarves", "x": 513, "y": 318, "adj": ["t_frosthold", "t_karakdun", "t_stoneforge", "t_silverbridge"] },

		{ "id": "t_ironwall",     "name": "Ironwall Cliffs",    "owner": "men",     "x": 801, "y": 141, "adj": ["t_thornwood", "t_scorched", "t_ironvein", "t_watchtower", "t_keep"] },
		{ "id": "t_keep",         "name": "Aldermere Keep",     "owner": "men",     "x": 774, "y": 256, "adj": ["t_ironwall", "t_stoneforge", "t_karakdun", "t_silverbridge", "t_watchtower", "t_marches", "t_citadel"] },
		{ "id": "t_watchtower",   "name": "The Watchtower",     "owner": "men",     "x": 837, "y": 206, "adj": ["t_ironwall", "t_keep", "t_harvest"] },
		{ "id": "t_silverbridge", "name": "Silver Bridge",      "owner": "men",     "x": 711, "y": 321, "adj": ["t_keep", "t_anvil", "t_harvest"] },
		{ "id": "t_harvest",      "name": "Harvest Fields",     "owner": "men",     "x": 828, "y": 343, "adj": ["t_watchtower", "t_silverbridge", "t_marches"] },
		{ "id": "t_marches",      "name": "Greywatch Marches",  "owner": "men",     "x": 738, "y": 386, "adj": ["t_keep", "t_harvest", "t_skullpeak", "t_gloomhollow"] },

		{ "id": "t_gloomhollow",  "name": "Gloomhollow Warren", "owner": "goblins", "x": 387, "y": 394, "adj": ["t_karakdun", "t_mudmire", "t_marches", "t_skullpeak", "t_rotfen", "t_toxicspire", "t_citadel"] },
		{ "id": "t_mudmire",      "name": "Mudmire Bog",        "owner": "goblins", "x": 153, "y": 386, "adj": ["t_deepmines", "t_gloomhollow", "t_rotfen"] },
		{ "id": "t_skullpeak",    "name": "Skullpeak",          "owner": "goblins", "x": 621, "y": 386, "adj": ["t_stoneforge", "t_marches", "t_gloomhollow", "t_darktide"] },
		{ "id": "t_rotfen",       "name": "Rotfen Marsh",       "owner": "goblins", "x": 198, "y": 441, "adj": ["t_mudmire", "t_gloomhollow"] },
		{ "id": "t_toxicspire",   "name": "Toxicspire",         "owner": "goblins", "x": 459, "y": 441, "adj": ["t_gloomhollow", "t_darktide"] },
		{ "id": "t_darktide",     "name": "Dark Tide",          "owner": "goblins", "x": 693, "y": 433, "adj": ["t_skullpeak", "t_toxicspire"] },

		{ "id": "t_citadel", "name": "Obsidian Citadel", "owner": "citadel", "x": 450, "y": 260, "adj": ["t_keep", "t_sylvan", "t_ashfield", "t_karakdun", "t_gloomhollow"], "final": true },
	]

func territory_by_id(id: String) -> Dictionary:
	for t in TERRITORIES:
		if t.id == id:
			return t
	return {}

func enemy_homes(player_id: String) -> Array[String]:
	var homes: Array[String] = []
	for f in FACTIONS:
		if f.id != player_id:
			homes.append(FACTION_HOME[f.id])
	return homes

func build_campaign(player_id: String) -> Array[Dictionary]:
	var home_id: String = FACTION_HOME[player_id]
	var rivals: Array[Dictionary] = []
	for f in FACTIONS:
		if f.id != player_id:
			rivals.append(f)

	# BFS from homeland
	var bfs_dist := {}
	var queue: Array[String] = [home_id]
	bfs_dist[home_id] = 0
	while queue.size() > 0:
		var cur: String = queue.pop_front()
		var t := territory_by_id(cur)
		if t.is_empty():
			continue
		for adj_id in t.adj:
			if not bfs_dist.has(adj_id):
				bfs_dist[adj_id] = bfs_dist[cur] + 1
				queue.append(adj_id)

	# Rotation so player home is at the bottom
	var cx := 450.0
	var cy := 260.0
	var home_t := territory_by_id(home_id)
	var home_angle := atan2(home_t.y - cy, home_t.x - cx)
	var target_angle := PI / 2.0
	var rot := target_angle - home_angle
	var cos_r := cos(rot)
	var sin_r := sin(rot)

	var result: Array[Dictionary] = []
	for i in TERRITORIES.size():
		var t: Dictionary = TERRITORIES[i]
		var d: int = bfs_dist.get(t.id, 8)
		var idx := maxi(0, d - 1)
		var owner: String = t.owner
		if owner == player_id:
			owner = rivals[i % rivals.size()].id
		if t.get("final", false):
			if owner.is_empty():
				owner = rivals[0].id

		var dx := t.x - cx
		var dy := t.y - cy
		var rx := cx + dx * cos_r - dy * sin_r
		var ry := cy + dx * sin_r + dy * cos_r

		var entry := t.duplicate()
		entry["owner"] = owner
		entry["index"] = idx
		entry["waves"] = 9 if t.get("final", false) else 5 + d
		entry["hpScale"] = 0.90 + 0.12 * idx
		entry["dmgScale"] = 0.85 + 0.12 * idx
		entry["countScale"] = 0.90 + 0.10 * idx
		entry["mapX"] = roundi(rx)
		entry["mapY"] = roundi(ry)
		result.append(entry)

	return result

# ---- Wave economy ----
func repair_cost(w: int) -> int:
	return roundi((60.0 + 20.0 * w) / 10.0) * 10
func merc_cost(w: int) -> int:
	return roundi((120.0 + 35.0 * w) / 10.0) * 10

const AUTO_RECRUIT_INTERVAL := 50.0
const REPAIR_CD := 20.0
const MERC_CD := 15.0
const ENEMY_RANGED_STOP := 70.0

# ---- Touch abilities ----
const TOUCH_ABILITIES := {
	"spear":  { "name": "Shield Wall",  "cooldown": 18.0, "dur": 4.0 },
	"sword":  { "name": "Rally Cry",    "cooldown": 20.0, "dur": 5.0 },
	"archer": { "name": "Rapid Volley", "cooldown": 12.0, "dur": 0.0 },
	"mage":   { "name": "Chain Blast",  "cooldown": 16.0, "dur": 0.0 },
}

# ---- Star upgrades ----
const UPGRADE_ATTRS := [
	{ "id": "atkSpd",    "name": "Attack Speed",        "max": 5, "perLv": 0.08 },
	{ "id": "atkStr",    "name": "Attack Strength",     "max": 5, "perLv": 0.08 },
	{ "id": "def",       "name": "Defence",             "max": 5, "perLv": 0.06 },
	{ "id": "moveSpd",   "name": "Movement Speed",      "max": 5, "perLv": 0.06 },
	{ "id": "goldReduc", "name": "Gold Cost Reduction",  "max": 5, "perLv": 0.05 },
]

func star_upg_cost(current_level: int) -> int:
	return current_level + 1

# ---- Wave design (first 10 waves) ----
const WAVE_DESIGN := [
	{ "mix": { "spear": 1.0 }, "count": 3 },
	{ "mix": { "spear": 0.7, "sword": 0.3 }, "count": 5 },
	{ "mix": { "spear": 0.35, "sword": 0.65 }, "count": 6 },
	{ "mix": { "spear": 0.4, "sword": 0.3, "archer": 0.3 }, "count": 7 },
	{ "mix": { "sword": 0.4, "archer": 0.4, "spear": 0.2 }, "count": 9 },
	{ "mix": { "sword": 0.4, "archer": 0.3, "mage": 0.3 }, "count": 10 },
	{ "mix": { "spear": 0.2, "sword": 0.5, "mage": 0.3 }, "count": 11 },
	{ "mix": { "archer": 0.55, "mage": 0.45 }, "count": 12 },
	{ "mix": { "sword": 0.35, "archer": 0.3, "mage": 0.35 }, "count": 13 },
	{ "mix": { "sword": 0.35, "archer": 0.3, "mage": 0.35 }, "count": 15 },
]

# ---- Dynamic reflow ----
func reflow(container_w: float, container_h: float) -> void:
	if container_w <= 0 or container_h <= 0:
		return
	var aspect := maxf(1.0, container_w / container_h)
	var ch := 376.0
	var sky := roundi(ch * 0.10)
	var btm := 8
	var avail := int(ch) - sky - btm
	var cell := avail / GRID.rows
	var h := cell * GRID.rows
	GRID.ch = int(ch)
	GRID.sky = int(ch) - h - btm
	GRID.h = h
	GRID.cell = cell
	GRID.cw = roundi(ch * aspect)
	GRID.w = GRID.cw
