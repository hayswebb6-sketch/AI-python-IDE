/**
 * A small POSIX/PowerShell-flavoured shell that runs entirely in the browser.
 *
 * The site is static, so there is no real `bash.exe` or `pwsh.exe` to talk to.
 * What this module does instead is implement the parts of a shell that make one
 * useful inside an IDE:
 *
 *   - quoting, escapes, variables ($NAME, ${NAME}, $?, $env:NAME)
 *   - pipes, output/input redirection, && / || / ;
 *   - globs (* and ?), tab completion, aliases, history
 *   - a workspace-backed filesystem (the same files the editor shows)
 *   - bash and PowerShell command vocabularies and prompts
 *
 * Commands return `{ code, out, err, streamed }`. `streamed` means the command
 * already wrote to the terminal (Python/JavaScript runs, pip installs).
 */

const DEFAULT_ENV = {
  HOME: "/",
  USER: "guest",
  USERNAME: "guest",
  HOSTNAME: "pyide",
  SHELL: "/bin/bash",
  PWD: "/",
  LANG: "en_US.UTF-8",
  TERM: "xterm-256color",
  PATH: "/usr/local/bin:/usr/bin:/bin",
  PYIDE: "browser",
};

/* -------------------------------------------------------------------------
 * Command vocabularies
 * ---------------------------------------------------------------------- */

const BASH = {
  pwd: "pwd",
  cd: "cd",
  ls: "list",
  dir: "list",
  tree: "tree",
  cat: "cat",
  head: "head",
  tail: "tail",
  wc: "wc",
  grep: "grep",
  sort: "sort",
  uniq: "uniq",
  cut: "cut",
  find: "find",
  echo: "echo",
  printf: "echo",
  touch: "touch",
  mkdir: "mkdir",
  rmdir: "rmdir",
  rm: "rm",
  cp: "cp",
  mv: "mv",
  stat: "stat",
  which: "which",
  type: "which",
  env: "env",
  export: "export",
  unset: "unset",
  alias: "alias",
  unalias: "unalias",
  history: "history",
  clear: "clear",
  help: "help",
  man: "help",
  shell: "shell",
  bash: { cmd: "shell", pre: ["bash"] },
  pwsh: { cmd: "shell", pre: ["pwsh"] },
  powershell: { cmd: "shell", pre: ["pwsh"] },
  run: "run",
  python: "python",
  python3: "python",
  py: "python",
  node: "node",
  js: "node",
  pip: "pip",
  pip3: "pip",
  open: "open",
  edit: "open",
  code: "open",
  download: "download",
  date: "date",
  whoami: "whoami",
  hostname: "hostname",
  uname: "uname",
  id: "id",
  groups: "groups",
  users: "users",
  who: "who",
  sudo: "sudo",
  su: "su",
  useradd: "useradd",
  adduser: "adduser",
  userdel: "userdel",
  deluser: "userdel",
  passwd: "passwd",
  usermod: "usermod",
  groupadd: "groupadd",
  groupdel: "groupdel",
  free: "free",
  df: "df",
  du: "du",
  ps: "ps",
  uptime: "uptime",
  cal: "cal",
  ping: "ping",
  ipconfig: "ipconfig",
  systeminfo: "systeminfo",
  tasklist: "tasklist",
  batch: "batch",
  sleep: "sleep",
  true: "true",
  false: "false",
  exit: "exit",
  version: "version",
  reset: "reset",
  "ll": { cmd: "list", pre: ["-l"] },
  "la": { cmd: "list", pre: ["-a"] },
  "l": { cmd: "list", pre: ["-1"] },
};

const PWSH = {
  "get-location": "pwd", pwd: "pwd", gl: "pwd",
  "set-location": "cd", cd: "cd", sl: "cd", chdir: "cd",
  "get-childitem": "list", gci: "list", ls: "list", dir: "list",
  "get-content": "cat", gc: "cat", cat: "cat", type: "cat",
  "set-content": "setcontent", sc: "setcontent",
  "add-content": "addcontent", ac: "addcontent",
  "new-item": "touch", ni: "touch", touch: "touch",
  "remove-item": "rm", ri: "rm", rm: "rm", del: "rm", erase: "rm",
  "copy-item": "cp", cpi: "cp", cp: "cp", copy: "cp",
  "move-item": "mv", mi: "mv", mv: "mv", move: "mv",
  "new-item-dir": "mkdir", "mkdir": "mkdir", md: "mkdir",
  "remove-item-dir": "rmdir", rmdir: "rmdir", rd: "rmdir",
  "test-path": "testpath",
  "select-string": "grep", sls: "grep", grep: "grep",
  "write-output": "echo", write: "echo", echo: "echo",
  "write-host": "echo", "out-string": "echo",
  "clear-host": "clear", clear: "clear", cls: "clear", clc: "clear",
  "get-help": "help", help: "help", man: "help",
  "get-command": "which", which: "which", gcm: "which",
  "get-history": "history", history: "history", h: "history",
  "get-item": "stat", stat: "stat",
  "compare-object": "grep",
  "invoke-python": "python", python: "python", python3: "python", py: "python",
  "node": "node", js: "node",
  "pip": "pip", pip3: "pip",
  "start-process": "open", open: "open", edit: "open", code: "open",
  "invoke-webrequest": "download", download: "download",
  "get-date": "date", date: "date",
  "get-childitem-tree": "tree", tree: "tree",
  "get-uname": "uname", uname: "uname",
  "get-process": "ps", gps: "ps", ps: "ps",
  "get-localuser": "users", "new-localuser": "adduser", "remove-localuser": "userdel",
  "get-localgroup": "groups", "new-localgroup": "groupadd", "remove-localgroup": "groupdel",
  "get-computerinfo": "systeminfo", "get-netipconfiguration": "ipconfig",
  "start-sleep": "sleep", sleep: "sleep",
  "where-object": "grep",
  "foreach-object": "echo",
  "measure-object": "wc", wc: "wc",
  "sort-object": "sort", sort: "sort",
  "get-unique": "uniq", uniq: "uniq",
  "find": "find",
  "head": "head", "tail": "tail", "cut": "cut",
  "env": "env", "export": "export", "unset": "unset",
  "alias": "alias", "unalias": "unalias",
  "shell": "shell", "bash": { cmd: "shell", pre: ["bash"] },
  "pwsh": { cmd: "shell", pre: ["pwsh"] }, "powershell": { cmd: "shell", pre: ["pwsh"] },
  "run": "run", "python-run": "run",
  "true": "true", "false": "false", "exit": "exit",
  "version": "version", "reset": "reset",
};

/* -------------------------------------------------------------------------
 * Lexer + parser
 * ---------------------------------------------------------------------- */

function lex(line, options = {}) {
  const pwsh = Boolean(options.pwsh);
  const tokens = [];
  let buffer = "";
  let mode = null;
  let quoted = false;
  let expand = false;
  let has = false;

  const flush = () => {
    if (!has && !buffer) return;
    tokens.push({ type: "word", value: buffer, quoted, expand });
    buffer = "";
    quoted = false;
    expand = false;
    has = false;
  };

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (mode === "'") {
      if (char === "'") mode = null;
      else buffer += char;
      quoted = true;
      continue;
    }

    if (mode === '"') {
      if (char === '"') {
        mode = null;
      } else if (!pwsh && char === "\\" && /["\\$`]/.test(line[index + 1] || "")) {
        buffer += line[index + 1];
        index += 1;
      } else {
        buffer += char;
      }
      quoted = true;
      expand = true;
      continue;
    }

    if (char === "'") {
      mode = "'";
      quoted = true;
      has = true;
      continue;
    }

    if (char === '"') {
      mode = '"';
      quoted = true;
      expand = true;
      has = true;
      continue;
    }

    if (char === "\\" && !pwsh) {
      buffer += line[index + 1] ?? "";
      index += 1;
      quoted = true;
      has = true;
      continue;
    }

    if (char === "`" && pwsh) {
      buffer += line[index + 1] ?? "";
      index += 1;
      quoted = true;
      has = true;
      continue;
    }

    if (char === "#" && !has && !buffer) {
      break;
    }

    if (/\s/.test(char)) {
      flush();
      continue;
    }

    const pair = line.slice(index, index + 2);
    if (pair === "&&" || pair === "||" || pair === ">>") {
      flush();
      tokens.push({ type: "op", value: pair });
      index += 1;
      continue;
    }

    if (char === "|" || char === ";" || char === "<" || char === ">") {
      flush();
      tokens.push({ type: "op", value: char });
      continue;
    }

    buffer += char;
    expand = true;
    has = true;
  }

  if (mode) throw new Error(`unterminated ${mode === "'" ? "single" : "double"} quote`);
  flush();
  return tokens;
}

function parse(tokens) {
  const groups = [];
  let connector = ";";
  let pipeline = [];
  let segment = { argv: [], redirects: {} };
  let redirect = null;

  const pushSegment = () => {
    if (segment.argv.length || segment.redirects.in || segment.redirects.out) {
      pipeline.push(segment);
    }
    segment = { argv: [], redirects: {} };
  };

  const pushGroup = () => {
    pushSegment();
    if (pipeline.length) groups.push({ connector, pipeline });
    pipeline = [];
    connector = ";";
  };

  for (const token of tokens) {
    if (token.type === "word") {
      if (redirect) {
        segment.redirects[redirect] = token;
        redirect = null;
      } else {
        segment.argv.push(token);
      }
      continue;
    }

    const op = token.value;
    if (op === ">" || op === ">>" || op === "<") {
      if (op === ">>") {
        redirect = "out";
        segment.redirects.append = true;
      } else {
        redirect = op === ">" ? "out" : "in";
      }
      continue;
    }
    if (redirect) throw new Error(`syntax error near unexpected token \`${op}'`);
    if (op === "|") {
      pushSegment();
      continue;
    }
    if (op === "&&" || op === "||" || op === ";") {
      pushGroup();
      connector = op;
    }
  }

  if (redirect) throw new Error("syntax error: expected a file name after redirection");
  pushGroup();
  return groups;
}

function commonPrefix(values) {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) index += 1;
    prefix = prefix.slice(0, index);
    if (!prefix) break;
  }
  return prefix;
}

function globToRegExp(pattern) {
  let source = "^";
  for (const char of pattern) {
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

function parseFlags(args) {
  const flags = new Set();
  const operands = [];
  let literal = false;
  for (const arg of args) {
    if (literal || !arg.startsWith("-") || arg === "-") {
      operands.push(arg);
      continue;
    }
    if (arg === "--") {
      literal = true;
      continue;
    }
    if (arg.startsWith("--")) {
      flags.add(arg);
      continue;
    }
    for (const char of arg.slice(1)) flags.add(`-${char}`);
  }
  return { flags, operands };
}

function splitLines(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

const VIRTUAL_PASSWORD_ITERATIONS = 80_000;

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createVirtualPassword(password) {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("Secure browser cryptography is unavailable.");
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const digest = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: VIRTUAL_PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return { salt: [...salt], digest: bytesToHex(new Uint8Array(digest)) };
}

async function verifyVirtualPassword(password, record) {
  if (!record || !globalThis.crypto?.subtle) return false;
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const digest = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: Uint8Array.from(record.salt), iterations: VIRTUAL_PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  const candidate = bytesToHex(new Uint8Array(digest));
  if (candidate.length !== record.digest.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ record.digest.charCodeAt(index);
  }
  return difference === 0;
}

const VIRTUAL_SYSTEM_USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;
const SUDO_SAFE_COMMANDS = new Set([
  "useradd", "adduser", "userdel", "passwd", "usermod", "groupadd", "groupdel",
  "groups", "id", "users", "who", "whoami", "hostname", "uname", "date",
  "df", "du", "free", "ps", "uptime", "cal", "ping", "ipconfig", "systeminfo", "tasklist",
  "list", "cat", "touch", "mkdir", "rmdir", "rm", "cp", "mv", "tree", "stat",
  "grep", "head", "tail", "wc", "sort", "uniq", "cut", "find", "echo", "clear", "help", "which",
]);

/* -------------------------------------------------------------------------
 * Shell
 * ---------------------------------------------------------------------- */

export class Shell {
  constructor(host, options = {}) {
    this.host = host;
    this.mode = options.mode === "pwsh" ? "pwsh" : "bash";
    this.cwd = "/";
    this.previousCwd = "/";
    this.env = { ...DEFAULT_ENV };
    this.groups = new Map([["root", 0], ["sudo", 27], ["users", 100]]);
    this.accounts = new Map();
    this.accounts.set("root", {
      name: "root",
      uid: 0,
      gid: 0,
      groups: new Set(["root", "sudo"]),
      home: "/root",
      password: null,
    });
    this.nextUid = 1000;
    this.nextGid = 101;
    this.userStack = [];
    this.startedAt = Date.now();
    this.aliases = new Map();
    this.history = Array.isArray(options.history) ? options.history.slice(-500) : [];
    this.lastExit = 0;
    this.aliasDepth = 0;

    const savedDirs = typeof host.loadDirs === "function" ? host.loadDirs() : [];
    this.dirs = new Set((savedDirs || []).map((dir) => this.normalize(String(dir))));
    this.setUsername(options.username);
    this.setMode(this.mode, { silent: true });
  }

  createAccountRecord(name, groups = ["users"], uid = null) {
    const existing = this.accounts.get(name);
    if (existing) return existing;
    const assignedUid = uid ?? this.nextUid++;
    const primaryGroup = groups.find((group) => this.groups.has(group)) || "users";
    const account = {
      name,
      uid: assignedUid,
      gid: this.groups.get(primaryGroup) ?? 100,
      groups: new Set(groups),
      home: `/home/${name}`,
      password: null,
    };
    this.accounts.set(name, account);
    return account;
  }

  setUsername(value) {
    const candidate = String(value ?? "").trim();
    const username = /^[A-Za-z_][A-Za-z0-9._-]{0,31}$/.test(candidate) ? candidate : "guest";
    const account = this.createAccountRecord(username, ["users", "sudo"]);
    this.env.USER = username;
    this.env.USERNAME = username;
    this.env.HOME = account.home;
  }

  /* -- filesystem ------------------------------------------------------- */

  files() {
    return this.host.getFiles();
  }

  normalize(path) {
    const parts = [];
    for (const segment of String(path).replace(/\\/g, "/").split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    }
    return `/${parts.join("/")}`;
  }

  /** Accept PowerShell-ish paths (C:\workspace\src) as well as POSIX ones. */
  normalizeInput(path) {
    let value = String(path ?? "");
    if (!value.trim()) return "";
    if (this.mode === "pwsh") {
      value = value.replace(/\\/g, "/");
      if (/^[A-Za-z]:\/workspace\/?$/i.test(value)) return "/";
      value = value.replace(/^[A-Za-z]:\/workspace/i, "");
      value = value.replace(/^[A-Za-z]:\//, "/");
    }
    return value;
  }

  resolve(path) {
    let value = this.normalizeInput(path);
    if (!value) return this.cwd;
    if (value === "~") return "/";
    if (value.startsWith("~/")) return this.normalize(value.slice(1));
    if (value.startsWith("/")) return this.normalize(value);
    return this.normalize(`${this.cwd}/${value}`);
  }

  key(absolute) {
    return absolute.replace(/^\/+/, "");
  }

  base(absolute) {
    return absolute.split("/").filter(Boolean).pop() || "/";
  }

  isFile(absolute) {
    return this.files().has(this.key(absolute));
  }

  isDir(absolute) {
    if (absolute === "/") return true;
    if (this.dirs.has(absolute)) return true;
    const prefix = `${this.key(absolute)}/`;
    for (const name of this.files().keys()) {
      if (name.startsWith(prefix)) return true;
    }
    return false;
  }

  read(absolute) {
    const value = this.files().get(this.key(absolute));
    return value === undefined ? null : String(value);
  }

  syncDirs() {
    if (typeof this.host.saveDirs === "function") {
      this.host.saveDirs([...this.dirs]);
    }
  }

  ensureParents(absolute) {
    const parts = absolute.split("/").filter(Boolean);
    parts.pop();
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      if (!this.dirs.has(current)) {
        this.dirs.add(current);
      }
    }
    this.syncDirs();
  }

  writeFile(absolute, content) {
    this.ensureParents(absolute);
    this.host.writeFile(this.key(absolute), String(content));
  }

  removeFile(absolute) {
    this.host.deleteFile(this.key(absolute));
  }

  list(absolute) {
    const entries = new Map();
    const filePrefix = absolute === "/" ? "" : `${absolute.slice(1)}/`;
    const dirPrefix = absolute === "/" ? "/" : `${absolute}/`;

    for (const name of this.files().keys()) {
      if (!name.startsWith(filePrefix)) continue;
      const rest = name.slice(filePrefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      const child = slash === -1 ? rest : rest.slice(0, slash);
      if (!child) continue;
      entries.set(child, slash !== -1 ? true : entries.get(child) || false);
    }

    for (const dir of this.dirs) {
      if (dir === absolute) continue;
      if (!dir.startsWith(dirPrefix)) continue;
      const rest = dir.slice(dirPrefix.length);
      const slash = rest.indexOf("/");
      const child = slash === -1 ? rest : rest.slice(0, slash);
      if (child) entries.set(child, true);
    }

    return [...entries.entries()]
      .map(([name, isDirectory]) => ({ name, dir: isDirectory }))
      .sort((a, b) => {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  pathMatches(prefix) {
    const slash = prefix.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : prefix.slice(0, slash + 1);
    const basePart = prefix.slice(dirPart.length);
    const absolute = this.resolve(dirPart || ".");
    if (!this.isDir(absolute)) return [];
    return this.list(absolute)
      .filter((entry) => entry.name.startsWith(basePart))
      .map((entry) => `${dirPart}${entry.name}${entry.dir ? "/" : ""}`);
  }

  glob(pattern) {
    const absolute = this.resolve(pattern);
    const slash = absolute.lastIndexOf("/");
    const directory = absolute.slice(0, slash) || "/";
    const namePattern = absolute.slice(slash + 1);
    const regex = globToRegExp(namePattern);
    const prefix = pattern.slice(0, pattern.lastIndexOf("/") + 1);
    return this.list(directory)
      .filter((entry) => regex.test(entry.name))
      .map((entry) => `${prefix}${entry.name}${entry.dir ? "/" : ""}`);
  }

  /* -- expansion -------------------------------------------------------- */

  expandVariables(value) {
    return String(value).replace(
      /\$(?:\{env:([A-Za-z_]\w*)\}|env:([A-Za-z_]\w*)|\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*)|\?)/g,
      (match, bracedEnv, plainEnv, braced, plain) => {
        if (match === "$?") return String(this.lastExit);
        const name = bracedEnv || plainEnv || braced || plain;
        if (name === "PWD") return this.cwd;
        if (name === "LASTEXITCODE") return String(this.lastExit);
        return this.env[name] ?? "";
      }
    );
  }

  expandToken(token) {
    if (!token.expand) return token.value;
    let value = this.expandVariables(token.value);
    if (!token.quoted) {
      if (/^~(?=\/|$)/.test(value)) value = value.replace(/^~/, "/");
      if (/[*?]/.test(value)) {
        const matches = this.glob(value);
        if (matches.length) return matches;
      }
    }
    return value;
  }

  /* -- prompt ----------------------------------------------------------- */

  displayCwd() {
    if (this.mode === "pwsh") {
      return this.cwd === "/" ? "C:\\workspace" : `C:\\workspace${this.cwd.replace(/\//g, "\\")}`;
    }
    return this.cwd === "/" ? "~" : `~${this.cwd}`;
  }

  promptParts() {
    return {
      path: this.displayCwd(),
      sigil: this.mode === "pwsh" ? ">" : "$",
    };
  }

  promptText() {
    const { path, sigil } = this.promptParts();
    const user = this.env.USER || "guest";
    const hostname = this.env.HOSTNAME || "pyide";
    return this.mode === "pwsh" ? `PS ${path}${sigil}` : `${user}@${hostname}:${path}${sigil}`;
  }

  /* -- mode / history --------------------------------------------------- */

  setMode(mode, { silent = false } = {}) {
    this.mode = mode === "pwsh" ? "pwsh" : "bash";
    this.env.SHELL = this.mode === "pwsh" ? "powerShell" : "/bin/bash";
    if (!silent) {
      this.host.write(`switched to ${this.mode === "pwsh" ? "PowerShell" : "bash"} mode`, "sys");
    }
  }

  addHistory(line) {
    const value = String(line).trim();
    if (!value) return;
    if (this.history[this.history.length - 1] === value) return;
    this.history.push(value);
    if (this.history.length > 500) this.history.shift();
    if (typeof this.host.saveHistory === "function") this.host.saveHistory(this.history);
  }

  commandTable() {
    return this.mode === "pwsh" ? PWSH : BASH;
  }

  canonical(name) {
    const table = this.commandTable();
    if (this.mode === "pwsh") {
      const entry = table[String(name).toLowerCase()];
      return entry || null;
    }
    return table[name] || null;
  }

  commandNames() {
    const names = new Set(Object.keys(this.commandTable()));
    for (const name of this.aliases.keys()) names.add(name);
    return [...names].sort();
  }

  /* -- completion ------------------------------------------------------- */

  complete(input, cursor) {
    const before = input.slice(0, cursor);
    const match = /(\S*)$/.exec(before);
    const prefix = match[1];
    const start = cursor - prefix.length;
    const preceding = before.slice(0, start).trim();
    const isCommand = preceding === "" || /[|;&]$/.test(preceding);

    let matches;
    if (isCommand) {
      matches = this.commandNames().filter((name) => name.startsWith(prefix));
    } else {
      matches = this.pathMatches(prefix);
    }

    if (!matches.length) return null;
    return {
      start,
      end: cursor,
      prefix,
      matches,
      common: commonPrefix(matches),
    };
  }

  /* -- execution -------------------------------------------------------- */

  async execute(line) {
    const input = String(line);
    if (!input.trim()) return 0;

    this.addHistory(input);
    this.host.write(`${this.promptText()} ${input}`, "cmd");

    let groups;
    try {
      groups = parse(lex(input, { pwsh: this.mode === "pwsh" }));
    } catch (error) {
      this.host.write(String(error.message || error), "err");
      this.lastExit = 2;
      return this.lastExit;
    }

    for (const group of groups) {
      if (group.connector === "&&" && this.lastExit !== 0) continue;
      if (group.connector === "||" && this.lastExit === 0) continue;
      await this.runPipeline(group.pipeline);
    }
    return this.lastExit;
  }

  async runPipeline(segments) {
    let input = "";

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const isLast = index === segments.length - 1;

      const argv = [];
      for (const token of segment.argv) {
        const value = this.expandToken(token);
        if (Array.isArray(value)) argv.push(...value);
        else argv.push(value);
      }

      const overrides = {};
      while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) {
        const assignment = argv.shift();
        const equals = assignment.indexOf("=");
        const name = assignment.slice(0, equals);
        overrides[name] = this.env[name];
        this.env[name] = assignment.slice(equals + 1);
      }

      if (segment.redirects.in) {
        const source = this.resolve(this.expandToken(segment.redirects.in));
        const content = this.read(source);
        if (content === null) {
          this.host.write(`${this.base(source)}: No such file or directory`, "err");
          this.lastExit = 1;
          this.restoreEnv(overrides);
          continue;
        }
        input = content;
      }

      const result = await this.dispatch(argv, input);
      this.restoreEnv(overrides);
      this.lastExit = result.code;

      if (segment.redirects.out) {
        const target = this.resolve(this.expandToken(segment.redirects.out));
        const existing = segment.redirects.append ? this.read(target) ?? "" : "";
        this.writeFile(target, existing + (result.out ?? ""));
        if (!isLast) input = "";
      } else if (!isLast) {
        input = result.streamed ? "" : result.out ?? "";
      } else if (!result.streamed) {
        this.host.write(result.out ?? "", "");
      }

      if (result.err) this.host.write(result.err, "err");
    }
  }

  restoreEnv(overrides) {
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) delete this.env[name];
      else this.env[name] = value;
    }
  }

  async dispatch(argv, stdin) {
    if (!argv.length) return { code: 0, out: "" };
    if (this.aliasDepth > 12) {
      return { code: 1, out: "", err: "alias expansion is too deep\n" };
    }

    let [name, ...args] = argv;
    const userAlias = this.aliases.get(name) || this.aliases.get(name.toLowerCase());
    if (userAlias) {
      this.aliasDepth += 1;
      try {
        const expanded = lex(userAlias, { pwsh: this.mode === "pwsh" }).filter((token) => token.type === "word").map((token) => token.value);
        if (!expanded.length) return { code: 0, out: "" };
        return await this.dispatch([...expanded, ...args], stdin);
      } finally {
        this.aliasDepth -= 1;
      }
    }

    const entry = this.canonical(name);
    if (!entry) {
      return { code: 127, out: "", err: `${name}: command not found\n` };
    }

    let canonical = entry;
    if (typeof entry === "object") {
      canonical = entry.cmd;
      args = [...(entry.pre || []), ...args];
    }

    return await this.run(canonical, args, stdin);
  }

  async run(command, args, stdin) {
    switch (command) {
      case "pwd":
        return this.ok(`${this.cwd}\n`);

      case "cd":
        return this.cd(args[0]);

      case "list":
        return this.listCommand(args);

      case "tree":
        return this.treeCommand(args, stdin);

      case "cat":
        return this.catCommand(args, stdin);

      case "head":
      case "tail":
        return this.headTail(command, args, stdin);

      case "wc":
        return this.wcCommand(args, stdin);

      case "grep":
        return this.grepCommand(args, stdin);

      case "sort":
        return this.sortCommand(args, stdin);

      case "uniq":
        return this.uniqCommand(args, stdin);

      case "cut":
        return this.cutCommand(args, stdin);

      case "find":
        return this.findCommand(args);

      case "echo":
        return this.echoCommand(args);

      case "touch":
        return this.touchCommand(args);

      case "mkdir":
        return this.mkdirCommand(args);

      case "rmdir":
        return this.rmdirCommand(args);

      case "rm":
        return this.rmCommand(args);

      case "cp":
      case "mv":
        return this.copyMove(command, args);

      case "stat":
        return this.statCommand(args);

      case "which":
        return this.whichCommand(args);

      case "env":
        return this.envCommand(args);

      case "export":
        return this.exportCommand(args);

      case "unset":
        return this.unsetCommand(args);

      case "alias":
        return this.aliasCommand(args);

      case "unalias":
        return this.unaliasCommand(args);

      case "history":
        return this.historyCommand(args);

      case "clear":
        this.host.clear();
        return this.ok();

      case "help":
        this.host.write(this.helpText(), "sys");
        return this.ok();

      case "shell":
        if (!args.length) {
          return this.ok(`${this.mode}\n`);
        }
        if (!["bash", "pwsh", "powershell"].includes(String(args[0]).toLowerCase())) {
          return this.fail(`shell: unknown shell '${args[0]}' (use bash or pwsh)\n`);
        }
        this.setMode(String(args[0]).toLowerCase() === "bash" ? "bash" : "pwsh");
        return this.ok();

      case "run":
        return this.runFileCommand(args, stdin, null);

      case "python":
        return this.runFileCommand(args, stdin, "python");

      case "node":
        return this.runFileCommand(args, stdin, "javascript");

      case "pip":
        return this.pipCommand(args);

      case "open":
        return this.openCommand(args);

      case "download":
        return this.downloadCommand(args);

      case "setcontent":
        return this.setContentCommand(args, false);

      case "addcontent":
        return this.setContentCommand(args, true);

      case "testpath":
        return this.testPathCommand(args);

      case "sudo":
        return this.sudoCommand(args, stdin);

      case "su":
        return this.suCommand(args);

      case "useradd":
        return this.userAddCommand(args, false);

      case "adduser":
        return this.userAddCommand(args, true);

      case "userdel":
        return this.userDelCommand(args);

      case "passwd":
        return this.passwdCommand(args);

      case "usermod":
        return this.userModCommand(args);

      case "groupadd":
        return this.groupAddCommand(args);

      case "groupdel":
        return this.groupDelCommand(args);

      case "id":
        return this.idCommand(args);

      case "groups":
        return this.groupsCommand(args);

      case "users":
        return this.usersCommand();

      case "who":
        return this.whoCommand();

      case "free":
      case "df":
      case "du":
      case "ps":
      case "uptime":
      case "cal":
      case "ping":
      case "ipconfig":
      case "systeminfo":
      case "tasklist":
        return this.virtualSystemCommand(command, args);

      case "batch":
        return this.runFileCommand(args, stdin, "batch");

      case "date":
        return this.ok(`${new Date().toString()}\n`);

      case "whoami":
        return this.ok(`${this.env.USER}\n`);

      case "hostname":
        return this.ok(`${this.env.HOSTNAME}\n`);

      case "uname":
        return this.ok("PyIDE Virtual OS · browser sandbox\n");

      case "sleep": {
        const seconds = Math.max(0, Math.min(10, Number(args[0] ?? 0) || 0));
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        return this.ok();
      }

      case "true":
        return this.ok();

      case "false":
        return { code: 1, out: "" };

      case "version":
        return this.ok(`${this.host.version()}\n`);

      case "reset": {
        const done = await this.host.resetWorkspace();
        return { code: done ? 0 : 1, out: "" };
      }

      case "exit":
        if (this.userStack.length) {
          const previous = this.userStack.pop();
          this.env.USER = previous.USER;
          this.env.USERNAME = previous.USERNAME;
          this.env.HOME = previous.HOME;
          this.env.PWD = previous.PWD;
          return this.ok(`Returned to ${this.env.USER}.\n`);
        }
        this.host.write("This is a browser tab — close the tab or press Stop to end a run.", "sys");
        return this.ok();

      default:
        return { code: 127, out: "", err: `${command}: not implemented\n` };
    }
  }

  ok(out = "") {
    return { code: 0, out };
  }

  fail(err, code = 1) {
    return { code, out: "", err };
  }

  /* -- command implementations ------------------------------------------ */

  cd(target) {
    if (target === "-") {
      const next = this.previousCwd;
      this.previousCwd = this.cwd;
      this.cwd = next;
      this.env.PWD = this.cwd;
      return this.ok(`${this.cwd}\n`);
    }
    const absolute = target ? this.resolve(target) : "/";
    if (!this.isDir(absolute)) {
      return this.fail(`cd: ${target}: Not a directory\n`);
    }
    this.previousCwd = this.cwd;
    this.cwd = absolute;
    this.env.PWD = this.cwd;
    return this.ok();
  }

  listCommand(args) {
    const { flags, operands } = parseFlags(args);
    const long = flags.has("-l");
    const one = flags.has("-1");
    const targets = operands.length ? operands : ["."];
    let out = "";
    let code = 0;

    for (const target of targets) {
      const absolute = this.resolve(target);
      if (this.isFile(absolute)) {
        out += `${long ? `-rw- ${formatSize(String(this.read(absolute)).length).padStart(7)}  ` : ""}${this.base(absolute)}\n`;
        continue;
      }
      if (!this.isDir(absolute)) {
        this.host.write(`ls: ${target}: No such file or directory`, "err");
        code = 1;
        continue;
      }
      if (targets.length > 1) out += `${target}:\n`;
      const entries = this.list(absolute);
      if (long) {
        for (const entry of entries) {
          const size = entry.dir ? "-" : formatSize(String(this.read(`${absolute === "/" ? "" : absolute}/${entry.name}`) ?? "").length);
          out += `${entry.dir ? "drwx" : "-rw-"} ${String(size).padStart(7)}  ${entry.name}${entry.dir ? "/" : ""}\n`;
        }
      } else if (one) {
        for (const entry of entries) out += `${entry.name}${entry.dir ? "/" : ""}\n`;
      } else {
        out += entries.map((entry) => entry.name + (entry.dir ? "/" : "")).join("  ") + "\n";
      }
      if (targets.length > 1) out += "\n";
    }
    return { code, out };
  }

  treeCommand(args) {
    const root = this.resolve(args[0] || ".");
    if (!this.isDir(root)) return this.fail(`tree: ${args[0] || "."}: Not a directory\n`);
    let out = `${args[0] || "."}\n`;
    const walk = (dir, prefix) => {
      const entries = this.list(dir);
      entries.forEach((entry, index) => {
        const last = index === entries.length - 1;
        out += `${prefix}${last ? "└── " : "├── "}${entry.name}${entry.dir ? "/" : ""}\n`;
        if (entry.dir) walk(`${dir === "/" ? "" : dir}/${entry.name}`, `${prefix}${last ? "    " : "│   "}`);
      });
    };
    walk(root, "");
    return this.ok(out);
  }

  catCommand(args, stdin) {
    if (!args.length) return this.ok(stdin);
    let out = "";
    let code = 0;
    for (const target of args) {
      const absolute = this.resolve(target);
      const content = this.read(absolute);
      if (content === null) {
        this.host.write(`cat: ${target}: No such file or directory`, "err");
        code = 1;
      } else {
        out += content;
        if (content && !content.endsWith("\n")) out += "\n";
      }
    }
    return { code, out };
  }

  headTail(command, args, stdin) {
    const { operands } = parseFlags(args, ["-n"]);
    let count = 10;
    const index = args.findIndex((arg) => arg === "-n");
    if (index >= 0) count = Math.max(0, Number(args[index + 1]) || 0);
    const files = index >= 0 ? args.filter((_, position) => position !== index && position !== index + 1) : operands;

    let text = stdin;
    let name = "";
    if (files.length) {
      name = files[0];
      const content = this.read(this.resolve(files[0]));
      if (content === null) return this.fail(`${command}: ${files[0]}: No such file or directory\n`);
      text = content;
    }
    const lines = splitLines(text);
    const selected = command === "head" ? lines.slice(0, count) : lines.slice(Math.max(0, lines.length - count));
    let out = selected.join("\n");
    if (out) out += "\n";
    if (files.length > 1) out = `==> ${name} <==\n${out}`;
    return this.ok(out);
  }

  wcCommand(args, stdin) {
    const { flags, operands } = parseFlags(args);
    const text = operands.length ? this.read(this.resolve(operands[0])) ?? "" : stdin;
    const lines = splitLines(text).length;
    const words = String(text).trim() ? String(text).trim().split(/\s+/).length : 0;
    const bytes = String(text).length;
    const parts = [];
    if (flags.has("-l")) parts.push(lines);
    else if (flags.has("-w")) parts.push(words);
    else if (flags.has("-c")) parts.push(bytes);
    else parts.push(lines, words, bytes);
    return this.ok(`${parts.join(" ")}${operands.length ? ` ${operands[0]}` : ""}\n`);
  }

  grepCommand(args, stdin) {
    const { flags, operands } = parseFlags(args);
    const pattern = operands.shift();
    if (!pattern) return this.fail("usage: grep [-i] [-v] [-n] [-c] pattern [file...]\n", 2);

    let regex;
    try {
      regex = new RegExp(pattern, flags.has("-i") ? "i" : "");
    } catch {
      return this.fail(`grep: invalid pattern: ${pattern}\n`, 2);
    }

    const files = operands.length ? operands : [null];
    let out = "";
    let matched = 0;

    for (const file of files) {
      const text = file ? this.read(this.resolve(file)) : stdin;
      if (text === null) {
        return this.fail(`grep: ${file}: No such file or directory\n`);
      }
      const lines = splitLines(text);
      const hits = [];
      lines.forEach((line, index) => {
        const hit = regex.test(line);
        if (hit !== flags.has("-v")) hits.push({ line, index: index + 1 });
      });
      matched += hits.length;
      if (flags.has("-l")) {
        if (hits.length) out += `${file}\n`;
        continue;
      }
      for (const hit of hits) {
        if (files.length > 1 && !flags.has("-c")) out += `${file}:`;
        if (flags.has("-n")) out += `${hit.index}:`;
        out += `${hit.line}\n`;
      }
      if (flags.has("-c")) out += `${hits.length}${file ? ` ${file}` : ""}\n`;
    }

    return { code: matched ? 0 : 1, out };
  }

  sortCommand(args, stdin) {
    const { flags, operands } = parseFlags(args);
    const text = operands.length ? this.read(this.resolve(operands[0])) ?? "" : stdin;
    let lines = splitLines(text);
    lines.sort((a, b) => (flags.has("-n") ? Number(a) - Number(b) : a.localeCompare(b)));
    if (flags.has("-r")) lines.reverse();
    if (flags.has("-u")) lines = [...new Set(lines)];
    return this.ok(lines.length ? `${lines.join("\n")}\n` : "");
  }

  uniqCommand(args, stdin) {
    const { flags, operands } = parseFlags(args);
    const text = operands.length ? this.read(this.resolve(operands[0])) ?? "" : stdin;
    const lines = splitLines(text);
    const out = [];
    let previous = null;
    let count = 0;
    for (const line of lines) {
      if (line === previous) {
        count += 1;
      } else {
        if (previous !== null) out.push(flags.has("-c") ? `${String(count).padStart(4)} ${previous}` : previous);
        previous = line;
        count = 1;
      }
    }
    if (previous !== null) out.push(flags.has("-c") ? `${String(count).padStart(4)} ${previous}` : previous);
    return this.ok(out.length ? `${out.join("\n")}\n` : "");
  }

  cutCommand(args, stdin) {
    let delimiter = "\t";
    let fields = [1];
    const files = [];
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg.startsWith("-d")) delimiter = arg.slice(2) || args[++index] || "\t";
      else if (arg.startsWith("-f")) fields = arg.slice(2).split(",").map((value) => Number(value) - 1);
      else files.push(arg);
    }
    const text = files.length ? this.read(this.resolve(files[0])) ?? "" : stdin;
    const lines = splitLines(text).map((line) => {
      const parts = line.split(delimiter);
      return fields.map((field) => parts[field] ?? "").join(delimiter);
    });
    return this.ok(lines.length ? `${lines.join("\n")}\n` : "");
  }

  findCommand(args) {
    let root = ".";
    let namePattern = null;
    let type = null;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === "-name") namePattern = args[++index];
      else if (args[index] === "-type") type = args[++index];
      else if (!args[index].startsWith("-")) root = args[index];
    }

    const absolute = this.resolve(root);
    if (!this.isDir(absolute)) return this.fail(`find: '${root}': No such file or directory\n`);
    const regex = namePattern ? globToRegExp(namePattern) : null;
    const results = [];

    const walk = (dir, display) => {
      for (const entry of this.list(dir)) {
        const childAbs = `${dir === "/" ? "" : dir}/${entry.name}`;
        const childDisplay = `${display}/${entry.name}`;
        const matchesName = !regex || regex.test(entry.name);
        const matchesType = !type || (type === "d" ? entry.dir : !entry.dir);
        if (matchesName && matchesType) results.push(childDisplay);
        if (entry.dir) walk(childAbs, childDisplay);
      }
    };

    walk(absolute, root === "." ? "." : root.replace(/\/$/, ""));
    return this.ok(results.length ? `${results.join("\n")}\n` : "");
  }

  echoCommand(args) {
    let newline = true;
    if (args[0] === "-n") {
      newline = false;
      args = args.slice(1);
    }
    return this.ok(`${args.join(" ")}${newline ? "\n" : ""}`);
  }

  touchCommand(args) {
    if (!args.length) return this.fail("touch: missing file operand\n");
    let code = 0;
    for (const target of args) {
      const absolute = this.resolve(target);
      if (this.isDir(absolute)) continue;
      if (!this.isFile(absolute)) this.writeFile(absolute, "");
      if (this.isFile(absolute)) continue;
      this.host.write(`touch: ${target}: cannot create file`, "err");
      code = 1;
    }
    return { code, out: "" };
  }

  mkdirCommand(args) {
    const { flags, operands } = parseFlags(args);
    if (!operands.length) return this.fail("mkdir: missing operand\n");
    let code = 0;
    for (const target of operands) {
      const absolute = this.resolve(target);
      if (this.isDir(absolute)) {
        if (!flags.has("-p")) {
          this.host.write(`mkdir: ${target}: File exists`, "err");
          code = 1;
        }
        continue;
      }
      if (!flags.has("-p")) {
        const parent = absolute.slice(0, absolute.lastIndexOf("/")) || "/";
        if (!this.isDir(parent)) {
          this.host.write(`mkdir: ${target}: No such file or directory`, "err");
          code = 1;
          continue;
        }
      }
      this.ensureParents(absolute);
      this.dirs.add(absolute);
      this.syncDirs();
    }
    return { code, out: "" };
  }

  rmdirCommand(args) {
    if (!args.length) return this.fail("rmdir: missing operand\n");
    let code = 0;
    for (const target of args) {
      const absolute = this.resolve(target);
      if (!this.isDir(absolute)) {
        this.host.write(`rmdir: ${target}: No such directory`, "err");
        code = 1;
        continue;
      }
      if (this.list(absolute).length) {
        this.host.write(`rmdir: ${target}: Directory not empty`, "err");
        code = 1;
        continue;
      }
      this.dirs.delete(absolute);
      this.syncDirs();
    }
    return { code, out: "" };
  }

  rmCommand(args) {
    const { flags, operands } = parseFlags(args);
    if (!operands.length) return this.fail("rm: missing operand\n");
    const recursive = flags.has("-r") || flags.has("-R") || flags.has("--recursive");
    const force = flags.has("-f");

    let code = 0;
    for (const target of operands) {
      const absolute = this.resolve(target);
      if (absolute === "/") {
        this.host.write("rm: refusing to remove the workspace root", "err");
        code = 1;
        continue;
      }
      if (this.isFile(absolute)) {
        this.removeFile(absolute);
        continue;
      }
      if (!this.isDir(absolute)) {
        if (!force) {
          this.host.write(`rm: ${target}: No such file or directory`, "err");
          code = 1;
        }
        continue;
      }
      if (!recursive) {
        this.host.write(`rm: ${target}: is a directory (use -r)`, "err");
        code = 1;
        continue;
      }
      const prefix = `${this.key(absolute)}/`;
      for (const name of [...this.files().keys()]) {
        if (name.startsWith(prefix)) this.removeFile(`/${name}`);
      }
      for (const dir of [...this.dirs]) {
        if (dir === absolute || dir.startsWith(prefix)) this.dirs.delete(dir);
      }
      this.syncDirs();
    }
    return { code, out: "" };
  }

  copyMove(command, args) {
    const { flags, operands } = parseFlags(args);
    if (operands.length < 2) return this.fail(`${command}: missing destination file operand\n`);
    const recursive = flags.has("-r") || flags.has("-R");
    const destination = operands.pop();
    const destAbsolute = this.resolve(destination);
    const destIsDir = this.isDir(destAbsolute);
    let code = 0;

    for (const source of operands) {
      const sourceAbsolute = this.resolve(source);
      if (this.isFile(sourceAbsolute)) {
        const targetAbsolute = destIsDir ? `${destAbsolute === "/" ? "" : destAbsolute}/${this.base(sourceAbsolute)}` : destAbsolute;
        this.writeFile(targetAbsolute, this.read(sourceAbsolute) ?? "");
        if (command === "mv") this.removeFile(sourceAbsolute);
        continue;
      }
      if (!this.isDir(sourceAbsolute)) {
        this.host.write(`${command}: ${source}: No such file or directory`, "err");
        code = 1;
        continue;
      }
      if (!recursive) {
        this.host.write(`${command}: ${source}: is a directory (use -r)`, "err");
        code = 1;
        continue;
      }

      const targetRoot = destIsDir
        ? `${destAbsolute === "/" ? "" : destAbsolute}/${this.base(sourceAbsolute)}`
        : destAbsolute;
      const prefix = `${this.key(sourceAbsolute)}/`;

      if (command === "mv") {
        for (const dir of [...this.dirs]) {
          if (dir === sourceAbsolute || dir.startsWith(prefix)) {
            this.dirs.delete(dir);
            this.dirs.add(targetRoot + dir.slice(sourceAbsolute.length));
          }
        }
        for (const name of [...this.files().keys()]) {
          if (name.startsWith(prefix)) {
            const content = this.files().get(name) ?? "";
            this.removeFile(`/${name}`);
            this.writeFile(`${targetRoot}/${name.slice(prefix.length)}`, content);
          }
        }
        this.dirs.add(targetRoot);
        this.syncDirs();
      } else {
        this.dirs.add(targetRoot);
        for (const name of [...this.files().keys()]) {
          if (name.startsWith(prefix)) {
            this.writeFile(`${targetRoot}/${name.slice(prefix.length)}`, this.files().get(name) ?? "");
          }
        }
        this.syncDirs();
      }
    }
    return { code, out: "" };
  }

  statCommand(args) {
    if (!args.length) return this.fail("stat: missing operand\n");
    let out = "";
    for (const target of args) {
      const absolute = this.resolve(target);
      if (this.isDir(absolute)) {
        out += `  File: ${target}\n  Type: directory\nEntries: ${this.list(absolute).length}\n`;
      } else if (this.isFile(absolute)) {
        const content = this.read(absolute) ?? "";
        out += `  File: ${target}\n  Type: file\n  Size: ${content.length} bytes\n  Lines: ${splitLines(content).length}\n`;
      } else {
        return this.fail(`stat: cannot stat '${target}': No such file or directory\n`);
      }
    }
    return this.ok(out);
  }

  whichCommand(args) {
    if (!args.length) return this.fail("which: missing operand\n");
    let out = "";
    let code = 0;
    for (const name of args) {
      const entry = this.canonical(name);
      if (entry) {
        const canonical = typeof entry === "object" ? entry.cmd : entry;
        out += `${name}: shell built-in (${canonical})\n`;
      } else {
        code = 1;
      }
    }
    return { code, out };
  }

  envCommand(args) {
    if (args.length) return this.dispatch(args, "");
    return this.ok(`${Object.entries(this.env).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
  }

  exportCommand(args) {
    if (!args.length) {
      return this.ok(`${Object.entries(this.env).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
    }
    let code = 0;
    for (const arg of args) {
      const equals = arg.indexOf("=");
      if (equals <= 0) {
        this.host.write(`export: ${arg}: not a valid identifier (use NAME=value)`, "err");
        code = 1;
        continue;
      }
      this.env[arg.slice(0, equals)] = arg.slice(equals + 1);
    }
    return { code, out: "" };
  }

  unsetCommand(args) {
    for (const name of args) delete this.env[name];
    return this.ok();
  }

  aliasCommand(args) {
    if (!args.length) {
      const lines = [...this.aliases.entries()].map(([name, value]) => `alias ${name}='${value}'`);
      return this.ok(lines.length ? `${lines.join("\n")}\n` : "");
    }
    for (const arg of args) {
      const equals = arg.indexOf("=");
      if (equals <= 0) continue;
      this.aliases.set(arg.slice(0, equals), arg.slice(equals + 1).replace(/^['"]|['"]$/g, ""));
    }
    return this.ok();
  }

  unaliasCommand(args) {
    for (const name of args) this.aliases.delete(name);
    return this.ok();
  }

  historyCommand(args) {
    if (args[0] === "-c") {
      this.history = [];
      if (typeof this.host.saveHistory === "function") this.host.saveHistory([]);
      return this.ok();
    }
    const out = this.history
      .map((line, index) => `${String(index + 1).padStart(4)}  ${line}`)
      .join("\n");
    return this.ok(out ? `${out}\n` : "");
  }

  currentAccount(name = this.env.USER) {
    return this.accounts.get(name) || null;
  }

  async requestVirtualSecret(options) {
    if (typeof this.host.requestSecret !== "function") return null;
    return this.host.requestSecret(options);
  }

  async requestVirtualText(options) {
    if (typeof this.host.requestText !== "function") return null;
    return this.host.requestText(options);
  }

  async sudoCommand(args, stdin) {
    if (args[0] === "-l") {
      return this.ok(`Allowed simulated admin commands:\n${[...SUDO_SAFE_COMMANDS].sort().join("  ")}\n`);
    }
    if (!args.length) return this.fail("usage: sudo <safe virtual command>\n", 2);

    const caller = this.currentAccount();
    if (!caller || (this.env.USER !== "root" && !caller.groups.has("sudo"))) {
      return this.fail(`sudo: ${this.env.USER} is not in the simulated sudo group\n`);
    }

    const [requestedName, ...requestedArgs] = args;
    const vocabulary = this.mode === "pwsh" ? PWSH : BASH;
    const definition = vocabulary[String(requestedName).toLowerCase()];
    if (!definition) return this.fail(`sudo: ${requestedName}: command is not available in the virtual shell\n`);
    const command = typeof definition === "string" ? definition : definition.cmd;
    const commandArgs = [...(typeof definition === "object" ? definition.pre || [] : []), ...requestedArgs];
    if (!SUDO_SAFE_COMMANDS.has(command)) {
      return this.fail("sudo is limited to allow-listed virtual commands; host programs and files are never accessed\n");
    }

    if (this.env.USER !== "root") {
      if (!caller.password) {
        return this.fail(`sudo: no demo password is set for ${caller.name}; run 'passwd' first\n`);
      }
      const password = await this.requestVirtualSecret({
        title: "Virtual sudo",
        label: `Password for ${caller.name}`,
        hint: "Demo-only password. It is kept in memory for this tab and is never sent to a server.",
        confirm: "Continue",
      });
      if (password === null) return { code: 1, out: "sudo: cancelled\n" };
      if (!(await verifyVirtualPassword(password, caller.password))) {
        return this.fail("sudo: incorrect demo password\n");
      }
    }

    const previousEnv = { ...this.env };
    this.env.USER = "root";
    this.env.USERNAME = "root";
    this.env.HOME = "/root";
    this.env.SUDO_USER = caller.name;
    try {
      return await this.run(command, commandArgs, stdin);
    } finally {
      this.env = previousEnv;
    }
  }

  async userAddCommand(args, interactive) {
    if (this.env.USER !== "root") {
      return this.fail(`useradd: permission denied; use sudo useradd <name>\n`);
    }
    if (args.includes("--help") || args.includes("-h")) {
      return this.ok("usage: useradd [-m] [-G group,...] <name>  (creates a virtual account only)\n");
    }

    let username = "";
    let requestedGroups = [];
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      if (["-m", "--create-home"].includes(argument)) continue;
      if (["-d", "--home-dir", "-s", "--shell"].includes(argument)) {
        index += 1;
        continue;
      }
      if (["-G", "--groups", "-g"].includes(argument)) {
        requestedGroups = String(args[index + 1] || "").split(",").filter(Boolean);
        index += 1;
        continue;
      }
      if (argument.startsWith("-")) return this.fail(`useradd: unsupported option ${argument}\n`);
      if (!username) username = argument;
    }

    if (!username && interactive) {
      const answer = await this.requestVirtualText({
        title: "Add virtual user",
        label: "Username",
        hint: "Use a Linux-style alias. This account exists only in the current browser tab.",
        value: "",
        confirm: "Add user",
      });
      if (answer === null) return { code: 1, out: "adduser: cancelled\n" };
      username = answer.trim().toLowerCase();
    }

    username = String(username).toLowerCase();
    if (!VIRTUAL_SYSTEM_USER_PATTERN.test(username)) {
      return this.fail("useradd: use 1–32 lowercase letters, digits, underscores, or hyphens; start with a letter or underscore\n", 2);
    }
    if (this.accounts.has(username)) return this.fail(`useradd: user '${username}' already exists\n`);
    const unknownGroup = requestedGroups.find((group) => !this.groups.has(group));
    if (unknownGroup) return this.fail(`useradd: group '${unknownGroup}' does not exist\n`);

    const groups = [...new Set(["users", ...requestedGroups])];
    const account = this.createAccountRecord(username, groups);
    return this.ok(`Created virtual user '${account.name}' (uid ${account.uid}). Set a tab-only demo password with 'sudo passwd ${account.name}'.\n`);
  }

  userDelCommand(args) {
    if (this.env.USER !== "root") return this.fail("userdel: permission denied; use sudo userdel <name>\n");
    const username = args.find((argument) => !argument.startsWith("-"));
    if (!username) return this.fail("usage: userdel <name>  (virtual users only)\n", 2);
    if (username === "root") return this.fail("userdel: the virtual root account cannot be removed\n");
    if (!this.accounts.has(username)) return this.fail(`userdel: user '${username}' does not exist\n`);
    if (this.userStack.some((entry) => entry.USER === username)) {
      return this.fail(`userdel: user '${username}' is active in this shell\n`);
    }
    this.accounts.delete(username);
    return this.ok(`Removed virtual user '${username}'. No host account or files were changed.\n`);
  }

  async passwdCommand(args) {
    const username = args.find((argument) => !argument.startsWith("-")) || this.env.USER;
    const account = this.currentAccount(username);
    if (!account) return this.fail(`passwd: user '${username}' does not exist\n`);
    if (username !== this.env.USER && this.env.USER !== "root") {
      return this.fail("passwd: only the account owner or virtual root can change this password\n");
    }

    if (username === this.env.USER && account.password) {
      const currentPassword = await this.requestVirtualSecret({
        title: `Verify ${username}`,
        label: "Current demo password",
        hint: "This password is only for the simulated shell in this tab.",
        confirm: "Verify",
      });
      if (currentPassword === null) return { code: 1, out: "passwd: cancelled\n" };
      if (!(await verifyVirtualPassword(currentPassword, account.password))) {
        return this.fail("passwd: authentication failed\n");
      }
    }

    const password = await this.requestVirtualSecret({
      title: `Set password for ${username}`,
      label: "New demo password",
      hint: "Never use a real password. This is stored as a salted digest in memory for this tab only.",
      confirm: "Continue",
    });
    if (password === null) return { code: 1, out: "passwd: cancelled\n" };
    if (password.length < 4) return this.fail("passwd: demo passwords must be at least 4 characters\n");

    const confirmation = await this.requestVirtualSecret({
      title: `Confirm password for ${username}`,
      label: "Enter the new demo password again",
      hint: "The password itself is never printed or saved to the workspace.",
      confirm: "Set password",
    });
    if (confirmation === null) return { code: 1, out: "passwd: cancelled\n" };
    if (password !== confirmation) return this.fail("passwd: passwords do not match\n");

    try {
      account.password = await createVirtualPassword(password);
      return this.ok(`Password updated for '${username}' in this tab only.\n`);
    } catch {
      return this.fail("passwd: secure browser cryptography is unavailable; use an HTTPS preview\n");
    }
  }

  userModCommand(args) {
    if (this.env.USER !== "root") return this.fail("usermod: permission denied; use sudo usermod\n");
    const groupOption = args.findIndex((argument) => ["-aG", "-G", "--groups"].includes(argument));
    if (groupOption === -1 || !args[groupOption + 1]) {
      return this.fail("usage: usermod -aG <group,...> <name>  (virtual groups only)\n", 2);
    }
    const username = args[groupOption + 2];
    const account = this.currentAccount(username);
    if (!account) return this.fail(`usermod: user '${username || ""}' does not exist\n`);
    const groupNames = args[groupOption + 1].split(",").filter(Boolean);
    const unknownGroup = groupNames.find((group) => !this.groups.has(group));
    if (unknownGroup) return this.fail(`usermod: group '${unknownGroup}' does not exist\n`);
    const append = args[groupOption] === "-aG";
    account.groups = new Set(append ? [...account.groups, ...groupNames] : ["users", ...groupNames]);
    return this.ok(`Updated virtual groups for '${username}': ${[...account.groups].join(", ")}\n`);
  }

  groupAddCommand(args) {
    if (this.env.USER !== "root") return this.fail("groupadd: permission denied; use sudo groupadd <name>\n");
    const name = args.find((argument) => !argument.startsWith("-"));
    if (!name || !VIRTUAL_SYSTEM_USER_PATTERN.test(name)) {
      return this.fail("usage: groupadd <lowercase-name>  (virtual groups only)\n", 2);
    }
    if (this.groups.has(name)) return this.fail(`groupadd: group '${name}' already exists\n`);
    this.groups.set(name, this.nextGid++);
    return this.ok(`Created virtual group '${name}'.\n`);
  }

  groupDelCommand(args) {
    if (this.env.USER !== "root") return this.fail("groupdel: permission denied; use sudo groupdel <name>\n");
    const name = args.find((argument) => !argument.startsWith("-"));
    if (!name) return this.fail("usage: groupdel <name>  (virtual groups only)\n", 2);
    if (["root", "sudo", "users"].includes(name)) return this.fail(`groupdel: protected virtual group '${name}'\n`);
    if (!this.groups.has(name)) return this.fail(`groupdel: group '${name}' does not exist\n`);
    if ([...this.accounts.values()].some((account) => account.groups.has(name))) {
      return this.fail(`groupdel: group '${name}' is still assigned to a virtual user\n`);
    }
    this.groups.delete(name);
    return this.ok(`Removed virtual group '${name}'.\n`);
  }

  idCommand(args) {
    const username = args.find((argument) => !argument.startsWith("-")) || this.env.USER;
    const account = this.currentAccount(username);
    if (!account) return this.fail(`id: '${username}': no such virtual user\n`);
    const groupNames = [...account.groups];
    const groups = groupNames.map((group) => `${this.groups.get(group) ?? account.gid}(${group})`).join(",");
    const primary = groupNames[0] || "users";
    return this.ok(`uid=${account.uid}(${account.name}) gid=${this.groups.get(primary) ?? account.gid}(${primary}) groups=${groups}\n`);
  }

  groupsCommand(args) {
    const username = args.find((argument) => !argument.startsWith("-")) || this.env.USER;
    const account = this.currentAccount(username);
    if (!account) return this.fail(`groups: '${username}': no such virtual user\n`);
    return this.ok(`${account.name} : ${[...account.groups].join(" ")}\n`);
  }

  usersCommand() {
    return this.ok(`${[...this.accounts.keys()].sort().join(" ")}\n`);
  }

  whoCommand() {
    return this.ok(`${this.env.USER}  browser-session  ${new Date().toLocaleTimeString()}\n`);
  }

  async suCommand(args) {
    const username = args.find((argument) => !argument.startsWith("-")) || "root";
    const account = this.currentAccount(username);
    if (!account) return this.fail(`su: user '${username}' does not exist\n`);
    if (username === this.env.USER) return this.ok();

    if (this.env.USER !== "root") {
      if (!account.password) return this.fail(`su: no demo password is set for '${username}'\n`);
      const password = await this.requestVirtualSecret({
        title: `Switch to ${username}`,
        label: `Password for ${username}`,
        hint: "Virtual account only. Never enter a real password.",
        confirm: "Switch user",
      });
      if (password === null) return { code: 1, out: "su: cancelled\n" };
      if (!(await verifyVirtualPassword(password, account.password))) return this.fail("su: authentication failure\n");
    }

    this.userStack.push({ USER: this.env.USER, USERNAME: this.env.USERNAME, HOME: this.env.HOME, PWD: this.env.PWD });
    this.env.USER = account.name;
    this.env.USERNAME = account.name;
    this.env.HOME = account.home;
    this.env.PWD = this.cwd;
    return this.ok(`Switched to virtual user '${username}'. Use 'exit' to return.\n`);
  }

  virtualSystemCommand(command, args) {
    const files = [...this.files().entries()];
    const workspaceBytes = files.reduce((total, [, content]) => total + new TextEncoder().encode(String(content)).length, 0);

    switch (command) {
      case "free":
        return this.ok("Virtual memory (simulated)\n              total        used        free\nMem:          256M         64M        192M\nSwap:           0M          0M          0M\n");
      case "df":
        return this.ok(`Filesystem  Size  Used  Avail  Use%  Mounted on\nworkspace   128M  ${formatSize(workspaceBytes)}  ${formatSize(Math.max(0, 128 * 1024 * 1024 - workspaceBytes))}  ${Math.min(100, Math.round(workspaceBytes / (128 * 1024 * 1024) * 100))}%  /workspace (virtual)\n`);
      case "du": {
        const target = this.resolve(args.find((argument) => !argument.startsWith("-")) || ".");
        const prefix = `${this.key(target).replace(/\/$/, "")}/`;
        const size = files.reduce((total, [name, content]) => {
          if (name === this.key(target) || name.startsWith(prefix)) return total + new TextEncoder().encode(String(content)).length;
          return total;
        }, 0);
        return this.ok(`${formatSize(size)}\t${target}\n`);
      }
      case "ps":
        return this.ok("Virtual processes only (no host processes)\n  PID USER     COMMAND\n    1 pyide    browser-ide\n    2 shell    bash-simulator\n    3 runtime  wasm-runtime\n");
      case "tasklist":
        return this.ok("Virtual tasks only (no host processes)\nImage Name                 PID   Session\npyide-browser.exe           1    Browser tab\nvirtual-shell.exe           2    Browser tab\nwasm-runtime.exe             3    Browser tab\n");
      case "uptime": {
        const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
        return this.ok(`Browser shell uptime: ${seconds} seconds\n`);
      }
      case "cal": {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
        const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const title = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        const cells = [...Array(first).fill("  "), ...Array.from({ length: days }, (_, index) => String(index + 1).padStart(2))];
        const rows = [];
        for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7).join(" "));
        return this.ok(`${title}\nSu Mo Tu We Th Fr Sa\n${rows.join("\n")}\n`);
      }
      case "ping": {
        const target = args.filter((argument) => !argument.startsWith("-")).at(-1) || "127.0.0.1";
        const safeTarget = String(target).replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 100) || "127.0.0.1";
        return this.ok(`PING ${safeTarget} (simulated; no network request)\n64 bytes from ${safeTarget}: seq=1 ttl=64 time=0.0 ms\n--- ${safeTarget} statistics ---\n1 packet transmitted, 1 received\n`);
      }
      case "ipconfig":
        return this.ok("Virtual network adapter (simulated; offline)\n  IPv4 Address: 192.0.2.10\n  Subnet Mask: 255.255.255.0\n  Default Gateway: 192.0.2.1\n");
      case "systeminfo":
        return this.ok("System Information (simulated)\nComputer: PYIDE-BROWSER\nOS: PyIDE Virtual OS\nEnvironment: isolated browser tab\nHost access: disabled\n");
      default:
        return this.fail(`${command}: not implemented\n`);
    }
  }

  helpText() {
    if (this.mode === "pwsh") {
      return `PowerShell-style shell (runs in your browser)

Files & folders
  Get-ChildItem / ls        list files
  Get-Content / cat         print a file
  Set-Content / sc          write a file         sc notes.txt "hello"
  Add-Content / ac          append to a file
  New-Item / touch          create a file
  New-Item / mkdir          create a folder (mkdir)
  Remove-Item / rm          delete (-Recurse for folders)
  Copy-Item / cp, Move-Item / mv
  Set-Location / cd, Get-Location / pwd
  Test-Path / gi            inspect a path
  Select-String / sls       grep
  Get-Help / help           this message
  Clear-Host / cls          clear the terminal

Virtual system & accounts
  Get-LocalUser / users     list simulated users
  New-LocalUser / adduser   create a browser-only user
  passwd                    set a session-only demo password
  sudo <safe command>       simulated admin; never elevates the host
  id, groups, ps, free, df, uptime

IDE commands
  run [file]                run Python, JavaScript, or Batch
  python [file]             force the Python runtime
  node [file]               force the JavaScript runtime
  pip install numpy         install a Pyodide package
  open [file]               open in the editor
  download [file]           download a file
  shell bash | pwsh         switch shell mode
  version, reset, history, aliases ($env:NAME works too)

All users and passwords exist only in this browser tab. Never use a real password.`;
    }

    return `bash-style shell (runs in your browser)

Files & folders
  ls [-l] [-a] [path]       list files
  cd [path], pwd            change / print the directory
  cat <file>                print a file
  touch <file>              create a file
  mkdir [-p] <dir>          create a directory
  rm [-r] [-f] <path>       delete files or folders
  cp [-r] <src> <dst>       copy
  mv <src> <dst>            move / rename
  tree [path]               directory tree
  find <path> -name '*.py'  find files
  stat <path>               file information

Text processing
  head/tail [-n N], wc, grep [-invc] pattern, sort [-rnu], uniq [-c], cut -d, -f1

Virtual system & accounts
  id, groups, users, who, whoami
  sudo <safe command>       simulated admin; never elevates the host
  useradd/adduser <name>    create a virtual account (sudo required)
  passwd [name]             set a session-only demo password
  usermod, userdel, groupadd, groupdel
  ps, free, df, du, uptime, cal, ping, ipconfig (simulated)

Pipelines & redirection
  ls | grep py              cat main.py | wc -l
  echo hi > notes.txt       echo more >> notes.txt
  python main.py > out.txt  cmd1 && cmd2 || cmd3 ; cmd4
  $VAR, \${VAR}, $?, globs (*.py), aliases (alias ll='ls -l')

IDE commands
  run [file]                run Python, JavaScript, Lua, SQL, Batch, or Shell
  python [file]             force the Python runtime
  node [file]               force the JavaScript runtime
  batch [file.bat]          open the virtual Batch PC
  pip install numpy         install a Pyodide package
  open [file]               open in the editor
  download [file]           download a file
  shell pwsh | bash         switch shell mode
  version, reset, history, clear, help

This is a simulated browser shell. sudo cannot access or change your computer.`;
  }

  async runFileCommand(args, stdin, forced) {
    const files = args.filter((arg) => !arg.startsWith("-"));
    const target = files[0] || (typeof this.host.getActiveFile === "function" ? this.host.getActiveFile() : null);
    if (!target) return this.fail("run: no file specified and nothing is open\n");

    const absolute = this.resolve(target);
    if (!this.isFile(absolute)) return this.fail(`run: ${target}: No such file\n`);
    const key = this.key(absolute);

    let language = forced;
    if (!language && typeof this.host.languageFor === "function") language = this.host.languageFor(key);
    if (!language) {
      const extension = key.split(".").pop().toLowerCase();
      language = extension === "py" || extension === "pyw" ? "python" : ["js", "mjs", "cjs"].includes(extension) ? "javascript" : null;
    }

    const lines = stdin ? splitLines(stdin) : [];

    if (language === "python") {
      const ok = await this.host.runPython(key, lines);
      return { code: ok ? 0 : 1, out: "", streamed: true };
    }
    if (language === "javascript") {
      const ok = await this.host.runJavaScript(key);
      return { code: ok ? 0 : 1, out: "", streamed: true };
    }
    if (language === "batch" && typeof this.host.runBatch === "function") {
      const ok = await this.host.runBatch(key);
      return { code: ok === false ? 1 : 0, out: "", streamed: true };
    }
    return this.fail(`run: ${target}: unsupported file type\n`);
  }

  async pipCommand(args) {
    if (args[0] !== "install" || args.length < 2) {
      return this.fail("usage: pip install <package> [more packages]\n", 2);
    }
    const result = await this.host.pip(args.slice(1));
    return { code: result ? 0 : 1, out: "", streamed: true };
  }

  openCommand(args) {
    if (!args.length) return this.fail("open: missing file operand\n");
    const absolute = this.resolve(args[0]);
    if (!this.isFile(absolute)) return this.fail(`open: ${args[0]}: No such file\n`);
    this.host.openFile(this.key(absolute));
    return this.ok();
  }

  downloadCommand(args) {
    const target = args[0] || (typeof this.host.getActiveFile === "function" ? this.host.getActiveFile() : null);
    if (!target) return this.fail("download: missing file operand\n");
    const absolute = this.resolve(target);
    if (!this.isFile(absolute)) return this.fail(`download: ${target}: No such file\n`);
    this.host.downloadFile(this.key(absolute));
    return this.ok();
  }

  setContentCommand(args, append) {
    if (args.length < 2) {
      return this.fail(`usage: ${append ? "add-content" : "set-content"} <file> <text...>\n`, 2);
    }
    const absolute = this.resolve(args[0]);
    const prefix = append ? this.read(absolute) ?? "" : "";
    const content = `${prefix}${args.slice(1).join(" ")}\n`;
    this.writeFile(absolute, content);
    return this.ok();
  }

  testPathCommand(args) {
    if (!args.length) return this.fail("test-path: missing path\n", 2);
    const absolute = this.resolve(args[0]);
    return { code: this.isFile(absolute) || this.isDir(absolute) ? 0 : 1, out: "" };
  }
}

/** Convenience factory used by app.js. */
export function createShell(host, options) {
  return new Shell(host, options);
}
