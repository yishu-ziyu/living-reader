extends Node2D

const PAPER := Color("f6f1df")
const INK := Color("151515")
const MID := Color("77736a")

var font: Font
var elapsed := 0.0

func _ready() -> void:
	font = load("res://assets/fonts/fusion-pixel-12px-monospaced-zh_hans.ttf")
	queue_redraw()

func _process(delta: float) -> void:
	elapsed += delta
	queue_redraw()

func rect(x: float, y: float, w: float, h: float, color: Color = INK) -> void:
	draw_rect(Rect2(round(x), round(y), round(w), round(h)), color)

func outline(x: float, y: float, w: float, h: float, thickness: float = 1.0) -> void:
	draw_rect(Rect2(round(x), round(y), round(w), round(h)), INK, false, thickness)

func pixel_line(a: Vector2, b: Vector2, thickness: float = 1.0, color: Color = INK) -> void:
	draw_line(a.round(), b.round(), color, thickness, false)

func label(text_value: String, x: float, y: float, size: int = 12, color: Color = INK) -> void:
	draw_string(font, Vector2(round(x), round(y)), text_value, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func centered(text_value: String, y: float, size: int = 12, color: Color = INK) -> void:
	var width := font.get_string_size(text_value, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	label(text_value, (320.0 - width) * 0.5, y, size, color)

func panel(x: float, y: float, w: float, h: float, title: String = "") -> void:
	rect(x, y, w, h, PAPER)
	outline(x, y, w, h, 2.0)
	rect(x + 3, y + 3, w - 6, 1)
	if title != "":
		rect(x + 6, y - 3, font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 8, 9, PAPER)
		outline(x + 6, y - 3, font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 8, 9)
		label(title, x + 10, y + 5, 10)

func dither_area(area: Rect2, density: int = 2, invert: bool = false) -> void:
	var matrix := [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
	var threshold := clampi(density * 2, 1, 15)
	for yy in range(int(area.position.y), int(area.end.y), 2):
		for xx in range(int(area.position.x), int(area.end.x), 2):
			var hit: bool = matrix[int(yy / 2) % 4][int(xx / 2) % 4] < threshold
			if invert:
				hit = not hit
			if hit:
				rect(xx, yy, 1, 1)

func draw_bread(pos: Vector2, scale_value: float = 1.0, sold: bool = false) -> void:
	var x: float = round(pos.x)
	var y: float = round(pos.y)
	if sold:
		outline(x, y, 14 * scale_value, 6 * scale_value)
		pixel_line(Vector2(x, y), Vector2(x + 14 * scale_value, y + 6 * scale_value))
		return
	rect(x + 2 * scale_value, y, 10 * scale_value, 2 * scale_value)
	rect(x, y + 2 * scale_value, 14 * scale_value, 5 * scale_value)
	rect(x + 2 * scale_value, y + 7 * scale_value, 10 * scale_value, 2 * scale_value)
	for i in range(3):
		rect(x + (3 + i * 4) * scale_value, y + 1 * scale_value, scale_value, 4 * scale_value, PAPER)

func draw_coin(pos: Vector2, amount: String = "4") -> void:
	rect(pos.x + 2, pos.y, 8, 1)
	rect(pos.x, pos.y + 2, 12, 8)
	rect(pos.x + 2, pos.y + 10, 8, 1)
	rect(pos.x + 2, pos.y + 2, 8, 7, PAPER)
	label(amount, pos.x + 3, pos.y + 9, 8)

func draw_person(pos: Vector2, role: String = "worker", pose: int = 0, flip: bool = false, scale_value: float = 1.0) -> void:
	var sx: float = -1.0 if flip else 1.0
	var x: float = round(pos.x)
	var y: float = round(pos.y)
	var bob: float = round(sin(elapsed * 4.0 + x) * 0.5)
	var head_w: float = 12.0 * scale_value
	var head_h: float = 11.0 * scale_value
	var body_w: float = 17.0 * scale_value
	var body_h: float = 20.0 * scale_value
	var edge: float = max(1.0, round(scale_value))
	# Legs and shoes. White cores keep the silhouette from turning into a block.
	rect(x - 7 * scale_value, y - 12 * scale_value, 5 * scale_value, 11 * scale_value)
	rect(x + 2 * scale_value, y - 12 * scale_value, 5 * scale_value, 11 * scale_value)
	rect(x - 7 * scale_value + edge, y - 11 * scale_value, max(1.0, 5 * scale_value - edge * 2), 8 * scale_value, PAPER)
	rect(x + 2 * scale_value + edge, y - 11 * scale_value, max(1.0, 5 * scale_value - edge * 2), 8 * scale_value, PAPER)
	rect(x - 9 * scale_value, y - 2 * scale_value, 7 * scale_value, 2 * scale_value)
	rect(x + 2 * scale_value, y - 2 * scale_value, 8 * scale_value, 2 * scale_value)
	# Coat/body: an outlined garment with role-specific interior detail.
	rect(x - body_w * 0.5, y - 31 * scale_value + bob, body_w, body_h)
	rect(x - body_w * 0.5 + edge, y - 29 * scale_value + bob, body_w - edge * 2, body_h - 3 * scale_value, PAPER)
	if role == "baker":
		rect(x - 5 * scale_value, y - 28 * scale_value + bob, 10 * scale_value, 15 * scale_value, PAPER)
		outline(x - 5 * scale_value, y - 28 * scale_value + bob, 10 * scale_value, 15 * scale_value, edge)
		pixel_line(Vector2(x - 5 * scale_value, y - 25 * scale_value + bob), Vector2(x - 8 * scale_value, y - 29 * scale_value + bob), edge)
		pixel_line(Vector2(x + 5 * scale_value, y - 25 * scale_value + bob), Vector2(x + 8 * scale_value, y - 29 * scale_value + bob), edge)
	elif role == "clerk":
		pixel_line(Vector2(x, y - 29 * scale_value + bob), Vector2(x, y - 13 * scale_value + bob), edge)
		pixel_line(Vector2(x, y - 24 * scale_value + bob), Vector2(x - 5 * scale_value, y - 29 * scale_value + bob), edge)
	else:
		pixel_line(Vector2(x - 6 * scale_value, y - 27 * scale_value + bob), Vector2(x, y - 20 * scale_value + bob), edge)
		pixel_line(Vector2(x + 6 * scale_value, y - 27 * scale_value + bob), Vector2(x, y - 20 * scale_value + bob), edge)
		pixel_line(Vector2(x, y - 20 * scale_value + bob), Vector2(x, y - 12 * scale_value + bob), edge)
	# Arms, with a simple pose offset.
	var arm_shift: float = -4.0 * scale_value if pose == 1 else 0.0
	rect(x - 13 * scale_value, y - 29 * scale_value + bob + arm_shift, 5 * scale_value, 15 * scale_value)
	rect(x + 8 * scale_value, y - 29 * scale_value + bob - arm_shift, 5 * scale_value, 15 * scale_value)
	rect(x - 13 * scale_value + edge, y - 27 * scale_value + bob + arm_shift, max(1.0, 5 * scale_value - edge * 2), 10 * scale_value, PAPER)
	rect(x + 8 * scale_value + edge, y - 27 * scale_value + bob - arm_shift, max(1.0, 5 * scale_value - edge * 2), 10 * scale_value, PAPER)
	rect(x - 13 * scale_value, y - 15 * scale_value + bob + arm_shift, 5 * scale_value, 3 * scale_value)
	rect(x + 8 * scale_value, y - 15 * scale_value + bob - arm_shift, 5 * scale_value, 3 * scale_value)
	# Head and face.
	rect(x - head_w * 0.5, y - 43 * scale_value + bob, head_w, head_h)
	rect(x - 4.5 * scale_value, y - 41 * scale_value + bob, 9 * scale_value, 7 * scale_value, PAPER)
	var eye_x: float = x + (2 * sx - 1) * scale_value
	rect(eye_x, y - 38 * scale_value + bob, 1 * scale_value, 1 * scale_value)
	rect(x + 4 * sx * scale_value, y - 36 * scale_value + bob, 2 * scale_value, 1 * scale_value)
	rect(x - 2 * scale_value, y - 34 * scale_value + bob, 5 * scale_value, 1 * scale_value)
	# Role silhouettes.
	if role == "baker":
		rect(x - 8 * scale_value, y - 48 * scale_value + bob, 16 * scale_value, 5 * scale_value)
		rect(x - 5 * scale_value, y - 52 * scale_value + bob, 10 * scale_value, 4 * scale_value)
		rect(x - 3 * scale_value, y - 51 * scale_value + bob, 6 * scale_value, 2 * scale_value, PAPER)
	elif role == "merchant":
		rect(x - 9 * scale_value, y - 46 * scale_value + bob, 18 * scale_value, 3 * scale_value)
		rect(x - 6 * scale_value, y - 51 * scale_value + bob, 12 * scale_value, 5 * scale_value)
		rect(x - 4 * scale_value, y - 50 * scale_value + bob, 8 * scale_value, 3 * scale_value, PAPER)
	elif role == "clerk":
		rect(x - 7 * scale_value, y - 46 * scale_value + bob, 14 * scale_value, 3 * scale_value)
		rect(x - 5 * scale_value, y - 49 * scale_value + bob, 10 * scale_value, 3 * scale_value)

func draw_sack(pos: Vector2, text_value: String = "麦") -> void:
	rect(pos.x + 3, pos.y, 12, 2)
	rect(pos.x + 1, pos.y + 2, 16, 3)
	rect(pos.x, pos.y + 5, 18, 17)
	rect(pos.x + 2, pos.y + 7, 14, 13, PAPER)
	label(text_value, pos.x + 5, pos.y + 18, 10)

func draw_smoke(pos: Vector2, phase_offset: float = 0.0) -> void:
	var drift: float = fmod(elapsed * 7.0 + phase_offset, 12.0)
	rect(pos.x + drift * 0.3, pos.y - drift, 4, 3)
	rect(pos.x + 3 + drift * 0.2, pos.y - 7 - drift, 6, 4)
