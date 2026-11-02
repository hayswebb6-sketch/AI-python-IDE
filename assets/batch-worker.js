const MAX_STEPS = 8000;
const MAX_OUTPUT_CHARS = 120000;
const MAX_LOOP_ITEMS = 300;
const MAX_CALL_DEPTH = 12;
const VIRTUAL_COMMANDS = new Set([
  "help", "echo", "set", "if", "for", "goto", "call", "exit", "pause", "cls",
  "cd", "chdir", "dir", "ls", "type", "copy", "move", "ren", "rename", "del", "erase",
  "mkdir", "md", "rmdir", "rd", "title", "color", "ver", "version", "whoami", "hostname",
  "date", "time", "systeminfo", "tasklist", "ipconfig", "ping", "where", "path", "start",
  "notepad", "explorer", "taskmgr", "calc", "cmd", "shutdown", "taskkill", "run", "attrib",
]);

let machine = null;
let messageQueue = Promise.resolve();
let nextRequestId = 1;
let outputLength = 0;
const pendingInputs = new Map();

function emit(text, kind = "stdout") {
  if (!text || !machine) return;
  let value = String(text);
  if (outputLength >= MAX_OUTPUT_CHARS) {
    if (!machine.outputLimited) {
      machine.outputLimited = true;
      self.postMessage({ type: "output", kind: "stderr", text: "Output limit reached; the virtual command was stopped.\n" });
    }
    machine.stopRequested = true;
    return;
  }
  const remaining = MAX_OUTPUT_CHARS - outputLength;
  if (value.length > remaining) value = `${value.slice(0, remaining)}\n[output truncated]\n`;
  outputLength += value.length;
  self.postMessage({ type: "output", kind, text: value });
}

function askForInput({ title, label, hint = "", inputType = "text", confirm = "Enter" }) {
  const id = nextRequestId++;
  self.postMessage({ type: "input-request", id, title, label, hint, inputType, confirm });
  return new Promise((resolve) => pendingInputs.set(id, resolve));
}

function safeUsername(value) {
  const name = String(value || "guest").trim();
  return /^[A-Za-z_][A-Za-z0-9._-]{0,31}$/.test(name) ? name : "guest";
}

function normalizePath(input, base = machine?.cwd || "") {
  let value = String(input ?? "").trim().replace(/^"(.*)"$/, "$1").replace(/\\/g, "/");
  if (!value || value === ".") return base;
  const hasDrive = /^[A-Za-z]:/.test(value);
  if (hasDrive) value = value.slice(2);
  const absolute = hasDrive || value.startsWith("/");
  value = value.replace(/^\/?workspace(?:\/|$)/i, "");
  const parts = absolute ? [] : base.split("/").filter(Boolean);
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function displayPath(relative = machine.cwd) {
  return `C:\\workspace${relative ? `\\${relative.replace(/\//g, "\\")}` : ""}`;
}

function virtualPathExists(path) {
  if (!path) return true;
  if (machine.files.has(path) || machine.dirs.has(path)) return true;
  const prefix = `${path}/`;
  return [...machine.files.keys(), ...machine.dirs].some((entry) => entry.startsWith(prefix));
}

function isDirectory(path) {
  if (!path) return true;
  if (machine.dirs.has(path)) return true;
  const prefix = `${path}/`;
  return [...machine.files.keys(), ...machine.dirs].some((entry) => entry.startsWith(prefix));
}

function ensureParentDirs(path) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    machine.dirs.add(current);
  }
}

function listEntries(path) {
  const prefix = path ? `${path}/` : "";
  const entries = new Map();
  for (const directory of machine.dirs) {
    if (!directory.startsWith(prefix) || directory === path) continue;
    const name = directory.slice(prefix.length).split("/")[0];
    if (name) entries.set(name, { name, directory: true, size: 0 });
  }
  for (const [file, content] of machine.files) {
    if (!file.startsWith(prefix)) continue;
    const remainder = file.slice(prefix.length);
    if (!remainder) continue;
    const name = remainder.split("/")[0];
    if (remainder.includes("/")) {
      entries.set(name, { name, directory: true, size: 0 });
    } else if (!entries.has(name)) {
      entries.set(name, { name, directory: false, size: new TextEncoder().encode(content).length });
    }
  }
  return [...entries.values()].sort((left, right) => Number(right.directory) - Number(left.directory) || left.name.localeCompare(right.name));
}

function initialize(data = {}) {
  const files = new Map();
  for (const [name, content] of Object.entries(data.files || {})) {
    const path = normalizePath(name, "");
    if (path) files.set(path, String(content));
  }
  const dirs = new Set([""]);
  for (const directory of data.dirs || []) {
    dirs.add(normalizePath(directory, ""));
  }
  const username = safeUsername(data.username);
  machine = {
    files,
    dirs,
    cwd: "",
    username,
    vars: {
      USERNAME: username,
      USER: username,
      COMPUTERNAME: "PYIDE-BROWSER-PC",
      CD: "C:\\workspace",
      ERRORLEVEL: "0",
      PATH: "C:\\workspace\\commands",
    },
    echo: true,
    title: "Command Prompt",
    color: "07",
    errorlevel: 0,
    stopRequested: false,
    outputLimited: false,
    steps: 0,
  };
  emit("PyIDE Batch PC [simulated]\nType help for the virtual command list. No host commands or disk access are available.\n", "system");
  sendState("ready");
}

function syncWorkspace(data = {}) {
  if (!machine) return initialize(data);
  const files = new Map();
  for (const [name, content] of Object.entries(data.files || {})) {
    const path = normalizePath(name, "");
    if (path) files.set(path, String(content));
  }
  const dirs = new Set([""]);
  for (const directory of data.dirs || []) dirs.add(normalizePath(directory, ""));
  machine.files = files;
  machine.dirs = dirs;
  machine.username = safeUsername(data.username || machine.username);
  machine.vars.USERNAME = machine.username;
  machine.vars.USER = machine.username;
  machine.vars.CD = displayPath();
}

function sendState(type = "state", extras = {}) {
  if (!machine) return;
  self.postMessage({
    type,
    cwd: displayPath(),
    prompt: `${displayPath()}>`,
    title: machine.title,
    username: machine.username,
    errorlevel: machine.errorlevel,
    files: Object.fromEntries(machine.files),
    dirs: [...machine.dirs],
    ...extras,
  });
}

function expandVariables(value, loopVariables = {}) {
  let result = String(value);
  for (const [name, replacement] of Object.entries(loopVariables)) {
    result = result.replace(new RegExp(`%%${name}`, "gi"), String(replacement));
  }
  result = result.replace(/%%([A-Za-z])/g, (_, name) => `\u0000BATCH_FOR_${name}\u0000`);
  result = result
    .replace(/%([^%]+)%/g, (_, name) => machine.vars[name.toUpperCase()] ?? "")
    .replace(/!([^!]+)!/g, (_, name) => machine.vars[name.toUpperCase()] ?? "");
  return result.replace(/\u0000BATCH_FOR_([A-Za-z])\u0000/g, "%%$1");
}

function splitArguments(value) {
  const args = [];
  let buffer = "";
  let quote = "";
  for (const char of String(value)) {
    if (quote) {
      if (char === quote) quote = "";
      else buffer += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (buffer) args.push(buffer);
      buffer = "";
    } else {
      buffer += char;
    }
  }
  if (buffer) args.push(buffer);
  return args;
}

function splitRedirection(line) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      const append = line[index + 1] === ">";
      const width = append ? 2 : 1;
      return {
        command: line.slice(0, index).trim(),
        destination: line.slice(index + width).trim(),
        append,
      };
    }
  }
  return { command: line, destination: "", append: false };
}

function collectLines(source) {
  const rawLines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const lines = [];
  const countParens = (line) => {
    let quote = "";
    let depth = 0;
    for (const char of line) {
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
    }
    return depth;
  };

  for (let index = 0; index < rawLines.length; index += 1) {
    const block = [rawLines[index]];
    const first = rawLines[index].trim();
    if (/^(?:for\b.*\bdo\s*\(|if\b.*\()\s*$/i.test(first)) {
      let depth = countParens(first);
      while (depth > 0 && index + 1 < rawLines.length) {
        const next = rawLines[++index];
        block.push(next);
        depth += countParens(next);
      }
    }
    lines.push(block.join("\n"));
  }
  return lines;
}

function parseArithmetic(expression) {
  const tokens = String(expression).match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
  const sourceWithoutSpace = String(expression).replace(/\s+/g, "");
  if (tokens.join("") !== sourceWithoutSpace) throw new Error("Unsupported arithmetic expression");
  let index = 0;
  const primary = () => {
    const token = tokens[index++];
    if (token === "(") {
      const value = addSub();
      if (tokens[index++] !== ")") throw new Error("Missing closing parenthesis");
      return value;
    }
    if (token === "+") return primary();
    if (token === "-") return -primary();
    if (token && /^\d/.test(token)) return Number(token);
    if (token && /^[A-Za-z_]/.test(token)) return Number(machine.vars[token.toUpperCase()] || 0);
    throw new Error("Expected a number or variable");
  };
  const mulDiv = () => {
    let value = primary();
    while (["*", "/", "%"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = primary();
      if ((operator === "/" || operator === "%") && right === 0) throw new Error("Division by zero");
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
    return value;
  };
  const addSub = () => {
    let value = mulDiv();
    while (["+", "-"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = mulDiv();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = addSub();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Unsupported arithmetic expression");
  return Math.trunc(result);
}

function parseBatchCondition(condition) {
  const text = condition.trim();
  let match = text.match(/^(not\s+)?exist\s+(".*?"|\S+)$/i);
  if (match) {
    const exists = virtualPathExists(normalizePath(match[2]));
    return Boolean(match[1]) ? !exists : exists;
  }
  match = text.match(/^(not\s+)?defined\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  if (match) {
    const defined = Object.hasOwn(machine.vars, match[2].toUpperCase());
    return Boolean(match[1]) ? !defined : defined;
  }
  match = text.match(/^(?:\/i\s+)?(".*?"|\S+)\s*(==|equ|neq|lss|leq|gtr|geq)\s*(".*?"|\S+)$/i);
  if (match) {
    const left = match[1].replace(/^"|"$/g, "");
    const right = match[3].replace(/^"|"$/g, "");
    const operator = match[2].toLowerCase();
    if (operator === "==" || operator === "equ") return left.toLowerCase() === right.toLowerCase();
    if (operator === "neq") return left.toLowerCase() !== right.toLowerCase();
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (operator === "lss") return a < b;
    if (operator === "leq") return a <= b;
    if (operator === "gtr") return a > b;
    return a >= b;
  }
  match = text.match(/^(not\s+)?errorlevel\s+(\d+)$/i);
  if (match) {
    const reached = machine.errorlevel >= Number(match[2]);
    return Boolean(match[1]) ? !reached : reached;
  }
  return false;
}

async function executeLine(rawLine, { script = false, loopVariables = {}, depth = 0 } = {}) {
  if (!machine || machine.stopRequested) return { code: 1 };
  let line = String(rawLine || "").trim();
  if (!line || /^::/.test(line) || /^rem(?:\s|$)/i.test(line)) return { code: 0 };

  const quiet = line.startsWith("@");
  if (quiet) line = line.slice(1).trim();
  if (!line) return { code: 0 };
  if (script && machine.echo && !quiet && !/^echo\s+off$/i.test(line)) emit(`${line}\n`, "command");

  if (/^echo\s+off$/i.test(line)) {
    machine.echo = false;
    return { code: 0 };
  }
  if (/^echo\s+on$/i.test(line)) {
    machine.echo = true;
    return { code: 0 };
  }

  const expandedLine = expandVariables(line, loopVariables);
  const redirect = splitRedirection(expandedLine);
  const commandText = redirect.command;
  let result;
  try {
    result = await dispatchCommand(commandText, { script, loopVariables, depth });
  } catch (error) {
    result = { code: 1, err: `Batch simulator: ${error.message || "command failed"}\n` };
  }

  if (result.out) {
    if (redirect.destination) {
      const destination = normalizePath(redirect.destination);
      if (!destination || isDirectory(destination)) {
        emit(`The virtual redirect target is not a file: ${redirect.destination}\n`, "stderr");
        result.code = 1;
      } else {
        ensureParentDirs(destination);
        const current = machine.files.get(destination) || "";
        machine.files.set(destination, `${redirect.append ? current : ""}${result.out}`);
      }
    } else {
      emit(result.out, result.kind || "stdout");
    }
  }
  if (result.err) emit(result.err, "stderr");
  if (result.clear) self.postMessage({ type: "clear" });
  if (result.launch) self.postMessage({ type: "launch-app", app: result.launch });
  machine.errorlevel = Number(result.code) || 0;
  machine.vars.ERRORLEVEL = String(machine.errorlevel);
  machine.vars.CD = displayPath();
  return { ...result, out: undefined, err: undefined };
}

async function dispatchCommand(commandText, context) {
  const trimmed = String(commandText || "").trim();
  if (!trimmed) return { code: 0 };
  const match = trimmed.match(/^([^\s]+)(?:\s+([\s\S]*))?$/);
  const command = match?.[1].toLowerCase() || "";
  const rest = match?.[2] || "";
  const args = splitArguments(rest);
  const { script, loopVariables, depth } = context;

  if (command.startsWith("echo.") || command.startsWith("echo(")) {
    return { code: 0, out: `${trimmed.slice(5).replace(/^\)/, "")}\n` };
  }

  switch (command) {
    case "help":
      return { code: 0, out: `Virtual Batch PC commands:\n  echo, set, if, for, goto, call, pause, exit /b\n  cd, dir, type, copy, move, ren, del, mkdir, rmdir\n  run <file.bat>, start <app>, notepad, explorer, taskmgr\n  ver, whoami, hostname, date, time, systeminfo, tasklist\n  ipconfig and ping are simulated; there is no network access.\n  All paths stay inside the IDE workspace. No host commands run.\n` };
    case "echo": {
      const value = rest.trim();
      if (!value) return { code: 0, out: `ECHO is ${machine.echo ? "on" : "off"}.\n` };
      return { code: 0, out: `${value === "." ? "" : value}\n` };
    }
    case "set":
      return await setCommand(rest);
    case "if": {
      const conditionMatch = rest.match(/^(?:not\s+)?(?:exist\s+(?:"[^"]*"|\S+)|defined\s+[A-Za-z_][A-Za-z0-9_]*|errorlevel\s+\d+)|^(?:\/i\s+)?(?:"[^"]*"|\S+)\s*(?:==|equ|neq|lss|leq|gtr|geq)\s*(?:"[^"]*"|\S+)/i);
      if (!conditionMatch) return { code: 1, err: "The IF command has an invalid format.\n" };
      const condition = conditionMatch[0].trim();
      const action = rest.slice(conditionMatch[0].length).trim();
      if (!action) return { code: 1, err: "The IF command needs a command or block after its condition.\n" };
      const isTrue = parseBatchCondition(condition);
      const elseBlock = action.match(/^\(([\s\S]*?)\)\s*else\s*\(([\s\S]*)\)$/i);
      const block = elseBlock || action.match(/^\(([\s\S]*)\)$/);
      if (block) {
        const selectedBody = elseBlock ? (isTrue ? elseBlock[1] : elseBlock[2]) : isTrue ? block[1] : "";
        if (!selectedBody.trim()) return { code: 0 };
        for (const line of selectedBody.split(/\r?\n/)) {
          const outcome = await executeLine(line, { script: true, loopVariables, depth: depth + 1 });
          if (outcome.jumpLabel || outcome.callLabel || outcome.return || outcome.exit) return outcome;
        }
        return { code: machine.errorlevel };
      }
      const inlineElse = action.match(/^([\s\S]+?)\s+else\s+([\s\S]+)$/i);
      const selectedCommand = inlineElse ? (isTrue ? inlineElse[1] : inlineElse[2]) : isTrue ? action : "";
      if (!selectedCommand) return { code: 0 };
      return executeLine(selectedCommand, { script: true, loopVariables, depth: depth + 1 });
    }
    case "for":
      return runFor(rest, { script, loopVariables, depth });
    case "goto": {
      const label = String(args[0] || "").replace(/^:/, "").toLowerCase();
      if (!label) return { code: 1, err: "The GOTO command requires a label.\n" };
      if (label === "eof") return { code: 0, return: true };
      return { code: 0, jumpLabel: label };
    }
    case "call": {
      const target = args[0] || "";
      if (target.startsWith(":")) return { code: 0, callLabel: target.slice(1).toLowerCase() };
      const filename = normalizePath(target);
      const contents = machine.files.get(filename);
      if (contents === undefined || !/\.(?:bat|cmd)$/i.test(filename)) {
        return { code: 1, err: `The virtual batch file was not found: ${target}\n` };
      }
      if (depth >= MAX_CALL_DEPTH) return { code: 1, err: "Batch call depth limit reached.\n" };
      await runScript(contents, filename, depth + 1);
      return { code: machine.errorlevel };
    }
    case "exit":
      if (args[0]?.toLowerCase() === "/b") return { code: Number(args[1]) || machine.errorlevel, return: true };
      return { code: 0, exit: true, out: "Virtual command session ended. The browser PC is still open.\n" };
    case "pause": {
      emit(rest || "Press Enter to continue . . .", "system");
      await askForInput({ title: "Batch pause", label: "Press Enter in this dialog to continue", hint: "This pauses only the simulated script.", confirm: "Continue" });
      return { code: 0, out: "\n" };
    }
    case "cls":
      return { code: 0, clear: true };
    case "cd":
    case "chdir": {
      const destination = args[0] || "";
      if (!destination) return { code: 0, out: `${displayPath()}\n` };
      const next = destination === "\\" || destination === "/" ? "" : normalizePath(destination);
      if (!isDirectory(next)) return { code: 1, err: `The system cannot find the path specified: ${destination}\n` };
      machine.cwd = next;
      machine.vars.CD = displayPath();
      return { code: 0 };
    }
    case "dir":
    case "ls": {
      const target = args.find((argument) => !argument.startsWith("/")) || ".";
      const path = normalizePath(target);
      if (!isDirectory(path)) return { code: 1, err: `File Not Found: ${target}\n` };
      const entries = listEntries(path);
      const rows = entries.map((entry) => `${entry.directory ? "<DIR>     " : "          "}${String(entry.size).padStart(8)}  ${entry.name}`);
      return { code: 0, out: ` Directory of ${displayPath(path)}\n\n${rows.length ? rows.join("\n") : "<empty>"}\n\n${entries.length} item(s)\n` };
    }
    case "type": {
      const path = normalizePath(args[0] || "");
      if (!path) return { code: 1, err: "The TYPE command requires a file name.\n" };
      const contents = machine.files.get(path);
      return contents === undefined ? { code: 1, err: `The system cannot find the file specified: ${args[0]}\n` } : { code: 0, out: contents };
    }
    case "copy":
    case "move": {
      if (args.length < 2) return { code: 1, err: `Usage: ${command} <source> <destination>\n` };
      const source = normalizePath(args[0]);
      const target = normalizePath(args[1]);
      const content = machine.files.get(source);
      if (content === undefined) return { code: 1, err: `The system cannot find the file specified: ${args[0]}\n` };
      const destination = isDirectory(target) ? `${target ? `${target}/` : ""}${source.split("/").pop()}` : target;
      ensureParentDirs(destination);
      machine.files.set(destination, content);
      if (command === "move") machine.files.delete(source);
      return { code: 0, out: `        ${command === "copy" ? "1 file(s) copied." : "1 file(s) moved."}\n` };
    }
    case "ren":
    case "rename": {
      if (args.length < 2) return { code: 1, err: "Usage: ren <old-name> <new-name>\n" };
      const source = normalizePath(args[0]);
      const content = machine.files.get(source);
      if (content === undefined) return { code: 1, err: `The system cannot find the file specified: ${args[0]}\n` };
      const parent = source.includes("/") ? source.slice(0, source.lastIndexOf("/")) : "";
      const destination = normalizePath(args[1], parent);
      if (isDirectory(destination)) return { code: 1, err: "The destination is a directory.\n" };
      machine.files.set(destination, content);
      machine.files.delete(source);
      return { code: 0, out: "File renamed.\n" };
    }
    case "del":
    case "erase": {
      if (!args.length) return { code: 1, err: "Usage: del <file>\n" };
      let removed = 0;
      for (const target of args) {
        const path = normalizePath(target);
        if (path.includes("*") || path.includes("?")) {
          const pattern = new RegExp(`^${path.split("").map((char) => char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("")}$`, "i");
          for (const file of [...machine.files.keys()]) {
            if (pattern.test(file)) {
              machine.files.delete(file);
              removed += 1;
            }
          }
        } else if (machine.files.delete(path)) {
          removed += 1;
        }
      }
      return removed ? { code: 0, out: `${removed} file(s) deleted.\n` } : { code: 1, err: "Could Not Find the file(s).\n" };
    }
    case "mkdir":
    case "md": {
      if (!args.length) return { code: 1, err: "Usage: mkdir <directory>\n" };
      for (const argument of args) {
        const path = normalizePath(argument);
        if (path) {
          ensureParentDirs(`${path}/.keep`);
          machine.dirs.add(path);
        }
      }
      return { code: 0 };
    }
    case "rmdir":
    case "rd": {
      const path = normalizePath(args[0] || "");
      if (!path || !isDirectory(path)) return { code: 1, err: "The system cannot find the directory specified.\n" };
      const prefix = `${path}/`;
      if ([...machine.files.keys()].some((file) => file.startsWith(prefix)) || [...machine.dirs].some((directory) => directory !== path && directory.startsWith(prefix))) {
        return { code: 1, err: "The directory is not empty.\n" };
      }
      machine.dirs.delete(path);
      return { code: 0 };
    }
    case "title":
      machine.title = rest.trim() || "Command Prompt";
      return { code: 0 };
    case "color":
      machine.color = args[0] || "07";
      return { code: 0, out: `Virtual console color set to ${machine.color}.\n` };
    case "ver":
    case "version":
      return { code: 0, out: "PyIDE Virtual PC [Browser Batch Simulator 1.0]\n" };
    case "whoami":
      return { code: 0, out: `pyide\\${machine.username}\n` };
    case "hostname":
      return { code: 0, out: "PYIDE-BROWSER-PC\n" };
    case "date":
      return { code: 0, out: `${new Date().toLocaleDateString()}\n` };
    case "time":
      return { code: 0, out: `${new Date().toLocaleTimeString()}\n` };
    case "systeminfo":
      return { code: 0, out: `Host Name:                 PYIDE-BROWSER-PC\nOS Name:                   PyIDE Virtual PC\nOS Version:                1.0 (simulated)\nSystem Type:               Browser sandbox\nWorkspace:                 ${displayPath()}\nHost access:               Disabled\n` };
    case "tasklist":
      return { code: 0, out: `Image Name                     PID Session Name        Session#    Mem Usage\n========================= ======== ================ =========== ============\npyide-virtual-pc.exe           100 Browser                    1       42 MB\ncmd-simulator.exe              101 Browser                    1       12 MB\nbatch-worker.js                102 Browser                    1        8 MB\n\nThese are simulated tasks, not host processes.\n` };
    case "ipconfig":
      return { code: 0, out: `Virtual Ethernet Adapter\n   IPv4 Address. . . . . . . . . . . : 192.0.2.10\n   Default Gateway . . . . . . . . . : 192.0.2.1\n   Network access . . . . . . . . . . : disabled (simulated)\n` };
    case "ping": {
      const target = args.filter((argument) => !argument.startsWith("/")).at(-1) || "127.0.0.1";
      const safeTarget = target.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 80) || "127.0.0.1";
      return { code: 0, out: `Pinging ${safeTarget} [simulated] with 32 bytes of data:\nReply from ${safeTarget}: bytes=32 time<1ms TTL=64\n\nPing statistics for ${safeTarget}: 1 packet sent, 1 received. No network request was made.\n` };
    }
    case "where":
      return args.length
        ? { code: 0, out: args.map((name) => VIRTUAL_COMMANDS.has(name.toLowerCase()) ? `C:\\workspace\\commands\\${name}.cmd` : `INFO: Could not find files for the given pattern(s).`).join("\n") + "\n" }
        : { code: 1, err: "Usage: where <command>\n" };
    case "path":
      return { code: 0, out: `${machine.vars.PATH}\n` };
    case "start": {
      const app = resolveVirtualApp(args.join(" "));
      if (!app) return { code: 1, err: "Available virtual apps: cmd, notepad, explorer, taskmgr, calc\n" };
      return { code: 0, out: `Opening ${app.label} in the virtual PC.\n`, launch: app.id };
    }
    case "notepad":
    case "explorer":
    case "taskmgr":
    case "calc":
      return { code: 0, out: `Opening ${command} in the virtual PC.\n`, launch: resolveVirtualApp(command)?.id || "cmd" };
    case "cmd":
      return { code: 0, out: "You are already in the simulated Command Prompt.\n" };
    case "shutdown":
      return { code: 0, out: "Shutdown is simulated; your browser and computer will not be affected.\n" };
    case "taskkill":
      return { code: 1, err: "Taskkill can only target virtual apps. Use the Batch PC task list; host processes are unavailable.\n" };
    case "run": {
      const filename = normalizePath(args[0] || "");
      if (!filename || !/\.(?:bat|cmd)$/i.test(filename)) return { code: 1, err: "Usage: run <file.bat|file.cmd>\n" };
      const contents = machine.files.get(filename);
      if (contents === undefined) return { code: 1, err: `The system cannot find the batch file: ${args[0]}\n` };
      await runScript(contents, filename, depth + 1);
      return { code: machine.errorlevel };
    }
    case "attrib": {
      const path = normalizePath(args[0] || "");
      if (!path || !machine.files.has(path)) return { code: 1, err: "Usage: attrib <file>\n" };
      return { code: 0, out: `A                ${path}\n` };
    }
    default:
      return { code: 1, err: `'${command}' is not recognized as a virtual command. Type help for available commands.\n` };
  }
}

async function setCommand(rest) {
  const text = rest.trim();
  let match = text.match(/^\/p\s+([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/i);
  if (match) {
    const name = match[1].toUpperCase();
    const label = match[2].trim() || `Enter ${name}`;
    const value = await askForInput({ title: "Batch input", label, hint: "This value stays in the current virtual PC session.", confirm: "Enter" });
    machine.vars[name] = String(value ?? "");
    return { code: 0 };
  }
  match = text.match(/^\/a\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:([+\-*/%])=|=)\s*(.+)$/i);
  if (match) {
    const name = match[1].toUpperCase();
    const operator = match[2] || "=";
    const current = Number(machine.vars[name]) || 0;
    const value = parseArithmetic(match[3]);
    const result = operator === "+" ? current + value : operator === "-" ? current - value : operator === "*" ? current * value : operator === "/" ? Math.trunc(current / value) : operator === "%" ? current % value : value;
    machine.vars[name] = String(Math.trunc(result));
    return { code: 0, out: `${machine.vars[name]}\n` };
  }
  match = text.match(/^"?([A-Za-z_][A-Za-z0-9_]*)=(.*?)"?$/);
  if (match) {
    machine.vars[match[1].toUpperCase()] = match[2];
    return { code: 0 };
  }
  const prefix = text.replace(/^"|"$/g, "").toUpperCase();
  const variables = Object.entries(machine.vars)
    .filter(([name]) => !prefix || name.startsWith(prefix))
    .map(([name, value]) => `${name}=${value}`);
  return { code: 0, out: variables.length ? `${variables.join("\n")}\n` : "" };
}

async function runFor(rest, context) {
  const match = rest.match(/^(?:\/l\s+)?%%([A-Za-z])\s+in\s+\(([^)]*)\)\s+do\s+([\s\S]+)$/i);
  if (!match) return { code: 1, err: "Supported FOR syntax: for %%i in (a b c) do echo %%i, or for /L %%i in (1,1,5) do echo %%i\n" };
  const loopVariable = match[1];
  const list = match[2].trim();
  const body = match[3].trim().replace(/^\(|\)$/g, "").trim();
  let values;
  const range = list.match(/^(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)$/);
  if (range) {
    const start = Number(range[1]);
    const step = Number(range[2]);
    const end = Number(range[3]);
    if (!step) return { code: 1, err: "FOR /L requires a non-zero step.\n" };
    values = [];
    for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
      values.push(String(value));
      if (values.length >= MAX_LOOP_ITEMS) break;
    }
  } else {
    values = splitArguments(list);
  }
  if (!values.length) return { code: 0 };
  for (const value of values.slice(0, MAX_LOOP_ITEMS)) {
    if (machine.stopRequested) break;
    const expandedBody = body.replace(new RegExp(`%%${loopVariable}`, "gi"), value);
    for (const line of expandedBody.split(/\r?\n/)) {
      const result = await executeLine(line, { script: true, loopVariables: { [loopVariable]: value }, depth: context.depth + 1 });
      if (result.jumpLabel || result.callLabel || result.return || result.exit) return result;
    }
  }
  return { code: machine.errorlevel };
}

function resolveVirtualApp(value) {
  const target = String(value || "").toLowerCase();
  const apps = [
    { id: "cmd", label: "Command Prompt", names: ["cmd", "cmd.exe", "command prompt"] },
    { id: "notepad", label: "Notepad", names: ["notepad", "notepad.exe"] },
    { id: "files", label: "Files", names: ["explorer", "explorer.exe", "files"] },
    { id: "tasks", label: "Task Manager", names: ["taskmgr", "taskmgr.exe", "task manager"] },
    { id: "calc", label: "Calculator", names: ["calc", "calc.exe", "calculator"] },
  ];
  return apps.find((app) => app.names.some((name) => target === name || target.startsWith(`${name} `)));
}

async function runScript(source, filename = "script.bat", depth = 0) {
  if (depth > MAX_CALL_DEPTH) {
    emit("Batch call depth limit reached.\n", "stderr");
    machine.errorlevel = 1;
    return;
  }
  const lines = collectLines(source);
  const labels = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const label = lines[index].trim().match(/^:([^:]+)$/);
    if (label) labels.set(label[1].toLowerCase(), index);
  }
  machine.vars["0"] = filename;
  let pointer = 0;
  const returnStack = [];
  while (pointer < lines.length && !machine.stopRequested) {
    if (machine.steps >= MAX_STEPS) {
      emit(`Script stopped after ${MAX_STEPS} virtual steps.\n`, "stderr");
      machine.errorlevel = 1;
      break;
    }
    machine.steps += 1;
    const current = lines[pointer].trim();
    if (/^:[^:]+$/.test(current)) {
      pointer += 1;
      continue;
    }
    const result = await executeLine(lines[pointer], { script: true, depth });
    if (result.jumpLabel) {
      const destination = labels.get(result.jumpLabel);
      if (destination === undefined) {
        emit(`Label not found: ${result.jumpLabel}\n`, "stderr");
        machine.errorlevel = 1;
        pointer += 1;
      } else {
        pointer = destination + 1;
      }
    } else if (result.callLabel) {
      const destination = labels.get(result.callLabel);
      if (destination === undefined) {
        emit(`Label not found: ${result.callLabel}\n`, "stderr");
        machine.errorlevel = 1;
        pointer += 1;
      } else {
        returnStack.push(pointer + 1);
        pointer = destination + 1;
      }
    } else if (result.return) {
      if (returnStack.length) pointer = returnStack.pop();
      else break;
    } else if (result.exit) {
      break;
    } else {
      pointer += 1;
    }
    if (machine.steps % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function processCommand(line) {
  outputLength = 0;
  machine.stopRequested = false;
  machine.outputLimited = false;
  machine.steps = 0;
  const value = String(line || "").trim();
  if (!value) return;
  const runMatch = value.match(/^run\s+(.+)$/i);
  if (runMatch) {
    const filename = normalizePath(runMatch[1]);
    if (!/\.(?:bat|cmd)$/i.test(filename) || !machine.files.has(filename)) {
      emit(`Batch file not found in the virtual workspace: ${runMatch[1]}\n`, "stderr");
      machine.errorlevel = 1;
    } else {
      await runScript(machine.files.get(filename), filename);
    }
  } else {
    await executeLine(value, { script: false });
  }
  sendState("complete", { stopped: machine.stopRequested });
}

async function handleMessage(message) {
  if (message.type === "init") {
    outputLength = 0;
    initialize(message);
    return;
  }
  if (message.type === "sync") {
    syncWorkspace(message);
    sendState();
    return;
  }
  if (message.type === "command") {
    if (!machine) initialize(message);
    await processCommand(message.line);
    return;
  }
  if (message.type === "run") {
    if (!machine) initialize(message);
    outputLength = 0;
    syncWorkspace(message);
    machine.stopRequested = false;
    machine.outputLimited = false;
    machine.steps = 0;
    const filename = String(message.filename || "script.bat");
    emit(`${displayPath()}> call ${filename}\n`, "command");
    await runScript(String(message.code || ""), filename);
    sendState("complete", { stopped: machine.stopRequested });
  }
}

self.onmessage = ({ data = {} }) => {
  if (data.type === "input-response") {
    const resolve = pendingInputs.get(data.id);
    if (resolve) {
      pendingInputs.delete(data.id);
      resolve(data.value ?? null);
    }
    return;
  }
  if (data.type === "stop") {
    if (machine) machine.stopRequested = true;
    for (const [id, resolve] of pendingInputs) {
      pendingInputs.delete(id);
      resolve(null);
    }
    return;
  }
  messageQueue = messageQueue.then(() => handleMessage(data)).catch((error) => {
    emit(`Batch worker error: ${error.message || "unknown error"}\n`, "stderr");
    if (machine) sendState("complete", { stopped: true });
  });
};
