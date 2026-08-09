extends "res://scripts/scene_base.gd"

func _draw() -> void:
	rect(0, 0, 320, 180, PAPER)
	_draw_sky()
	_draw_buildings()
	_draw_street()
	_draw_stall()

	# The actors are deliberately foreground-sized: about 9% of frame width.
	draw_person(Vector2(118, 141), "merchant", 1 if elapsed > 1.1 else 0, false, 1.05)
	draw_person(Vector2(204, 141), "worker", 1 if elapsed > 0.8 else 0, true, 1.05)
	if elapsed < 1.4:
		draw_bread(Vector2(157, 105), 1.0)
	else:
		var bread_x := lerpf(157.0, 186.0, clampf((elapsed - 1.4) * 1.8, 0.0, 1.0))
		draw_bread(Vector2(bread_x, 105), 1.0)
	if elapsed > 0.65:
		var coin_x := lerpf(191.0, 151.0, clampf((elapsed - 0.65) * 1.4, 0.0, 1.0))
		draw_coin(Vector2(coin_x, 91), "4")

func _draw_sky() -> void:
	for x in range(12, 310, 19):
		if int(x / 19) % 2 == 0:
			rect(x, 24 + (int(x / 19) % 3) * 5, 1, 1)
	# Smoke gives the otherwise static skyline some life.
	draw_smoke(Vector2(36, 42), 0.0)
	draw_smoke(Vector2(285, 35), 5.0)

func _draw_buildings() -> void:
	# Left row.
	rect(0, 53, 89, 79)
	rect(5, 58, 78, 69, PAPER)
	for floor_y in [65, 83, 101]:
		for window_x in [13, 35, 62]:
			outline(window_x, floor_y, 13, 10)
			rect(window_x + 6, floor_y + 1, 1, 8)
			rect(window_x + 1, floor_y + 5, 11, 1)
	rect(6, 47, 75, 7)
	for x in range(8, 81, 6):
		rect(x, 47, 3, 7, PAPER if int(x / 6) % 2 == 0 else INK)
	rect(28, 36, 9, 17)
	# Right shop and stepped roof.
	rect(234, 46, 86, 87)
	rect(240, 53, 75, 74, PAPER)
	for i in range(4):
		rect(240 + i * 4, 49 - i * 3, 75 - i * 8, 3)
	outline(248, 64, 24, 34)
	outline(279, 64, 24, 34)
	for x in [254, 261, 285, 292]:
		rect(x, 66, 1, 30)
	rect(237, 103, 80, 7)
	for x in range(239, 315, 8):
		rect(x, 104, 4, 5, PAPER)
	label("面包", 263, 120, 11)
	# Narrow middle-distance houses frame the encounter.
	for x in range(91, 234, 29):
		var top := 63 + (int(x / 29) % 3) * 5
		outline(x, top, 25, 62)
		pixel_line(Vector2(x, top), Vector2(x + 12, top - 12))
		pixel_line(Vector2(x + 12, top - 12), Vector2(x + 25, top))
		outline(x + 7, top + 11, 10, 13)
		outline(x + 8, top + 39, 9, 23)

func _draw_street() -> void:
	rect(0, 126, 320, 17, PAPER)
	rect(0, 126, 320, 2)
	for y in range(130, 143, 5):
		for x in range((y % 10) - 4, 320, 14):
			pixel_line(Vector2(x, y), Vector2(x + 8, y))
			pixel_line(Vector2(x + 8, y), Vector2(x + 11, y + 3))

func _draw_stall() -> void:
	rect(145, 86, 39, 4)
	pixel_line(Vector2(149, 90), Vector2(149, 127), 2)
	pixel_line(Vector2(180, 90), Vector2(180, 127), 2)
	rect(143, 111, 43, 5)
	for x in range(146, 182, 9):
		draw_bread(Vector2(x, 102), 0.55)
	rect(141, 83, 47, 4)
	for x in range(143, 188, 8):
		rect(x, 84, 4, 3, PAPER)
