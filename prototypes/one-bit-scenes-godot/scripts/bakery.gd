extends "res://scripts/scene_base.gd"

func _draw() -> void:
	rect(0, 0, 320, 180, PAPER)
	_draw_bakery_interior()
	_draw_oven()
	# A real close-up: the baker occupies roughly 17% of frame width.
	draw_person(Vector2(68, 137), "baker", 1 if elapsed > 1.4 else 0, false, 1.95)
	_draw_cost_cards()
	if elapsed > 1.6:
		_draw_stop_mark()

func _draw_bakery_interior() -> void:
	# Brick wall and ceiling beams.
	rect(0, 16, 320, 7)
	for y in range(28, 118, 9):
		var offset := 0 if int(y / 9) % 2 == 0 else 8
		for x in range(-8 + offset, 320, 24):
			outline(x, y, 23, 8)
	# Foreground preparation table.
	rect(102, 101, 111, 7)
	outline(97, 108, 121, 18, 2)
	rect(106, 109, 5, 17)
	rect(203, 109, 5, 17)
	for x in [116, 135, 154, 173]:
		draw_bread(Vector2(x, 92), 0.8)
	# Flour sacks are large enough to read as objects rather than icons.
	draw_sack(Vector2(5, 103), "麦")
	draw_sack(Vector2(25, 106), "粉")

func _draw_cost_cards() -> void:
	panel(100, 27, 108, 28, "成本")
	label("小麦 1.7", 108, 47, 11)
	label("+", 169, 47, 11)
	panel(215, 27, 90, 28, "售价")
	label("法定 2.0", 225, 47, 11)
	if elapsed > 0.85:
		panel(123, 62, 153, 25, "每个面包")
		label("1.7 + 0.5 - 2.0 =", 131, 79, 10)
		label("-0.2", 247, 79, 11)

func _draw_oven() -> void:
	# Large domed oven on the right.
	rect(229, 67, 86, 61)
	rect(236, 72, 72, 56, PAPER)
	for i in range(7):
		rect(236 + i * 3, 71 - i * 2, 72 - i * 6, 3)
	rect(250, 92, 44, 36)
	rect(256, 99, 32, 29, PAPER)
	if elapsed < 1.6:
		# Flickering furnace flame.
		var flicker := int(elapsed * 8.0) % 3
		rect(267, 109 - flicker, 10, 15 + flicker)
		rect(263, 116, 18, 8)
		rect(270, 112, 4, 10, PAPER)
		draw_smoke(Vector2(302, 51), 0.0)
	else:
		outline(263, 111, 20, 12)
		pixel_line(Vector2(263, 111), Vector2(283, 123), 2)
		pixel_line(Vector2(283, 111), Vector2(263, 123), 2)
	label("燃料 0.5", 244, 89, 9)

func _draw_stop_mark() -> void:
	rect(176, 91, 38, 3)
	label("停炉", 180, 104, 10)
	if int(elapsed * 5.0) % 2 == 0:
		rect(211, 89, 4, 7)
