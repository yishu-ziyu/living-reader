extends Node2D

const PAPER := Color("f6f1df")
const INK := Color("151515")
const RED := Color("9b1d20")

var font: Font

func _ready() -> void:
	font = load("res://assets/fonts/fusion-pixel-12px-monospaced-zh_hans.ttf")
	z_index = 100
	queue_redraw()

func _draw() -> void:
	var main = get_parent()
	if main.mode == main.Mode.TITLE:
		_draw_title()
		return

	_draw_stage_hud(main.scene_index)
	if main.mode == main.Mode.RESULT:
		_draw_result(main.result_time)
	else:
		_draw_log(main.scene_index, main.scene_time)
	if main.transition_active:
		_draw_transition(main.transition_time)

func rect(x: float, y: float, w: float, h: float, color: Color = INK) -> void:
	draw_rect(Rect2(round(x), round(y), round(w), round(h)), color)

func outline(x: float, y: float, w: float, h: float, thickness := 1.0, color: Color = INK) -> void:
	draw_rect(Rect2(round(x), round(y), round(w), round(h)), color, false, thickness)

func label(text_value: String, x: float, y: float, size := 12, color: Color = INK) -> void:
	draw_string(font, Vector2(round(x), round(y)), text_value, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func centered(text_value: String, y: float, size := 12, color: Color = INK) -> void:
	var width := font.get_string_size(text_value, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	label(text_value, (320.0 - width) * 0.5, y, size, color)

func _draw_title() -> void:
	rect(0, 0, 320, 180, PAPER)
	# Dense city silhouette to make the title feel like a game cartridge screen.
	for x in range(0, 320, 16):
		var h := 18 + (int(x / 16) % 4) * 6
		rect(x, 180 - h, 14, h)
		for wy in range(180 - h + 5, 176, 6):
			for wx in range(x + 3, x + 12, 5):
				rect(wx, wy, 2, 2, PAPER)
	for x in range(0, 320, 4):
		if int(x / 4) % 3 == 0:
			rect(x, 22 + (int(x / 4) % 5) * 2, 1, 1)
	centered("EXECUTABLE BOOK  /  01", 22, 10)
	centered("看不见的手", 62, 28)
	centered("一条法令，如何掏空面包架", 82, 12)
	outline(92, 101, 136, 28, 2)
	rect(96, 105, 128, 20)
	centered("开始演示  ▶", 120, 12, PAPER)
	centered("点击推进场景 · R 返回", 143, 10)

func _draw_stage_hud(index: int) -> void:
	var names := ["街口", "法令室", "面包房", "市场"]
	rect(0, 0, 320, 15, PAPER)
	rect(0, 14, 320, 2)
	label("0%d  %s" % [index + 1, names[index]], 7, 11, 10)
	label("看不见的手", 123, 11, 10)
	label("第 %d / 4 场" % [index + 1], 258, 11, 10)

func _draw_log(index: int, time_value: float) -> void:
	var ys := [143.0, 132.0, 136.0, 130.0]
	var hs := [31.0, 42.0, 38.0, 44.0]
	var lines := [
		["面包师：今天还是 4 银币。", "交易成立。面包架剩余 11 个。"],
		["你：面包不得高于 2 银币。", "规则已写入：bread.price ≤ 2"],
		["成本核算：小麦 1.7 + 燃料 0.5", "面包师：每卖一个，我亏 0.2。"],
		["货架：0　队伍：7　暗巷价：6", "居民：法定价格很低，但买不到。"],
	]
	var y: float = ys[index]
	rect(5, y, 310, hs[index], PAPER)
	outline(5, y, 310, hs[index], 2)
	rect(9, y - 3, 52, 9, PAPER)
	outline(9, y - 3, 52, 9)
	label("世界日志", 15, y + 5, 9)
	label(lines[index][0], 12, y + 17, 10)
	if time_value > 1.1:
		label(lines[index][1], 12, y + 29, 10)

func _draw_transition(t: float) -> void:
	var half := 0.38
	var edge_width := 18
	if t <= half:
		var progress := clampf(t / half, 0.0, 1.0)
		var edge_x := int(progress * 338.0) - edge_width
		rect(0, 0, max(0, edge_x), 180)
		_draw_bayer_edge(edge_x, edge_width, true)
	else:
		var progress := clampf((t - half) / half, 0.0, 1.0)
		var edge_x := int(progress * 338.0) - edge_width
		rect(edge_x + edge_width, 0, 320 - edge_x, 180)
		_draw_bayer_edge(edge_x, edge_width, false)

func _draw_bayer_edge(edge_x: int, width: int, filling: bool) -> void:
	var matrix := [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
	for y in range(0, 180, 2):
		for x in range(max(0, edge_x), min(320, edge_x + width), 2):
			var local := float(x - edge_x) / float(width)
			var threshold := local * 16.0
			var value: int = matrix[int(y / 2) % 4][int(x / 2) % 4]
			var hit := value > threshold if filling else value < threshold
			if hit:
				rect(x, y, 2, 2)

func _draw_result(t: float) -> void:
	# The old log grows into the final evidence window instead of being replaced.
	var grow := clampf(t / 0.45, 0.0, 1.0)
	var top := lerpf(130.0, 26.0, grow)
	rect(5, top, 310, 148 - top, PAPER)
	outline(5, top, 310, 148 - top, 2)
	if t > 0.35:
		centered("法令执行完毕", top + 18, 15)
		label("你压低了价格，但没有压低成本。", 34, top + 34, 11)
	if t > 0.8:
		_draw_cause_box(16, top + 45, 60, "限价 2")
		_draw_arrow(78, top + 55, 18)
		_draw_cause_box(99, top + 45, 60, "亏损 0.2")
	if t > 1.2:
		_draw_arrow(161, top + 55, 18)
		_draw_cause_box(182, top + 45, 54, "停炉")
		_draw_arrow(238, top + 55, 18)
		_draw_cause_box(259, top + 45, 45, "短缺")
	if t > 1.7:
		centered("价格不是数字。它是一条让人行动的信号。", top + 84, 11, RED)
		rect(94, top + 96, 132, 22)
		centered("重新运行  ↻", top + 111, 11, PAPER)
		centered("点击回到起点", 166, 9)

func _draw_cause_box(x: float, y: float, w: float, text_value: String) -> void:
	rect(x, y, w, 20, PAPER)
	outline(x, y, w, 20, 1)
	var width := font.get_string_size(text_value, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
	label(text_value, x + (w - width) * 0.5, y + 14, 10)

func _draw_arrow(x: float, y: float, w: float) -> void:
	rect(x, y, w - 4, 1)
	rect(x + w - 5, y - 2, 1, 5)
	rect(x + w - 3, y - 1, 1, 3)
	rect(x + w - 1, y, 1, 1)
