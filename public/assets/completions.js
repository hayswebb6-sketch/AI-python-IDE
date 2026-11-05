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

const numpyArrayMethods = [
  ["astype", "array.astype(dtype)", "Return an array converted to another dtype."],
  ["copy", "array.copy()", "Return a copy of the array."],
  ["flatten", "array.flatten()", "Return a flattened copy."],
  ["max", "array.max(axis=None)", "Return the maximum value."],
  ["mean", "array.mean(axis=None)", "Return the arithmetic mean."],
  ["min", "array.min(axis=None)", "Return the minimum value."],
  ["reshape", "array.reshape(shape)", "Return the array with a new shape."],
  ["ravel", "array.ravel()", "Return a flattened view when possible."],
  ["round", "array.round(decimals=0)", "Round array values."],
  ["shape", "array.shape", "Array dimensions.", "value"],
  ["size", "array.size", "Number of array elements.", "value"],
  ["sum", "array.sum(axis=None)", "Sum array elements."],
  ["transpose", "array.transpose()", "Return the transposed array."],
  ["T", "array.T", "Transposed array.", "value"],
  ["dtype", "array.dtype", "Array element type.", "value"],
];

const pandasFrameMethods = [
  ["head", "frame.head(n=5)", "Return the first rows."],
  ["tail", "frame.tail(n=5)", "Return the last rows."],
  ["describe", "frame.describe()", "Generate descriptive statistics."],
  ["info", "frame.info()", "Print a concise summary."],
  ["mean", "frame.mean(axis=0)", "Calculate the mean."],
  ["sum", "frame.sum(axis=0)", "Calculate the sum."],
  ["sort_values", "frame.sort_values(by, ascending=True)", "Sort by column values."],
  ["groupby", "frame.groupby(by)", "Group rows by one or more columns."],
  ["drop", "frame.drop(labels, axis=0)", "Drop specified labels."],
  ["fillna", "frame.fillna(value=None)", "Fill missing values."],
  ["isna", "frame.isna()", "Detect missing values."],
  ["to_csv", "frame.to_csv(path_or_buf=None, index=True)", "Write the DataFrame to CSV."],
  ["to_dict", "frame.to_dict(orient='dict')", "Convert the DataFrame to dictionaries."],
  ["columns", "frame.columns", "Column labels.", "value"],
  ["index", "frame.index", "Row labels.", "value"],
  ["shape", "frame.shape", "DataFrame dimensions.", "value"],
  ["loc", "frame.loc", "Select rows and columns by label.", "value"],
  ["iloc", "frame.iloc", "Select rows and columns by position.", "value"],
];

const pandasSeriesMethods = [
  ["head", "series.head(n=5)", "Return the first values."],
  ["tail", "series.tail(n=5)", "Return the last values."],
  ["mean", "series.mean()", "Calculate the mean."],
  ["sum", "series.sum()", "Calculate the sum."],
  ["value_counts", "series.value_counts()", "Count unique values."],
  ["unique", "series.unique()", "Return unique values."],
  ["sort_values", "series.sort_values()", "Sort by values."],
  ["isna", "series.isna()", "Detect missing values."],
  ["fillna", "series.fillna(value=None)", "Fill missing values."],
  ["to_list", "series.to_list()", "Convert values to a list."],
  ["index", "series.index", "Row labels.", "value"],
  ["shape", "series.shape", "Series dimensions.", "value"],
  ["dtype", "series.dtype", "Value type.", "value"],
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
      ["Toplevel", "tkinter.Toplevel(master=None)", "Create an additional window.", "class"],
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
      ["DoubleVar", "tkinter.DoubleVar(value=0.0)", "Floating-point variable.", "class"],
      ["END", "tkinter.END", "Index after the final character.", "value"],
      ["BOTH", "tkinter.BOTH", "Fill both directions in pack().", "value"],
      ["LEFT", "tkinter.LEFT", "Align to the left.", "value"],
      ["RIGHT", "tkinter.RIGHT", "Align to the right.", "value"],
      ["X", "tkinter.X", "Fill horizontally.", "value"],
      ["Y", "tkinter.Y", "Fill vertically.", "value"],
      ["messagebox", "tkinter.messagebox.showinfo(title, message)", "Show a dialog in the terminal.", "value"],
    ].concat(tkMethods.map(([label, signature, doc]) => [label, signature, doc, "function"])),
  },
  "tkinter.ttk": {
    doc: "Themed Tkinter widgets.",
    members: [
      ["Frame", "ttk.Frame(master)", "Themed container widget.", "class"],
      ["Label", "ttk.Label(master, text='')", "Themed text label.", "class"],
      ["Button", "ttk.Button(master, text='', command=None)", "Themed button.", "class"],
      ["Entry", "ttk.Entry(master)", "Themed single-line input.", "class"],
      ["Checkbutton", "ttk.Checkbutton(master, text='')", "Themed checkbox.", "class"],
      ["Combobox", "ttk.Combobox(master, values=())", "Dropdown selection widget.", "class"],
      ["Notebook", "ttk.Notebook(master)", "Tabbed container.", "class"],
      ["Progressbar", "ttk.Progressbar(master, maximum=100)", "Progress indicator.", "class"],
      ["Scale", "ttk.Scale(master, from_=0, to=100)", "Themed slider.", "class"],
      ["Separator", "ttk.Separator(master)", "Visual divider.", "class"],
      ["Treeview", "ttk.Treeview(master, columns=())", "Tabular tree widget.", "class"],
      ["Style", "ttk.Style(master=None)", "Configure widget styles.", "class"],
    ].concat(tkMethods.map(([label, signature, doc]) => [label, signature, doc, "function"])),
  },
  "tkinter.messagebox": {
    doc: "Tkinter message dialogs.",
    members: [
      ["showinfo", "messagebox.showinfo(title, message)", "Show an information dialog.", "function"],
      ["showwarning", "messagebox.showwarning(title, message)", "Show a warning dialog.", "function"],
      ["showerror", "messagebox.showerror(title, message)", "Show an error dialog.", "function"],
      ["askyesno", "messagebox.askyesno(title, message)", "Ask a yes-or-no question.", "function"],
      ["askokcancel", "messagebox.askokcancel(title, message)", "Ask for confirmation.", "function"],
      ["askretrycancel", "messagebox.askretrycancel(title, message)", "Ask whether to retry.", "function"],
    ],
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
  decimal: { doc: "Decimal fixed-point arithmetic.", members: [["Decimal", "decimal.Decimal(value)", "Create a decimal number.", "class"], ["getcontext", "decimal.getcontext()", "Get the active arithmetic context.", "function"], ["localcontext", "decimal.localcontext(ctx=None)", "Temporarily use a decimal context.", "function"]] },
  fractions: { doc: "Rational numbers.", members: [["Fraction", "fractions.Fraction(numerator, denominator=1)", "Create a rational number.", "class"]] },
  argparse: { doc: "Command-line argument parsing.", members: [["ArgumentParser", "argparse.ArgumentParser(description=None)", "Create a command-line parser.", "class"], ["Namespace", "argparse.Namespace(**kwargs)", "Store parsed arguments.", "class"]] },
  logging: { doc: "Application logging.", members: [["debug", "logging.debug(msg, *args)", "Log a debug message.", "function"], ["info", "logging.info(msg, *args)", "Log an informational message.", "function"], ["warning", "logging.warning(msg, *args)", "Log a warning.", "function"], ["error", "logging.error(msg, *args)", "Log an error.", "function"], ["exception", "logging.exception(msg, *args)", "Log an exception with traceback.", "function"], ["basicConfig", "logging.basicConfig(level=None)", "Configure the root logger.", "function"], ["getLogger", "logging.getLogger(name=None)", "Get a named logger.", "function"], ["DEBUG", "logging.DEBUG", "Debug logging level.", "value"], ["INFO", "logging.INFO", "Informational logging level.", "value"], ["WARNING", "logging.WARNING", "Warning logging level.", "value"], ["ERROR", "logging.ERROR", "Error logging level.", "value"]] },
  textwrap: { doc: "Wrap and format plain text.", members: [["wrap", "textwrap.wrap(text, width=70)", "Wrap text into lines.", "function"], ["fill", "textwrap.fill(text, width=70)", "Wrap text into one string.", "function"], ["dedent", "textwrap.dedent(text)", "Remove common leading whitespace.", "function"], ["indent", "textwrap.indent(text, prefix)", "Add a prefix to each line.", "function"]] },
  urllib: { doc: "URL handling utilities.", members: [["parse", "urllib.parse", "URL parsing and quoting.", "module"], ["request", "urllib.request", "HTTP request helpers.", "module"]] },
  "urllib.parse": { doc: "Parse, quote, and construct URLs.", members: [["urlparse", "urllib.parse.urlparse(url)", "Parse a URL.", "function"], ["urljoin", "urllib.parse.urljoin(base, url)", "Join a URL to a base.", "function"], ["urlencode", "urllib.parse.urlencode(query)", "Encode query parameters.", "function"], ["quote", "urllib.parse.quote(string)", "Percent-encode a string.", "function"], ["unquote", "urllib.parse.unquote(string)", "Decode percent-encoded text.", "function"], ["parse_qs", "urllib.parse.parse_qs(query)", "Parse a query string.", "function"]] },
  numpy: {
    doc: "Numerical arrays and mathematical operations (commonly imported as np).",
    members: [
      ["array", "numpy.array(object, dtype=None)", "Create an array.", "function"],
      ["asarray", "numpy.asarray(object, dtype=None)", "Convert input to an array.", "function"],
      ["arange", "numpy.arange(start, stop=None, step=1)", "Create evenly spaced values.", "function"],
      ["linspace", "numpy.linspace(start, stop, num=50)", "Create evenly spaced samples.", "function"],
      ["zeros", "numpy.zeros(shape)", "Create an array filled with zeros.", "function"],
      ["ones", "numpy.ones(shape)", "Create an array filled with ones.", "function"],
      ["empty", "numpy.empty(shape)", "Create an uninitialised array.", "function"],
      ["full", "numpy.full(shape, fill_value)", "Create an array with a fill value.", "function"],
      ["eye", "numpy.eye(N, M=None)", "Create a 2-D identity matrix.", "function"],
      ["reshape", "numpy.reshape(a, newshape)", "Reshape an array.", "function"],
      ["concatenate", "numpy.concatenate(arrays, axis=0)", "Join arrays along an axis.", "function"],
      ["stack", "numpy.stack(arrays, axis=0)", "Join arrays along a new axis.", "function"],
      ["where", "numpy.where(condition, x, y)", "Select values by condition.", "function"],
      ["mean", "numpy.mean(a, axis=None)", "Compute the arithmetic mean.", "function"],
      ["median", "numpy.median(a, axis=None)", "Compute the median.", "function"],
      ["std", "numpy.std(a, axis=None)", "Compute the standard deviation.", "function"],
      ["sum", "numpy.sum(a, axis=None)", "Sum array elements.", "function"],
      ["min", "numpy.min(a, axis=None)", "Find the minimum.", "function"],
      ["max", "numpy.max(a, axis=None)", "Find the maximum.", "function"],
      ["abs", "numpy.abs(x)", "Element-wise absolute value.", "function"],
      ["sqrt", "numpy.sqrt(x)", "Element-wise square root.", "function"],
      ["sin", "numpy.sin(x)", "Element-wise sine.", "function"],
      ["cos", "numpy.cos(x)", "Element-wise cosine.", "function"],
      ["pi", "numpy.pi", "The mathematical constant pi.", "value"],
      ["nan", "numpy.nan", "Not-a-Number value.", "value"],
      ["newaxis", "numpy.newaxis", "Add a dimension to an array.", "value"],
      ["ndarray", "numpy.ndarray(shape)", "N-dimensional array type.", "class"],
      ["linalg", "numpy.linalg", "Linear algebra routines.", "module"],
      ["random", "numpy.random", "Random number generation.", "module"],
    ],
  },
  "numpy.linalg": { doc: "Linear algebra operations.", members: [["norm", "numpy.linalg.norm(x, ord=None)", "Compute a vector or matrix norm.", "function"], ["det", "numpy.linalg.det(a)", "Compute a matrix determinant.", "function"], ["inv", "numpy.linalg.inv(a)", "Compute a matrix inverse.", "function"], ["solve", "numpy.linalg.solve(a, b)", "Solve a linear system.", "function"], ["eig", "numpy.linalg.eig(a)", "Compute eigenvalues and eigenvectors.", "function"], ["svd", "numpy.linalg.svd(a)", "Compute a singular value decomposition.", "function"], ["matrix_rank", "numpy.linalg.matrix_rank(a)", "Compute the matrix rank.", "function"]] },
  "numpy.random": { doc: "Random sampling tools from NumPy.", members: [["default_rng", "numpy.random.default_rng(seed=None)", "Create a random generator.", "function"], ["random", "numpy.random.random(size=None)", "Draw random floats.", "function"], ["rand", "numpy.random.rand(d0, d1)", "Draw samples from a uniform distribution.", "function"], ["randint", "numpy.random.randint(low, high=None, size=None)", "Draw random integers.", "function"], ["normal", "numpy.random.normal(loc=0.0, scale=1.0, size=None)", "Draw normal samples.", "function"], ["choice", "numpy.random.choice(a, size=None)", "Choose random samples.", "function"], ["seed", "numpy.random.seed(seed=None)", "Seed the random generator.", "function"]] },
  pandas: {
    doc: "Tabular data analysis (commonly imported as pd).",
    members: [
      ["DataFrame", "pandas.DataFrame(data=None, columns=None)", "Two-dimensional labeled data.", "class"],
      ["Series", "pandas.Series(data=None, index=None)", "One-dimensional labeled data.", "class"],
      ["read_csv", "pandas.read_csv(filepath_or_buffer)", "Read a CSV file into a DataFrame.", "function"],
      ["read_json", "pandas.read_json(path_or_buf)", "Read JSON data.", "function"],
      ["concat", "pandas.concat(objs, axis=0)", "Concatenate pandas objects.", "function"],
      ["merge", "pandas.merge(left, right, on=None)", "Merge DataFrames.", "function"],
      ["to_datetime", "pandas.to_datetime(arg)", "Convert values to datetimes.", "function"],
      ["date_range", "pandas.date_range(start, end=None, periods=None)", "Create a date range.", "function"],
      ["NaT", "pandas.NaT", "Missing datetime value.", "value"],
      ["NA", "pandas.NA", "Missing value indicator.", "value"],
    ],
  },
  matplotlib: { doc: "Plotting library.", members: [["pyplot", "matplotlib.pyplot", "State-based plotting interface.", "module"]] },
  "matplotlib.pyplot": {
    doc: "Matplotlib plotting functions (commonly imported as plt).",
    members: [
      ["plot", "pyplot.plot(x, y, label=None)", "Plot lines and/or markers.", "function"],
      ["scatter", "pyplot.scatter(x, y)", "Make a scatter plot.", "function"],
      ["bar", "pyplot.bar(x, height)", "Make a bar plot.", "function"],
      ["barh", "pyplot.barh(y, width)", "Make a horizontal bar plot.", "function"],
      ["hist", "pyplot.hist(x, bins=None)", "Plot a histogram.", "function"],
      ["imshow", "pyplot.imshow(X)", "Display data as an image.", "function"],
      ["xlabel", "pyplot.xlabel(xlabel)", "Set the x-axis label.", "function"],
      ["ylabel", "pyplot.ylabel(ylabel)", "Set the y-axis label.", "function"],
      ["title", "pyplot.title(label)", "Set the plot title.", "function"],
      ["legend", "pyplot.legend()", "Show a legend.", "function"],
      ["xlim", "pyplot.xlim(left=None, right=None)", "Get or set x-axis limits.", "function"],
      ["ylim", "pyplot.ylim(bottom=None, top=None)", "Get or set y-axis limits.", "function"],
      ["grid", "pyplot.grid(visible=True)", "Show or hide grid lines.", "function"],
      ["subplots", "pyplot.subplots(nrows=1, ncols=1)", "Create a figure and axes.", "function"],
      ["figure", "pyplot.figure(figsize=None)", "Create a figure.", "function"],
      ["show", "pyplot.show()", "Display the figure.", "function"],
      ["savefig", "pyplot.savefig(fname)", "Save the figure to a file.", "function"],
      ["close", "pyplot.close(fig=None)", "Close a figure.", "function"],
    ],
  },
  requests: { doc: "HTTP client library (install separately in Pyodide if needed).", members: [["get", "requests.get(url, params=None)", "Send an HTTP GET request.", "function"], ["post", "requests.post(url, data=None, json=None)", "Send an HTTP POST request.", "function"], ["put", "requests.put(url, data=None)", "Send an HTTP PUT request.", "function"], ["delete", "requests.delete(url)", "Send an HTTP DELETE request.", "function"], ["Session", "requests.Session()", "Create a persistent session.", "class"], ["Response", "requests.Response", "HTTP response object.", "class"]] },
  asyncio: { doc: "Asynchronous I/O, tasks, and synchronization.", members: [["run", "asyncio.run(coro)", "Run a coroutine as the main entry point.", "function"], ["sleep", "asyncio.sleep(delay)", "Pause a coroutine.", "function"], ["gather", "asyncio.gather(*aws)", "Run awaitables concurrently.", "function"], ["create_task", "asyncio.create_task(coro)", "Schedule a coroutine as a task.", "function"], ["wait", "asyncio.wait(aws)", "Wait for futures or tasks.", "function"], ["Event", "asyncio.Event()", "Async notification primitive.", "class"], ["Lock", "asyncio.Lock()", "Async mutual-exclusion lock.", "class"], ["Queue", "asyncio.Queue(maxsize=0)", "Async FIFO queue.", "class"]] },
  base64: { doc: "Encode and decode Base16, Base32, and Base64 data.", members: [["b64encode", "base64.b64encode(data)", "Encode bytes using Base64.", "function"], ["b64decode", "base64.b64decode(data, validate=False)", "Decode Base64 data.", "function"], ["urlsafe_b64encode", "base64.urlsafe_b64encode(data)", "Encode bytes for use in URLs.", "function"], ["urlsafe_b64decode", "base64.urlsafe_b64decode(data)", "Decode URL-safe Base64 data.", "function"], ["b32encode", "base64.b32encode(data)", "Encode bytes using Base32.", "function"]] },
  copy: { doc: "Shallow and deep copy operations.", members: [["copy", "copy.copy(object)", "Make a shallow copy.", "function"], ["deepcopy", "copy.deepcopy(object)", "Make a deep copy.", "function"]] },
  hashlib: { doc: "Secure hashes and message digests.", members: [["sha256", "hashlib.sha256(data=b'')", "Create a SHA-256 hash object.", "function"], ["sha1", "hashlib.sha1(data=b'')", "Create a SHA-1 hash object.", "function"], ["md5", "hashlib.md5(data=b'')", "Create an MD5 hash object.", "function"], ["new", "hashlib.new(name, data=b'')", "Create a hash by algorithm name.", "function"], ["pbkdf2_hmac", "hashlib.pbkdf2_hmac(hash_name, password, salt, iterations)", "Derive a key from a password.", "function"]] },
  io: { doc: "Tools for working with text and binary streams.", members: [["StringIO", "io.StringIO(initial_value='')", "In-memory text stream.", "class"], ["BytesIO", "io.BytesIO(initial_bytes=b'')", "In-memory binary stream.", "class"], ["TextIOWrapper", "io.TextIOWrapper(buffer)", "Text stream wrapper.", "class"], ["open", "io.open(file, mode='r')", "Open a file with the io API.", "function"]] },
  pprint: { doc: "Pretty-print Python data structures.", members: [["pprint", "pprint.pprint(object, stream=None, width=80)", "Pretty-print an object.", "function"], ["pformat", "pprint.pformat(object, width=80)", "Return a formatted representation.", "function"], ["pp", "pprint.pp(object, width=80)", "Pretty-print an object.", "function"]] },
  typing: { doc: "Type hints and typing-related helpers.", members: [["Any", "typing.Any", "Dynamically typed value.", "value"], ["Callable", "typing.Callable", "Callable type.", "value"], ["Iterable", "typing.Iterable", "Iterable type.", "value"], ["Iterator", "typing.Iterator", "Iterator type.", "value"], ["Mapping", "typing.Mapping", "Mapping type.", "value"], ["Optional", "typing.Optional[type]", "Optional value type.", "function"], ["Sequence", "typing.Sequence", "Sequence type.", "value"], ["TypeVar", "typing.TypeVar(name)", "Declare a type variable.", "function"], ["TypedDict", "typing.TypedDict(name, fields)", "Define a dictionary type with named fields.", "function"], ["Union", "typing.Union[type, ...]", "Union of types.", "function"], ["Protocol", "typing.Protocol", "Structural typing protocol.", "class"], ["Literal", "typing.Literal[value, ...]", "Constrain a value to literals.", "value"]] },
  zipfile: { doc: "Read and write ZIP archive files.", members: [["ZipFile", "zipfile.ZipFile(file, mode='r')", "Read or write a ZIP archive.", "class"], ["is_zipfile", "zipfile.is_zipfile(filename)", "Check whether a file is a ZIP archive.", "function"], ["ZipInfo", "zipfile.ZipInfo(filename)", "Metadata for a member of an archive.", "class"], ["ZIP_DEFLATED", "zipfile.ZIP_DEFLATED", "Deflate compression method.", "value"], ["ZIP_STORED", "zipfile.ZIP_STORED", "No compression.", "value"]] },
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
  ndarray: numpyArrayMethods,
  dataframe: pandasFrameMethods,
  series: pandasSeriesMethods,
};

function builtinEntry(name) {
  return BUILTINS.find((entry) => entry.label === name) || null;
}

function moduleBindings(source) {
  const bindings = new Map();
  for (const match of source.matchAll(/^[ \t]*import[ \t]+([^\n#]+)/gm)) {
    for (const part of match[1].split(",")) {
      const imported = /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(part);
      if (!imported) continue;
      const [, moduleName, alias] = imported;
      bindings.set(alias || moduleName.split(".")[0], alias ? moduleName : moduleName.split(".")[0]);
    }
  }
  for (const match of source.matchAll(/^[ \t]*from[ \t]+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)[ \t]+import[ \t]+([^\n#]+)/gm)) {
    const [, parent, names] = match;
    for (const part of names.replace(/^\(|\)$/g, "").split(",")) {
      const imported = /^\s*([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(part);
      if (!imported) continue;
      const [, name, alias] = imported;
      const submodule = `${parent}.${name}`;
      if (MODULES[submodule]) bindings.set(alias || name, submodule);
    }
  }
  return bindings;
}

function resolveModuleName(receiver, source) {
  const [name, ...suffix] = receiver.split(".");
  const root = moduleBindings(source).get(name) || name;
  const resolved = [root, ...suffix].join(".");
  return MODULES[resolved] ? resolved : null;
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

export function lookupSymbol(dotted, source = "") {
  const value = String(dotted);
  const lastDot = value.lastIndexOf(".");
  if (lastDot >= 0) {
    const receiver = value.slice(0, lastDot);
    const member = value.slice(lastDot + 1);
    const moduleName = resolveModuleName(receiver, source);
    const mod = moduleName && MODULES[moduleName];
    if (mod) {
      const found = mod.members.find(([label]) => label === member);
      if (found) {
        const [label, signature, doc, kind = "function"] = found;
        return { label, signature, doc, kind };
      }
    }
    return null;
  }
  return builtinEntry(value) || null;
}

/** Infer ``receiver -> type`` from simple assignments in the buffer. */
function inferVariables(source) {
  const types = new Map();
  const bindings = moduleBindings(source);
  const resolveModule = (receiver) => {
    const [name, ...suffix] = receiver.split(".");
    const root = bindings.get(name) || name;
    const resolved = [root, ...suffix].join(".");
    return MODULES[resolved] ? resolved : null;
  };
  const assignment = /^[ \t]*([A-Za-z_]\w*)\s*(?::[^=\n]+)?\s*=\s*([^\n#]+)/gm;
  let match;
  while ((match = assignment.exec(source))) {
    const [, name, rhs] = match;
    const text = rhs.trim();
    const constructor = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)\s*\(/.exec(text);
    const constructorModule = constructor && resolveModule(constructor[1]);
    if (/^(?:turtle\.)?(?:Turtle|RawTurtle)\s*\(/.test(text)
      || (constructorModule === "turtle" && ["Turtle", "RawTurtle"].includes(constructor[2]))) {
      types.set(name, "turtle");
    } else {
      const moduleName = constructorModule;
      const className = constructor?.[2];
      if (moduleName === "tkinter" || moduleName === "tkinter.ttk") {
        types.set(name, "tk");
      } else if (moduleName === "pygame" && className === "Surface") {
        types.set(name, "pygame");
      } else if (moduleName === "numpy" && ["array", "asarray", "arange", "linspace", "zeros", "ones", "empty", "full"].includes(className)) {
        types.set(name, "ndarray");
      } else if (moduleName === "pandas" && className === "DataFrame") {
        types.set(name, "dataframe");
      } else if (moduleName === "pandas" && className === "Series") {
        types.set(name, "series");
      }
    }
    if (/^(?:[rubf]{0,2})["']/i.test(text)) types.set(name, "str");
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
      const source = model.getValue();
      const fromImportMatch = /^[ \t]*from[ \t]+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)[ \t]+import[ \t]+[\w, ]*$/.exec(before);

      if (fromImportMatch) {
        const moduleName = resolveModuleName(fromImportMatch[1], source) || fromImportMatch[1];
        if (MODULES[moduleName]) {
          return { suggestions: memberSuggestions(monaco, range, MODULES[moduleName].members) };
        }
      }

      const memberMatch = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\.\s*[A-Za-z_]*$/.exec(before);

      if (memberMatch) {
        const receiver = memberMatch[1];
        const moduleName = resolveModuleName(receiver, source);
        if (moduleName) {
          return { suggestions: memberSuggestions(monaco, range, MODULES[moduleName].members) };
        }
        const inferred = inferVariables(source).get(receiver);
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
      const receiver = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\.\s*$/.exec(before)?.[1] || null;
      const entry = lookupSymbol(receiver ? `${receiver}.${word.word}` : word.word, model.getValue());
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
      const entry = lookupSymbol(context.name, model.getValue());
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
