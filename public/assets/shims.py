"""Browser shims for ``turtle``, ``tkinter`` and ``pygame``.

Loaded once into the Pyodide interpreter by ``assets/worker.js``.  Nothing in
here touches the DOM: drawing commands and widget trees are serialised to JSON
and posted to the main thread, which owns the real canvas / preview panel.
That is what lets user code run inside a Web Worker (so a runaway loop can be
killed without freezing the page).

Protocol
--------
``ideBridge.emit(kind, json_payload)``
    kind ``"canvas"``   -> one drawing operation for the canvas panel
    kind ``"tk"``       -> a complete tkinter window tree to render
    kind ``"timer"``    -> ask the main thread to fire ``after()`` callbacks

``ideBridge.stdin()``
    Returns the next queued stdin line, or ``null`` when the queue is empty.
"""

import builtins
import json
import math
import sys
import time as _time
import types

from js import ideBridge


# ---------------------------------------------------------------------------
# shared helpers
# ---------------------------------------------------------------------------

def _emit(kind, payload):
    ideBridge.emit(kind, json.dumps(payload, default=str))


def _css_color(value):
    """Best-effort conversion of a turtle/tk/pygame colour to CSS."""
    if value is None:
        return None
    if isinstance(value, (tuple, list)):
        parts = list(value)
        if len(parts) == 1:
            # greyscale shorthand used by some pygame code
            return "rgb(%d,%d,%d)" % ((int(parts[0]),) * 3)
        if len(parts) == 3:
            return "rgb(%d,%d,%d)" % tuple(int(max(0, min(255, v))) for v in parts)
        if len(parts) >= 4:
            alpha = float(parts[3])
            if alpha > 1:
                alpha /= 255.0
            return "rgba(%d,%d,%d,%.3f)" % (
                int(max(0, min(255, parts[0]))),
                int(max(0, min(255, parts[1]))),
                int(max(0, min(255, parts[2]))),
                alpha,
            )
    return str(value)


def _num(value, default=0):
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return value
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_font(font):
    """Normalise a Tk font description into a small JSON-friendly dict."""
    family, size, style = None, 12, ""
    if isinstance(font, str):
        bits = [b for b in font.split() if b]
        styles = {"bold", "italic", "normal", "underline", "overstrike", "roman"}
        core = [b for b in bits if b.lower() not in styles]
        style = " ".join(b.lower() for b in bits if b.lower() in styles)
        if core:
            if core[-1].lstrip("-").isdigit():
                size = int(core[-1])
                family = " ".join(core[:-1]) or None
            else:
                family = " ".join(core)
    elif isinstance(font, (tuple, list)):
        if font and font[0]:
            family = str(font[0])
        for item in font[1:]:
            text = str(item)
            if text.lstrip("-").isdigit():
                size = int(text)
            else:
                style += " " + text.lower()
    size = max(6, min(72, int(size)))
    return {
        "family": family or "Segoe UI, system-ui, sans-serif",
        "size": size,
        "bold": "bold" in style,
        "italic": "italic" in style,
        "underline": "underline" in style,
    }


# ===========================================================================
# turtle
# ===========================================================================

_CANVAS_W = 720
_CANVAS_H = 480
_canvas_ready = False
_canvas_bg = "#0f1524"
_screen = None


def _canvas_init(force=False):
    global _canvas_ready
    if _canvas_ready and not force:
        return
    _canvas_ready = True
    _emit("canvas", {
        "op": "init",
        "width": _CANVAS_W,
        "height": _CANVAS_H,
        "bg": _canvas_bg,
    })


def _resize_canvas(width=None, height=None):
    global _CANVAS_W, _CANVAS_H

    def dimension(value, current, base):
        if value is None:
            return current
        number = _num(value, current)
        if number <= 0:
            return current
        if number <= 1:
            number = round(base * number)
        return max(1, min(1600, int(number)))

    next_width = dimension(width, _CANVAS_W, 720)
    next_height = dimension(height, _CANVAS_H, 480)
    if (next_width, next_height) != (_CANVAS_W, _CANVAS_H):
        _CANVAS_W, _CANVAS_H = next_width, next_height
        _canvas_init(force=True)


def _sx(x):
    return _CANVAS_W / 2.0 + x


def _sy(y):
    return _CANVAS_H / 2.0 - y


class Turtle:
    """A pragmatic re-implementation of the stdlib ``turtle`` module."""

    def __init__(self, screen=None):
        self._x = 0.0
        self._y = 0.0
        self._heading = 0.0
        self._down = True
        self._pencolor = "#e8eefc"
        self._fillcolor = "#e8eefc"
        self._pensize = 2.0
        self._filling = False
        self._fill_points = []
        self._visible = True
        self._speed = 3
        self._shape = "classic"
        self._shape_size = (1.0, 1.0)
        self._stamp_count = 0
        _canvas_init()
        self._emit_cursor()

    # -- helpers ----------------------------------------------------------
    def _emit_cursor(self):
        _emit("canvas", {
            "op": "turtle",
            "visible": self._visible,
            "x": _sx(self._x),
            "y": _sy(self._y),
            "heading": self._heading,
            "shape": self._shape,
            "scale": list(self._shape_size),
            "fill": _css_color(self._fillcolor),
            "color": _css_color(self._pencolor),
            "width": self._pensize,
        })

    def _move_to(self, nx, ny):
        x1, y1 = _sx(self._x), _sy(self._y)
        x2, y2 = _sx(nx), _sy(ny)
        if self._down:
            _emit("canvas", {
                "op": "line",
                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                "color": _css_color(self._pencolor),
                "width": self._pensize,
            })
            if self._filling:
                self._fill_points.append((x2, y2))
        self._x, self._y = nx, ny
        self._emit_cursor()

    # -- movement ---------------------------------------------------------
    def forward(self, distance):
        rad = math.radians(self._heading)
        self._move_to(self._x + distance * math.cos(rad),
                      self._y + distance * math.sin(rad))

    fd = forward

    def backward(self, distance):
        self.forward(-distance)

    bk = back = backward

    def right(self, angle):
        self._heading = (self._heading - angle) % 360
        self._emit_cursor()

    rt = right

    def left(self, angle):
        self._heading = (self._heading + angle) % 360
        self._emit_cursor()

    lt = left

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._move_to(float(x), float(y))

    setpos = setposition = goto

    def setx(self, x):
        self._move_to(float(x), self._y)

    def sety(self, y):
        self._move_to(self._x, float(y))

    def setheading(self, angle):
        self._heading = float(angle) % 360

    seth = setheading

    def home(self):
        self._move_to(0.0, 0.0)
        self._heading = 0.0

    # -- state ------------------------------------------------------------
    def position(self):
        return (self._x, self._y)

    pos = position

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return self._heading

    def towards(self, x, y=None):
        if y is None:
            x, y = x
        return math.degrees(math.atan2(float(y) - self._y, float(x) - self._x)) % 360

    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(float(x) - self._x, float(y) - self._y)

    # -- pen --------------------------------------------------------------
    def penup(self):
        self._down = False
        self._emit_cursor()

    pu = up = penup

    def pendown(self):
        self._down = True
        self._emit_cursor()

    pd = down = pendown

    def isdown(self):
        return self._down

    def pensize(self, width=None):
        if width is None:
            return self._pensize
        self._pensize = max(0.1, float(width))

    width = pensize

    def pencolor(self, *args):
        if not args:
            return self._pencolor
        self._pencolor = _css_color(args[0] if len(args) == 1 else args)
        return self._pencolor

    def fillcolor(self, *args):
        if not args:
            return self._fillcolor
        self._fillcolor = _css_color(args[0] if len(args) == 1 else args)
        return self._fillcolor

    def color(self, *args):
        if not args:
            return (self._pencolor, self._fillcolor)
        if len(args) == 1:
            value = _css_color(args[0])
            self._pencolor = self._fillcolor = value
        else:
            self._pencolor = _css_color(args[0])
            self._fillcolor = _css_color(args[1])
        return (self._pencolor, self._fillcolor)

    def begin_fill(self):
        self._filling = True
        self._fill_points = [(_sx(self._x), _sy(self._y))]

    def end_fill(self):
        if not self._filling:
            return
        self._filling = False
        points = self._fill_points
        self._fill_points = []
        if len(points) >= 3:
            _emit("canvas", {
                "op": "polygon",
                "points": [c for p in points for c in p],
                "fill": _css_color(self._fillcolor),
            })

    def filling(self):
        return self._filling

    def pen(self, *args, **kwargs):
        if not args and not kwargs:
            return {
                "pencolor": self._pencolor,
                "fillcolor": self._fillcolor,
                "pensize": self._pensize,
                "shown": self._visible,
                "speed": self._speed,
            }
        spec = args[0] if args else kwargs
        if isinstance(spec, dict):
            if "pencolor" in spec:
                self.pencolor(spec["pencolor"])
            if "fillcolor" in spec:
                self.fillcolor(spec["fillcolor"])
            if "pensize" in spec:
                self.pensize(spec["pensize"])
            if "shown" in spec:
                self._visible = bool(spec["shown"])
            if "speed" in spec:
                self._speed = spec["speed"]

    # -- shapes -----------------------------------------------------------
    def circle(self, radius, extent=None, steps=None):
        radius = float(radius)
        if radius == 0:
            return
        turn = 360.0 if extent is None else float(extent)
        r = abs(radius)
        count = int(steps) if steps else max(12, int(abs(turn) / 6) + 1)
        count = max(3, count)

        if radius > 0:
            center_angle = self._heading + 90
            start_angle = self._heading - 90
            delta = turn
        else:
            center_angle = self._heading - 90
            start_angle = self._heading + 90
            delta = -turn

        cx = self._x + r * math.cos(math.radians(center_angle))
        cy = self._y + r * math.sin(math.radians(center_angle))

        for i in range(1, count + 1):
            angle = start_angle + delta * i / count
            self._move_to(cx + r * math.cos(math.radians(angle)),
                          cy + r * math.sin(math.radians(angle)))
        self._heading = (self._heading + delta) % 360

    def dot(self, size=None, *color):
        radius = (float(size) / 2.0) if size else self._pensize + 2.0
        fill = _css_color(color[0]) if color else _css_color(self._pencolor)
        _emit("canvas", {
            "op": "dot",
            "x": _sx(self._x), "y": _sy(self._y),
            "r": radius, "color": fill,
        })

    def write(self, text, move=False, align="left", font=("Segoe UI", 12, "normal")):
        _canvas_init()
        spec = _parse_font(font)
        offset = {"left": 0, "center": 0, "right": 0}.get(str(align), 0)
        _emit("canvas", {
            "op": "text",
            "x": _sx(self._x) - offset,
            "y": _sy(self._y),
            "text": str(text),
            "color": _css_color(self._pencolor),
            "size": spec["size"],
            "family": spec["family"],
            "bold": spec["bold"],
            "italic": spec["italic"],
            "align": str(align),
        })
        return None

    def stamp(self):
        return None

    def shape(self, *args):
        return None

    shapesize = turtlesize = shape

    def hideturtle(self):
        self._visible = False

    ht = hideturtle

    def showturtle(self):
        self._visible = True

    st = showturtle

    def isvisible(self):
        return self._visible

    def speed(self, value=None):
        if value is None:
            return self._speed
        self._speed = value

    def delay(self, *args):
        return None

    def tracer(self, *args, **kwargs):
        return None

    def update(self):
        return None

    def clear(self):
        self._emit_clear()
        self._x = self._y = 0.0
        self._heading = 0.0
        self._filling = False
        self._fill_points = []

    def reset(self):
        self.clear()

    def _emit_clear(self):
        _canvas_init(force=True)

    # screen-ish helpers (turtle delegates to the screen in CPython)
    def bgcolor(self, *args):
        return _screen.bgcolor(*args) if _screen else None

    def bgpic(self, *args):
        return None

    def title(self, *args):
        return None

    def setup(self, *args, **kwargs):
        return None

    def screensize(self, *args, **kwargs):
        return None

    def window_width(self):
        return _CANVAS_W

    def window_height(self):
        return _CANVAS_H

    def onscreenclick(self, *args, **kwargs):
        return None

    onclick = onscreenclick

    def onkey(self, *args, **kwargs):
        return None

    def listen(self, *args, **kwargs):
        return None

    def mainloop(self):
        return None

    done = mainloop

    def bye(self):
        return None

    def exitonclick(self):
        return None


class Screen:
    """Stand-in for ``turtle.Screen()``."""

    def __init__(self):
        global _screen
        _screen = self
        _canvas_init()

    def bgcolor(self, *args):
        global _canvas_bg
        if not args:
            return _canvas_bg
        _canvas_bg = _css_color(args[0] if len(args) == 1 else args)
        _canvas_init(force=True)

    def title(self, *args):
        return None

    def setup(self, *args, **kwargs):
        return None

    def screensize(self, *args, **kwargs):
        return None

    def bgpic(self, *args):
        return None

    def tracer(self, *args, **kwargs):
        return None

    def update(self):
        return None

    def delay(self, *args):
        return None

    def listen(self, *args, **kwargs):
        return None

    def onkey(self, *args, **kwargs):
        return None

    def onclick(self, *args, **kwargs):
        return None

    def onscreenclick(self, *args, **kwargs):
        return None

    def mainloop(self):
        return None

    def done(self):
        return None

    def bye(self):
        return None

    def exitonclick(self):
        return None

    def colormode(self, *args):
        return None

    def register_shape(self, *args, **kwargs):
        return None


_default_turtle = None


def _t():
    global _default_turtle
    if _default_turtle is None:
        _default_turtle = Turtle()
    return _default_turtle


def _install_turtle():
    module = types.ModuleType("turtle")
    module.Turtle = Turtle
    module.Screen = Screen
    module.TurtleScreen = Screen
    module.RawTurtle = Turtle

    # ``from turtle import *`` style helpers operate on one shared turtle
    for name in (
        "forward", "fd", "backward", "bk", "back", "right", "rt", "left", "lt",
        "goto", "setpos", "setposition", "setx", "sety", "setheading", "seth",
        "home", "position", "pos", "xcor", "ycor", "heading", "towards",
        "distance", "penup", "pu", "up", "pendown", "pd", "down", "isdown",
        "pensize", "width", "pencolor", "fillcolor", "color", "begin_fill",
        "end_fill", "filling", "pen", "circle", "dot", "write", "hideturtle",
        "ht", "showturtle", "st", "isvisible", "speed", "clear", "reset",
        "stamp", "shape", "tracer", "update", "delay",
    ):
        setattr(module, name, (lambda n: lambda *a, **k: getattr(_t(), n)(*a, **k))(name))

    module.bgcolor = lambda *a, **k: (Screen() if _screen is None else _screen).bgcolor(*a, **k)
    module.title = lambda *a, **k: None
    module.setup = lambda *a, **k: None
    module.screensize = lambda *a, **k: None
    module.done = lambda: None
    module.mainloop = lambda: None
    module.bye = lambda: None
    module.exitonclick = lambda: None
    module.listen = lambda *a, **k: None
    module.onkey = lambda *a, **k: None
    module.onscreenclick = lambda *a, **k: None
    module.colormode = lambda *a, **k: None
    module.register_shape = lambda *a, **k: None
    sys.modules["turtle"] = module


# ===========================================================================
# tkinter
# ===========================================================================

_tk = {
    "seq": 0,
    "root": None,
    "widgets": {},
    "handlers": {},
    "vars": {},
    "dirty": False,
}

_ALIASES = {
    "background": "bg",
    "foreground": "fg",
    "from_": "from",
    "bd": "borderwidth",
    "relief": "relief",
    "activebackground": "activebackground",
    "activeforeground": "activeforeground",
    "selectbackground": "selectbackground",
    "selectforeground": "selectforeground",
    "highlightbackground": "highlightbackground",
    "highlightcolor": "highlightcolor",
    "disabledforeground": "disabledforeground",
}


def _next_id(prefix="w"):
    _tk["seq"] += 1
    return "%s%d" % (prefix, _tk["seq"])


def _tk_dirty():
    _tk["dirty"] = True


def _tk_flush():
    root = _tk.get("root")
    if root is None:
        return
    _tk["dirty"] = False
    _emit("tk", root._to_spec())


class Variable:
    _default = ""
    _coerce = str

    def __init__(self, master=None, value=None, name=None):
        self._id = _next_id("v")
        self._traces = []
        self._value = self._coerce(self._default if value is None else value)
        _tk["vars"][self._id] = self

    def get(self):
        return self._value

    def set(self, value):
        self._value = self._coerce(value)
        for callback in list(self._traces):
            try:
                callback(self._id, None, "write")
            except Exception:
                pass
        _tk_dirty()

    def trace_add(self, mode, callback):
        self._traces.append(callback)
        return "trace%d" % len(self._traces)

    def trace(self, mode, callback):
        return self.trace_add(mode, callback)

    def trace_remove(self, *args):
        return None

    def trace_variable(self, mode, callback):
        return self.trace_add(mode, callback)


class StringVar(Variable):
    _default = ""
    _coerce = str


class IntVar(Variable):
    _default = 0

    def _coerce(self, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0


class DoubleVar(Variable):
    _default = 0.0

    def _coerce(self, value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0


class BooleanVar(Variable):
    _default = False

    def _coerce(self, value):
        if isinstance(value, str):
            return value.lower() in ("1", "true", "yes", "on")
        return bool(value)


class Widget:
    kind = "frame"

    def __init__(self, master=None, **kw):
        self._id = _next_id()
        self._master = master
        self._children = []
        self._opts = {}
        self._layout = None
        self._handlers = {}
        _tk["widgets"][self._id] = self
        if isinstance(master, Widget):
            master._children.append(self)
        elif self.kind in ("tk", "toplevel"):
            _tk["root"] = self
        self.configure(**kw)

    # -- configuration ----------------------------------------------------
    def _register(self, fn):
        key = _next_id("h")
        _tk["handlers"][key] = fn
        return key

    def configure(self, **kw):
        for raw_key, value in kw.items():
            key = _ALIASES.get(raw_key, raw_key)
            if key == "command" and callable(value):
                value = self._register(value)
            elif key in ("textvariable", "variable") and isinstance(value, Variable):
                value = value._id
            elif key == "font":
                value = _parse_font(value)
            elif key in ("bg", "fg", "activebackground", "activeforeground",
                        "selectbackground", "selectforeground", "highlightbackground",
                        "highlightcolor", "disabledforeground", "troughcolor"):
                value = _css_color(value)
            elif key == "values":
                value = [str(v) for v in value]
            elif key in ("text", "title", "geometry", "show", "name"):
                value = str(value)
            elif key in ("width", "height", "wraplength", "borderwidth", "padx",
                         "pady", "row", "column", "rowspan", "columnspan",
                         "from", "to", "length"):
                value = _num(value)
            self._opts[key] = value
        _tk_dirty()
        return None

    config = configure

    def cget(self, key):
        return self._opts.get(_ALIASES.get(key, key))

    def __getitem__(self, key):
        return self.cget(key)

    def __setitem__(self, key, value):
        self.configure(**{key: value})

    # -- geometry managers ------------------------------------------------
    def pack(self, **kw):
        self._layout = {
            "manager": "pack",
            "side": str(kw.get("side", "top")).lower(),
            "fill": str(kw.get("fill", "none")).lower(),
            "expand": bool(_num(kw.get("expand", 0))),
            "padx": _num(kw.get("padx", 0)),
            "pady": _num(kw.get("pady", 0)),
            "anchor": str(kw.get("anchor", "center")).lower(),
        }
        _tk_dirty()
        return self

    def grid(self, **kw):
        self._layout = {
            "manager": "grid",
            "row": int(_num(kw.get("row", 0))),
            "column": int(_num(kw.get("column", 0))),
            "rowspan": max(1, int(_num(kw.get("rowspan", 1)))),
            "columnspan": max(1, int(_num(kw.get("columnspan", 1)))),
            "sticky": str(kw.get("sticky", "")).lower(),
            "padx": _num(kw.get("padx", 0)),
            "pady": _num(kw.get("pady", 0)),
        }
        _tk_dirty()
        return self

    def place(self, **kw):
        self._layout = {
            "manager": "place",
            "x": _num(kw.get("x", 0)),
            "y": _num(kw.get("y", 0)),
            "width": _num(kw.get("width", 0)),
            "height": _num(kw.get("height", 0)),
            "relx": _num(kw.get("relx", 0)),
            "rely": _num(kw.get("rely", 0)),
        }
        _tk_dirty()
        return self

    def pack_forget(self):
        self._layout = None
        _tk_dirty()

    forget = pack_forget
    grid_forget = pack_forget
    place_forget = pack_forget

    def pack_propagate(self, *args):
        return None

    def grid_propagate(self, *args):
        return None

    def bind(self, sequence=None, func=None, add=None):
        if func is None:
            return None

        def invoke(event=None):
            # Tk callbacks are written for either ``lambda e: ...`` or a
            # no-argument function; support both without inspecting bytecode
            # (which breaks for builtins and functools.partial).
            try:
                return func(event)
            except TypeError:
                return func()

        key = self._register(invoke)
        self._opts.setdefault("bindings", {})[str(sequence)] = key
        return key

    def unbind(self, sequence=None, funcid=None):
        self._opts.setdefault("bindings", {}).pop(str(sequence), None)

    # -- lifecycle --------------------------------------------------------
    def destroy(self):
        parent = self._master
        if isinstance(parent, Widget) and self in parent._children:
            parent._children.remove(self)
        if _tk.get("root") is self:
            _tk["root"] = None
        _tk["widgets"].pop(self._id, None)
        _tk_dirty()

    def update(self):
        _tk_flush()

    update_idletasks = update

    def winfo_width(self):
        return int(_num(self._opts.get("width", 300)))

    def winfo_height(self):
        return int(_num(self._opts.get("height", 200)))

    def winfo_exists(self):
        return self._id in _tk["widgets"]

    def focus_set(self):
        self._opts["focus"] = True
        _tk_dirty()

    focus = focus_set

    def columnconfigure(self, *args, **kwargs):
        return None

    rowconfigure = columnconfigure
    grid_columnconfigure = columnconfigure
    grid_rowconfigure = columnconfigure

    # -- serialisation ----------------------------------------------------
    def _options(self):
        opts = dict(self._opts)
        opts.pop("bindings", None)
        for key in ("width", "height", "wraplength", "borderwidth", "padx", "pady",
                    "from", "to", "length", "row", "column", "rowspan", "columnspan"):
            if key in opts:
                opts[key] = _num(opts[key])
        if "textvariable" in self._opts:
            var = _tk["vars"].get(self._opts["textvariable"])
            if isinstance(var, Variable):
                opts["value"] = var.get()
                # Labels/buttons display ``text``; entries read ``value``.
                if self.kind in ("label", "button", "checkbutton", "radiobutton"):
                    opts["text"] = str(var.get())
        if "variable" in self._opts:
            var = _tk["vars"].get(self._opts["variable"])
            if isinstance(var, Variable):
                opts["value"] = var.get()
        return opts

    def _to_spec(self):
        spec = {
            "id": self._id,
            "kind": self.kind,
            "options": self._options(),
            "layout": self._layout,
        }
        if self._children:
            spec["children"] = [child._to_spec() for child in self._children]
        return spec

    def _on_event(self, value):
        """Called by the worker when the browser reports interaction."""
        return None

    def _fire(self, value=None):
        key = self._opts.get("command")
        if key:
            fn = _tk["handlers"].get(key)
            if fn:
                try:
                    fn()
                except Exception as exc:  # surface errors in the terminal
                    raise exc


class Tk(Widget):
    kind = "tk"

    def __init__(self, **kw):
        super().__init__(master=None, **kw)
        _tk["root"] = self
        if "bg" not in self._opts:
            self._opts["bg"] = "#f0f0f0"

    def title(self, text=None):
        if text is None:
            return self._opts.get("title", "")
        self._opts["title"] = str(text)
        _tk_dirty()

    def geometry(self, spec=None):
        if spec is None:
            return self._opts.get("geometry", "")
        self._opts["geometry"] = str(spec)
        _tk_dirty()

    wm_geometry = geometry

    def minsize(self, *args):
        return None

    def maxsize(self, *args):
        return None

    def resizable(self, *args):
        return None

    def iconify(self):
        return None

    def deiconify(self):
        return None

    def protocol(self, *args):
        return None

    def attributes(self, *args):
        return None

    def state(self, *args):
        return None

    def after(self, milliseconds, func=None, *args):
        if func is None:
            return "after"
        key = self._register(lambda: func(*args) if args else func())
        _emit("timer", {"id": key, "ms": max(0, int(_num(milliseconds)))})
        return key

    def after_cancel(self, ident):
        _emit("timer", {"id": str(ident), "cancel": True})

    def after_idle(self, func, *args):
        return self.after(0, func, *args)

    def mainloop(self, n=0):
        _tk_flush()

    def quit(self):
        return None


class Toplevel(Tk):
    kind = "toplevel"


class Frame(Widget):
    kind = "frame"


class Label(Widget):
    kind = "label"


class Button(Widget):
    kind = "button"

    def invoke(self):
        self._fire()
        _tk_flush()


class Entry(Widget):
    kind = "entry"

    def get(self):
        if "textvariable" in self._opts:
            var = _tk["vars"].get(self._opts["textvariable"])
            if isinstance(var, Variable):
                return var.get()
        return str(self._opts.get("value", ""))

    def insert(self, index, string):
        current = self.get()
        pos = len(current) if str(index) == "end" else 0
        value = current[:pos] + str(string) + current[pos:]
        self._set_value(value)

    def delete(self, first, last=None):
        value = self.get()
        if str(first) in ("0", "0.0") and (last is None or str(last) in ("end", "end-1c")):
            self._set_value("")
        else:
            self._set_value(value[: max(0, int(_num(first, 0)))])

    def _set_value(self, value):
        if "textvariable" in self._opts:
            var = _tk["vars"].get(self._opts["textvariable"])
            if isinstance(var, Variable):
                var.set(value)
        self._opts["value"] = str(value)
        _tk_dirty()

    def _on_event(self, value):
        self._set_value("" if value is None else str(value))
        key = self._opts.get("bindings", {}).get("<KeyRelease>")
        if key:
            fn = _tk["handlers"].get(key)
            if fn:
                fn(_SimpleEvent())


class Text(Widget):
    kind = "text"

    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self._content = ""

    def get(self, index1=None, index2=None):
        if index1 is None:
            return self._content
        start = 0 if str(index1) in ("1.0", "0", "0.0") else len(self._content)
        end = len(self._content)
        return self._content[start:end]

    def insert(self, index, string):
        pos = len(self._content) if str(index).startswith("end") else 0
        self._content = self._content[:pos] + str(string) + self._content[pos:]
        _tk_dirty()

    def delete(self, index1, index2=None):
        if str(index1) in ("1.0", "0", "0.0") and (index2 is None or str(index2).startswith("end")):
            self._content = ""
        _tk_dirty()

    def see(self, index):
        return None

    def _options(self):
        opts = super()._options()
        opts["value"] = self._content
        return opts

    def _on_event(self, value):
        self._content = "" if value is None else str(value)


class Checkbutton(Widget):
    kind = "checkbutton"

    def _on_event(self, value):
        var_id = self._opts.get("variable")
        if var_id:
            var = _tk["vars"].get(var_id)
            if isinstance(var, Variable):
                var.set(True if value else False)
        else:
            self._opts["value"] = bool(value)
        self._fire()
        _tk_flush()

    def invoke(self):
        self._on_event(not bool(self._opts.get("value")))


class Radiobutton(Widget):
    kind = "radiobutton"

    def configure(self, **kw):
        # A radio button's ``value`` is the value it *represents*, which is
        # different from the variable's current value serialised by _options().
        if "value" in kw:
            kw = dict(kw)
            self._opts["rvalue"] = str(kw.pop("value"))
        return super().configure(**kw)

    def _on_event(self, value):
        var_id = self._opts.get("variable")
        if var_id:
            var = _tk["vars"].get(var_id)
            if isinstance(var, Variable):
                var.set(value if value is not None else self._opts.get("rvalue", ""))
        self._fire()
        _tk_flush()

    def invoke(self):
        self._on_event(None)


class Scale(Widget):
    kind = "scale"

    def get(self):
        var_id = self._opts.get("variable")
        if var_id:
            var = _tk["vars"].get(var_id)
            if isinstance(var, Variable):
                return var.get()
        return _num(self._opts.get("value", 0))

    def set(self, value):
        var_id = self._opts.get("variable")
        if var_id:
            var = _tk["vars"].get(var_id)
            if isinstance(var, Variable):
                var.set(value)
        self._opts["value"] = _num(value)
        _tk_dirty()

    def _on_event(self, value):
        self.set(_num(value))
        key = self._opts.get("command")
        if key:
            fn = _tk["handlers"].get(key)
            if fn:
                fn(str(self.get()))
        _tk_flush()


class Listbox(Widget):
    kind = "listbox"

    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self._items = []
        self._selection = []

    def insert(self, index, *elements):
        for element in elements:
            if str(index) == "end":
                self._items.append(str(element))
            else:
                self._items.insert(int(_num(index)), str(element))
        _tk_dirty()

    def delete(self, first, last=None):
        if str(first) == "0" and (last is None or str(last).startswith("end")):
            self._items = []
        elif self._items:
            self._items.pop(int(_num(first)))
        _tk_dirty()

    def get(self, first, last=None):
        if last is None:
            return self._items[int(_num(first))] if self._items else ""
        return self._items

    def size(self):
        return len(self._items)

    def curselection(self):
        return tuple(self._selection)

    def selection_clear(self, first=0, last=None):
        self._selection = []
        _tk_dirty()

    def _options(self):
        opts = super()._options()
        opts["items"] = self._items
        opts["selection"] = self._selection
        opts["height"] = int(_num(self._opts.get("height", 6)))
        return opts

    def _on_event(self, value):
        try:
            self._selection = [int(value)]
        except (TypeError, ValueError):
            self._selection = []
        key = self._opts.get("bindings", {}).get("<<ListboxSelect>>")
        if key:
            fn = _tk["handlers"].get(key)
            if fn:
                fn(_SimpleEvent())


class Combobox(Entry):
    kind = "combobox"

    def current(self, index=None):
        values = self._opts.get("values", [])
        if index is None:
            try:
                return values.index(self.get())
            except ValueError:
                return -1
        if 0 <= int(index) < len(values):
            self._set_value(values[int(index)])
        return None

    def set(self, value):
        self._set_value(str(value))


class Canvas(Widget):
    kind = "canvas"

    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self._items = []
        self._item_seq = 0

    def _add(self, kind, coords, options):
        self._item_seq += 1
        item = {
            "id": self._item_seq,
            "kind": kind,
            "coords": [float(c) for c in coords],
            "options": {k: (_css_color(v) if k in ("fill", "outline") else v)
                        for k, v in options.items()},
        }
        self._items.append(item)
        _tk_dirty()
        return self._item_seq

    @staticmethod
    def _flat(args):
        if len(args) == 1 and isinstance(args[0], (list, tuple)):
            return list(args[0])
        return list(args)

    def create_line(self, *args, **kw):
        return self._add("line", self._flat(args), kw)

    def create_rectangle(self, *args, **kw):
        return self._add("rect", self._flat(args), kw)

    def create_oval(self, *args, **kw):
        return self._add("oval", self._flat(args), kw)

    def create_polygon(self, *args, **kw):
        return self._add("polygon", self._flat(args), kw)

    def create_arc(self, *args, **kw):
        return self._add("arc", self._flat(args), kw)

    def create_text(self, *args, **kw):
        return self._add("text", self._flat(args), kw)

    def create_image(self, *args, **kw):
        return None

    def delete(self, *items):
        if not items or "all" in [str(i) for i in items]:
            self._items = []
        else:
            ids = {int(_num(i)) for i in items}
            self._items = [item for item in self._items if item["id"] not in ids]
        _tk_dirty()

    def itemconfig(self, item, **kw):
        for entry in self._items:
            if entry["id"] == int(_num(item)):
                for key, value in kw.items():
                    entry["options"][key] = _css_color(value) if key in ("fill", "outline") else value
        _tk_dirty()

    itemconfigure = itemconfig

    def coords(self, item, *args):
        for entry in self._items:
            if entry["id"] == int(_num(item)):
                if args:
                    entry["coords"] = [float(c) for c in self._flat(args)]
                return list(entry["coords"])
        return []

    def find_all(self):
        return tuple(item["id"] for item in self._items)

    def _options(self):
        opts = super()._options()
        opts["items"] = self._items
        opts["width"] = int(_num(self._opts.get("width", 320)))
        opts["height"] = int(_num(self._opts.get("height", 200)))
        return opts

    def _on_event(self, value):
        key = self._opts.get("bindings", {}).get("<Button-1>")
        if key and isinstance(value, dict):
            fn = _tk["handlers"].get(key)
            if fn:
                event = _SimpleEvent()
                event.x = int(_num(value.get("x", 0)))
                event.y = int(_num(value.get("y", 0)))
                fn(event)


class _SimpleEvent:
    x = 0
    y = 0
    char = ""
    keysym = ""

    def __init__(self, **kw):
        for key, value in kw.items():
            setattr(self, key, value)


class Menu(Widget):
    """Menus have no browser analogue; commands stay callable no-ops."""

    kind = "frame"

    def add_command(self, **kw):
        return None

    def add_cascade(self, **kw):
        return None

    def add_separator(self, **kw):
        return None

    def add_checkbutton(self, **kw):
        return None

    def add_radiobutton(self, **kw):
        return None


# -- message box ------------------------------------------------------------

class _MessageBox:
    @staticmethod
    def _notify(kind, title, message):
        _emit("notice", {"level": kind, "title": str(title), "message": str(message)})

    def showinfo(self, title=None, message=None, **kw):
        self._notify("info", title or "", message or "")
        return "ok"

    def showwarning(self, title=None, message=None, **kw):
        self._notify("warning", title or "", message or "")
        return "ok"

    def showerror(self, title=None, message=None, **kw):
        self._notify("error", title or "", message or "")
        return "ok"

    def askyesno(self, title=None, message=None, **kw):
        self._notify("question", title or "", message or "")
        return True

    askokcancel = askyesno
    askretrycancel = askyesno
    askquestion = askyesno

    def askyesnocancel(self, title=None, message=None, **kw):
        self._notify("question", title or "", message or "")
        return True


# -- ttk --------------------------------------------------------------------

class _Style:
    def configure(self, *args, **kwargs):
        return None

    def map(self, *args, **kwargs):
        return None

    def theme_use(self, *args, **kwargs):
        return None


class Notebook(Frame):
    """Tabs are approximated: every page is shown stacked."""

    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self._pages = []

    def add(self, child, **kw):
        self._pages.append(child)
        if not isinstance(child._master, Widget):
            self._children.append(child)
        child._layout = {"manager": "pack", "side": "top", "fill": "both",
                         "expand": True, "padx": 0, "pady": 0, "anchor": "center"}
        _tk_dirty()

    def select(self, *args):
        return None


_ttk = types.ModuleType("tkinter.ttk")
for _name, _cls in {
    "Frame": Frame, "Label": Label, "Button": Button, "Entry": Entry,
    "Checkbutton": Checkbutton, "Radiobutton": Radiobutton, "Scale": Scale,
    "Combobox": Combobox, "Notebook": Notebook, "Style": _Style,
}.items():
    setattr(_ttk, _name, _cls)


def _install_tkinter():
    module = types.ModuleType("tkinter")
    exports = {
        "Tk": Tk, "Toplevel": Toplevel, "Frame": Frame, "Label": Label,
        "Button": Button, "Entry": Entry, "Text": Text,
        "Checkbutton": Checkbutton, "Radiobutton": Radiobutton,
        "Scale": Scale, "Listbox": Listbox, "Canvas": Canvas,
        "Menu": Menu,
        "StringVar": StringVar, "IntVar": IntVar, "DoubleVar": DoubleVar,
        "BooleanVar": BooleanVar, "Variable": Variable, "Widget": Widget,
        "Misc": Widget, "Wm": Widget,
    }
    for name, value in exports.items():
        setattr(module, name, value)

    constants = {
        "END": "end", "LEFT": "left", "RIGHT": "right", "TOP": "top",
        "BOTTOM": "bottom", "BOTH": "both", "X": "x", "Y": "y",
        "N": "n", "S": "s", "E": "e", "W": "w", "NW": "nw", "NE": "ne",
        "SW": "sw", "SE": "se", "CENTER": "center", "HORIZONTAL": "horizontal",
        "VERTICAL": "vertical", "NORMAL": "normal", "DISABLED": "disabled",
        "ACTIVE": "active", "FLAT": "flat", "SUNKEN": "sunken", "RAISED": "raised",
        "GROOVE": "groove", "RIDGE": "ridge",
    }
    module_constants = types.ModuleType("tkinter.constants")
    for name, value in constants.items():
        setattr(module, name, value)
        setattr(module_constants, name, value)

    module.ttk = _ttk
    module.messagebox = _MessageBox()
    module.constants = module_constants
    module.TclError = Exception
    module.font = types.SimpleNamespace(
        Font=lambda *a, **k: types.SimpleNamespace(configure=lambda **k: None)
    )

    sys.modules["tkinter"] = module
    sys.modules["tkinter.ttk"] = _ttk
    sys.modules["tkinter.messagebox"] = module.messagebox
    sys.modules["tkinter.constants"] = module_constants


# ===========================================================================
# pygame (a small subset that maps onto the same canvas)
# ===========================================================================

_pg = {"w": 720, "h": 480, "started": 0.0, "screen": None}

_QUIT = 256
_KEYDOWN = 768
_KEYUP = 769
_MOUSEBUTTONDOWN = 1025
_MOUSEBUTTONUP = 1026


class _Event(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


class Rect:
    def __init__(self, *args):
        if len(args) == 1:
            args = tuple(args[0])
        if len(args) == 4:
            self.x, self.y, self.width, self.height = (int(v) for v in args)
        elif len(args) == 2:
            self.x, self.y = (int(v) for v in args)
            self.width = self.height = 0
        else:
            self.x = self.y = self.width = self.height = 0

    @property
    def left(self): return self.x

    @property
    def top(self): return self.y

    @property
    def right(self): return self.x + self.width

    @property
    def bottom(self): return self.y + self.height

    @property
    def center(self): return (self.x + self.width // 2, self.y + self.height // 2)

    @property
    def centerx(self): return self.x + self.width // 2

    @property
    def centery(self): return self.y + self.height // 2

    @property
    def topleft(self): return (self.x, self.y)

    @property
    def size(self): return (self.width, self.height)

    def __iter__(self):
        return iter((self.x, self.y, self.width, self.height))

    def __getitem__(self, index):
        return (self.x, self.y, self.width, self.height)[index]

    def move(self, dx, dy):
        return Rect(self.x + dx, self.y + dy, self.width, self.height)

    def move_ip(self, dx, dy):
        self.x += dx
        self.y += dy

    def collidepoint(self, x, y=None):
        if y is None:
            x, y = x
        return self.x <= x < self.right and self.y <= y < self.bottom

    def colliderect(self, other):
        return not (self.right <= other.x or other.right <= self.x or
                    self.bottom <= other.y or other.bottom <= self.y)

    def inflate(self, dx, dy):
        return Rect(self.x - dx // 2, self.y - dy // 2, self.width + dx, self.height + dy)

    def inflate_ip(self, dx, dy):
        self.x -= dx // 2
        self.y -= dy // 2
        self.width += dx
        self.height += dy


class Surface:
    def __init__(self, size=(720, 480), **kw):
        self._size = (int(size[0]), int(size[1]))

    def get_size(self):
        return self._size

    def get_width(self):
        return self._size[0]

    def get_height(self):
        return self._size[1]

    def get_rect(self, **kw):
        rect = Rect(0, 0, self._size[0], self._size[1])
        for key, value in kw.items():
            setattr(rect, key, value)
        return rect

    def fill(self, color, rect=None):
        if rect is None:
            old = _css_color(color)
            _emit("canvas", {"op": "bg", "bg": old, "fill": True})
        else:
            r = Rect(rect)
            _emit("canvas", {"op": "rect", "x": r.x, "y": r.y, "w": r.width,
                             "h": r.height, "fill": _css_color(color), "color": None,
                             "width": 0})

    def blit(self, source, pos, area=None, special_flags=0):
        if isinstance(source, _TextSurface):
            x, y = (pos[0], pos[1]) if isinstance(pos, (tuple, list)) else (pos.x, pos.y)
            _emit("canvas", {"op": "text", "x": x, "y": y, "text": source.text,
                             "color": _css_color(source.color), "size": source.size,
                             "family": source.family, "bold": source.bold,
                             "italic": False, "align": "left"})
        return Rect(pos[0] if isinstance(pos, (tuple, list)) else pos.x,
                    pos[1] if isinstance(pos, (tuple, list)) else pos.y,
                    getattr(source, "width", 0), getattr(source, "height", 0))

    def convert(self, *args, **kw):
        return self


class _TextSurface:
    def __init__(self, text, color, size, family, bold):
        self.text = text
        self.color = color
        self.size = size
        self.family = family
        self.bold = bold
        self.width = max(1, int(len(text) * size * 0.55))
        self.height = int(size * 1.3)

    def get_rect(self, **kw):
        rect = Rect(0, 0, self.width, self.height)
        for key, value in kw.items():
            setattr(rect, key, value)
        return rect

    def convert(self, *args, **kw):
        return self


def _pg_init_surface():
    _emit("canvas", {"op": "init", "width": _pg["w"], "height": _pg["h"], "bg": "#000000"})
    _pg["started"] = _time.time()


class _Display:
    def init(self):
        return None

    def set_mode(self, size, flags=0, depth=32):
        _pg["w"], _pg["h"] = int(size[0]), int(size[1])
        _pg_init_surface()
        surface = Surface((_pg["w"], _pg["h"]))
        _pg["screen"] = surface
        return surface

    def get_surface(self):
        return _pg["screen"]

    def set_caption(self, *args):
        return None

    def set_icon(self, *args):
        return None

    def flip(self):
        return None

    def update(self):
        return None

    def get_size(self):
        return (_pg["w"], _pg["h"])

    def quit(self):
        return None


class _Draw:
    def rect(self, surface, color, rect, width=0):
        r = Rect(rect)
        _emit("canvas", {"op": "rect", "x": r.x, "y": r.y, "w": max(1, r.width),
                         "h": max(1, r.height), "color": _css_color(color),
                         "fill": None if width else _css_color(color),
                         "width": max(1, int(width))})

    def circle(self, surface, color, center, radius, width=0):
        _emit("canvas", {"op": "circle", "x": center[0], "y": center[1],
                         "r": max(1, int(radius)), "color": _css_color(color),
                         "fill": None if width else _css_color(color),
                         "width": max(1, int(width))})

    def ellipse(self, surface, color, rect, width=0):
        r = Rect(rect)
        _emit("canvas", {"op": "ellipse", "x": r.x, "y": r.y, "w": max(1, r.width),
                         "h": max(1, r.height), "color": _css_color(color),
                         "fill": None if width else _css_color(color),
                         "width": max(1, int(width))})

    def line(self, surface, color, start, end, width=1):
        _emit("canvas", {"op": "line", "x1": start[0], "y1": start[1],
                         "x2": end[0], "y2": end[1],
                         "color": _css_color(color), "width": max(1, int(width))})

    def lines(self, surface, color, closed, points, width=1):
        pts = list(points)
        if len(pts) < 2:
            return
        if closed:
            pts.append(pts[0])
        for a, b in zip(pts, pts[1:]):
            self.line(surface, color, a, b, width)

    def polygon(self, surface, color, points, width=0):
        pts = list(points)
        if len(pts) < 3:
            return
        _emit("canvas", {"op": "polygon",
                         "points": [c for p in pts for c in (p[0], p[1])],
                         "fill": None if width else _css_color(color),
                         "color": _css_color(color),
                         "width": max(1, int(width))})


class _Clock:
    def __init__(self):
        self._last = _time.time()

    def tick(self, framerate=0):
        now = _time.time()
        elapsed = int((now - self._last) * 1000)
        self._last = now
        if framerate:
            target = 1000.0 / float(framerate)
            if elapsed < target:
                try:
                    _time.sleep((target - elapsed) / 1000.0)
                except Exception:
                    pass
                return int(target)
        return elapsed

    tick_busy_loop = tick

    def get_time(self):
        return int((_time.time() - self._last) * 1000)

    def get_rawtime(self):
        return self.get_time()

    def get_fps(self):
        return 60.0


class _PygameTime:
    Clock = _Clock

    @staticmethod
    def get_ticks():
        return int(_time.time() * 1000)

    @staticmethod
    def delay(ms):
        _time.sleep(ms / 1000.0)

    wait = delay


class _PygameEvent:
    @staticmethod
    def get(*args, **kwargs):
        if not _pg["started"]:
            _pg["started"] = _time.time()
        elapsed = _time.time() - _pg["started"]
        if elapsed > 15.0:
            _emit("canvas", {"op": "notice",
                             "text": "pygame: stopped the event loop after 15s — press Stop for a runaway loop."})
            return [_Event(type=_QUIT)]
        return []

    @staticmethod
    def pump():
        return None

    @staticmethod
    def poll():
        return _Event(type=_QUIT)

    @staticmethod
    def wait():
        return _Event(type=_QUIT)

    @staticmethod
    def set_allowed(*args):
        return None


class _PygameKey:
    _K = {
        "K_LEFT": 1073741904, "K_RIGHT": 1073741903, "K_UP": 1073741906,
        "K_DOWN": 1073741905, "K_SPACE": 32, "K_RETURN": 13, "K_ESCAPE": 27,
        "K_a": 97, "K_d": 100, "K_w": 119, "K_s": 115, "K_r": 114,
    }

    @staticmethod
    def get_pressed():
        class _Keys:
            def __getitem__(self, key):
                return False

            def __getattr__(self, name):
                return False

        return _Keys()

    @staticmethod
    def set_repeat(*args):
        return None

    @staticmethod
    def name(key):
        return ""


class _PygameMouse:
    @staticmethod
    def get_pos():
        return (0, 0)

    @staticmethod
    def get_pressed():
        return (False, False, False)

    @staticmethod
    def set_visible(*args):
        return None


class _PygameFont:
    @staticmethod
    def init():
        return None

    @staticmethod
    def SysFont(name, size, bold=False, italic=False):
        family = "monospace" if str(name).lower() == "monospace" else str(name or "Segoe UI")
        return _Font(family, int(size), bool(bold))

    @staticmethod
    def get_default_font():
        return "Segoe UI"


class _Font:
    def __init__(self, family, size, bold=False):
        self.family = family
        self.size = size
        self.bold = bold

    def render(self, text, antialias=True, color=(255, 255, 255), background=None):
        return _TextSurface(str(text), color, self.size, self.family, self.bold)

    def size(self, text):
        return (max(1, int(len(str(text)) * self.size * 0.55)), int(self.size * 1.3))

    def get_height(self):
        return int(self.size * 1.3)


def _install_pygame():
    module = types.ModuleType("pygame")
    module.init = lambda: None
    module.quit = lambda: None
    module.display = _Display()
    module.draw = _Draw()
    module.time = _PygameTime()
    module.event = _PygameEvent()
    module.key = _PygameKey()
    module.mouse = _PygameMouse()
    module.font = _PygameFont()
    module.Surface = Surface
    module.Rect = Rect
    module.Color = lambda *args: tuple(args[0]) if len(args) == 1 else tuple(args)
    module.QUIT = _QUIT
    module.KEYDOWN = _KEYDOWN
    module.KEYUP = _KEYUP
    module.MOUSEBUTTONDOWN = _MOUSEBUTTONDOWN
    module.MOUSEBUTTONUP = _MOUSEBUTTONUP
    module.K_LEFT = 1073741904
    module.K_RIGHT = 1073741903
    module.K_UP = 1073741906
    module.K_DOWN = 1073741905
    module.K_SPACE = 32
    module.K_RETURN = 13
    module.K_ESCAPE = 27
    module.error = RuntimeError
    module.version = types.SimpleNamespace(ver="2.6.0-browser")

    submodules = {
        "pygame.display": module.display,
        "pygame.draw": module.draw,
        "pygame.time": module.time,
        "pygame.event": module.event,
        "pygame.key": module.key,
        "pygame.mouse": module.mouse,
        "pygame.font": module.font,
    }
    for name, sub in submodules.items():
        sys.modules[name] = sub
    sys.modules["pygame"] = module


# ===========================================================================
# stdin
# ===========================================================================

_stdin_prompt_pending = False


def _browser_input(prompt=""):
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    value = ideBridge.stdin()
    if value is None:
        raise EOFError("No terminal input is available in this browser context.")
    sys.stdout.write(str(value) + "\n")
    sys.stdout.flush()
    return value


# ===========================================================================
# hooks called by worker.js
# ===========================================================================

def __ide_reset():
    """Called before every run so each execution starts from a clean slate."""
    global _default_turtle, _screen, _canvas_ready, _canvas_bg
    _default_turtle = None
    _screen = None
    _canvas_ready = False
    _canvas_bg = "#0f1524"

    _tk.update({
        "seq": 0,
        "root": None,
        "widgets": {},
        "handlers": {},
        "vars": {},
        "dirty": False,
    })

    _pg.update({"w": 720, "h": 480, "started": 0.0, "screen": None})


def __ide_finish():
    """Called after every run / UI event to flush pending renders."""
    if _tk.get("root") is not None:
        _tk_flush()


def __ide_tk_event(target, ident, value_json):
    """Called by the worker for timers and widget interactions."""
    try:
        value = json.loads(value_json)
    except (TypeError, ValueError):
        value = None

    if target == "handler":
        fn = _tk["handlers"].get(ident)
        if fn:
            fn()
    elif target == "var":
        var = _tk["vars"].get(ident)
        if isinstance(var, Variable):
            var.set(value)
    elif target == "widget":
        widget = _tk["widgets"].get(ident)
        if widget is not None:
            widget._on_event(value)
    __ide_finish()


builtins.input = _browser_input

_install_turtle()
_install_tkinter()
_install_pygame()
