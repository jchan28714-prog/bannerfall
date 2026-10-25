extends Node2D

# ==========================================================================
# BANNERFALL — Main scene controller
# Manages game state, renders battlefield, handles input.
# ==========================================================================

const BATTLE_SCRIPT = preload("res://scripts/battle.gd")

var battle: Node2D = null
var selected_unit_type: String = "spear"
var campaign: Array[Dictionary] = []
var current_faction_id: String = "men"
var current_territory: Dictionary = {}
var game_state: String = "menu"

@onready var gold_label: Label = $UI/GoldLabel
@onready var wave_label: Label = $UI/WaveLabel
@onready var base_hp_bar: ProgressBar = $UI/BaseHPBar
@onready var enemy_hp_bar: ProgressBar = $UI/EnemyHPBar
@onready var unit_buttons: HBoxContainer = $UI/UnitButtons
@onready var battle_layer: Node2D = $BattleLayer

func _ready() -> void:
	_build_unit_buttons()
	_start_demo_battle()

func _build_unit_buttons() -> void:
	for role in Data.ROLES:
		var btn := Button.new()
		btn.text = role.capitalize()
		btn.custom_minimum_size = Vector2(100, 36)
		btn.pressed.connect(_on_unit_selected.bind(role))
		unit_buttons.add_child(btn)

func _on_unit_selected(role: String) -> void:
	selected_unit_type = role

func _start_demo_battle() -> void:
	current_faction_id = "men"
	campaign = Data.build_campaign(current_faction_id)
	# Pick first non-home territory
	for t in campaign:
		if t.id != Data.FACTION_HOME[current_faction_id]:
			current_territory = t
			break

	if battle != null:
		battle.queue_free()

	battle = Node2D.new()
	battle.set_script(BATTLE_SCRIPT)
	battle_layer.add_child(battle)

	battle.init_battle({
		"factionId": current_faction_id,
		"territory": current_territory,
		"upgrades": { "treasury": 0, "barracks": 0, "walls": 0 },
	})
	battle.battle_over.connect(_on_battle_over)
	game_state = "battle"

func _on_battle_over(result: String, stars: int) -> void:
	print("Battle over: %s (%d stars)" % [result, stars])

func _process(dt: float) -> void:
	if game_state != "battle" or battle == null:
		return
	battle.step(dt)
	_update_ui()
	queue_redraw()

func _update_ui() -> void:
	gold_label.text = "Gold: %d" % battle.gold
	wave_label.text = "Wave: %d" % battle.wave_now()
	if battle.base_max > 0:
		base_hp_bar.value = 100.0 * battle.base_hp / battle.base_max
	if battle.enemy_base_max > 0:
		enemy_hp_bar.value = 100.0 * battle.enemy_base_hp / battle.enemy_base_max

func _unhandled_input(event: InputEvent) -> void:
	if game_state != "battle" or battle == null:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var G := Data.GRID
		var vp_size := get_viewport_rect().size
		var scale_x := vp_size.x / float(G.cw)
		var scale_y := vp_size.y / float(G.ch)
		var draw_scale := minf(scale_x, scale_y)
		var ox := (vp_size.x - G.cw * draw_scale) / 2.0
		var oy := (vp_size.y - G.ch * draw_scale) / 2.0
		var gx := (event.position.x - ox) / draw_scale
		var gy := (event.position.y - oy) / draw_scale
		var row := floori((gy - G.sky) / float(G.cell))
		if row >= 0 and row < G.rows:
			battle.spawn_defender(selected_unit_type, row)

func _draw() -> void:
	if game_state != "battle" or battle == null:
		return

	var G := Data.GRID
	var vp_size := get_viewport_rect().size
	var scale_x := vp_size.x / float(G.cw)
	var scale_y := vp_size.y / float(G.ch)
	var draw_scale := minf(scale_x, scale_y)
	var ox := (vp_size.x - G.cw * draw_scale) / 2.0
	var oy := (vp_size.y - G.ch * draw_scale) / 2.0

	# Sky
	var sky_rect := Rect2(ox, oy, G.cw * draw_scale, G.sky * draw_scale)
	draw_rect(sky_rect, Color(0.15, 0.22, 0.35))

	# Battlefield lanes
	for row in G.rows:
		var y := oy + (G.sky + row * G.cell) * draw_scale
		var lane_rect := Rect2(ox, y, G.cw * draw_scale, G.cell * draw_scale)
		var shade := 0.18 if row % 2 == 0 else 0.22
		draw_rect(lane_rect, Color(shade, shade + 0.04, shade))

	# Player castle
	var castle_rect := Rect2(ox, oy + G.sky * draw_scale, Data.CASTLE_W * draw_scale, G.h * draw_scale)
	draw_rect(castle_rect, Color(0.3, 0.35, 0.5))

	# Enemy castle
	var e_castle_x := ox + (G.cw - Data.CASTLE_W) * draw_scale
	var e_castle_rect := Rect2(e_castle_x, oy + G.sky * draw_scale, Data.CASTLE_W * draw_scale, G.h * draw_scale)
	var enemy_color: Color = Data.faction_by_id(current_territory.get("owner", "men")).get("color", Color.RED)
	draw_rect(e_castle_rect, enemy_color.darkened(0.3))

	# Defenders
	var player_color: Color = Data.faction_by_id(current_faction_id).get("color", Color.BLUE)
	for d in battle.defenders:
		if d.dead:
			continue
		var px := ox + d.x * draw_scale
		var py := oy + d.y * draw_scale
		var r := 8.0 * draw_scale
		var c: Color = player_color
		if d.hit > 0:
			c = Color.WHITE
		draw_circle(Vector2(px, py), r, c)

	# Enemies
	for e in battle.enemies:
		if e.dead:
			continue
		var px := ox + e.x * draw_scale
		var py := oy + e.y * draw_scale
		var r := 8.0 * draw_scale * e.size
		var c: Color = enemy_color
		if e.hit > 0:
			c = Color.WHITE
		draw_rect(Rect2(px - r, py - r, r * 2, r * 2), c)
