extends Node2D

const SCENES := [
	preload("res://scenes/street.tscn"),
	preload("res://scenes/decree.tscn"),
	preload("res://scenes/bakery.tscn"),
	preload("res://scenes/market.tscn"),
]
const DURATIONS := [2.7, 2.9, 3.5, 3.8]

enum Mode { TITLE, PLAYING, RESULT }

var mode := Mode.TITLE
var scene_index := -1
var scene_time := 0.0
var transition_active := false
var transition_time := 0.0
var transition_swapped := false
var result_time := 0.0
var current_scene: Node

@onready var overlay := $Overlay

func _ready() -> void:
	set_process(true)

func _process(delta: float) -> void:
	if mode == Mode.PLAYING:
		if transition_active:
			transition_time += delta
			if transition_time >= 0.38 and not transition_swapped:
				transition_swapped = true
				_load_scene(scene_index + 1)
			if transition_time >= 0.76:
				transition_active = false
				transition_time = 0.0
				transition_swapped = false
		else:
			scene_time += delta
			if scene_index >= 0 and scene_time >= DURATIONS[scene_index]:
				if scene_index == SCENES.size() - 1:
					mode = Mode.RESULT
					result_time = 0.0
				else:
					_begin_transition()
	elif mode == Mode.RESULT:
		result_time += delta
	overlay.queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_handle_action()
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_R:
			_reset_to_title()
		elif event.keycode in [KEY_SPACE, KEY_ENTER]:
			_handle_action()

func _handle_action() -> void:
	if mode == Mode.TITLE:
		mode = Mode.PLAYING
		_load_scene(0)
	elif mode == Mode.PLAYING and not transition_active:
		if scene_index == SCENES.size() - 1:
			mode = Mode.RESULT
			result_time = 0.0
		else:
			_begin_transition()
	elif mode == Mode.RESULT:
		_reset_to_title()

func _begin_transition() -> void:
	transition_active = true
	transition_time = 0.0
	transition_swapped = false

func _load_scene(index: int) -> void:
	if current_scene != null:
		current_scene.queue_free()
	current_scene = SCENES[index].instantiate()
	add_child(current_scene)
	move_child(current_scene, 0)
	scene_index = index
	scene_time = 0.0

func _reset_to_title() -> void:
	if current_scene != null:
		current_scene.queue_free()
		current_scene = null
	mode = Mode.TITLE
	scene_index = -1
	scene_time = 0.0
	transition_active = false
	result_time = 0.0

