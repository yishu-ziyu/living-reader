extends "res://scripts/scene_base.gd"

func _draw() -> void:
	rect(0, 0, 320, 180, PAPER)
	_draw_market_front()
	_draw_alley()
	_draw_queue()
	if elapsed > 1.0:
		_draw_resale_exchange()

func _draw_market_front() -> void:
	# Main market occupies two thirds of the frame.
	rect(0, 18, 218, 8)
	for x in range(4, 214, 21):
		pixel_line(Vector2(x, 26), Vector2(x - 14, 63))
	# Empty shelf: an observable consequence, not a number on a dashboard.
	outline(9, 43, 85, 67, 2)
	for y in [62, 82, 102]:
		rect(13, y, 77, 3)
		for x in range(16, 87, 12):
			pixel_line(Vector2(x, y - 4), Vector2(x + 5, y - 1))
	label("面包售罄", 22, 38, 11)
	panel(103, 29, 103, 27, "官方摊位")
	label("库存  0", 114, 49, 11)
	# Hanging price board.
	pixel_line(Vector2(61, 26), Vector2(61, 33))
	pixel_line(Vector2(94, 26), Vector2(94, 33))
	rect(53, 32, 50, 18)
	label("2 银币", 61, 45, 10, PAPER)

func _draw_queue() -> void:
	var shift := -1.0 if int(elapsed * 2.0) % 2 == 0 else 0.0
	draw_person(Vector2(112 + shift, 129), "worker", 0, true, 0.93)
	draw_person(Vector2(145 + shift, 129), "merchant", 0, true, 0.93)
	draw_person(Vector2(179 + shift, 129), "worker", 1 if elapsed > 1.6 else 0, true, 0.93)
	# Queue marks extend out of frame, implying more residents.
	for x in [116, 149, 182]:
		rect(x, 124, 19, 2)
	label("队伍 ×7", 132, 70, 10)

func _draw_alley() -> void:
	# A split stage: the hidden market is literally behind a black partition.
	rect(220, 16, 100, 114)
	for y in range(24, 128, 7):
		for x in range(226 + (y % 3), 316, 12):
			rect(x, y, 2, 1, PAPER)
	rect(220, 16, 3, 114, PAPER)
	label("暗巷", 255, 31, 12, PAPER)
	draw_rect(Rect2(238, 39, 67, 24), PAPER, false, 1.0)
	label("面包 6", 248, 56, 11, PAPER)
	# Seller silhouette with white face cutout.
	rect(258, 78, 29, 45, PAPER)
	rect(263, 83, 19, 35, INK)
	rect(266, 69, 14, 13, PAPER)
	rect(268, 72, 10, 8, INK)
	rect(274, 75, 1, 1, PAPER)
	rect(253, 66, 38, 4, PAPER)
	rect(261, 62, 22, 4, PAPER)

func _draw_resale_exchange() -> void:
	var travel := clampf((elapsed - 1.0) * 1.2, 0.0, 1.0)
	var x := lerpf(232.0, 247.0, travel)
	# Bread remains readable against the alley by inverting its plate.
	rect(x - 2, 93, 19, 13, PAPER)
	rect(x + 2, 96, 11, 6)
	if elapsed > 1.8:
		label("有价，无货", 231, 121, 10, PAPER)
