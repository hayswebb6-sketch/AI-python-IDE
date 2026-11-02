/**
 * Python IntelliSense for the Monaco editor.
 *
 * Monaco ships syntax highlighting for Python but no language service, so this
 * module provides the pieces a "real" editor is expected to have:
 *
 *   - completion for keywords, builtins, modules and their members,
 *   - snippets for the common control-flow statements,
 *   - hover documentation,
 *   - signature help for builtins / module functions,
 *   - a little type inference (`t = turtle.Turtle()` -> turtle methods).
 *
 * It is intentionally data-driven: add an entry to ```BUILTINS``` or
 * ```MODULES``` and every feature picks it up.
 */

export const KEYWORDS = [
  ["and", "Boolean operator"],
  ["as", "Bind an imported name"],
  ["assert", "Assert a condition"],
  ["async", "Async definition"],
  ["await", "Await a coroutine"],
  ["break", "Leave a loop"],
  ["case", "Pattern matching branch"],
  ["class", "Define a class"],
  ["continue", "Next loop iteration"],
  ["def", "Define a function"],
  ["del", "Delete a binding"],
  ["elif", "Else-if branch"],
  ["else", "Fallback branch"],
  ["except", "Catch an exception"],
  ["False", "Boolean false"],
  ["finally", "Always-run block"],
  ["for", "Iterate"],
  ["from", "Import from a module"],
  ["global", "Module-level name"],
  ["if", "Conditional"],
  ["import", "Import a module"],
  ["in", "Membership operator"],
  ["is", "Identity operator"],
  ["lambda", "Anonymous function"],
  ["match", "Pattern matching"],
  ["None", "Null value"],
  ["nonlocal", "Enclosing-scope name"],
  ["not", "Boolean negation"],
  ["or", "Boolean operator"],
  ["pass", "Do nothing"],
  ["raise", "Raise an exception"],
  ["return", "Return a value"],
  ["True", "Boolean true"],
  ["try", "Exception handling"],
  ["while", "Loop while true"],
  ["with", "Context manager"],
  ["yield", "Produce from a generator"],
];

const fn = (label, signature, doc) => ({ label, signature, doc, kind: "function" });
const cls = (label, signature, doc) => ({ label, signature, doc, kind: "class" });
const val = (label, signature, doc) => ({ label, signature, doc, kind: "value" });

/** Builtins available without an import. */
export const BUILTINS = [
  fn("abs", "abs(x)", "Return the absolute value of a number."),
  fn("aiter", "aiter(async_iterable)", "Return an asynchronous iterator."),
  fn("all", "all(iterable)", "True if every item is truthy."),
  fn("anext", "anext(async_iterator, default=...)", "Next item from an async iterator."),
  fn("any", "any(iterable)", "True if any item is truthy."),
  fn("ascii", "ascii(object)", "Readable representation with escapes."),
  fn("bin", "bin(x)", "Binary representation of an integer."),
  cls("bool", "bool(x=False)", "Boolean type."),
  fn("breakpoint", "breakpoint(*args, **kwargs)", "Drop into the debugger."),
  cls("bytearray", "bytearray(source=b'')", "Mutable sequence of bytes."),
  cls("bytes", "bytes(source=b'')", "Immutable sequence of bytes."),
  fn("callable", "callable(object)", "True if the object can be called."),
  fn("chr", "chr(i)", "Unicode character for a code point."),
  fn("classmethod", "classmethod(function)", "Class method decorator."),
  fn("compile", "compile(source, filename, mode)", "Compile source to a code object."),
  cls("complex", "complex(real=0, imag=0)", "Complex number type."),
  fn("delattr", "delattr(object, name)", "Delete an attribute."),
  cls("dict", "dict(**kwargs)", "Hash map type."),
  fn("dir", "dir(object)", "List attribute names."),
  fn("divmod", "divmod(a, b)", "Return (a // b, a % b)."),
  fn("enumerate", "enumerate(iterable, start=0)", "Yield (index, item) pairs."),
  fn("eval", "eval(source, globals=None, locals=None)", "Evaluate an expression."),
  fn("exec", "exec(source, globals=None, locals=None)", "Execute statements."),
  cls("Exception", "Exception(*args)", "Base class for most exceptions."),
  fn("filter", "filter(function, iterable)", "Keep items where function is true."),
  cls("float", "float(x=0.0)", "Floating point type."),
  cls("frozenset", "frozenset(iterable=())", "Immutable set type."),
  fn("getattr", "getattr(object, name, default=...)", "Read an attribute."),
  fn("globals", "globals()", "Current global namespace."),
  fn("hasattr", "hasattr(object, name)", "True if the attribute exists."),
  fn("hash", "hash(object)", "Hash value of an object."),
  fn("help", "help(object=None)", "Show built-in help."),
  fn("hex", "hex(x)", "Hexadecimal representation."),
  fn("id", "id(object)", "Identity of an object."),
  fn("input", "input(prompt='')", "Read a line from standard input."),
  cls("int", "int(x=0, base=10)", "Integer type."),
  fn("isinstance", "isinstance(object, classinfo)", "Type check."),
  fn("issubclass", "issubclass(cls, classinfo)", "Subclass check."),
  fn("iter", "iter(object, sentinel=...)", "Return an iterator."),
  cls("KeyError", "KeyError(key)", "Raised when a dict key is missing."),
  fn("len", "len(object)", "Number of items in a container."),
  cls("list", "list(iterable=())", "Mutable sequence type."),
  fn("locals", "locals()", "Current local namespace."),
  fn("map", "map(function, *iterables)", "Apply a function lazily."),
  fn("max", "max(iterable, *, key=None, default=...)", "Largest item."),
  fn("min", "min(iterable, *, key=None, default=...)", "Smallest item."),
  fn("next", "next(iterator, default=...)", "Next item from an iterator."),
  cls("object", "object()", "Root of the class hierarchy."),
  fn("oct", "oct(x)", "Octal representation."),
  fn("open", "open(file, mode='r', encoding=None)", "Open a file and return a handle."),
  fn("ord", "ord(c)", "Code point of a character."),
  fn("pow", "pow(base, exp, mod=None)", "Raise to a power."),
  fn("print", "print(*values, sep=' ', end='\\n', file=None, flush=False)", "Write values to standard output."),
  fn("property", "property(fget=None, fset=None, fdel=None, doc=None)", "Property decorator."),
  fn("range", "range(start, stop=..., step=1)", "Lazy arithmetic sequence."),
  fn("repr", "repr(object)", "Developer-facing representation."),
  fn("reversed", "reversed(sequence)", "Iterate in reverse."),
  fn("round", "round(number, ndigits=None)", "Round to the nearest value."),
  cls("RuntimeError", "RuntimeError(*args)", "Generic runtime error."),
  cls("set", "set(iterable=())", "Mutable set type."),
  fn("setattr", "setattr(object, name, value)", "Write an attribute."),
  fn("slice", "slice(start, stop, step=None)", "Slice object."),
  fn("sorted", "sorted(iterable, *, key=None, reverse=False)", "Return a sorted list."),
  fn("staticmethod", "staticmethod(function)", "Static method decorator."),
  cls("str", "str(object='')", "Text string type."),
  fn("sum", "sum(iterable, start=0)", "Sum of the items."),
  fn("super", "super(type=None, object=None)", "Access the parent class."),
  cls("tuple", "tuple(iterable=())", "Immutable sequence type."),
  cls("type", "type(object)", "Type of an object, or a new class."),
  fn("vars", "vars(object=None)", "Attribute namespace as a dict."),
  fn("zip", "zip(*iterables, strict=False)", "Zip iterables together."),
  cls("ValueError", "ValueError(*args)", "Raised for an invalid value."),
  cls("TypeError", "TypeError(*args)", "Raised for a wrong type."),
  cls("IndexError", "IndexError(*args)", "Sequence index out of range."),
  cls("AttributeError", "AttributeError(*args)", "Missing attribute."),
  cls("NameError", "NameError(*args)", "Unknown name."),
  cls("ZeroDivisionError", "ZeroDivisionError(*args)", "Division by zero."),
  cls("FileNotFoundError", "FileNotFoundError(*args)", "File does not exist."),
  cls("ImportError", "ImportError(*args)", "Import failed."),
  cls("ModuleNotFoundError", "ModuleNotFoundError(*args)", "Module is not installed."),
  cls("StopIteration", "StopIteration(*args)", "Iterator is exhausted."),
  cls("NotImplementedError", "NotImplementedError(*args)", "Abstract method."),
  cls("AssertionError", "AssertionError(*args)", "Failed assert statement."),
  cls("ArithmeticError", "ArithmeticError(*args)", "Arithmetic base error."),
  cls("OSError", "OSError(*args)", "Operating system error."),
];

const strMethods = [
  ["capitalize", "str.capitalize()", "First character upper case."],
  ["casefold", "str.casefold()", "Aggressive lower case, for comparisons."],
  ["center", "str.center(width, fillchar=' ')", "Pad both sides."],
  ["count", "str.count(sub, start=0, end=...)", "Count non-overlapping occurrences."],
  ["encode", "str.encode(encoding='utf-8')", "Encode to bytes."],
  ["endswith", "str.endswith(suffix, start=0, end=...)", "Suffix test."],
  ["find", "str.find(sub, start=0, end=...)", "First index, or -1."],
  ["format", "str.format(*args, **kwargs)", "Format placeholders."],
  ["index", "str.index(sub, start=0, end=...)", "First index, or ValueError."],
  ["isalnum", "str.isalnum()", "All characters alphanumeric."],
  ["isalpha", "str.isalpha()", "All characters alphabetic."],
  ["isdigit", "str.isdigit()", "All characters digits."],
  ["islower", "str.islower()", "All cased characters lower."],
  ["isspace", "str.isspace()", "All characters whitespace."],
  ["isupper", "str.isupper()", "All cased characters upper."],
  ["join", "str.join(iterable)", "Join strings with this separator."],
  ["lower", "str.lower()", "Lower-case copy."],
  ["lstrip", "str.lstrip(chars=None)", "Strip leading characters."],
  ["partition", "str.partition(sep)", "Split at the first separator."],
  ["removeprefix", "str.removeprefix(prefix)", "Drop a prefix if present."],
  ["removesuffix", "str.removesuffix(suffix)", "Drop a suffix if present."],
  ["replace", "str.replace(old, new, count=-1)", "Replace occurrences."],
  ["rfind", "str.rfind(sub, start=0, end=...)", "Last index, or -1."],
  ["rjust", "str.rjust(width, fillchar=' ')", "Pad on the left."],
  ["rsplit", "str.rsplit(sep=None, maxsplit=-1)", "Split from the right."],
  ["rstrip", "str.rstrip(chars=None)", "Strip trailing characters."],
  ["split", "str.split(sep=None, maxsplit=-1)", "Split into a list."],
  ["splitlines", "str.splitlines(keepends=False)", "Split on line boundaries."],
  ["startswith", "str.startswith(prefix, start=0, end=...)", "Prefix test."],
  ["strip", "str.strip(chars=None)", "Strip both ends."],
  ["swapcase", "str.swapcase()", "Swap letter case."],
  ["title", "str.title()", "Title-case copy."],
  ["upper", "str.upper()", "Upper-case copy."],
  ["zfill", "str.zfill(width)", "Pad with zeros."],
];

const listMethods = [
  ["append", "list.append(item)", "Add one item to the end."],
  ["clear", "list.clear()", "Remove every item."],
  ["copy", "list.copy()", "Shallow copy."],
  ["count", "list.count(value)", "Count equal items."],
  ["extend", "list.extend(iterable)", "Append every item."],
  ["index", "list.index(value, start=0, stop=...)", "First index of a value."],
  ["insert", "list.insert(index, item)", "Insert before an index."],
  ["pop", "list.pop(index=-1)", "Remove and return an item."],
  ["remove", "list.remove(value)", "Remove the first equal item."],
  ["reverse", "list.reverse()", "Reverse in place."],
  ["sort", "list.sort(*, key=None, reverse=False)", "Sort in place."],
];

const dictMethods = [
  ["clear", "dict.clear()", "Remove every item."],
  ["copy", "dict.copy()", "Shallow copy."],
  ["get", "dict.get(key, default=None)", "Value for a key, or a default."],
  ["items", "dict.items()", "View of (key, value) pairs."],
  ["keys", "dict.keys()", "View of the keys."],
  ["pop", "dict.pop(key, default=...)", "Remove a key and return its value."],
  ["popitem", "dict.popitem()", "Remove and return the last pair."],
  ["setdefault", "dict.setdefault(key, default=None)", "Get a key, inserting a default."],
  ["update", "dict.update(other)", "Merge pairs into the dict."],
  ["values", "dict.values()", "View of the values."],
];

const setMethods = [
  ["add", "set.add(item)", "Add an item."],
  ["clear", "set.clear()", "Remove every item."],
  ["copy", "set.copy()", "Shallow copy."],
  ["difference", "set.difference(*others)", "Items not in the others."],
  ["discard", "set.discard(item)", "Remove if present."],
  ["intersection", "set.intersection(*others)", "Items in all sets."],
  ["issubset", "set.issubset(other)", "Containment test."],
  ["issuperset", "set.issuperset(other)", "Containment test."],
  ["pop", "set.pop()", "Remove and return an arbitrary item."],
  ["remove", "set.remove(item)", "Remove an item, or KeyError."],
  ["union", "set.union(*others)", "Combine sets."],
];

const turtleMethods = [
  ["forward", "turtle.forward(distance)", "Move forward, drawing if the pen is down."],
  ["backward", "turtle.backward(distance)", "Move backward."],
  ["right", "turtle.right(angle)", "Turn clockwise."],
  ["left", "turtle.left(angle)", "Turn counter-clockwise."],
  ["goto", "turtle.goto(x, y)", "Move to an absolute position."],
  ["setx", "turtle.setx(x)", "Move horizontally."],
  ["sety", "turtle.sety(y)", "Move vertically."],
  ["setheading", "turtle.setheading(angle)", "Set the heading in degrees."],
  ["home", "turtle.home()", "Return to the origin."],
  ["position", "turtle.position()", "Return (x, y)."],
  ["xcor", "turtle.xcor()", "Return the x coordinate."],
  ["ycor", "turtle.ycor()", "Return the y coordinate."],
  ["heading", "turtle.heading()", "Return the heading."],
  ["towards", "turtle.towards(x, y)", "Angle towards a point."],
  ["distance", "turtle.distance(x, y)", "Distance to a point."],
  ["penup", "turtle.penup()", "Stop drawing."],
  ["pendown", "turtle.pendown()", "Start drawing."],
  ["isdown", "turtle.isdown()", "True if the pen is down."],
  ["pensize", "turtle.pensize(width)", "Set the line width."],
  ["pencolor", "turtle.pencolor(color)", "Set the pen colour."],
  ["fillcolor", "turtle.fillcolor(color)", "Set the fill colour."],
  ["color", "turtle.color(pencolor, fillcolor=None)", "Set pen and fill colours."],
  ["begin_fill", "turtle.begin_fill()", "Start recording a filled shape."],
  ["end_fill", "turtle.end_fill()", "Fill the recorded shape."],
  ["circle", "turtle.circle(radius, extent=None, steps=None)", "Draw a circle or arc."],
  ["dot", "turtle.dot(size=None, *color)", "Draw a filled dot."],
  ["write", "turtle.write(text, align='left', font=...)", "Draw text at the turtle."],
  ["hideturtle", "turtle.hideturtle()", "Hide the turtle."],
  ["showturtle", "turtle.showturtle()", "Show the turtle."],
  ["isvisible", "turtle.isvisible()", "True if the turtle is visible."],
  ["speed", "turtle.speed(value)", "Set the drawing speed."],
  ["clear", "turtle.clear()", "Erase the drawing."],
  ["reset", "turtle.reset()", "Erase and return home."],
  ["bgcolor", "turtle.bgcolor(color)", "Set the canvas background."],
  ["mainloop", "turtle.mainloop()", "No-op in the browser."],
];

const tkMethods = [
  ["pack", "widget.pack(side='top', fill='none', expand=False)", "Place with the pack manager."],
  ["grid", "widget.grid(row=0, column=0, sticky='')", "Place in a grid."],
  ["place", "widget.place(x=0, y=0)", "Absolute placement."],
  ["configure", "widget.configure(**options)", "Change options."],
  ["config", "widget.config(**options)", "Alias for configure."],
  ["cget", "widget.cget(option)", "Read an option."],
  ["bind", "widget.bind(sequence, func)", "Attach an event handler."],
  ["after", "widget.after(ms, func, *args)", "Run a callback later."],
  ["after_cancel", "widget.after_cancel(id)", "Cancel a scheduled callback."],
  ["destroy", "widget.destroy()", "Remove the widget."],
  ["update", "widget.update()", "Flush pending layout work."],
  ["winfo_width", "widget.winfo_width()", "Approximate width in pixels."],
  ["winfo_height", "widget.winfo_height()", "Approximate height in pixels."],
  ["focus_set", "widget.focus_set()", "Give the widget keyboard focus."],
  ["mainloop", "root.mainloop()", "Render the window."],
  ["title", "root.title(text)", "Set the window title."],
  ["geometry", "root.geometry('340x200')", "Set the window size."],
];

const pygameSurface = [
  ["fill", "surface.fill(color, rect=None)", "Fill the surface with a colour."],
  ["blit", "surface.blit(source, dest)", "Draw another surface."],
  ["get_rect", "surface.get_rect(**kwargs)", "Rectangle covering the surface."],
  ["get_size", "surface.get_size()", "Return (width, height)."],
  ["get_width", "surface.get_width()", "Return the width."],
  ["get_height", "surface.get_height()", "Return the height."],
  ["convert", "surface.convert()", "No-op in the browser."],
];

/** Modules with their members. `stdlib` marks what Pyodide can import. */
export const MODULES = {
  math: {
    doc: "Mathematical functions (`pi`, `tau`, trigonometry, logs).",
    members: [
      ["pi", "math.pi", "Ratio of a circle's circumference to its diameter.", "value"],
      ["e", "math.e", "Euler's number.", "value"],
      ["tau", "math.tau", "Two times pi.", "value"],
      ["inf", "math.inf", "Positive infinity.", "value"],
      ["nan", "math.nan", "Not a number.", "value"],
      ["sqrt", "math.sqrt(x)", "Square root.", "function"],
      ["pow", "math.pow(x, y)", "x raised to y.", "function"],
      ["floor", "math.floor(x)", "Largest integer <= x.", "function"],
      ["ceil", "math.ceil(x)", "Smallest integer >= x.", "function"],
      ["trunc", "math.trunc(x)", "Drop the fractional part.", "function"],
      ["fabs", "math.fabs(x)", "Absolute value as a float.", "function"],
      ["factorial", "math.factorial(n)", "Factorial of an integer.", "function"],
      ["gcd", "math.gcd(*integers)", "Greatest common divisor.", "function"],
      ["lcm", "math.lcm(*integers)", "Least common multiple.", "function"],
      ["hypot", "math.hypot(*coordinates)", "Euclidean norm.", "function"],
      ["sin", "math.sin(x)", "Sine of x radians.", "function"],
      ["cos", "math.cos(x)", "Cosine of x radians.", "function"],
      ["tan", "math.tan(x)", "Tangent of x radians.", "function"],
      ["asin", "math.asin(x)", "Arc sine.", "function"],
      ["acos", "math.acos(x)", "Arc cosine.", "function"],
      ["atan", "math.atan(x)", "Arc tangent.", "function"],
      ["atan2", "math.atan2(y, x)", "Angle of the point (x, y).", "function"],
      ["degrees", "math.degrees(x)", "Radians to degrees.", "function"],
      ["radians", "math.radians(x)", "Degrees to radians.", "function"],
      ["log", "math.log(x, base=e)", "Natural or custom-base logarithm.", "function"],
      ["log10", "math.log10(x)", "Base-10 logarithm.", "function"],
      ["exp", "math.exp(x)", "e raised to x.", "function"],
      ["isclose", "math.isclose(a, b, rel_tol=1e-9)", "Approximate equality.", "function"],
      ["dist", "math.dist(p, q)", "Distance between two points.", "function"],
    ],
  },
  random: {
    doc: "Pseudo-random numbers.",
    members: [
      ["random", "random.random()", "Float in [0.0, 1.0).", "function"],
      ["randint", "random.randint(a, b)", "Integer in [a, b].", "function"],
      ["randrange", "random.randrange(start, stop, step=1)", "Random integer from a range.", "function"],
      ["choice", "random.choice(sequence)", "Pick one item.", "function"],
      ["choices", "random.choices(population, weights=None, k=1)", "Pick k items with replacement.", "function"],
      ["sample", "random.sample(population, k)", "Pick k distinct items.", "function"],
      ["shuffle", "random.shuffle(x)", "Shuffle a list in place.", "function"],
      ["uniform", "random.uniform(a, b)", "Float in [a, b].", "function"],
      ["gauss", "random.gauss(mu, sigma)", "Normal distribution.", "function"],
      ["seed", "random.seed(a=None)", "Seed the generator.", "function"],
    ],
  },
  os: {
    doc: "Operating-system interface. Filenames live in Pyodide's MEMFS.",
    members: [
      ["getcwd", "os.getcwd()", "Current working directory.", "function"],
      ["chdir", "os.chdir(path)", "Change the working directory.", "function"],
      ["listdir", "os.listdir(path='.')", "Names in a directory.", "function"],
      ["mkdir", "os.mkdir(path)", "Create a directory.", "function"],
      ["makedirs", "os.makedirs(path, exist_ok=False)", "Create directories recursively.", "function"],
      ["remove", "os.remove(path)", "Delete a file.", "function"],
      ["rename", "os.rename(src, dst)", "Rename a file or directory.", "function"],
      ["replace", "os.replace(src, dst)", "Rename, overwriting the target.", "function"],
      ["path", "os.path", "Path manipulation helpers.", "value"],
      ["environ", "os.environ", "Environment variables.", "value"],
      ["getenv", "os.getenv(key, default=None)", "Read an environment variable.", "function"],
      ["walk", "os.walk(top)", "Walk a directory tree.", "function"],
    ],
  },
  sys: {
    doc: "Interpreter state, arguments and streams.",
    members: [
      ["argv", "sys.argv", "Command-line arguments.", "value"],
      ["version", "sys.version", "Python version string.", "value"],
      ["platform", "sys.platform", "Platform identifier.", "value"],
      ["path", "sys.path", "Import search path.", "value"],
      ["modules", "sys.modules", "Imported modules.", "value"],
      ["stdin", "sys.stdin", "Standard input.", "value"],
      ["stdout", "sys.stdout", "Standard output.", "value"],
      ["stderr", "sys.stderr", "Standard error.", "value"],
      ["exit", "sys.exit(code=0)", "Exit the program.", "function"],
    ],
  },
  json: {
    doc: "JSON encoder and decoder.",
    members: [
      ["dumps", "json.dumps(obj, indent=None)", "Serialise an object to text.", "function"],
      ["loads", "json.loads(text)", "Parse JSON text.", "function"],
      ["dump", "json.dump(obj, file, indent=None)", "Write JSON to a file.", "function"],
      ["load", "json.load(file)", "Read JSON from a file.", "function"],
    ],
  },
  time: {
    doc: "Clock and sleep helpers.",
    members: [
      ["time", "time.time()", "Seconds since the epoch.", "function"],
      ["sleep", "time.sleep(seconds)", "Block for a number of seconds.", "function"],
      ["perf_counter", "time.perf_counter()", "High-resolution timer.", "function"],
      ["monotonic", "time.monotonic()", "Monotonic clock.", "function"],
      ["strftime", "time.strftime(format, t=None)", "Format a time tuple.", "function"],
      ["localtime", "time.localtime(secs=None)", "Local time tuple.", "function"],
    ],
  },
  re: {
    doc: "Regular expressions.",
    members: [
      ["match", "re.match(pattern, string)", "Match at the start.", "function"],
      ["search", "re.search(pattern, string)", "Find anywhere.", "function"],
      ["findall", "re.findall(pattern, string)", "All non-overlapping matches.", "function"],
      ["finditer", "re.finditer(pattern, string)", "Iterator of match objects.", "function"],
      ["sub", "re.sub(pattern, repl, string, count=0)", "Replace matches.", "function"],
      ["split", "re.split(pattern, string)", "Split on matches.", "function"],
      ["compile", "re.compile(pattern)", "Compile a pattern.", "function"],
      ["escape", "re.escape(text)", "Escape metacharacters.", "function"],
    ],
  },
  collections: {
    doc: "Container datatypes.",
    members: [
      ["Counter", "collections.Counter(iterable=None)", "Count hashable items.", "class"],
      ["defaultdict", "collections.defaultdict(factory)", "Dict with default values.", "class"],
      ["deque", "collections.deque(iterable=(), maxlen=None)", "Double-ended queue.", "class"],
      ["namedtuple", "collections.namedtuple(name, fields)", "Tuple with named fields.", "function"],
      ["OrderedDict", "collections.OrderedDict()", "Dict that remembers insertion order.", "class"],
    ],
  },
  itertools: {
    doc: "Iterator building blocks.",
    members: [
      ["count", "itertools.count(start=0, step=1)", "Infinite counter.", "function"],
      ["cycle", "itertools.cycle(iterable)", "Repeat an iterable forever.", "function"],
      ["repeat", "itertools.repeat(object, times=None)", "Repeat one value.", "function"],
      ["chain", "itertools.chain(*iterables)", "Concatenate iterables.", "function"],
      ["product", "itertools.product(*iterables)", "Cartesian product.", "function"],
      ["permutations", "itertools.permutations(iterable, r=None)", "Ordered arrangements.", "function"],
      ["combinations", "itertools.combinations(iterable, r)", "Unordered selections.", "function"],
      ["groupby", "itertools.groupby(iterable, key=None)", "Group adjacent items.", "function"],
      ["islice", "itertools.islice(iterable, stop)", "Slice an iterator.", "function"],
    ],
  },
  statistics: {
    doc: "Basic statistics.",
    members: [
      ["mean", "statistics.mean(data)", "Arithmetic mean.", "function"],
      ["median", "statistics.median(data)", "Median value.", "function"],
      ["mode", "statistics.mode(data)", "Most common value.", "function"],
      ["stdev", "statistics.stdev(data)", "Sample standard deviation.", "function"],
      ["variance", "statistics.variance(data)", "Sample variance.", "function"],
    ],
  },
  turtle: {
    doc: "Turtle graphics, rendered on the Canvas panel.",
    members: turtleMethods.map(([label, signature, doc]) => [label, signature, doc, "function"]),
  },
  tkinter: {
    doc: "Tkinter widgets, rendered in the Window panel.",
    members: [
      ["Tk", "tkinter.Tk()", "Create the root window.", "class"],
      ["Frame", "tkinter.Frame(master)", "Container widget.", "class"],
      ["Label", "tkinter.Label(master, text='')", "Text label.", "class"],
      ["Button", "tkinter.Button(master, text='', command=None)", "Button.", "class"],
      ["Entry", "tkinter.Entry(master)", "Single-line input.", "class"],
      ["Text", "tkinter.Text(master)", "Multi-line input.", "class"],
      ["Canvas", "tkinter.Canvas(master, width=320, height=200)", "Drawing surface.", "class"],
      ["Listbox", "tkinter.Listbox(master)", "List of choices.", "class"],
      ["Scale", "tkinter.Scale(master, from_=0, to=100)", "Slider.", "class"],
      ["Checkbutton", "tkinter.Checkbutton(master, text='')", "Checkbox.", "class"],
      ["Radiobutton", "tkinter.Radiobutton(master, text='', value=0)", "Radio button.", "class"],
      ["StringVar", "tkinter.StringVar(value='')", "String variable.", "class"],
      ["IntVar", "tkinter.IntVar(value=0)", "Integer variable.", "class"],
      ["BooleanVar", "tkinter.BooleanVar(value=False)", "Boolean variable.", "class"],
      ["messagebox", "tkinter.messagebox.showinfo(title, message)", "Show a dialog in the terminal.", "value"],
    ].concat(tkMethods.map(([label, signature, doc]) => [label, signature, doc, "function"])),
  },
  pygame: {
    doc: "A small pygame subset, rendered on the Canvas panel.",
    members: [
      ["init", "pygame.init()", "Initialise the modules.", "function"],
      ["quit", "pygame.quit()", "Shut down the modules.", "function"],
      ["display", "pygame.display", "Window / surface functions.", "value"],
      ["draw", "pygame.draw", "Shape drawing helpers.", "value"],
      ["event", "pygame.event", "Event queue.", "value"],
      ["time", "pygame.time", "Clock helpers.", "value"],
      ["font", "pygame.font", "Text rendering.", "value"],
      ["key", "pygame.key", "Keyboard state.", "value"],
      ["mouse", "pygame.mouse", "Mouse state.", "value"],
      ["Surface", "pygame.Surface(size)", "Off-screen image.", "class"],
      ["Rect", "pygame.Rect(x, y, w, h)", "Rectangle helper.", "class"],
    ],
  },
  csv: { doc: "Read and write CSV files.", members: [["reader", "csv.reader(file)", "Row iterator.", "function"], ["writer", "csv.writer(file)", "Row writer.", "function"], ["DictReader", "csv.DictReader(file)", "Rows as dicts.", "class"], ["DictWriter", "csv.DictWriter(file, fieldnames)", "Write dict rows.", "class"]] },
  datetime: { doc: "Dates and times.", members: [["datetime", "datetime.datetime.now()", "Date and time.", "class"], ["date", "datetime.date.today()", "Calendar date.", "class"], ["timedelta", "datetime.timedelta(days=0)", "Duration.", "class"], ["timezone", "datetime.timezone.utc", "UTC timezone.", "value"]] },
  pathlib: { doc: "Object-oriented filesystem paths.", members: [["Path", "pathlib.Path('file.txt')", "Filesystem path.", "class"]] },
  functools: { doc: "Higher-order functions.", members: [["reduce", "functools.reduce(function, iterable)", "Fold an iterable.", "function"], ["lru_cache", "functools.lru_cache(maxsize=128)", "Memoisation decorator.", "function"], ["partial", "functools.partial(func, *args)", "Bind arguments.", "function"]] },
  string: { doc: "String constants and templates.", members: [["ascii_letters", "string.ascii_letters", "a-z and A-Z.", "value"], ["digits", "string.digits", "0-9.", "value"], ["punctuation", "string.punctuation", "ASCII punctuation.", "value"], ["Template", "string.Template(template)", "Simple substitution template.", "class"]] },
  heapq: { doc: "Heap queue algorithms.", members: [["heappush", "heapq.heappush(heap, item)", "Push onto a heap.", "function"], ["heappop", "heapq.heappop(heap)", "Pop the smallest item.", "function"], ["heapify", "heapq.heapify(x)", "Turn a list into a heap.", "function"], ["nlargest", "heapq.nlargest(n, iterable)", "The n largest items.", "function"], ["nsmallest", "heapq.nsmallest(n, iterable)", "The n smallest items.", "function"]] },
  bisect: { doc: "Binary search on sorted lists.", members: [["bisect_left", "bisect.bisect_left(a, x)", "Insertion point on the left.", "function"], ["bisect_right", "bisect.bisect_right(a, x)", "Insertion point on the right.", "function"], ["insort", "bisect.insort(a, x)", "Insert while keeping order.", "function"]] },
  sqlite3: { doc: "SQLite database access (in-memory inside the browser).", members: [["connect", "sqlite3.connect(':memory:')", "Open a database.", "function"]] },
  micropip: { doc: "Install pure-Python wheels from PyPI into Pyodide.", members: [["install", "micropip.install('numpy')", "Install a package.", "function"]] },
  numpy: {
    doc: "NumPy arrays and numerical computing. Pyodide loads it automatically when imported.",
    members: [
      ["array", "numpy.array(values)", "Create an array.", "function"],
      ["arange", "numpy.arange(start, stop, step)", "Create a range of values.", "function"],
      ["linspace", "numpy.linspace(start, stop, num=50)", "Create evenly spaced values.", "function"],
      ["zeros", "numpy.zeros(shape)", "Create an array filled with zeros.", "function"],
      ["ones", "numpy.ones(shape)", "Create an array filled with ones.", "function"],
      ["mean", "numpy.mean(values)", "Calculate the arithmetic mean.", "function"],
      ["sum", "numpy.sum(values)", "Sum array values.", "function"],
      ["sqrt", "numpy.sqrt(values)", "Calculate square roots.", "function"],
      ["pi", "numpy.pi", "The constant pi.", "value"],
      ["random", "numpy.random", "Random number helpers.", "value"],
    ],
  },
  pandas: {
    doc: "DataFrame and Series tools for working with tabular data. Pyodide loads it automatically when imported.",
    members: [
      ["DataFrame", "pandas.DataFrame(data)", "Create a labeled, two-dimensional table.", "class"],
      ["Series", "pandas.Series(data)", "Create a labeled one-dimensional sequence.", "class"],
      ["read_csv", "pandas.read_csv(filepath_or_buffer)", "Read CSV data into a DataFrame.", "function"],
      ["concat", "pandas.concat(objects)", "Combine pandas objects.", "function"],
      ["merge", "pandas.merge(left, right, on=None)", "Join DataFrames.", "function"],
      ["to_datetime", "pandas.to_datetime(arg)", "Convert values to datetimes.", "function"],
      ["isna", "pandas.isna(obj)", "Detect missing values.", "function"],
    ],
  },
};

export const SNIPPETS = [
  {
    label: "if __name__",
    detail: "Script entry point",
    insertText: "if __name__ == \"__main__\":\n    ${1:main()}\n",
  },
  {
    label: "for",
    detail: "for loop",
    insertText: "for ${1:item} in ${2:iterable}:\n    ${0:pass}\n",
  },
  {
    label: "while",
    detail: "while loop",
    insertText: "while ${1:condition}:\n    ${0:pass}\n",
  },
  {
    label: "def",
    detail: "Function definition",
    insertText: "def ${1:name}(${2:args}):\n    ${3:return None}\n",
  },
  {
    label: "class",
    detail: "Class definition",
    insertText: "class ${1:Name}:\n    def __init__(self${2:, value}):\n        ${0:pass}\n",
  },
  {
    label: "try",
    detail: "Exception handling",
    insertText: "try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:exc}:\n    ${0:raise}\n",
  },
  {
    label: "with",
    detail: "Context manager",
    insertText: "with ${1:open(\"file.txt\")} as ${2:handle}:\n    ${0:pass}\n",
  },
  {
    label: "turtle",
    detail: "Turtle drawing",
    insertText: "import turtle\n\nt = turtle.Turtle()\nt.speed(0)\nfor i in range(${1:120}):\n    t.forward(i * ${2:2})\n    t.left(${3:59})\n",
  },
  {
    label: "tkinter app",
    detail: "Tkinter window",
    insertText: "import tkinter as tk\n\nroot = tk.Tk()\nroot.title(\"${1:App}\")\n\nlabel = tk.Label(root, text=\"${2:Hello}\")\nlabel.pack(padx=20, pady=20)\n\ndef on_click():\n    label.config(text=\"${3:Clicked}\")\n\ntk.Button(root, text=\"Click me\", command=on_click).pack()\nroot.mainloop()\n",
  },
  {
    label: "main guard",
    detail: "if __name__ == '__main__'",
    insertText: "def main():\n    ${1:pass}\n\n\nif __name__ == \"__main__\":\n    main()\n",
  },
];

/* -------------------------------------------------------------------------
 * Lookup helpers
 * ---------------------------------------------------------------------- */

const ARG_TYPE = {
  str: strMethods,
  list: listMethods,
  dict: dictMethods,
  set: setMethods,
  turtle: turtleMethods,
  tk: tkMethods,
  pygame: pygameSurface,
};

function builtinEntry(name) {
  return BUILTINS.find((entry) => entry.label === name) || null;
}

const PYTHON_RESERVED_NAMES = new Set([
  ...KEYWORDS.map(([name]) => name),
  ...BUILTINS.map(({ label }) => label),
  ...Object.keys(MODULES),
]);
const modelSymbolCache = new WeakMap();

function maskPythonLiterals(source) {
  let masked = "";
  let quote = null;
  let quoteSize = 0;
  let escaped = false;
  let comment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (comment) {
      if (character === "\n") {
        masked += "\n";
        comment = false;
      } else {
        masked += " ";
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        masked += character === "\n" ? "\n" : " ";
        escaped = false;
        continue;
      }
      if (character === "\\") {
        masked += " ";
        escaped = true;
        continue;
      }
      if (quoteSize === 3 && source.startsWith(quote.repeat(3), index)) {
        masked += "   ";
        index += 2;
        quote = null;
        quoteSize = 0;
        continue;
      }
      if (quoteSize === 1 && character === quote) {
        masked += " ";
        quote = null;
        quoteSize = 0;
        continue;
      }
      masked += character === "\n" ? "\n" : " ";
      continue;
    }

    if (character === "#") {
      masked += " ";
      comment = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      quoteSize = source.startsWith(character.repeat(3), index) ? 3 : 1;
      masked += " ".repeat(quoteSize);
      index += quoteSize - 1;
      continue;
    }
    masked += character;
  }

  return masked;
}

function readBalancedGroup(source, start, opening, closing) {
  if (start < 0) return "";
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === opening) depth += 1;
    else if (source[index] === closing) {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }
  return "";
}

function modelIsInCommentOrString(monaco, model, position) {
  const standardTokenType = monaco.languages.StandardTokenType;
  const tokens = model.getLineTokens?.(position.lineNumber);
  if (!standardTokenType || !tokens?.findTokenIndexAtOffset || !tokens?.getStandardTokenType) return false;

  const tokenIndex = tokens.findTokenIndexAtOffset(Math.max(0, position.column - 2));
  const tokenType = tokens.getStandardTokenType(tokenIndex);
  return tokenType === standardTokenType.Comment || tokenType === standardTokenType.String;
}

function symbolsForModel(model) {
  const versionId = model.getVersionId?.();
  const cached = modelSymbolCache.get(model);
  if (versionId !== undefined && cached?.versionId === versionId) return cached.symbols;

  const symbols = collectPythonSymbols(model.getValue());
  if (versionId !== undefined) modelSymbolCache.set(model, { versionId, symbols });
  return symbols;
}

export function collectPythonSymbols(source) {
  const lines = maskPythonLiterals(String(source ?? "")).split(/\r?\n/);
  const symbols = new Map();
  const ranks = { variable: 1, parameter: 2, module: 3, function: 4, class: 5 };

  const add = (name, kind, detail, signature = "") => {
    if (!/^[A-Za-z_]\w*$/.test(name) || PYTHON_RESERVED_NAMES.has(name)) return;
    const existing = symbols.get(name);
    if (existing && ranks[existing.kind] >= ranks[kind]) return;
    symbols.set(name, { label: name, kind, detail, signature, doc: detail });
  };

  const addTargetNames = (target, detail) => {
    const names = target.split(":", 1)[0].match(/[A-Za-z_]\w*/g) || [];
    for (const name of names) add(name, "variable", detail);
  };

  for (const line of lines) {
    const definition = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(line);
    if (definition) {
      const opening = line.indexOf("(", definition.index);
      const parameters = readBalancedGroup(line, opening, "(", ")");
      const parameterNames = [];
      for (const parameter of splitParams(parameters)) {
        const name = parameter.trim().replace(/^\*{1,2}/, "").split(/[=:]/, 1)[0].trim();
        if (/^[A-Za-z_]\w*$/.test(name)) {
          parameterNames.push(name);
          add(name, "parameter", `Parameter of ${definition[1]}`);
        }
      }
      add(definition[1], "function", "Function defined in this file", `${definition[1]}(${parameterNames.join(", ")})`);
    }

    const classDefinition = /^\s*class\s+([A-Za-z_]\w*)/.exec(line);
    if (classDefinition) add(classDefinition[1], "class", "Class defined in this file");

    const importStatement = /^\s*import\s+(.+)$/.exec(line);
    if (importStatement) {
      for (const item of splitParams(importStatement[1])) {
        const match = /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(item);
        if (match) add(match[2] || match[1].split(".")[0], "module", "Imported module");
      }
      continue;
    }

    const fromImport = /^\s*from\s+[.\w]+\s+import\s+(.+)$/.exec(line);
    if (fromImport) {
      for (const item of splitParams(fromImport[1].replace(/[()]/g, " "))) {
        const match = /^\s*([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(item);
        if (match) add(match[2] || match[1], "variable", "Imported name");
      }
      continue;
    }

    const loop = /^\s*(?:async\s+)?for\s+(.+?)\s+in\b/.exec(line);
    if (loop) addTargetNames(loop[1], "Loop variable");

    const alias = /\bas\s+([A-Za-z_]\w*)/g;
    for (const match of line.matchAll(alias)) add(match[1], "variable", "Local alias");

    const declaration = /^\s*(?:global|nonlocal)\s+(.+)$/.exec(line);
    if (declaration) addTargetNames(declaration[1], "Declared name");

    const assignment = /^\s*((?:[A-Za-z_]\w*\s*,\s*)*[A-Za-z_]\w*)\s*(?::[^=\n]+)?(?:\*\*=|\/\/=|>>=|<<=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|=(?!=))/.exec(line);
    if (assignment) addTargetNames(assignment[1], "Variable in this file");
  }

  return [...symbols.values()];
}

export function lookupSymbol(dotted) {
  const [head, member] = String(dotted).split(".");
  if (member) {
    const mod = MODULES[head];
    if (mod) {
      const found = mod.members.find(([label]) => label === member);
      if (found) {
        const [label, signature, doc, kind = "function"] = found;
        return { label, signature, doc, kind };
      }
    }
    return null;
  }
  return builtinEntry(head) || null;
}

/** Infer ``receiver -> type`` from simple assignments in the buffer. */
function inferVariables(source) {
  const types = new Map();
  const assignment = /^[ \t]*([A-Za-z_]\w*)\s*(?::[^=\n]+)?\s*=\s*([^\n#]+)/gm;
  let match;
  while ((match = assignment.exec(source))) {
    const [, name, rhs] = match;
    const text = rhs.trim();
    if (/^(?:turtle\.)?(?:Turtle|RawTurtle)\s*\(/.test(text)) types.set(name, "turtle");
    else if (/(?:tkinter|tk)\.(?:Tk|Toplevel)\s*\(/.test(text)) types.set(name, "tk");
    else if (/(?:tkinter|tk)\.(?:Frame|Label|Button|Entry|Text|Canvas|Listbox|Scale|Checkbutton|Radiobutton)\s*\(/.test(text)) types.set(name, "tk");
    else if (/pygame\.Surface\s*\(/.test(text)) types.set(name, "pygame");
    else if (/^(?:[rubf]{0,2})["']/i.test(text)) types.set(name, "str");
    else if (/^(?:list)\s*\(/.test(text) || /^\s*\[/.test(text)) types.set(name, "list");
    else if (/^(?:dict)\s*\(/.test(text) || /^\s*\{\s*\}/.test(text) || /^\s*\{[^}]*:/.test(text)) types.set(name, "dict");
    else if (/^(?:set)\s*\(/.test(text) || /^\s*\{/.test(text)) types.set(name, "set");
    else if (/^\s*\(/.test(text)) types.set(name, "list");
  }
  return types;
}

function toSuggestion(monaco, range, entry, kindOverride) {
  const kindName = entry.kind || kindOverride || "function";
  const kind =
    kindName === "class"
      ? monaco.languages.CompletionItemKind.Class
      : kindName === "value"
        ? monaco.languages.CompletionItemKind.Constant
        : kindName === "variable" || kindName === "parameter"
          ? monaco.languages.CompletionItemKind.Variable
          : kindName === "module"
            ? monaco.languages.CompletionItemKind.Module
            : monaco.languages.CompletionItemKind.Function;
  const sortPriority =
    kindName === "variable" || kindName === "parameter"
      ? "0"
      : kindName === "function"
        ? "1"
        : kindName === "class"
          ? "2"
          : kindName === "module"
            ? "5"
            : "3";

  return {
    label: entry.label,
    kind,
    detail: entry.signature || entry.detail || "",
    documentation: entry.doc ? { value: entry.doc } : undefined,
    insertText: entry.insertText || entry.label,
    insertTextRules: entry.insertText
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    sortText: `${sortPriority}${entry.label}`,
    range,
  };
}

function memberSuggestions(monaco, range, members) {
  return members.map(([label, signature, doc, kind]) =>
    toSuggestion(monaco, range, { label, signature, doc, kind })
  );
}

/* -------------------------------------------------------------------------
 * Registration
 * ---------------------------------------------------------------------- */

export function registerPythonIntelliSense(monaco) {
  const K = monaco.languages.CompletionItemKind;

  monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: Array.from("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_.$"),
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      if (modelIsInCommentOrString(monaco, model, position)) return { suggestions: [] };

      const prefix = word.word.toLowerCase();
      const matchesPrefix = (label) => label.toLowerCase().startsWith(prefix);
      const line = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);
      const memberMatch = /([A-Za-z_]\w*)\s*\.\s*[A-Za-z_]*$/.exec(before);

      if (memberMatch) {
        const receiver = memberMatch[1];
        if (MODULES[receiver]) {
          return { suggestions: memberSuggestions(monaco, range, MODULES[receiver].members) };
        }
        const inferred = inferVariables(model.getValue()).get(receiver);
        if (inferred && ARG_TYPE[inferred]) {
          return { suggestions: memberSuggestions(monaco, range, ARG_TYPE[inferred]) };
        }
        if (receiver === "self") {
          return { suggestions: memberSuggestions(monaco, range, tkMethods) };
        }
        return { suggestions: [] };
      }

      const suggestions = [];

      for (const [label, doc] of KEYWORDS) {
        if (!matchesPrefix(label)) continue;
        suggestions.push({
          label,
          kind: K.Keyword,
          detail: "keyword",
          documentation: doc,
          insertText: label,
          sortText: `4${label}`,
          range,
        });
      }

      for (const entry of BUILTINS) {
        if (matchesPrefix(entry.label)) suggestions.push(toSuggestion(monaco, range, entry));
      }

      for (const [name, meta] of Object.entries(MODULES)) {
        if (!matchesPrefix(name)) continue;
        suggestions.push({
          label: name,
          kind: K.Module,
          detail: "module",
          documentation: meta.doc,
          insertText: name,
          sortText: `5${name}`,
          range,
        });
      }

      for (const snippet of SNIPPETS) {
        if (!matchesPrefix(snippet.label)) continue;
        suggestions.push({
          label: snippet.label,
          kind: K.Snippet,
          detail: snippet.detail,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `6${snippet.label}`,
          range,
        });
      }

      for (const entry of symbolsForModel(model)) {
        if (matchesPrefix(entry.label)) suggestions.push(toSuggestion(monaco, range, entry));
      }

      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider("python", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const line = model.getLineContent(position.lineNumber);
      const before = line.slice(0, word.startColumn - 1);
      const receiver = /([A-Za-z_]\w*)\s*\.\s*$/.exec(before)?.[1] || null;
      const entry = lookupSymbol(receiver ? `${receiver}.${word.word}` : word.word);
      if (!entry) return null;

      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        ),
        contents: [
          { value: `\`\`\`python\n${entry.signature || entry.label}\n\`\`\`` },
          ...(entry.doc ? [{ value: entry.doc }] : []),
        ],
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider("python", {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [","],
    provideSignatureHelp(model, position) {
      const context = signatureContext(model, position);
      if (!context) return null;
      const entry = lookupSymbol(context.name);
      if (!entry || !entry.signature) return null;

      const open = entry.signature.indexOf("(");
      const close = entry.signature.lastIndexOf(")");
      const raw = open >= 0 && close > open ? entry.signature.slice(open + 1, close) : "";
      const params = splitParams(raw);

      return {
        value: {
          activeSignature: 0,
          activeParameter: Math.min(context.argIndex, Math.max(0, params.length - 1)),
          signatures: [
            {
              label: entry.signature,
              documentation: entry.doc ? { value: entry.doc } : undefined,
              parameters: params.map((label) => ({ label })),
            },
          ],
        },
        dispose() {},
      };
    },
  });
}

function splitParams(raw) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    else if (char === "," && depth === 0) {
      out.push(raw.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function signatureContext(model, position) {
  const text = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  let depth = 0;
  let open = -1;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (char === ")" || char === "]" || char === "}") depth += 1;
    else if (char === "(") {
      if (depth === 0) {
        open = index;
        break;
      }
      depth -= 1;
    } else if (char === "\n" && depth === 0 && !/[A-Za-z_]\s*$/.test(text.slice(0, index))) {
      // Keep scanning: calls can span lines.
    }
  }
  if (open < 0) return null;

  const before = text.slice(0, open);
  const match = /([A-Za-z_][\w.]*)\s*$/.exec(before);
  if (!match) return null;

  let argIndex = 0;
  let inner = 0;
  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "[" || char === "{") inner += 1;
    else if (char === ")" || char === "]" || char === "}") inner -= 1;
    else if (char === "," && inner === 0) argIndex += 1;
  }

  return { name: match[1], argIndex };
}
