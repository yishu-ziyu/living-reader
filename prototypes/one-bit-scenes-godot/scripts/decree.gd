extends "res://scripts/scene_base.gd"

func _draw() -> void:
	rect(0, 0, 320, 180, PAPER)
	_draw_room()
	_draw_rule_console()
	draw_person(Vector2(55, 132), "clerk", 1 if elapsed > 1.1 else 0, false, 1.28)
	_draw_quill()
	if elapsed > 1.55:
		_draw_stamp(clampf((elapsed - 1.55) * 3.0, 0.0, 1.0))

func _draw_room() -> void:
	# Heavy institutional room: columns and a wall of filed laws.
	rect(0, 16, 320, 7)
	for x in [13, 286]:
		rect(x, 23, 21, 107)
		rect(x + 4, 27, 13, 99, PAPER)
		rect(x - 3, 25, 27, 5)
		rect(x - 3, 121, 27, 8)
	for y in range(30, 122, 12):
		outline(92, y, 25, 8)
		outline(120, y, 22, 8)
	# Wall hatching.
	for x in range(39, 285, 7):
		pixel_line(Vector2(x, 25), Vector2(x - 28, 65))
	rect(36, 25, 53, 98, PAPER)
	outline(36, 25, 53, 98, 2)
	label("法", 50, 58, 28)
	label("令", 50, 91, 28)
	# Desk plane.
	rect(0, 119, 320, 7)
	rect(78, 115, 217, 17, PAPER)
	outline(78, 115, 217, 17, 2)

func _draw_rule_console() -> void:
	panel(151, 29, 143, 73, "你的法令")
	label("“禁止面包售价", 162, 48, 11)
	label("  超过 2 银币。”", 162, 62, 11)
	if elapsed > 0.8:
		rect(158, 70, 129, 22)
		label("bread.price <= 2", 164, 85, 10, PAPER)
		# Blinking compiler cursor.
		if int(elapsed * 4.0) % 2 == 0:
			rect(278, 76, 3, 10, PAPER)
	# A small causal warning is visible but deliberately not explained yet.
	if elapsed > 1.25:
		label("世界规则已改变", 169, 98, 9)

func _draw_quill() -> void:
	var tip := Vector2(105, 105)
	var sway := sin(elapsed * 5.0) * 2.0
	pixel_line(tip, Vector2(137 + sway, 72), 3)
	pixel_line(Vector2(116, 94), Vector2(139 + sway, 72), 1)
	pixel_line(Vector2(120, 88), Vector2(140 + sway, 72), 1)
	rect(93, 106, 46, 3)
	for x in range(96, 137, 5):
		rect(x, 103, 3, 1)

func _draw_stamp(progress: float) -> void:
	var stamp_y := lerpf(58.0, 94.0, progress)
	rect(260, stamp_y, 14, 21)
	rect(255, stamp_y + 18, 24, 6)
	if progress >= 0.98:
		outline(239, 93, 54, 22, 2)
		label("生效", 251, 108, 12)

