/**
 * Python IDE — application shell.
 *
 * Responsibilities:
 *   - workspace/files/tabs persistence (localStorage)
 *   - Monaco editor
 *   - terminal + shell commands
 *   - canvas (turtle/pygame) and tkinter preview renderers
 *   - supervising the Python and JavaScript workers
 */

import { registerPythonIntelliSense } from "./completions.js?v=30";
import { createShell } from "./shell.js?v=30";

const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";
const STORAGE_KEY = "pyide.workspace.v2";
const SETTINGS_KEY = "pyide.settings.v1";
const USERNAME_SESSION_KEY = "pyide.shell.username.session";
const SHELL_HISTORY_KEY = "pyide.shell.history.v1";
const SHELL_DIRS_KEY = "pyide.shell.dirs.v1";
const PYODIDE_VERSION = "0.26.4";
const PROGRAM_STDIN_BUFFER_BYTES = 65_536;
const PROGRAM_STDIN_CONTROL_BYTES = Int32Array.BYTES_PER_ELEMENT * 2;
const programInputEncoder = new TextEncoder();
const DEFAULT_USERNAME = "guest";
const USERNAME_PATTERN = /^[A-Za-z_][A-Za-z0-9._-]{0,31}$/;

/* ==========================================================================
 * Settings
 * ========================================================================== */

const DEFAULT_SETTINGS = {
  theme: "dark",
  fontSize: 13.5,
  lineHeight: 21,
  tabSize: 4,
  wordWrap: false,
  minimap: true,
  lineNumbers: true,
  quickSuggestions: true,
  parameterHints: true,
  terminalFontSize: 13,
  shell: "bash",
  username: DEFAULT_USERNAME,
};

let settings = { ...DEFAULT_SETTINGS };
let shouldAskForUsername = true;

function normalizeUsername(value) {
  const username = String(value ?? "").trim();
  return USERNAME_PATTERN.test(username) ? username : "";
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (key !== "username" && saved[key] !== undefined) settings[key] = saved[key];
      }
    }
  } catch {
    /* corrupted settings — fall back to defaults */
  }
  try {
    const sessionUsername = normalizeUsername(sessionStorage.getItem(USERNAME_SESSION_KEY));
    settings.username = sessionUsername || DEFAULT_USERNAME;
    shouldAskForUsername = !sessionUsername;
  } catch {
    settings.username = DEFAULT_USERNAME;
    shouldAskForUsername = true;
  }
  settings.theme = settings.theme === "light" ? "light" : "dark";
  settings.shell = settings.shell === "pwsh" ? "pwsh" : "bash";
  settings.fontSize = Math.min(24, Math.max(10, Number(settings.fontSize) || DEFAULT_SETTINGS.fontSize));
  settings.terminalFontSize = Math.min(24, Math.max(9, Number(settings.terminalFontSize) || DEFAULT_SETTINGS.terminalFontSize));
  settings.tabSize = [2, 4, 8].includes(Number(settings.tabSize)) ? Number(settings.tabSize) : 4;
}

function saveSettings() {
  try {
    const persistentSettings = { ...settings };
    delete persistentSettings.username;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistentSettings));
  } catch {
    /* ignore */
  }
}

function saveSessionUsername(value) {
  const username = normalizeUsername(value);
  if (!username) return false;
  settings.username = username;
  shouldAskForUsername = false;
  try {
    sessionStorage.setItem(USERNAME_SESSION_KEY, username);
  } catch {
    /* The username remains available for this page load. */
  }
  return true;
}

/* ==========================================================================
 * Templates
 * ========================================================================== */

const TEMPLATES = {
  blank: { name: "script.txt", content: "" },
  batch: {
    name: "hello.bat",
    content: "@echo off\ntitle Batch PC demo\necho Hello, %USERNAME%!\necho Files in this virtual workspace:\ndir\n",
  },
};

/* ==========================================================================
 * DOM
 * ========================================================================== */

const debugLog = [];
function dbg(message, data) {
  const entry = { t: new Date().toISOString(), message, data: data ?? null };
  debugLog.push(entry);
  if (debugLog.length > 120) debugLog.shift();
  try { console.log("[pyide]", message, data ?? ""); } catch { /* ignore */ }
}
window.__pyideDebug = {
  log: debugLog,
  snapshot: () => ({
    active: state.active,
    runtime: state.runtime,
    jsRunning: state.jsRunning,
    files: [...state.files.keys()],
    openTabs: state.openTabs,
    settings: Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "username")),
    userAgent: navigator.userAgent,
  }),
};


window.addEventListener("error", (event) => {
  try { dbg("uncaught error", event.message); } catch { /* ignore */ }
  console.error(event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  try { dbg("unhandled rejection", String(event.reason)); } catch { /* ignore */ }
  console.error(event.reason);
});

const $ = (id) => document.getElementById(id);

const dom = {
  app: $("app"),
  runtime: $("runtime"),
  runtimeText: $("runtime-text"),
  statusRuntime: $("status-runtime"),
  statusCursor: $("status-cursor"),
  statusLanguage: $("status-language"),
  btnDocs: $("btn-docs"),
  statusIndent: $("status-indent"),

  sidebar: $("sidebar"),
  fileList: $("file-list"),
  sidebarScrim: $("sidebar-scrim"),

  tabs: $("tabs"),
  editor: $("editor"),
  editorLoading: $("editor-loading"),
  emptyState: $("empty-state"),

  console: $("console"),
  resizer: $("resizer"),
  terminal: $("terminal"),
  promptForm: $("prompt-form"),
  promptInput: $("prompt-input"),
  promptPath: $("prompt-path"),
  promptSigil: $("prompt-sigil"),

  canvas: $("canvas"),
  tkStage: $("tk-stage"),
  tkEmpty: $("tk-empty"),
  htmlPreview: $("html-preview"),

  breadcrumbs: $("breadcrumbs"),

  btnRun: $("btn-run"),
  btnRunMenu: $("btn-run-menu"),
  btnStop: $("btn-stop"),
  btnRestart: $("btn-restart"),
  btnSettings: $("btn-settings"),
  btnBatchPc: $("btn-batch-pc"),
  batchPcDialog: $("batch-pc-dialog"),
  batchPcClose: $("batch-pc-close"),
  batchStop: $("batch-stop"),
  batchCreateScript: $("batch-pc-create-script"),
  batchNotepadOpen: $("batch-notepad-open"),
  batchNotepadFilename: $("batch-notepad-filename"),
  batchNotepadPreview: $("batch-notepad-preview"),
  batchCalcDisplay: $("batch-calc-display"),
  batchCommandForm: $("batch-command-form"),
  batchCommandInput: $("batch-command-input"),
  batchPromptLabel: $("batch-prompt-label"),
  batchOutput: $("batch-output"),
  batchWindowTitle: $("batch-pc-window-title"),
  batchFileList: $("batch-file-list"),
  batchTaskList: $("batch-task-list"),
  batchStart: $("batch-start"),
  batchStartMenu: $("batch-start-menu"),
  runMenu: $("run-menu"),

  newMenu: $("new-menu"),
  btnNew: $("btn-new"),
  btnImport: $("btn-import"),
  btnExport: $("btn-export"),
  fileInput: $("file-input"),

  dialog: $("dialog"),
  dialogForm: $("dialog-form"),
  dialogTitle: $("dialog-title"),
  dialogLabel: $("dialog-label"),
  dialogInput: $("dialog-input"),
  dialogTextarea: $("dialog-textarea"),
  dialogHint: $("dialog-hint"),
  dialogOk: $("dialog-ok"),
  dialogCancel: $("dialog-cancel"),

  langDialog: $("lang-dialog"),
  langFilter: $("lang-filter"),
  langList: $("lang-list"),

  settingsDialog: $("settings-dialog"),
  settingsForm: $("settings-form"),
  usernameDialog: $("username-dialog"),
  usernameForm: $("username-form"),
  usernameInput: $("username-input"),

  palette: $("palette"),
  paletteInput: $("palette-input"),
  paletteList: $("palette-list"),

  toasts: $("toasts"),
  srLive: $("sr-live"),
};

const ctx = dom.canvas.getContext("2d");

/* ==========================================================================
 * State
 * ========================================================================== */

const state = {
  files: new Map(),          // name -> source
  dirs: new Set(),           // explicit empty folders created in the shell
  languages: {},             // name -> Monaco language override
  openTabs: [],              // ordered list of open file names
  active: null,              // active file name
  models: new Map(),         // name -> monaco model
  views: new Map(),          // name -> monaco view state
  snapshots: new Map(),      // name -> source at last run (for "stale" dots)
  runtime: "loading",
  panel: "terminal",
  consoleHeight: Math.min(320, Math.max(160, Math.round(window.innerHeight * 0.4))),
  pyVersion: "3.14.0",
  monaco: null,
  editor: null,
  worker: null,
  jsWorker: null,
  jsRunning: false,
  batchWorker: null,
  batchInitialized: false,
  batchRunning: false,
  batchRunKind: "",
  batchCalc: { display: "0", accumulator: null, operator: null, waitingForOperand: false },
  running: false,
  pythonRunStarting: false,
  stdinChannel: null,
  stdinPending: false,
  pendingRun: null,
  pendingPip: null,
  pipInstalling: false,
  pipRequestId: 0,
};

let shell = null;

/* ==========================================================================
 * Persistence
 * ========================================================================== */

let saveTimer = 0;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWorkspace, 400);
}

function saveWorkspace() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        files: [...state.files],
        dirs: [...state.dirs],
        languages: state.languages,
        openTabs: state.openTabs,
        active: state.active,
        panel: state.panel,
        consoleHeight: state.consoleHeight,
      })
    );
  } catch {
    /* storage full or blocked — the IDE still works without persistence */
  }
}

function restoreWorkspace() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }

  if (saved && Array.isArray(saved.files) && saved.files.length) {
    for (const entry of saved.files) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      state.files.set(entry[0], String(entry[1] ?? ""));
    }
    state.dirs = new Set(Array.isArray(saved.dirs) ? saved.dirs.filter((dir) => typeof dir === "string") : []);
    state.languages = saved.languages && typeof saved.languages === "object" ? saved.languages : {};
    state.openTabs = (saved.openTabs || []).filter((name) => state.files.has(name));
    if (!state.openTabs.length) state.openTabs = [...state.files.keys()].slice(0, 2);
    state.active = state.files.has(saved.active) ? saved.active : state.openTabs[0] || null;
    state.panel = ["terminal", "canvas", "window"].includes(saved.panel) ? saved.panel : "terminal";
    if (Number.isFinite(saved.consoleHeight)) state.consoleHeight = saved.consoleHeight;
  } else {
    state.openTabs = [];
    state.active = null;
  }
  try {
    const savedDirs = JSON.parse(localStorage.getItem(SHELL_DIRS_KEY) || "null");
    if (!state.dirs.size && Array.isArray(savedDirs)) {
      state.dirs = new Set(savedDirs.filter((dir) => typeof dir === "string"));
    }
  } catch {
    /* ignore */
  }
}

/* ==========================================================================
 * Small UI helpers
 * ========================================================================== */

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = `toast${kind ? ` is-${kind}` : ""}`;
  el.textContent = message;
  dom.toasts.append(el);
  setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

function announce(message) {
  dom.srLive.textContent = message;
}

function askText({ title, label, value = "", hint = "", multiline = false, confirm = "OK", inputType = "text" }) {
  return new Promise((resolve) => {
    dom.dialogTitle.textContent = title;
    dom.dialogLabel.textContent = label;
    dom.dialogLabel.hidden = !label;
    dom.dialogHint.textContent = hint;
    dom.dialogHint.hidden = !hint;
    dom.dialogOk.textContent = confirm;

    const field = multiline ? dom.dialogTextarea : dom.dialogInput;
    dom.dialogInput.hidden = multiline;
    dom.dialogTextarea.hidden = !multiline;
    if (!multiline) dom.dialogInput.type = inputType === "password" ? "password" : "text";
    field.value = value;

    const finish = (result) => {
      dom.dialog.removeEventListener("close", onClose);
      if (!multiline) {
        dom.dialogInput.value = "";
        dom.dialogInput.type = "text";
      }
      resolve(result);
    };
    const onClose = () => {
      const ok = dom.dialog.returnValue === "ok";
      finish(ok ? field.value : null);
    };

    dom.dialog.addEventListener("close", onClose);
    dom.dialog.showModal();
    field.focus();
    if (!multiline) field.select();
  });
}

/* ==========================================================================
 * Menus
 * ========================================================================== */

function closeMenus() {
  dom.runMenu.hidden = true;
  dom.newMenu.hidden = true;
  dom.btnRunMenu.setAttribute("aria-expanded", "false");
  dom.btnNew.setAttribute("aria-expanded", "false");
}

function toggleMenu(menu, trigger) {
  const willOpen = menu.hidden;
  closeMenus();
  menu.hidden = !willOpen;
  trigger.setAttribute("aria-expanded", String(willOpen));
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-wrap")) closeMenus();
});

/* ==========================================================================
 * Languages
 * ========================================================================== */

const LANGUAGE_DOCS = {
  python: "https://docs.python.org/3/",
  javascript: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  typescript: "https://www.typescriptlang.org/docs/",
  html: "https://developer.mozilla.org/en-US/docs/Web/HTML",
  css: "https://developer.mozilla.org/en-US/docs/Web/CSS",
  json: "https://www.json.org/json-en.html",
  markdown: "https://www.markdownguide.org/",
  shell: "https://www.gnu.org/software/bash/manual/",
  powershell: "https://learn.microsoft.com/en-us/powershell/",
  batch: "https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/windows-commands",
  yaml: "https://yaml.org/spec/1.2.2/",
  xml: "https://developer.mozilla.org/en-US/docs/Web/XML",
  php: "https://www.php.net/manual/en/",
  ruby: "https://docs.ruby-lang.org/en/",
  toml: "https://toml.io/en/",
  c: "https://en.cppreference.com/w/c",
  cpp: "https://en.cppreference.com/w/cpp",
  java: "https://docs.oracle.com/en/java/",
  csharp: "https://learn.microsoft.com/en-us/dotnet/csharp/",
  go: "https://go.dev/doc/",
  rust: "https://doc.rust-lang.org/",
  sql: "https://www.sqlite.org/docs.html",
  lua: "https://www.lua.org/manual/5.4/",
  swift: "https://docs.swift.org/swift-book/",
  kotlin: "https://kotlinlang.org/docs/home.html",
  r: "https://cran.r-project.org/manuals.html",
  dart: "https://dart.dev/guides",
  perl: "https://perldoc.perl.org/",
  scala: "https://docs.scala-lang.org/",
  julia: "https://docs.julialang.org/",
  fsharp: "https://learn.microsoft.com/en-us/dotnet/fsharp/",
  clojure: "https://clojure.org/guides",
  "objective-c": "https://developer.apple.com/documentation/objectivec",
  pascal: "https://www.freepascal.org/docs.html",
  coffeescript: "https://coffeescript.org/",
  scss: "https://sass-lang.com/documentation/",
  less: "https://lesscss.org/",
  dockerfile: "https://docs.docker.com/reference/dockerfile/",
  graphql: "https://graphql.org/learn/",
  proto: "https://protobuf.dev/",
  hcl: "https://developer.hashicorp.com/terraform/language",
  ini: "https://en.wikipedia.org/wiki/INI_file",
  vb: "https://learn.microsoft.com/en-us/dotnet/visual-basic/",
  abap: "https://help.sap.com/docs/abap",
};
const LANGUAGE_DEFS = {
  go: { label: "Go", short: "go", runnable: false },
  rust: { label: "Rust", short: "rs", runnable: false },
  java: { label: "Java", short: "java", runnable: false },
  csharp: { label: "C#", short: "cs", runnable: false },
  sql: { label: "SQL", short: "sql", runnable: true },
  yaml: { label: "YAML", short: "yml", runnable: false },
  xml: { label: "XML", short: "xml", runnable: false },
  php: { label: "PHP", short: "php", runnable: false },
  ruby: { label: "Ruby", short: "rb", runnable: false },
  lua: { label: "Lua", short: "lua", runnable: true },
  swift: { label: "Swift", short: "swift", runnable: false },
  kotlin: { label: "Kotlin", short: "kt", runnable: false },
  r: { label: "R", short: "r", runnable: false },
  dart: { label: "Dart", short: "dart", runnable: false },
  perl: { label: "Perl", short: "pl", runnable: false },
  scala: { label: "Scala", short: "scala", runnable: false },
  julia: { label: "Julia", short: "jl", runnable: false },
  fsharp: { label: "F#", short: "fs", runnable: false },
  clojure: { label: "Clojure", short: "clj", runnable: false },
  "objective-c": { label: "Objective-C", short: "m", runnable: false },
  pascal: { label: "Pascal", short: "pas", runnable: false },
  coffeescript: { label: "CoffeeScript", short: "coffee", runnable: false },
  scss: { label: "SCSS", short: "scss", runnable: false },
  less: { label: "Less", short: "less", runnable: false },
  dockerfile: { label: "Dockerfile", short: "dockerfile", runnable: false },
  graphql: { label: "GraphQL", short: "graphql", runnable: false },
  proto: { label: "Protocol Buffers", short: "proto", runnable: false },
  hcl: { label: "HCL/Terraform", short: "tf", runnable: false },
  ini: { label: "INI/Config", short: "ini", runnable: false },
  toml: { label: "TOML", short: "toml", runnable: false },
  vb: { label: "Visual Basic", short: "vb", runnable: false },
  abap: { label: "ABAP", short: "abap", runnable: false },
  batch: { label: "Batch", short: "bat", runnable: true },
  c: { label: "C", short: "c", runnable: false },
  cpp: { label: "C++", short: "cpp", runnable: false },
  python: { label: "Python", short: "py", runnable: true },
  javascript: { label: "JavaScript", short: "js", runnable: true },
  typescript: { label: "TypeScript", short: "ts", runnable: false },
  html: { label: "HTML", short: "html", runnable: false },
  css: { label: "CSS", short: "css", runnable: false },
  json: { label: "JSON", short: "json", runnable: false },
  markdown: { label: "Markdown", short: "md", runnable: false },
  shell: { label: "Shell", short: "sh", runnable: false },
  powershell: { label: "PowerShell", short: "ps1", runnable: false },
  plaintext: { label: "Plain Text", short: "txt", runnable: false },
};

const MONACO_LANGUAGE_IDS = { batch: "bat" };

function monacoLanguageId(language) {
  return MONACO_LANGUAGE_IDS[language] || language;
}

const EXTENSION_LANGUAGE = {
  go: "go",
  rs: "rust",
  java: "java",
  cs: "csharp",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  php: "php",
  rb: "ruby",
  lua: "lua",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  r: "r",
  dart: "dart",
  pl: "perl",
  scala: "scala",
  sc: "scala",
  jl: "julia",
  fs: "fsharp",
  fsx: "fsharp",
  clj: "clojure",
  cljs: "clojure",
  m: "objective-c",
  pas: "pascal",
  coffee: "coffeescript",
  scss: "scss",
  less: "less",
  dockerfile: "dockerfile",
  graphql: "graphql", gql: "graphql",
  proto: "proto",
  tf: "hcl", tfvars: "hcl",
  ini: "ini", toml: "toml", cfg: "ini", conf: "ini",
  vb: "vb",
  abap: "abap",
  bat: "batch",
  cmd: "batch",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  py: "python",
  pyw: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  htm: "html",
  css: "css",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  sh: "shell",
  bash: "shell",
  ps1: "powershell",
  psm1: "powershell",
  txt: "plaintext",
  csv: "plaintext",
  log: "plaintext",
};

function languageFor(name) {
  if (!name) return "plaintext";
  if (state.languages[name]) return state.languages[name];
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return EXTENSION_LANGUAGE[extension] || "plaintext";
}

const MATERIAL_ICON_MAP = {
  py: "python", js: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript",
  tsx: "typescript", jsx: "react", html: "html", htm: "html", css: "css", scss: "sass",
  less: "less", json: "json", md: "markdown", markdown: "markdown", txt: "document", csv: "document",
  log: "log", sh: "console", bash: "console", bat: "console", cmd: "console",
  ps1: "powershell", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  java: "java", go: "go", rs: "rust", php: "php", rb: "ruby", lua: "lua", swift: "swift",
  kt: "kotlin", kts: "kotlin", r: "r", dart: "dart", pl: "perl", scala: "scala", sc: "scala",
  sql: "database", yml: "yaml", yaml: "yaml", xml: "xml", png: "image", jpg: "image",
  jpeg: "image", gif: "image", svg: "svg", mp4: "video", mp3: "audio", zip: "zip",
  exe: "exe", lock: "lock", gitignore: "git", env: "tune",
  jl: "julia", fs: "fsharp", fsx: "fsharp", clj: "clojure", cljs: "clojure",
  m: "objectivec", pas: "pascal", coffee: "coffeescript", scss: "sass", less: "less",
  dockerfile: "docker", graphql: "graphql", gql: "graphql", proto: "proto",
  tf: "terraform", tfvars: "terraform", ini: "settings", toml: "settings", cfg: "settings", conf: "settings",
  vb: "visualstudio", abap: "abap",
};

function materialIconUrl(name) {
  if (!name || name.endsWith("/")) return null;
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const base = name.split("/").pop().toLowerCase();
  let iconName = MATERIAL_ICON_MAP[extension];
  if (!iconName && (base === ".gitignore" || base === ".env")) iconName = MATERIAL_ICON_MAP[base.replace(".", "")];
  if (!iconName) return null;
  return `https://cdn.jsdelivr.net/npm/material-icon-theme@5.40.0/icons/${iconName}.svg`;
}

function fileIcon(name) {
  if (!name) return "📄";
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const icons = {
    py: "🐍", js: "📜", mjs: "📜", cjs: "📜", ts: "🔷", tsx: "🔷", jsx: "📜",
    html: "🌐", htm: "🌐", css: "🎨", scss: "🎨", less: "🎨",
    json: "📋", md: "📝", markdown: "📝", txt: "📄", csv: "📊", log: "📄",
    sh: "⚙️", bash: "⚙️", bat: "⚙️", cmd: "⚙️", ps1: "🔷",
    c: "🔧", h: "🔧", cpp: "🔧", cc: "🔧", cxx: "🔧", hpp: "🔧",
    java: "☕", go: "🐹", rs: "🦀", php: "🐘", rb: "💎", lua: "🌙",
    swift: "🍎", kt: "🟣", kts: "🟣", r: "📊", dart: "🎯", pl: "🐪",
    scala: "🔴", sql: "🗄️", yml: "⚙️", yaml: "⚙️", xml: "📰",
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️",
    mp4: "🎬", mp3: "🎵", zip: "📦", exe: "⚙️",
  };
  if (name.endsWith("/")) return "📁";
  return icons[extension] || "📄";
}

function renderFileIcon(container, name) {
  container.replaceChildren();
  const url = materialIconUrl(name);
  if (url) {
    const img = document.createElement("img");
    img.className = "file-icon-img";
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => {
      img.replaceWith(Object.assign(document.createElement("span"), { className: "file-icon", textContent: fileIcon(name) }));
    };
    container.append(img);
  } else {
    const span = document.createElement("span");
    span.className = "file-icon";
    span.textContent = fileIcon(name);
    container.append(span);
  }
}


function updateStatusLanguage() {
  if (!dom.statusLanguage) return;
  const language = languageFor(state.active);
  dom.statusLanguage.value = language;
  dom.statusLanguage.disabled = !state.active;
  if (dom.statusIndent) dom.statusIndent.textContent = `Spaces: ${settings.tabSize}`;
}

function refreshLanguage() {
  updateStatusLanguage();
  const name = state.active;
  const monaco = state.monaco;
  const model = name ? state.models.get(name) : null;
  if (monaco && model && !model.isDisposed()) {
    const language = languageFor(name);
    const monacoLanguage = monacoLanguageId(language);
  if (model.getLanguageId() !== monacoLanguage) monaco.editor.setModelLanguage(model, monacoLanguage);
  }
  updateHtmlPreviewVisibility();
}

let htmlPreviewTimer = 0;
function updateHtmlPreviewVisibility() {
  if (!dom.htmlPreview || !dom.tkStage) return;
  const isHtml = !!state.active && languageFor(state.active) === "html";
  dom.htmlPreview.hidden = !isHtml;
  dom.tkStage.hidden = isHtml;
  if (isHtml) scheduleHtmlPreview();
}

function scheduleHtmlPreview() {
  clearTimeout(htmlPreviewTimer);
  htmlPreviewTimer = setTimeout(renderHtmlPreview, 300);
}

function renderHtmlPreview() {
  if (!dom.htmlPreview) return;
  const code = state.active ? (state.editor && !state.editor.fallback ? state.editor.getValue() : state.files.get(state.active) ?? "") : "";
  dom.htmlPreview.srcdoc = code;
}

/* ==========================================================================
 * Files
 * ========================================================================== */

const RESERVED = /[\\:*?"<>|]/;

function validFileName(name) {
  if (!name || name.length > 120) return "Enter a name.";
  if (RESERVED.test(name)) return 'Names cannot contain \\ : * ? " < > |';
  if (name.split("/").some((part) => part === ".." || part === ".")) return "That path is not allowed.";
  if (name.endsWith("/")) return "Names must end with a file extension.";
  return "";
}

function createFile(name, content = "") {
  const error = validFileName(name);
  if (error) {
    toast(error, "error");
    return null;
  }
  if (state.files.has(name)) {
    toast(`“${name}” already exists.`, "error");
    openFile(name);
    return null;
  }
  state.files.set(name, content);
  scheduleSave();
  renderFileList();
  openFile(name);
  return name;
}

function deleteFile(name) {
  if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
  state.files.delete(name);
  state.snapshots.delete(name);
  const model = state.models.get(name);
  if (model) model.dispose();
  state.models.delete(name);
  state.views.delete(name);
  state.openTabs = state.openTabs.filter((item) => item !== name);

  if (state.active === name) {
    state.active = state.openTabs[0] || null;
  }
  scheduleSave();
  renderFileList();
  renderTabs();
  syncEditor();
  toast(`Deleted ${name}`);
}

async function renameFile(name) {
  const next = await askText({
    title: "Rename file",
    label: "New name",
    value: name,
    confirm: "Rename",
  });
  if (next === null || next === name) return;
  const error = validFileName(next);
  if (error) return toast(error, "error");
  if (state.files.has(next)) return toast("That name is already in use.", "error");

  const content = state.files.get(name) ?? "";
  state.files.delete(name);
  state.files.set(next, content);

  if (state.snapshots.has(name)) {
    state.snapshots.set(next, state.snapshots.get(name));
    state.snapshots.delete(name);
  }

  const model = state.models.get(name);
  if (model) model.dispose();
  state.models.delete(name);
  state.views.delete(name);

  state.openTabs = state.openTabs.map((item) => (item === name ? next : item));
  if (state.active === name) state.active = next;

  scheduleSave();
  renderFileList();
  renderTabs();
  syncEditor();
  toast(`Renamed to ${next}`, "ok");
}

function resetWorkspace() {
  if (!window.confirm("Restore the starter workspace? Your current files will be replaced.")) {
    writeTerminal("reset cancelled", "sys");
    return false;
  }

  for (const model of state.models.values()) {
    try { model.dispose(); } catch { /* noop */ }
  }
  state.models.clear();
  state.views.clear();
  state.snapshots.clear();
  state.files.clear();
  state.dirs.clear();
  state.languages = {};
  state.openTabs = [];
  state.active = null;
  renderFileList();
  renderTabs();
  syncEditor();
  refreshLanguage();
  updateRunButtons();
  scheduleSave();
  try { localStorage.removeItem(SHELL_DIRS_KEY); } catch { /* ignore */ }
  writeTerminal("workspace restored", "ok");
  return true;
}

function openFile(name) {
  if (!state.files.has(name)) return;
  if (!state.openTabs.includes(name)) state.openTabs.push(name);
  edgeActivate(name);
}

function edgeActivate(name) {
  state.active = name;
  renderTabs();
  renderFileList();
  syncEditor();
  refreshLanguage();
  updateRunButtons();
  renderBreadcrumbs();
  scheduleSave();
}

function closeTab(name) {
  state.openTabs = state.openTabs.filter((item) => item !== name);
  if (state.active === name) {
    state.active = state.openTabs[state.openTabs.length - 1] || null;
  }
  renderTabs();
  renderFileList();
  syncEditor();
  scheduleSave();
}

function isStale(name) {
  const snapshot = state.snapshots.get(name);
  if (snapshot === undefined) return false;
  return (state.files.get(name) ?? "") !== snapshot;
}

function renderFileList() {
  dom.fileList.replaceChildren();

  if (!state.files.size) {
    const empty = document.createElement("li");
    empty.className = "file-empty";
    empty.innerHTML = 'No files yet.<br>Use <code>+</code> to create one.';
    dom.fileList.append(empty);
    return;
  }

  const names = [...state.files.keys()].sort((a, b) => a.localeCompare(b));

  for (const name of names) {
    const item = document.createElement("li");
    item.className = `file-item${name === state.active ? " is-active" : ""} lang-${languageFor(name)}`;
    item.dataset.name = name;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(name === state.active));
    item.tabIndex = 0;

    const icon = document.createElement("span");
    icon.className = "file-icon-wrap";
    renderFileIcon(icon, name);

    const label = document.createElement("span");
    label.className = "name";
    label.textContent = name;

    item.append(icon, label);

    if (isStale(name)) {
      const dot = document.createElement("span");
      dot.className = "dirty-dot";
      dot.title = "Changed since the last run";
      item.append(dot);
    }

    const actions = document.createElement("span");
    actions.className = "row-actions";
    for (const [action, iconId, title] of [
      ["rename", "#i-pencil", "Rename"],
      ["delete", "#i-trash", "Delete"],
    ]) {
      const button = document.createElement("button");
      button.className = `icon-btn${action === "delete" ? " danger" : ""}`;
      button.dataset.action = action;
      button.title = `${title} ${name}`;
      button.setAttribute("aria-label", `${title} ${name}`);
      button.innerHTML = `<svg class="icon"><use href="${iconId}"/></svg>`;
      actions.append(button);
    }
    item.append(actions);

    dom.fileList.append(item);
  }
}

dom.fileList.addEventListener("click", (event) => {
  const item = event.target.closest(".file-item");
  if (!item) return;
  const action = event.target.closest("[data-action]")?.dataset.action;
  const name = item.dataset.name;
  if (action === "rename") renameFile(name);
  else if (action === "delete") deleteFile(name);
  else openFile(name);
});

dom.fileList.addEventListener("keydown", (event) => {
  const item = event.target.closest(".file-item");
  if (!item) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFile(item.dataset.name);
  }
});

/* ==========================================================================
 * Tabs
 * ========================================================================== */

function renderTabs() {
  dom.tabs.replaceChildren();

  for (const name of state.openTabs) {
    if (!state.files.has(name)) continue;
    const tab = document.createElement("div");
    tab.className = `tab${name === state.active ? " is-active" : ""} lang-${languageFor(name)}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(name === state.active));
    tab.tabIndex = 0;

    tab.innerHTML = "";
    const iconWrap = document.createElement("span");
    iconWrap.className = "file-icon-wrap";
    renderFileIcon(iconWrap, name);
    tab.append(iconWrap);
    const label = document.createElement("span");
    label.textContent = name;
    tab.append(label);

    if (isStale(name)) {
      const dot = document.createElement("span");
      dot.className = "dirty-dot";
      dot.title = "Changed since the last run";
      tab.append(dot);
    }

    const close = document.createElement("button");
    close.className = "tab-close";
    close.dataset.close = name;
    close.title = `Close ${name}`;
    close.setAttribute("aria-label", `Close ${name}`);
    close.innerHTML = `<svg class="icon"><use href="#i-x"/></svg>`;
    tab.append(close);

    dom.tabs.append(tab);
  }

  dom.emptyState.hidden = Boolean(state.active);
}

dom.tabs.addEventListener("click", (event) => {
  const closeName = event.target.closest("[data-close]")?.dataset.close;
  if (closeName) {
    closeTab(closeName);
    return;
  }
  const tab = event.target.closest(".tab");
  if (tab) {
    const index = [...dom.tabs.children].indexOf(tab);
    const name = state.openTabs[index];
    if (name) edgeActivate(name);
  }
});

dom.tabs.addEventListener("keydown", (event) => {
  const tab = event.target.closest(".tab");
  if (!tab) return;
  const index = [...dom.tabs.children].indexOf(tab);
  if (event.key === "Enter") {
    const name = state.openTabs[index];
    if (name) edgeActivate(name);
  } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + delta + state.openTabs.length) % state.openTabs.length;
    const name = state.openTabs[next];
    if (name) {
      edgeActivate(name);
      dom.tabs.children[next]?.focus();
    }
  }
});

/* ==========================================================================
 * Monaco
 * ========================================================================== */

const THEME = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8996ab", fontStyle: "italic" },
    { token: "keyword", foreground: "d4a7ff", fontStyle: "bold" },
    { token: "keyword.control", foreground: "d4a7ff", fontStyle: "bold" },
    { token: "string", foreground: "a6e3a1" },
    { token: "string.escape", foreground: "f5c2e7" },
    { token: "number", foreground: "fab387" },
    { token: "regexp", foreground: "f38ba8" },
    { token: "type", foreground: "89dceb" },
    { token: "type.identifier", foreground: "f9e2af" },
    { token: "function", foreground: "89b4fa" },
    { token: "identifier.function", foreground: "89b4fa" },
    { token: "identifier", foreground: "dbe3f4" },
    { token: "variable", foreground: "cdd6f4" },
    { token: "predefined", foreground: "f9a8d4" },
    { token: "constant", foreground: "f38ba8" },
    { token: "operator", foreground: "89dceb" },
    { token: "delimiter", foreground: "a6adc8" },
    { token: "delimiter.bracket", foreground: "c4b5fd" },
  ],
  colors: {
    "editor.background": "#0c111b",
    "editor.foreground": "#e6edf6",
    "editorLineNumber.foreground": "#56647a",
    "editorLineNumber.activeForeground": "#a8b7ca",
    "editorCursor.foreground": "#38bdf8",
    "editor.selectionBackground": "#1e3a5f",
    "editor.inactiveSelectionBackground": "#16283f",
    "editor.lineHighlightBackground": "#121a27",
    "editorIndentGuide.background1": "#1a2437",
    "editorIndentGuide.activeBackground1": "#3a5068",
    "editorWidget.background": "#121a25",
    "editorWidget.foreground": "#e6edf6",
    "editorWidget.border": "#3a5068",
    "editorHoverWidget.background": "#121a25",
    "editorHoverWidget.border": "#3a5068",
    "editorSuggestWidget.background": "#121a25",
    "editorSuggestWidget.foreground": "#e6edf6",
    "editorSuggestWidget.border": "#3a5068",
    "editorSuggestWidget.selectedBackground": "#243247",
    "editorSuggestWidget.selectedForeground": "#ffffff",
    "editorSuggestWidget.highlightForeground": "#7dd3fc",
    "editorBracketHighlight.foreground1": "#89b4fa",
    "editorBracketHighlight.foreground2": "#cba6f7",
    "editorBracketHighlight.foreground3": "#a6e3a1",
    "editorBracketHighlight.foreground4": "#f9e2af",
    "editorBracketHighlight.foreground5": "#f38ba8",
    "editorBracketHighlight.foreground6": "#89dceb",
    "scrollbarSlider.background": "#26314980",
    "scrollbarSlider.hoverBackground": "#33415faa",
    "minimap.background": "#0c111b",
  },
};

const LIGHT_THEME = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "64748b", fontStyle: "italic" },
    { token: "keyword", foreground: "6d28d9", fontStyle: "bold" },
    { token: "keyword.control", foreground: "6d28d9", fontStyle: "bold" },
    { token: "string", foreground: "166534" },
    { token: "string.escape", foreground: "be185d" },
    { token: "number", foreground: "b45309" },
    { token: "regexp", foreground: "be123c" },
    { token: "type", foreground: "0369a1" },
    { token: "type.identifier", foreground: "92400e" },
    { token: "function", foreground: "1d4ed8" },
    { token: "identifier.function", foreground: "1d4ed8" },
    { token: "identifier", foreground: "1e293b" },
    { token: "variable", foreground: "1e293b" },
    { token: "predefined", foreground: "be185d" },
    { token: "constant", foreground: "9d174d" },
    { token: "operator", foreground: "0369a1" },
    { token: "delimiter", foreground: "475569" },
    { token: "delimiter.bracket", foreground: "7c3aed" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#1e293b",
    "editorLineNumber.foreground": "#b6c1d2",
    "editorLineNumber.activeForeground": "#475569",
    "editorCursor.foreground": "#0284c7",
    "editor.selectionBackground": "#bfdbfe",
    "editor.inactiveSelectionBackground": "#dbeafe",
    "editor.lineHighlightBackground": "#f1f5f9",
    "editorIndentGuide.background1": "#e2e8f0",
    "editorIndentGuide.activeBackground1": "#94a3b8",
    "editorWidget.background": "#f8fafc",
    "editorWidget.border": "#cbd5e1",
    "editorSuggestWidget.background": "#ffffff",
    "editorSuggestWidget.selectedBackground": "#e0f2fe",
    "scrollbarSlider.background": "#94a3b850",
    "scrollbarSlider.hoverBackground": "#64748b70",
    "minimap.background": "#ffffff",
  },
};

function monacoWorker(path) {
  const source = `self.MonacoEnvironment = { baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/' };\nimportScripts('${MONACO_CDN}/${path.replace(/^vs\//, '')}');`;
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

function loadMonaco() {
  return new Promise((resolve, reject) => {
    if (!window.require) {
      reject(new Error("Monaco loader missing"));
      return;
    }

    const timeout = setTimeout(() => reject(new Error("Monaco timed out")), 8000);

    const workers = {
      editor: monacoWorker("vs/base/worker/workerMain.js"),
      json: monacoWorker("vs/language/json/jsonWorker.js"),
      css: monacoWorker("vs/language/css/cssWorker.js"),
      html: monacoWorker("vs/language/html/htmlWorker.js"),
      typescript: monacoWorker("vs/language/typescript/tsWorker.js"),
    };

    window.MonacoEnvironment = {
      getWorkerUrl(moduleId, label) {
        if (label === "json") return workers.json;
        if (label === "css" || label === "scss" || label === "less") return workers.css;
        if (label === "html" || label === "handlebars" || label === "razor") return workers.html;
        if (label === "typescript" || label === "javascript") return workers.typescript;
        return workers.editor;
      },
    };

    window.require.config({ paths: { vs: MONACO_CDN } });
    window.require(["vs/editor/editor.main"], (monaco) => {
      clearTimeout(timeout);
      resolve(monaco || window.monaco);
    }, (error) => {
      clearTimeout(timeout);
      reject(error || new Error("Monaco failed to load"));
    });
  });
}

function registerCompletions(monaco) {
  registerPythonIntelliSense(monaco);
}

function ensureModel(name) {
  const monaco = state.monaco;
  let model = state.models.get(name);
  if (model && !model.isDisposed()) return model;

  model = monaco.editor.createModel(
    state.files.get(name) ?? "",
    monacoLanguageId(languageFor(name)),
    monaco.Uri.parse(`file:///workspace/${name.split("/").map(encodeURIComponent).join("/")}`)
  );
  state.models.set(name, model);
  return model;
}

function syncEditor() {
  const editor = state.editor;
  if (!editor) return;

  if (!state.active || !state.files.has(state.active)) {
    dom.emptyState.hidden = false;
    return;
  }
  dom.emptyState.hidden = true;

  const model = ensureModel(state.active);
  if (editor.getModel() === model) return;

  const previous = editor.getModel();
  if (previous) {
    const previousName = [...state.models.entries()].find(([, value]) => value === previous)?.[0];
    if (previousName) state.views.set(previousName, editor.saveViewState());
  }

  editor.setModel(model);
  const view = state.views.get(state.active);
  if (view) editor.restoreViewState(view);
  editor.focus();
}

function setEditorLoading(isLoading) {
  if (!dom.editorLoading) return;
  dom.editorLoading.hidden = !isLoading;
  dom.editorLoading.closest(".editor-wrap")?.setAttribute("aria-busy", String(isLoading));
}

async function initEditor() {
  dbg("initEditor start");
  setEditorLoading(true);
  try {
    const monaco = await loadMonaco();
    state.monaco = monaco;

    monaco.editor.defineTheme("pyide", THEME);
    monaco.editor.defineTheme("pyide-light", LIGHT_THEME);
    registerCompletions(monaco);
    registerLanguageCompletions(monaco);
    state.editor = monaco.editor.create(dom.editor, {
      model: null,
      theme: settings.theme === "light" ? "pyide-light" : "pyide",
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: settings.fontSize,
      lineHeight: Math.round(settings.fontSize * 1.55),
      fontLigatures: true,
      minimap: { enabled: settings.minimap, renderCharacters: false, maxColumn: 80 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      padding: { top: 14, bottom: 24 },
      renderLineHighlight: "line",
      tabSize: settings.tabSize,
      insertSpaces: true,
      wordWrap: settings.wordWrap ? "on" : "off",
      lineNumbers: settings.lineNumbers ? "on" : "off",
      quickSuggestions: settings.quickSuggestions,
      quickSuggestionsDelay: 90,
      suggestOnTriggerCharacters: settings.quickSuggestions,
      suggestSelection: "first",
      parameterHints: { enabled: settings.parameterHints },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: { showWords: false },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });

    state.editor.onDidChangeModelContent(() => {
      const name = state.active;
      if (!name) return;
      state.files.set(name, state.editor.getValue());
      renderTabs();
      renderFileList();
      scheduleSave();
      if (languageFor(name) === "html") scheduleHtmlPreview();
    });

    state.editor.onDidChangeCursorPosition((event) => {
      dom.statusCursor.textContent = `Ln ${event.position.lineNumber}, Col ${event.position.column}`;
    });

    state.editor.onDidChangeModel(() => updateStatusLanguage());

    state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runActive());
    state.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => focusTerminalInput()
    );

    setEditorLoading(false);
    syncEditor();
  } catch (error) {
    if (state.editor && !state.editor.fallback) {
      state.editor.dispose();
      state.editor = null;
    }
    if (!state.editor) initFallbackEditor();
    setEditorLoading(false);
    dbg("editor load failed", error?.message || String(error));
    toast("Monaco could not load. The basic editor is ready.", "error");
    console.error(error);
  }
}

/** Apply editor/terminal/theme settings everywhere they matter. */
function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.colorScheme = settings.theme;
  root.style.setProperty("--editor-font-size", `${settings.fontSize}px`);
  root.style.setProperty("--terminal-font-size", `${settings.terminalFontSize}px`);

  if (state.editor && !state.editor.fallback) {
    state.editor.updateOptions({
      fontSize: settings.fontSize,
      lineHeight: Math.round(settings.fontSize * 1.55),
      tabSize: settings.tabSize,
      wordWrap: settings.wordWrap ? "on" : "off",
      minimap: { enabled: settings.minimap, renderCharacters: false, maxColumn: 80 },
      lineNumbers: settings.lineNumbers ? "on" : "off",
      quickSuggestions: settings.quickSuggestions,
      suggestOnTriggerCharacters: settings.quickSuggestions,
      parameterHints: { enabled: settings.parameterHints },
    });
  }

  if (state.monaco) {
    state.monaco.editor.setTheme(settings.theme === "light" ? "pyide-light" : "pyide");
  }

  if (shell) {
    const nextMode = settings.shell === "pwsh" ? "pwsh" : "bash";
    if (shell.mode !== nextMode) shell.setMode(nextMode, { silent: true });
    shell.setUsername(settings.username);
    refreshPrompt();
  }

  updateStatusLanguage();
  syncSettingsForm();
}

function syncSettingsForm() {
  const form = dom.settingsForm;
  if (!form) return;
  for (const field of form.querySelectorAll("[data-setting]")) {
    const key = field.dataset.setting;
    if (!(key in settings)) continue;
    if (field.type === "checkbox") field.checked = Boolean(settings[key]);
    else field.value = String(settings[key]);
  }
}

function populateLanguageSelect() {
  if (!dom.statusLanguage) return;
  dom.statusLanguage.replaceChildren();
  for (const [id, definition] of Object.entries(LANGUAGE_DEFS)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = definition.label;
    dom.statusLanguage.append(option);
  }
}

function initFallbackEditor() {
  if (state.editor?.fallback) return;

  const area = document.createElement("textarea");
  area.className = "editor-fallback";
  area.spellcheck = false;
  area.setAttribute("aria-label", "Code editor");
  area.setAttribute("autocapitalize", "off");
  area.setAttribute("autocomplete", "off");
  area.setAttribute("autocorrect", "off");
  dom.editor.append(area);

  const load = () => {
    area.value = state.active ? state.files.get(state.active) ?? "" : "";
    area.disabled = !state.active;
  };
  area.addEventListener("input", () => {
    if (!state.active) return;
    state.files.set(state.active, area.value);
    scheduleSave();
  });
  area.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runActive();
    }
  });

  state.editor = {
    fallback: true,
    getValue: () => area.value,
    setValue: (value) => {
      area.value = value;
    },
    getModel: () => null,
    focus: () => area.focus(),
    saveViewState: () => null,
    restoreViewState: () => {},
    setModel: () => {},
  };
  state.editorSync = load;
  load();
}

/* ==========================================================================
 * Terminal
 * ========================================================================== */

const ANSI = {
  30: "#4b5563", 31: "#f87171", 32: "#34d399", 33: "#fbbf24",
  34: "#60a5fa", 35: "#c084fc", 36: "#22d3ee", 37: "#e5e7eb",
  90: "#6b7280", 91: "#fca5a5", 92: "#86efac", 93: "#fde68a",
  94: "#93c5fd", 95: "#d8b4fe", 96: "#67e8f9", 97: "#f8fafc",
};

function ansiFragment(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /\x1b\[([0-9;]*)m/g;
  let color = null;
  let bold = false;
  let dim = false;
  let last = 0;
  let match;

  const push = (chunk) => {
    if (!chunk) return;
    const span = document.createElement("span");
    span.textContent = chunk;
    if (color) span.style.color = color;
    if (bold) span.style.fontWeight = "700";
    if (dim) span.style.opacity = "0.7";
    fragment.append(span);
  };

  while ((match = pattern.exec(text))) {
    push(text.slice(last, match.index));
    const codes = match[1].split(";").filter(Boolean).map(Number);
    if (!codes.length) codes.push(0);
    for (const code of codes) {
      if (code === 0) {
        color = null;
        bold = false;
        dim = false;
      } else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 22) {
        bold = false;
        dim = false;
      } else if (code === 39) color = null;
      else if (ANSI[code]) color = ANSI[code];
    }
    last = pattern.lastIndex;
  }
  push(text.slice(last));
  return fragment;
}

function terminalNearBottom() {
  const el = dom.terminal;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

let terminalStreamLine = null;

function createTerminalStreamLine(kind = "") {
  const element = document.createElement("div");
  element.className = `term-line is-streaming${kind ? ` ${kind}` : ""}`;
  const output = document.createElement("span");
  output.className = "term-stream-output";
  element.append(output);
  dom.terminal.append(element);
  terminalStreamLine = { element, output, raw: "" };
  return terminalStreamLine;
}

function finishTerminalStreamLine() {
  if (!terminalStreamLine) return;
  terminalStreamLine.element.classList.remove("is-streaming");
  terminalStreamLine = null;
}

function writeTerminal(text, kind = "") {
  if (text === undefined || text === null) return;
  finishTerminalStreamLine();
  const stick = terminalNearBottom();
  const clean = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "");
  const lines = clean.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const div = document.createElement("div");
    div.className = `term-line${kind ? ` ${kind}` : ""}`;
    if (line.includes("\x1b[")) div.append(ansiFragment(line));
    else div.textContent = line;
    fragment.append(div);
  }
  dom.terminal.append(fragment);

  if (stick) dom.terminal.scrollTop = dom.terminal.scrollHeight;
  announce(clean);
}

function writeTerminalStream(text, kind = "") {
  if (text === undefined || text === null) return;
  const clean = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "");
  if (!clean) return;

  const stick = terminalNearBottom();
  const chunks = clean.split("\n");
  const endsWithNewline = chunks[chunks.length - 1] === "";
  if (endsWithNewline) chunks.pop();

  for (let index = 0; index < chunks.length; index += 1) {
    const line = terminalStreamLine || createTerminalStreamLine(kind);
    if (kind) line.element.classList.add(kind);
    line.raw += chunks[index];
    if (line.raw.includes("\x1b[")) line.output.replaceChildren(ansiFragment(line.raw));
    else line.output.textContent = line.raw;
    if (index < chunks.length - 1 || endsWithNewline) finishTerminalStreamLine();
  }

  if (!chunks.length && endsWithNewline) {
    if (!terminalStreamLine) createTerminalStreamLine(kind);
    finishTerminalStreamLine();
  }

  if (stick) dom.terminal.scrollTop = dom.terminal.scrollHeight;
  announce(clean);
}

function clearActiveOutput() {
  clearTerminal();
}

function clearTerminal() {
  if (dom.promptForm.parentElement?.closest(".term-line")) {
    dom.promptForm.classList.remove("is-inline");
    dom.terminal.after(dom.promptForm);
  }
  dom.terminal.replaceChildren();
  terminalStreamLine = null;
  if (state.stdinPending) attachProgramInputPrompt();
}

/* ==========================================================================
 * Terminal prompt + shell
 * ========================================================================== */

const shellHistory = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SHELL_HISTORY_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((line) => typeof line === "string").slice(-500)
      : [];
  } catch {
    return [];
  }
})();

let historyIndex = shellHistory.length;

function refreshPrompt() {
  if (!shell) return;

  if (state.stdinPending) {
    dom.promptPath.textContent = "";
    dom.promptSigil.textContent = "›";
    dom.promptInput.placeholder = "Type a response and press Enter";
    dom.promptInput.title = "Send a line to the running Python program";
    dom.promptInput.setAttribute("aria-label", "Program input");
    dom.promptInput.disabled = false;
    return;
  }

  const parts = shell.promptParts();
  if (dom.promptPath) dom.promptPath.textContent = parts.path;
  if (dom.promptSigil) dom.promptSigil.textContent = parts.sigil;
  const busy = state.pythonRunStarting || state.running || Boolean(state.pendingRun) || state.pipInstalling;
  dom.promptInput.placeholder = busy
    ? "Python is running…"
    : shell.mode === "pwsh"
      ? "Type a PowerShell command — try “help”"
      : "Type a bash command — try “help”";
  dom.promptInput.title = busy ? "The terminal prompt returns when the running task finishes" : shell.promptText();
  dom.promptInput.setAttribute("aria-label", "Terminal command");
  dom.promptInput.disabled = busy;
}

function createProgramStdinChannel() {
  if (globalThis.crossOriginIsolated !== true || typeof SharedArrayBuffer === "undefined") return null;
  try {
    const buffer = new SharedArrayBuffer(PROGRAM_STDIN_BUFFER_BYTES);
    return {
      buffer,
      control: new Int32Array(buffer, 0, 2),
      data: new Uint8Array(buffer, PROGRAM_STDIN_CONTROL_BYTES),
    };
  } catch {
    return null;
  }
}

function attachProgramInputPrompt() {
  if (!terminalStreamLine) createTerminalStreamLine();
  dom.promptForm.classList.add("is-inline");
  terminalStreamLine.element.append(dom.promptForm);
}

function restoreTerminalPrompt() {
  dom.promptForm.classList.remove("is-inline");
  if (dom.promptForm.parentElement !== dom.terminal.parentElement) {
    dom.terminal.after(dom.promptForm);
  }
}

function submitProgramInput(value) {
  const channel = state.stdinChannel;
  if (!state.stdinPending || !channel) return false;

  const bytes = programInputEncoder.encode(String(value));
  if (bytes.length > channel.data.length) {
    toast("Input is too long for the running program.", "error");
    return false;
  }

  channel.data.set(bytes);
  Atomics.store(channel.control, 1, bytes.length);
  Atomics.store(channel.control, 0, 1);
  Atomics.notify(channel.control, 0, 1);
  state.stdinPending = false;
  dom.promptInput.value = "";
  restoreTerminalPrompt();
  refreshPrompt();
  return true;
}

function shellWriteFile(key, content) {
  const model = state.models.get(key);
  state.files.set(key, String(content));
  if (model && !model.isDisposed()) {
    if (model.getValue() !== String(content)) model.setValue(String(content));
  } else if (state.active === key && state.editor?.fallback) {
    state.editor.setValue(String(content));
  }
  renderFileList();
  renderTabs();
  scheduleSave();
}

function shellDeleteFile(key) {
  state.files.delete(key);
  state.snapshots.delete(key);
  const model = state.models.get(key);
  if (model) model.dispose();
  state.models.delete(key);
  state.views.delete(key);
  state.openTabs = state.openTabs.filter((item) => item !== key);
  if (state.active === key) state.active = state.openTabs[0] || null;
  renderFileList();
  renderTabs();
  syncEditor();
  refreshLanguage();
  updateRunButtons();
  scheduleSave();
}

function shellHost() {
  return {
    getFiles: () => state.files,
    loadDirs: () => [...state.dirs],
    saveDirs: (dirs) => {
      state.dirs = new Set(dirs);
      try {
        localStorage.setItem(SHELL_DIRS_KEY, JSON.stringify([...state.dirs]));
      } catch {
        /* ignore */
      }
      scheduleSave();
    },
    writeFile: shellWriteFile,
    deleteFile: shellDeleteFile,
    openFile,
    downloadFile,
    clear: clearTerminal,
    write: (text, kind) => writeTerminal(text, kind),
    runPython: async (key, lines) => {
      if (state.pipInstalling) {
        writeTerminal("python: wait for pip installation to finish.\n", "err");
        return false;
      }
      if (state.runtime !== "ready") {
        writeTerminal("python: the Python runtime is still starting.\n", "err");
        return false;
      }
      return runPythonFile(key, lines, { fromShell: true });
    },
    runJavaScript: async (key) => runJavaScript(key, { quiet: true }),
    runBatch: async (key) => runBatchFile(key),
    requestText: (options) => askText({ ...options, inputType: "text" }),
    requestSecret: (options) => askText({ ...options, inputType: "password" }),
    pip: async (packages) => {
      const specs = Array.isArray(packages)
        ? packages.map((packageSpec) => String(packageSpec).trim()).filter(Boolean)
        : [];
      if (!specs.length) {
        writeTerminal("pip: specify at least one package.\n", "err");
        return false;
      }
      if (state.running || state.runtime === "running" || state.pendingRun) {
        writeTerminal("pip: wait for the Python program to finish.\n", "err");
        return false;
      }
      if (state.pipInstalling) {
        writeTerminal("pip: another installation is already in progress.\n", "err");
        return false;
      }

      state.pipInstalling = true;
      updateRunButtons();
      refreshPrompt();

      try {
        if (state.runtime !== "ready") {
          writeTerminal("Starting Python runtime for pip…\n", "sys");
          await ensureRuntime();
        }

        if (state.runtime !== "ready" || !state.worker) {
          writeTerminal("pip: Python runtime is unavailable.\n", "err");
          return false;
        }
        if (state.running || state.runtime === "running" || state.pendingRun) {
          writeTerminal("pip: wait for the Python program to finish.\n", "err");
          return false;
        }

        const requestId = ++state.pipRequestId;
        return await new Promise((resolve) => {
          state.pendingPip = { requestId, resolve };
          try {
            state.worker.postMessage({ type: "pip", requestId, packages: specs });
          } catch (error) {
            writeTerminal(`pip: ${error?.message || error}\n`, "err");
            settlePendingPip(false, requestId);
          }
        });
      } catch (error) {
        writeTerminal(`pip: ${error?.message || error}\n`, "err");
        return false;
      } finally {
        if (state.pipInstalling && !state.pendingPip) {
          state.pipInstalling = false;
          updateRunButtons();
          refreshPrompt();
        }
      }
    },
    resetWorkspace: async () => resetWorkspace(),
    version: () => `Python ${state.pyVersion} · Pyodide ${PYODIDE_VERSION} · browser runtime`,
    getActiveFile: () => state.active,
    languageFor,
    saveHistory: (history) => {
      try {
        localStorage.setItem(SHELL_HISTORY_KEY, JSON.stringify(history.slice(-500)));
      } catch {
        /* ignore */
      }
    },
  };
}

function initShell() {
  shell = createShell(shellHost(), {
    mode: settings.shell,
    username: settings.username,
    history: shellHistory,
    dirs: [...state.dirs],
  });
  historyIndex = shell.history.length;
  refreshPrompt();
}

function insertCompletion(result) {
  const value = dom.promptInput.value;
  const caret = dom.promptInput.selectionStart ?? value.length;
  const insert = result.matches.length === 1 ? result.matches[0] : result.common;
  if (!insert || insert.length <= result.prefix.length) return false;

  const next = value.slice(0, result.start) + insert + value.slice(caret);
  dom.promptInput.value = next;
  let position = result.start + insert.length;
  if (result.matches.length === 1 && !insert.endsWith("/")) {
    dom.promptInput.value = `${next.slice(0, position)} ${next.slice(position)}`;
    position += 1;
  }
  dom.promptInput.setSelectionRange(position, position);
  return true;
}

async function submitTerminalLine() {
  if (!shell) return;
  if (!state.stdinPending && (state.pythonRunStarting || state.running || state.pendingRun || state.pipInstalling)) return;

  const line = dom.promptInput.value;
  if (state.stdinPending) {
    submitProgramInput(line);
    return;
  }

  dom.promptInput.value = "";
  if (!line.trim()) {
    refreshPrompt();
    return;
  }

  try {
    await shell.execute(line);
  } catch (error) {
    writeTerminal(String(error?.message || error), "err");
  }

  historyIndex = shell.history.length;
  refreshPrompt();
  updateRunButtons();
  scheduleSave();
}

dom.promptInput.addEventListener("keydown", (event) => {
  if (!shell) return;

  if (event.key === "Enter") {
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submitTerminalLine();
    return;
  }

  if (state.stdinPending) {
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "c") {
      const hasSelection = (dom.promptInput.selectionStart ?? 0) !== (dom.promptInput.selectionEnd ?? 0);
      if (!hasSelection) {
        event.preventDefault();
        stopRuntime("Python program interrupted with Ctrl+C.");
      }
    } else if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      clearTerminal();
    }
    return;
  }

  const history = shell.history;

  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!history.length) return;
    historyIndex = Math.max(0, historyIndex - 1);
    dom.promptInput.value = history[historyIndex] ?? "";
    dom.promptInput.setSelectionRange(dom.promptInput.value.length, dom.promptInput.value.length);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    historyIndex = Math.min(history.length, historyIndex + 1);
    dom.promptInput.value = history[historyIndex] ?? "";
    dom.promptInput.setSelectionRange(dom.promptInput.value.length, dom.promptInput.value.length);
  } else if (event.key === "Tab") {
    event.preventDefault();
    const value = dom.promptInput.value;
    const caret = dom.promptInput.selectionStart ?? value.length;
    const result = shell.complete(value, caret);
    if (!result) return;
    if (insertCompletion(result)) {
      if (result.matches.length > 1) {
        writeTerminal(result.matches.join("  "), "sys");
      }
    } else if (result.matches.length > 1) {
      writeTerminal(result.matches.join("  "), "sys");
    }
  } else if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "c") {
    const start = dom.promptInput.selectionStart ?? 0;
    const end = dom.promptInput.selectionEnd ?? 0;
    if (start !== end) {
      const selected = dom.promptInput.value.slice(start, end);
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(selected).catch(() => {});
        } else {
          const ta = document.createElement("textarea");
          ta.value = selected;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.append(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
      } catch {
        /* ignore */
      }
      return;
    }
    if (!dom.promptInput.value) return;
    event.preventDefault();
    writeTerminal(`${shell.promptText()} ${dom.promptInput.value}^C`, "cmd");
    dom.promptInput.value = "";
  } else if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    clearTerminal();
  } else if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "u") {
    event.preventDefault();
    dom.promptInput.value = "";
  }
});

dom.terminal.addEventListener("click", () => {
  if (!window.getSelection()?.toString()) dom.promptInput.focus({ preventScroll: true });
});

dom.promptForm.addEventListener("click", (event) => {
  if (event.target === dom.promptForm) dom.promptInput.focus({ preventScroll: true });
});

/* ==========================================================================
 * Runtime (worker)
 * ========================================================================== */

function updateRunButtons() {
  const running = state.runtime === "running" || state.pythonRunStarting || Boolean(state.pendingRun) || state.jsRunning || state.batchRunning || state.pipInstalling;
  const canRun = !running && Boolean(state.active);
  dom.btnRun.disabled = !canRun;
  dom.btnRunMenu.disabled = !canRun;
  dom.btnStop.disabled = !running;
  if (dom.batchStop) dom.batchStop.disabled = !state.batchRunning;
}

function setRuntime(next, text) {
  state.runtime = next;
  dom.runtime.dataset.state = next;
  if (text) dom.runtimeText.textContent = text;

  if (next === "ready") {
    dom.statusRuntime.textContent = `Python ${state.pyVersion} · WebAssembly`;
  }

  updateRunButtons();
}

const runtimeReadyResolvers = [];

function resolveRuntimeReadyWaiters() {
  while (runtimeReadyResolvers.length) runtimeReadyResolvers.shift()();
}

function finishPendingPythonRun(ok) {
  state.running = false;
  state.pythonRunStarting = false;
  state.stdinPending = false;
  state.stdinChannel = null;
  restoreTerminalPrompt();
  const resolve = state.pendingRun;
  state.pendingRun = null;
  if (resolve) resolve(Boolean(ok));
  refreshPrompt();
  updateRunButtons();
}

function settlePendingPip(ok, requestId) {
  const pending = state.pendingPip;
  if (!pending || (requestId !== undefined && pending.requestId !== requestId)) return false;
  state.pendingPip = null;
  state.pipInstalling = false;
  updateRunButtons();
  refreshPrompt();
  pending.resolve(Boolean(ok));
  return true;
}

function startWorker() {
  if (state.pendingPip) settlePendingPip(false, state.pendingPip.requestId);
  if (state.worker) state.worker.terminate();
  state.worker = new Worker(new URL("assets/worker.js?v=30", document.baseURI));

  state.worker.addEventListener("message", onWorkerMessage);
  state.worker.addEventListener("error", (event) => {
    const runtimeError = `Runtime error: ${event.message || "unknown"}`;
    setRuntime("error", "Runtime crashed");
    dbg("worker error", event.message);
    state.worker = null;
    writeTerminal(runtimeError, "err");
    finishPendingPythonRun(false);
    if (state.pendingPip) settlePendingPip(false, state.pendingPip.requestId);
    resolveRuntimeReadyWaiters();
  });

  setRuntime("loading", "Starting runtime…");
}

function ensureRuntime() {
  if (state.runtime === "ready") return Promise.resolve();
  if (state.runtime === "loading" || state.runtime === "idle") {
    if (!state.worker) startWorker();
    return new Promise((resolve) => runtimeReadyResolvers.push(resolve));
  }
  startWorker();
  return new Promise((resolve) => runtimeReadyResolvers.push(resolve));
}

function stopRuntime(reason = "Runtime stopped.", { restart = false } = {}) {
  const worker = state.worker;
  state.worker = null;
  worker?.terminate();
  finishPendingPythonRun(false);
  if (state.pendingPip) settlePendingPip(false, state.pendingPip.requestId);
  else {
    state.pipInstalling = false;
    updateRunButtons();
    refreshPrompt();
  }
  resolveRuntimeReadyWaiters();
  setRuntime("idle", "Python runtime stopped.");
  writeTerminal(`\n${reason}`, "sys");
  refreshPrompt();
  if (restart) startWorker();
}

let jsRunCounter = 0;

function runJavaScript(name, options = {}) {
  const quiet = Boolean(options.quiet);
  if (!state.files.has(name)) return Promise.resolve(false);

  const code = (state.active === name && state.editor && !state.editor.fallback)
    ? state.editor.getValue()
    : (state.files.get(name) ?? "");
  state.files.set(name, code);

  if (!quiet) writeTerminal(` node ${name}`, "cmd");
  showConsole("terminal");

  const runId = ++jsRunCounter;
  state.jsRunning = true;
  updateRunButtons();
  dom.statusRuntime.textContent = "JavaScript · browser";
  const iframe = dom.htmlPreview ?? document.createElement("iframe");
  const shouldMountPreview = !iframe.isConnected;
  dom.htmlPreview = iframe;
  iframe.className = "html-preview";
  iframe.sandbox = "allow-scripts allow-modals";
  if (shouldMountPreview) {
    document.body.append(iframe);
    iframe.hidden = true;
  }

  return new Promise((resolve) => {
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      state.jsRunning = false;
      updateRunButtons();
      dom.statusRuntime.textContent = `Python ${state.pyVersion} · WebAssembly`;
      window.removeEventListener("message", onMessage);
      try { iframe.srcdoc = ""; } catch { /* ignore */ }
      resolve(Boolean(ok));
    };

    const onMessage = (event) => {
      if (!event.data || event.data.runId !== runId) return;
      switch (event.data.type) {
        case "stdout": writeTerminal(event.data.text, ""); break;
        case "stderr": writeTerminal(event.data.text, "err"); break;
        case "done":
          const seconds = ((event.data.ms || 0) / 1000).toFixed(2);
          writeTerminal(event.data.ok ? `Process finished in ${seconds}s` : `Process exited with errors after ${seconds}s`, event.data.ok ? "ok" : "err");
          finish(event.data.ok);
          break;
        default: break;
      }
    };
    window.addEventListener("message", onMessage);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;margin:16px;background:#0c111b;color:#dbe3f4;}</style></head><body><script>
(function() {
  const runId = ${runId};
  const send = (type, text, ms, ok) => parent.postMessage({ runId, type, text, ms, ok }, "*");
  const fmt = (v) => (v === null ? "null" : v === undefined ? "undefined" : (typeof v === "object" ? JSON.stringify(v) : String(v)));
  const origLog = console.log, origWarn = console.warn, origErr = console.error;
  console.log = (...a) => send("stdout", a.map(fmt).join(" ") + "\\n");
  console.warn = (...a) => send("stderr", a.map(fmt).join(" ") + "\\n");
  console.error = (...a) => send("stderr", a.map(fmt).join(" ") + "\\n");
  const started = performance.now();
  window.onerror = (msg, src, line, col, err) => { send("stderr", (err && err.stack) ? err.stack + "\\n" : String(msg) + "\\n"); return true; };
  (async () => {
    try {
      ${code}
      send("done", null, performance.now() - started, true);
    } catch (e) {
      send("stderr", (e && e.stack) ? e.stack + "\\n" : String(e) + "\\n");
      send("done", null, performance.now() - started, false);
    }
  })();
})();
<\/script></body></html>`;

    iframe.srcdoc = html;
    iframe.hidden = false;
    toast("JS preview updated — see the Window tab.", "ok");
  });
}

function onWorkerMessage({ data }) {
  switch (data.type) {
    case "status": {
      if (data.state === "ready") {
        state.pyVersion = data.pythonVersion || state.pyVersion;
        dom.statusRuntime.textContent = `Python ${state.pyVersion} · Pyodide ${PYODIDE_VERSION}`;
        setRuntime("ready", data.message || `Python ${state.pyVersion} ready`);
        refreshPrompt();
        while (runtimeReadyResolvers.length) runtimeReadyResolvers.shift()();
      } else if (data.state === "error") {
        setRuntime("error", data.message || "Runtime error");
        finishPendingPythonRun(false);
        if (state.pendingPip) settlePendingPip(false, state.pendingPip.requestId);
        resolveRuntimeReadyWaiters();
      } else {
        setRuntime("loading", data.message || "Loading…");
      }
      break;
    }

    case "fatal": {
      const fatalMessage = data.text || "Fatal runtime error";
      dbg("worker fatal", data.text);
      setRuntime("error", "Runtime crashed");
      writeTerminal(fatalMessage, "err");
      finishPendingPythonRun(false);
      if (state.pendingPip) settlePendingPip(false, state.pendingPip.requestId);
      resolveRuntimeReadyWaiters();
      break;
    }

    case "stdout":
      if (state.pipInstalling) writeTerminal(data.text, "");
      else writeTerminalStream(data.text, "");
      break;

    case "stderr":
      if (state.pipInstalling) writeTerminal(data.text, "err");
      else writeTerminalStream(data.text, "err");
      break;

    case "run-start":
      state.running = true;
      refreshPrompt();
      setRuntime("running", "Running…");
      dom.tkStage.replaceChildren();
      dom.tkEmpty.hidden = false;
      break;

    case "stdin-request":
      if (!state.stdinChannel) break;
      state.stdinPending = true;
      dom.promptInput.value = "";
      refreshPrompt();
      if (state.panel !== "terminal") showConsole("terminal");
      attachProgramInputPrompt();
      dom.promptInput.focus({ preventScroll: true });
      break;

    case "stdin-unavailable":
      state.stdinPending = false;
      restoreTerminalPrompt();
      refreshPrompt();
      writeTerminal("Live program input requires a cross-origin-isolated page. Deploy with the configured COOP/COEP headers, or provide input through a shell pipe.\n", "err");
      break;

    case "canvas":
      handleCanvasOp(data.payload || {});
      break;

    case "tk":
      renderTk(data.payload || {});
      break;

    case "notice":
      writeTerminal(`[${data.payload?.title || "dialog"}] ${data.payload?.message || ""}`, "meta");
      break;

    case "timer":
      handleTimer(data.payload || {});
      break;

    case "pip-done":
      if (state.pendingPip?.requestId === data.requestId) {
        settlePendingPip(Boolean(data.ok), data.requestId);
        setRuntime("ready", `Python ${state.pyVersion} ready`);
      }
      break;

    case "done":
      finishPendingPythonRun(Boolean(data.ok));
      setRuntime("ready", `Python ${state.pyVersion} ready`);
      finishRun(data);
      break;

    default:
      break;
  }
}

/* ==========================================================================
 * Canvas renderer
 * ========================================================================== */

let canvasSize = { w: 720, h: 480 };
let canvasBg = "#0f1524";
let canvasOps = [];

function resetCanvas(w, h, bg) {
  canvasSize = { w: Math.max(1, w || 720), h: Math.max(1, h || 480) };
  canvasBg = bg || "#0f1524";
  canvasOps = [];
  fitCanvas();
}

function fitCanvas() {
  const stage = dom.canvas.parentElement;
  if (!stage) return;
  const pad = 20;
  const availableWidth = Math.max(120, stage.clientWidth - pad);
  const availableHeight = Math.max(90, stage.clientHeight - pad);
  const scale = Math.min(availableWidth / canvasSize.w, availableHeight / canvasSize.h, 1);
  const cssWidth = Math.max(120, Math.round(canvasSize.w * scale));
  const cssHeight = Math.max(90, Math.round(canvasSize.h * scale));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  dom.canvas.style.width = `${cssWidth}px`;
  dom.canvas.style.height = `${cssHeight}px`;
  dom.canvas.width = Math.round(cssWidth * dpr);
  dom.canvas.height = Math.round(cssHeight * dpr);

  ctx.setTransform(
    (cssWidth * dpr) / canvasSize.w, 0,
    0, (cssHeight * dpr) / canvasSize.h,
    0, 0
  );

  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);
  for (const op of canvasOps) drawOp(op);
}

function drawOp(op) {
  const width = op.width || 1;

  switch (op.op) {
    case "init":
      break;

    case "bg":
      ctx.fillStyle = op.bg || op.fill || "#000";
      ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);
      break;

    case "line": {
      ctx.strokeStyle = op.color || "#e8eefc";
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      break;
    }

    case "dot":
      ctx.fillStyle = op.color || "#e8eefc";
      ctx.beginPath();
      ctx.arc(op.x, op.y, Math.max(0.5, op.r || 1), 0, Math.PI * 2);
      ctx.fill();
      break;

    case "circle":
      ctx.beginPath();
      ctx.arc(op.x, op.y, Math.max(0.5, op.r || 1), 0, Math.PI * 2);
      if (op.fill) {
        ctx.fillStyle = op.fill;
        ctx.fill();
      }
      if (op.color && width) {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      break;

    case "rect":
      if (op.fill) {
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x, op.y, op.w, op.h);
      }
      if (op.color && width) {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = width;
        ctx.strokeRect(op.x, op.y, op.w, op.h);
      }
      break;

    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(op.x + op.w / 2, op.y + op.h / 2, op.w / 2, op.h / 2, 0, 0, Math.PI * 2);
      if (op.fill) {
        ctx.fillStyle = op.fill;
        ctx.fill();
      }
      if (op.color && width) {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      break;

    case "polygon": {
      const points = op.points || [];
      if (points.length < 6) break;
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) {
        ctx.lineTo(points[index], points[index + 1]);
      }
      ctx.closePath();
      if (op.fill) {
        ctx.fillStyle = op.fill;
        ctx.fill();
      }
      if (op.color && width) {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      break;
    }

    case "text": {
      const font = op.font || {};
      const size = op.size || 13;
      const family = op.family || "Segoe UI, system-ui, sans-serif";
      ctx.font = `${op.italic ? "italic " : ""}${op.bold ? "700" : "400"} ${size}px ${family}`;
      ctx.fillStyle = op.color || "#e8eefc";
      ctx.textAlign = op.align === "center" ? "center" : op.align === "right" ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(op.text ?? "", op.x, op.y);
      break;
    }

    case "notice":
      writeTerminal(op.text || "", "sys");
      break;

    default:
      break;
  }
}

function handleCanvasOp(op) {
  if (!op || !op.op) return;

  if (op.op === "init") {
    resetCanvas(op.width, op.height, op.bg);
    if (state.panel !== "canvas") showPanel("canvas");
    bumpBadge("badge-canvas");
    return;
  }

  canvasOps.push(op);
  drawOp(op);

  if (state.panel !== "canvas") {
    bumpBadge("badge-canvas");
  }
}

function bumpBadge(id) {
  const badge = $(id);
  if (!badge) return;
  if (badge.hidden) {
    badge.hidden = false;
    badge.textContent = "•";
  }
}

/* ==========================================================================
 * Tkinter renderer
 * ========================================================================== */

const tkControls = new Map();
let tkRenderQueued = false;
let tkPendingSpec = null;

function renderTk(spec) {
  if (!spec || spec.kind !== "tk") return;

  tkPendingSpec = spec;
  dom.tkEmpty.hidden = true;
  if (state.panel !== "window") bumpBadge("badge-window");

  if (tkRenderQueued) return;
  tkRenderQueued = true;
  requestAnimationFrame(() => {
    tkRenderQueued = false;
    const latest = tkPendingSpec;
    tkPendingSpec = null;
    if (latest) drawTk(latest);
  });
}

function drawTk(spec) {
  const active = document.activeElement;
  const focusId = active && dom.tkStage.contains(active)
    ? active.closest("[data-widget-id]")?.dataset.widgetId
    : null;
  const caret = focusId && "selectionStart" in active ? active.selectionStart : null;

  tkControls.clear();
  dom.tkStage.replaceChildren();

  const windowEl = document.createElement("div");
  windowEl.className = "tk-window";

  const titlebar = document.createElement("div");
  titlebar.className = "tk-titlebar";
  titlebar.textContent = spec.options?.title || "Tk";

  const body = document.createElement("div");
  body.className = "tk-body";
  body.style.background = spec.options?.bg || "#f0f0f0";

  const geometry = String(spec.options?.geometry || "");
  const match = geometry.match(/^(\d+)x(\d+)/);
  if (match) {
    body.style.width = `${match[1]}px`;
    body.style.minHeight = `${match[2]}px`;
  }

  const children = (spec.children || []).map(buildTkWidget).filter(Boolean);
  applyTkLayout(body, children, spec.children || []);

  windowEl.append(titlebar, body);
  dom.tkStage.append(windowEl);

  if (focusId) {
    const restored = dom.tkStage.querySelector(`[data-widget-id="${CSS.escape(focusId)}"] [data-focusable]`)
      || dom.tkStage.querySelector(`[data-widget-id="${CSS.escape(focusId)}"]`);
    if (restored) {
      restored.focus({ preventScroll: true });
      if (caret !== null && "setSelectionRange" in restored) {
        try {
          restored.setSelectionRange(caret, caret);
        } catch {
          /* not a text field */
        }
      }
    }
  }
}

function applyTkLayout(container, elements, specs) {
  const anyGrid = specs.some((spec) => spec.layout?.manager === "grid");
  const anyPlace = specs.some((spec) => spec.layout?.manager === "place");

  if (anyPlace) container.style.position = "relative";

  if (anyGrid) {
    container.style.display = "grid";
    container.style.gridAutoRows = "min-content";
    container.style.alignItems = "start";
    container.style.justifyItems = "start";
  } else {
    container.classList.add("tk-col");
  }

  let row = null;

  elements.forEach((element, index) => {
    const layout = specs[index]?.layout || { manager: "pack" };
    element.classList.add("tk-widget");
    element.dataset.side = layout.side || "top";

    if (layout.manager === "grid") {
      element.style.gridRow = `${(layout.row ?? 0) + 1} / span ${layout.rowspan ?? 1}`;
      element.style.gridColumn = `${(layout.column ?? 0) + 1} / span ${layout.columnspan ?? 1}`;
      if (layout.sticky) {
        const sticky = layout.sticky;
        element.style.justifySelf = sticky.includes("e") ? "end" : sticky.includes("w") ? "start" : "stretch";
        element.style.alignSelf = sticky.includes("s") ? "end" : sticky.includes("n") ? "start" : "stretch";
      }
      element.style.margin = `${layout.pady || 0}px ${layout.padx || 0}px`;
      container.append(element);
      return;
    }

    if (layout.manager === "place") {
      element.style.position = "absolute";
      element.style.left = layout.relx ? `${layout.relx * 100}%` : `${layout.x || 0}px`;
      element.style.top = layout.rely ? `${layout.rely * 100}%` : `${layout.y || 0}px`;
      if (layout.width) element.style.width = `${layout.width}px`;
      if (layout.height) element.style.height = `${layout.height}px`;
      container.append(element);
      return;
    }

    element.style.margin = `${layout.pady || 0}px ${layout.padx || 0}px`;
    const fill = layout.fill || "none";
    if (fill.includes("x")) element.style.alignSelf = "stretch";
    if (layout.expand) element.style.flex = "1 1 auto";

    const side = layout.side || "top";
    if (side === "left" || side === "right") {
      if (!row) {
        row = document.createElement("div");
        row.className = "tk-row";
        row.style.width = "100%";
        container.append(row);
      }
      if (side === "right") element.style.marginLeft = "auto";
      row.append(element);
    } else {
      row = null;
      container.append(element);
    }
  });
}

function buildTkWidget(spec) {
  const options = spec.options || {};
  const wrapper = document.createElement("div");
  wrapper.dataset.widgetId = spec.id;
  wrapper.style.display = "block";

  let control;

  switch (spec.kind) {
    case "label": {
      control = document.createElement("span");
      control.className = "tk-label";
      control.textContent = options.text ?? "";
      styleTk(control, options);
      if (options.width) control.style.minWidth = `${Number(options.width) * 7}px`;
      break;
    }

    case "button": {
      control = document.createElement("button");
      control.type = "button";
      control.className = "tk-button";
      control.dataset.focusable = "true";
      control.textContent = options.text ?? "Button";
      if (options.state === "disabled") control.disabled = true;
      if (options.bg) control.style.background = options.bg;
      if (options.fg) control.style.color = options.fg;
      if (options.font) control.style.font = tkFont(options.font);
      control.addEventListener("click", () => postTkEvent("widget", spec.id, true));
      break;
    }

    case "entry": {
      control = document.createElement("input");
      control.type = options.show === "*" ? "password" : "text";
      control.className = "tk-entry";
      control.dataset.focusable = "true";
      control.value = options.value ?? options.text ?? "";
      control.style.width = options.width ? `${Number(options.width) * 8}px` : "160px";
      if (options.font) control.style.font = tkFont(options.font);
      control.addEventListener("change", () => postTkEvent("widget", spec.id, control.value));
      control.addEventListener("keydown", (event) => {
        if (event.key === "Enter") postTkEvent("widget", spec.id, control.value);
      });
      tkControls.set(spec.id, { kind: "entry", element: control });
      break;
    }

    case "text": {
      control = document.createElement("textarea");
      control.className = "tk-text";
      control.dataset.focusable = "true";
      control.value = options.value ?? "";
      control.style.width = options.width ? `${Number(options.width) * 8}px` : "240px";
      control.style.height = options.height ? `${Number(options.height) * 18}px` : "72px";
      control.addEventListener("change", () => postTkEvent("widget", spec.id, control.value));
      tkControls.set(spec.id, { kind: "text", element: control });
      break;
    }

    case "checkbutton": {
      control = document.createElement("label");
      control.className = "tk-check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = Boolean(options.value);
      box.dataset.focusable = "true";
      box.addEventListener("change", () => postTkEvent("widget", spec.id, box.checked));
      const text = document.createElement("span");
      text.textContent = options.text ?? "";
      control.append(box, text);
      tkControls.set(spec.id, { kind: "checkbutton", element: box });
      break;
    }

    case "radiobutton": {
      control = document.createElement("label");
      control.className = "tk-check";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `tk-radio-${spec.id}`;
      radio.checked = String(options.value) === String(options.rvalue);
      radio.dataset.focusable = "true";
      radio.addEventListener("change", () => postTkEvent("widget", spec.id, options.rvalue));
      const text = document.createElement("span");
      text.textContent = options.text ?? "";
      control.append(radio, text);
      break;
    }

    case "scale": {
      control = document.createElement("input");
      control.type = "range";
      control.className = "tk-scale";
      const from = Number(options.from ?? 0);
      const to = Number(options.to ?? 100);
      control.min = String(Math.min(from, to));
      control.max = String(Math.max(from, to));
      control.step = String(options.resolution || 1);
      control.value = String(options.value ?? from);
      control.dataset.focusable = "true";
      let throttled = 0;
      control.addEventListener("input", () => {
        clearTimeout(throttled);
        throttled = setTimeout(() => postTkEvent("widget", spec.id, Number(control.value)), 120);
      });
      tkControls.set(spec.id, { kind: "scale", element: control });
      break;
    }

    case "listbox": {
      control = document.createElement("div");
      control.className = "tk-listbox";
      control.dataset.focusable = "true";
      control.tabIndex = 0;
      const items = options.items || [];
      const selected = new Set((options.selection || []).map(Number));
      if (options.height) control.style.height = `${Number(options.height) * 18}px`;
      items.forEach((item, index) => {
        const row = document.createElement("div");
        row.textContent = item;
        row.classList.toggle("is-selected", selected.has(index));
        row.addEventListener("click", () => {
          for (const child of control.children) child.classList.remove("is-selected");
          row.classList.add("is-selected");
          postTkEvent("widget", spec.id, index);
        });
        control.append(row);
      });
      break;
    }

    case "combobox": {
      control = document.createElement("select");
      control.className = "tk-combo";
      control.dataset.focusable = "true";
      const values = options.values || [];
      const current = String(options.value ?? "");
      if (!values.includes(current) && current) {
        const option = document.createElement("option");
        option.value = current;
        option.textContent = current;
        control.append(option);
      }
      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        control.append(option);
      }
      control.value = current;
      control.addEventListener("change", () => postTkEvent("widget", spec.id, control.value));
      break;
    }

    case "canvas": {
      control = document.createElement("canvas");
      control.className = "tk-canvas";
      const width = Number(options.width || 320);
      const height = Number(options.height || 200);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      control.width = width * dpr;
      control.height = height * dpr;
      control.style.width = `${width}px`;
      control.style.height = `${height}px`;
      const context = control.getContext("2d");
      context.scale(dpr, dpr);
      context.fillStyle = options.bg || "#ffffff";
      context.fillRect(0, 0, width, height);
      paintTkCanvas(context, options.items || []);
      control.addEventListener("click", (event) => {
        const rect = control.getBoundingClientRect();
        postTkEvent("widget", spec.id, {
          x: Math.round(event.clientX - rect.left),
          y: Math.round(event.clientY - rect.top),
        });
      });
      break;
    }

    default: {
      control = document.createElement("div");
      if (spec.children) {
        const nested = spec.children.map(buildTkWidget).filter(Boolean);
        applyTkLayout(control, nested, spec.children);
      }
      if (options.bg) control.style.background = options.bg;
      styleTk(control, options);
      break;
    }
  }

  wrapper.append(control);

  if (spec.children && spec.kind !== "frame") {
    const container = document.createElement("div");
    const nested = spec.children.map(buildTkWidget).filter(Boolean);
    applyTkLayout(container, nested, spec.children);
    wrapper.append(container);
  }

  return wrapper;
}

function styleTk(element, options) {
  if (options.bg) element.style.background = options.bg;
  if (options.fg) element.style.color = options.fg;
  if (options.font) element.style.font = tkFont(options.font);
  if (options.anchor === "w") element.style.textAlign = "left";
  if (options.anchor === "e") element.style.textAlign = "right";
  if (options.anchor === "center") element.style.textAlign = "center";
  if (options.wraplength) element.style.maxWidth = `${options.wraplength}px`;
}

function tkFont(font) {
  if (!font || typeof font !== "object") return "";
  return `${font.italic ? "italic " : ""}${font.bold ? "600" : "400"} ${font.size || 12}px ${font.family || "Segoe UI, system-ui, sans-serif"}`;
}

function paintTkCanvas(context, items) {
  for (const item of items) {
    const o = item.options || {};
    const coords = item.coords || [];
    context.save();
    context.lineWidth = Number(o.width || 1);
    context.strokeStyle = o.outline || "#000000";
    context.fillStyle = o.fill || "";

    if (item.kind === "line") {
      context.beginPath();
      context.moveTo(coords[0], coords[1]);
      for (let index = 2; index < coords.length; index += 2) {
        context.lineTo(coords[index], coords[index + 1]);
      }
      context.stroke();
    } else if (item.kind === "rect") {
      const [x1, y1, x2, y2] = coords;
      if (o.fill) context.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      context.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (item.kind === "oval") {
      const [x1, y1, x2, y2] = coords;
      context.beginPath();
      context.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      if (o.fill) context.fill();
      context.stroke();
    } else if (item.kind === "polygon") {
      context.beginPath();
      context.moveTo(coords[0], coords[1]);
      for (let index = 2; index < coords.length; index += 2) {
        context.lineTo(coords[index], coords[index + 1]);
      }
      context.closePath();
      if (o.fill) context.fill();
      context.stroke();
    } else if (item.kind === "arc") {
      const [x1, y1, x2, y2] = coords;
      const start = ((Number(o.start ?? 0) - 0) * Math.PI) / 180;
      const extent = (Number(o.extent ?? 90) * Math.PI) / 180;
      context.beginPath();
      context.ellipse(
        (x1 + x2) / 2, (y1 + y2) / 2,
        Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2,
        0, -start - extent, -start
      );
      context.stroke();
    } else if (item.kind === "text") {
      context.fillStyle = o.fill || "#000000";
      const font = o.font ? tkFont(o.font) : "12px 'Segoe UI', sans-serif";
      context.font = font;
      context.textAlign = o.anchor === "center" ? "center" : o.anchor === "e" ? "right" : "left";
      context.textBaseline = "middle";
      context.fillText(o.text ?? "", coords[0], coords[1]);
    }
    context.restore();
  }
}

/* ==========================================================================
 * Tk event plumbing (timers + widget events)
 * ========================================================================== */

const timers = new Map();

function handleTimer(payload) {
  if (!payload.id) return;
  if (payload.cancel) {
    clearTimeout(timers.get(payload.id));
    timers.delete(payload.id);
    return;
  }
  clearTimeout(timers.get(payload.id));
  timers.set(
    payload.id,
    setTimeout(() => {
      timers.delete(payload.id);
      postTkEvent("handler", payload.id, null);
    }, Math.max(0, Number(payload.ms) || 0))
  );
}

function postTkEvent(target, id, value) {
  if (!state.worker) return;
  state.worker.postMessage({ type: "tk-event", target, id, value });
}

/* ==========================================================================
 * Run
 * ========================================================================== */

function snapshotActive() {
  if (state.active && state.editor && !state.editor.fallback) {
    state.files.set(state.active, state.editor.getValue());
  }
}

async function runSqlFile(name) {
  if (!state.files.has(name)) return;
  const code = state.files.get(name) ?? "";
  writeTerminal(` sql ${name}`, "cmd");
  showConsole("terminal");

  const worker = new Worker(new URL("assets/sql-worker.js", document.baseURI));
  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case "stdout": writeTerminal(data.text, ""); break;
      case "stderr": writeTerminal(data.text, "err"); break;
      case "done": {
        const seconds = ((data.ms || 0) / 1000).toFixed(2);
        writeTerminal(data.ok ? `Query finished in ${seconds}s` : `Query failed after ${seconds}s`, data.ok ? "ok" : "err");
        worker.terminate();
        break;
      }
      default: break;
    }
  };
  worker.onerror = (event) => {
    writeTerminal(`SQL worker error: ${event.message || "unknown"}`, "err");
    worker.terminate();
  };
  worker.postMessage({ type: "run", code });
}

async function runLuaFile(name) {
  if (!state.files.has(name)) return;
  const code = state.files.get(name) ?? "";
  writeTerminal(` lua ${name}`, "cmd");
  showConsole("terminal");

  const worker = new Worker(new URL("assets/lua-worker.js", document.baseURI));
  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case "stdout": writeTerminal(data.text, ""); break;
      case "stderr": writeTerminal(data.text, "err"); break;
      case "done": {
        const seconds = ((data.ms || 0) / 1000).toFixed(2);
        writeTerminal(data.ok ? `Process finished in ${seconds}s` : `Process exited with errors after ${seconds}s`, data.ok ? "ok" : "err");
        worker.terminate();
        break;
      }
      default: break;
    }
  };
  worker.onerror = (event) => {
    writeTerminal(`Lua worker error: ${event.message || "unknown"}`, "err");
    worker.terminate();
  };
  worker.postMessage({ type: "run", code });
}

function appendBatchOutput(text, kind = "stdout") {
  if (!dom.batchOutput || text === "") return;
  const line = document.createElement("div");
  const safeKind = ["command", "stderr", "system", "success"].includes(kind) ? kind : "stdout";
  line.className = `batch-line batch-line-${safeKind}`;
  line.textContent = String(text ?? "");
  dom.batchOutput.append(line);
  while (dom.batchOutput.children.length > 700) dom.batchOutput.firstElementChild?.remove();
  dom.batchOutput.scrollTop = dom.batchOutput.scrollHeight;
}

function batchWorkspaceSnapshot() {
  snapshotActive();
  return {
    files: Object.fromEntries(state.files),
    dirs: [...state.dirs],
    username: settings.username || "guest",
  };
}

function startBatchWorker() {
  if (state.batchWorker) return state.batchWorker;
  try {
    const worker = new Worker(new URL(  "./batch-worker.js?v=30", import.meta.url));
    state.batchWorker = worker;
    state.batchInitialized = false;
    worker.addEventListener("message", handleBatchWorkerMessage);
    worker.addEventListener("error", (event) => {
      state.batchRunning = false;
      state.batchWorker?.terminate();
      state.batchWorker = null;
      state.batchInitialized = false;
      state.batchRunKind = "";
      appendBatchOutput(`Batch PC stopped: ${event.message || "worker error"}\n`, "stderr");
      updateRunButtons();
    });
    worker.postMessage({ type: "init", ...batchWorkspaceSnapshot() });
    return worker;
  } catch (error) {
    appendBatchOutput(`Batch PC could not start: ${error.message}\n`, "stderr");
    toast("Batch PC could not start.", "error");
    return null;
  }
}

function syncBatchWorker() {
  if (!state.batchWorker) return startBatchWorker();
  state.batchWorker.postMessage({ type: "sync", ...batchWorkspaceSnapshot() });
  return state.batchWorker;
}

function openBatchPC(app = "cmd") {
  if (!dom.batchPcDialog) return;
  snapshotActive();
  if (!dom.batchPcDialog.open) dom.batchPcDialog.showModal();
  openBatchApp(app);
  if (state.batchWorker) syncBatchWorker();
  else startBatchWorker();
}

function openBatchApp(app) {
  const titles = {
    cmd: "Command Prompt",
    files: "Files",
    notepad: "Notepad",
    tasks: "Task Manager",
    calc: "Calculator",
    settings: "About this PC",
  };
  if (!titles[app]) return;
  document.querySelectorAll("[data-batch-view]").forEach((view) => {
    view.hidden = view.dataset.batchView !== app;
  });
  document.querySelectorAll(".batch-desktop-shortcut").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.batchApp === app));
  });
  if (dom.batchWindowTitle) dom.batchWindowTitle.textContent = titles[app];
  $("batch-taskbar-active").textContent = titles[app];
  if (dom.batchStartMenu) dom.batchStartMenu.hidden = true;
  dom.batchStart?.setAttribute("aria-expanded", "false");

  if (app === "files") renderBatchFiles();
  if (app === "tasks") renderBatchTasks();
  if (app === "calc") renderBatchCalculator();
  if (app === "notepad") {
    const name = state.active;
    dom.batchNotepadFilename.textContent = name || "No file is open";
    dom.batchNotepadPreview.textContent = name
      ? state.files.get(name) ?? ""
      : "Open a file from Files, or create a .bat script to get started.";
  }
  if (app === "cmd" && dom.batchPcDialog?.open) {
  requestAnimationFrame(() => dom.batchCommandInput?.focus({ preventScroll: true }));
  }
  if (app === "calc" && dom.batchPcDialog?.open) {
  requestAnimationFrame(() => document.querySelector('[data-batch-view="calc"] [data-calc-digit]')?.focus({ preventScroll: true }));
  }
}

function renderBatchFiles() {
  if (!dom.batchFileList) return;
  dom.batchFileList.replaceChildren();
  const files = [...state.files.keys()].sort((left, right) => left.localeCompare(right));
  if (!files.length) {
    const empty = document.createElement("li");
    empty.className = "batch-empty";
    empty.textContent = "The virtual workspace is empty.";
    dom.batchFileList.append(empty);
    return;
  }
  for (const name of files) {
    const item = document.createElement("li");
    item.className = "batch-file-row";
    const filename = document.createElement("span");
    filename.textContent = name;
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "btn ghost small";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => {
      dom.batchPcDialog?.close();
      openFile(name);
    });
    item.append(filename, openButton);
    dom.batchFileList.append(item);
  }
}

function createBatchScript() {
  let suffix = 1;
  let filename = TEMPLATES.batch.name;
  while (state.files.has(filename)) {
    suffix += 1;
    filename = `hello-${suffix}.bat`;
  }
  if (createFile(filename, TEMPLATES.batch.content)) {
    renderBatchFiles();
    openBatchApp("notepad");
  }
}

function renderBatchCalculator() {
  if (dom.batchCalcDisplay) dom.batchCalcDisplay.textContent = state.batchCalc.display;
}

function batchCalculatorResult(left, operator, right) {
  switch (operator) {
    case "add": return left + right;
    case "subtract": return left - right;
    case "multiply": return left * right;
    case "divide": return right === 0 ? null : left / right;
    default: return null;
  }
}

function formatBatchCalculatorValue(value) {
  if (!Number.isFinite(value)) return "Error";
  return Number(value.toPrecision(12)).toString();
}

function handleBatchCalculatorButton(button) {
  const calculator = state.batchCalc;
  const digit = button.dataset.calcDigit;
  if (digit !== undefined) {
    const next = calculator.waitingForOperand || calculator.display === "Error"
      ? digit === "." ? "0." : digit
      : digit === "."
        ? calculator.display.includes(".") ? calculator.display : `${calculator.display}.`
        : calculator.display === "0" ? digit : `${calculator.display}${digit}`;
    if (next.length <= 18) calculator.display = next;
    calculator.waitingForOperand = false;
    renderBatchCalculator();
    return;
  }

  if (button.dataset.calcAction === "clear") {
    state.batchCalc = { display: "0", accumulator: null, operator: null, waitingForOperand: false };
    renderBatchCalculator();
    return;
  }
  if (button.dataset.calcAction === "backspace") {
    if (calculator.waitingForOperand || calculator.display === "Error") {
      calculator.display = "0";
      calculator.waitingForOperand = false;
    } else {
      calculator.display = calculator.display.length > 1 ? calculator.display.slice(0, -1) : "0";
      if (calculator.display === "-" || calculator.display === "") calculator.display = "0";
    }
    renderBatchCalculator();
    return;
  }

  const operation = button.dataset.calcOperation;
  if (operation) {
    const current = Number(calculator.display);
    if (!Number.isFinite(current)) return;
    if (calculator.operator && calculator.accumulator !== null && !calculator.waitingForOperand) {
      const result = batchCalculatorResult(calculator.accumulator, calculator.operator, current);
      calculator.display = result === null ? "Error" : formatBatchCalculatorValue(result);
      calculator.accumulator = result;
    } else if (calculator.accumulator === null) {
      calculator.accumulator = current;
    }
    calculator.operator = operation;
    calculator.waitingForOperand = true;
    renderBatchCalculator();
    return;
  }

  if (button.dataset.calcAction === "equals" && calculator.operator && calculator.accumulator !== null) {
    const right = calculator.waitingForOperand ? calculator.accumulator : Number(calculator.display);
    const result = batchCalculatorResult(calculator.accumulator, calculator.operator, right);
    calculator.display = result === null ? "Error" : formatBatchCalculatorValue(result);
    calculator.accumulator = result;
    calculator.operator = null;
    calculator.waitingForOperand = true;
    renderBatchCalculator();
  }
}

function renderBatchTasks() {
  if (!dom.batchTaskList) return;
  dom.batchTaskList.replaceChildren();
  const activeApp = $("batch-taskbar-active")?.textContent || "Command Prompt";
  const tasks = [
    { pid: "100", name: "PyIDE Virtual PC", status: "Running" },
    { pid: "101", name: activeApp, status: "Open" },
    { pid: "102", name: "Batch interpreter", status: state.batchRunning ? "Running" : "Idle" },
  ];
  for (const task of tasks) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${task.pid} · ${task.name}`;
    const status = document.createElement("span");
    status.textContent = task.status;
    item.append(name, status);
    dom.batchTaskList.append(item);
  }
}

function applyBatchWorkspace(result) {
  if (result.files && typeof result.files === "object") {
    const incoming = new Map(Object.entries(result.files).map(([name, content]) => [name, String(content)]));
    for (const name of [...state.files.keys()]) {
      if (incoming.has(name)) continue;
      const current = state.files.get(name) ?? "";
      const model = state.models.get(name);
      const editorValue = state.active === name ? model?.getValue() ?? state.editor?.getValue() : current;
      if (state.active === name && editorValue !== current) continue;
      shellDeleteFile(name);
    }
    for (const [name, content] of incoming) {
      const current = state.files.get(name);
      if (current === content) continue;
      const model = state.models.get(name);
      const editorValue = state.active === name ? model?.getValue() ?? state.editor?.getValue() : current;
      if (state.active === name && current !== undefined && editorValue !== current) {
        state.files.set(name, content);
        continue;
      }
      shellWriteFile(name, content);
    }
  }
  if (Array.isArray(result.dirs)) {
    state.dirs = new Set(result.dirs.map((dir) => `/${String(dir).replace(/^\/+|\/+$/g, "")}`));
    if (!state.dirs.size) state.dirs.add("/");
  }
  renderBatchFiles();
  renderBreadcrumbs();
  scheduleSave();
}

function handleBatchWorkerMessage({ data = {} }) {
  if (data.type === "output") {
    appendBatchOutput(data.text, data.kind);
    return;
  }
  if (data.type === "clear") {
    dom.batchOutput?.replaceChildren();
    return;
  }
  if (data.type === "input-request") {
    askText({
      title: data.title || "Batch input",
      label: data.label || "Enter a value",
      hint: data.hint || "This value stays in the virtual PC session.",
      inputType: data.inputType === "password" ? "password" : "text",
      confirm: data.confirm || "Enter",
    }).then((value) => state.batchWorker?.postMessage({ type: "input-response", id: data.id, value }));
    return;
  }
  if (data.type === "launch-app") {
    openBatchApp(data.app);
    return;
  }
  if (data.type === "ready") state.batchInitialized = true;
  if (data.prompt && dom.batchPromptLabel) dom.batchPromptLabel.textContent = data.prompt;
  if (data.title && dom.batchWindowTitle && dom.batchWindowTitle.textContent === "Command Prompt") {
    dom.batchWindowTitle.textContent = data.title;
  }
  if (data.type !== "complete") return;

  applyBatchWorkspace(data);
  state.batchRunning = false;
  if (state.batchRunKind === "script") {
    appendBatchOutput(
      data.stopped ? "Batch script stopped.\n" : `Batch script finished with exit code ${data.errorlevel ?? 0}.\n`,
      data.stopped ? "system" : data.errorlevel ? "stderr" : "success"
    );
  }
  state.batchRunKind = "";
  updateRunButtons();
  if (document.querySelector('[data-batch-view="tasks"]:not([hidden])')) renderBatchTasks();
  if (dom.batchPcDialog?.open && !document.querySelector('[data-batch-view="cmd"][hidden]')) {
    dom.batchCommandInput?.focus({ preventScroll: true });
  }
}

function runBatchCommand(line) {
  const command = String(line || "").trim();
  if (!command || state.batchRunning) return;
  const worker = syncBatchWorker();
  if (!worker) return;
  const prompt = dom.batchPromptLabel?.textContent || "C:\\workspace>";
  appendBatchOutput(`${prompt} ${command}\n`, "command");
  dom.batchCommandInput.value = "";
  state.batchRunKind = "command";
  state.batchRunning = true;
  updateRunButtons();
  worker.postMessage({ type: "command", line: command });
}

function runBatchFile(name) {
  const filename = String(name || "");
  if (!state.files.has(filename)) {
    toast(`Batch file not found: ${filename}`, "error");
    return false;
  }
  if (state.batchRunning) {
    toast("A Batch command is already running.", "error");
    return false;
  }
  openBatchPC("cmd");
  const worker = state.batchWorker;
  if (!worker) return false;
  const code = state.files.get(filename) ?? "";
  state.snapshots.set(filename, code);
  renderTabs();
  state.batchRunKind = "script";
  state.batchRunning = true;
  updateRunButtons();
  worker.postMessage({
    type: "run",
    filename,
    code,
    ...batchWorkspaceSnapshot(),
  });
  return true;
}

function runActive() {
  if (!state.active) {
    toast("Open a file first.", "error");
    return;
  }
  const language = languageFor(state.active);
  if (language === "python") {
    return runPythonFile(state.active);
  } else if (language === "javascript") {
    if (state.jsRunning) {
      toast("Already running.");
      return;
    }
    runJavaScript(state.active);
  } else if (language === "lua") {
    runLuaFile(state.active);
  } else if (language === "sql") {
    runSqlFile(state.active);
  } else if (language === "shell") {
    runShellFile(state.active);
  } else if (language === "batch") {
    runBatchFile(state.active);
  } else if (language === "html") {
    runHtmlFile(state.active);
  } else {
    toast(`${languageLabel(language)} files are editing-only — Run supports Python, JavaScript, Lua, SQL, Shell, Batch, and HTML preview.`);
  }
}

function focusTerminalInput() {
  showConsole("terminal");
  dom.promptInput.focus({ preventScroll: true });
}

function normalizeProgramStdin(stdin) {
  if (Array.isArray(stdin)) return stdin.map(String);
  if (stdin === undefined || stdin === null || stdin === "") return [];
  const lines = String(stdin).replace(/\r\n?/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

async function runPythonFile(name, stdin, options = {}) {
  if (!state.files.has(name)) return false;
  snapshotActive();
  return runFile(name, normalizeProgramStdin(stdin), options);
}

async function runFile(name, stdin, options = {}) {
  if (!state.files.has(name)) return false;
  if (state.pipInstalling) {
    toast("Wait for pip installation to finish.");
    return false;
  }
  if (state.running || state.pendingRun || state.pythonRunStarting) {
    toast("A Python program is already running.");
    return false;
  }

  snapshotActive();
  showConsole("terminal");
  if (!options.fromShell) writeTerminal(`${shell?.promptText() || "guest@pyide:~$"} python ${name}`, "cmd");
  state.stdinPending = false;
  state.stdinChannel = null;
  state.pythonRunStarting = true;
  refreshPrompt();
  updateRunButtons();

  try {
    await ensureRuntime();
    if (state.pipInstalling) {
      writeTerminal("Python: wait for pip installation to finish.\n", "err");
      return false;
    }
    if (state.running || state.pendingRun) {
      writeTerminal("Python: another program is already running.\n", "err");
      return false;
    }
    if (state.runtime !== "ready" || !state.worker) {
      writeTerminal("Python runtime is unavailable.\n", "err");
      return false;
    }

    snapshotActive();
    const code = state.files.get(name) ?? "";
    state.snapshots.set(name, code);
    renderTabs();
    state.stdinChannel = createProgramStdinChannel();

    return await new Promise((resolve) => {
      state.pendingRun = resolve;
      refreshPrompt();
      updateRunButtons();
      state.worker.postMessage({
        type: "run",
        entry: name,
        code,
        stdin,
        stdinBuffer: state.stdinChannel?.buffer ?? null,
        files: Object.fromEntries(state.files),
      });
    });
  } finally {
    state.pythonRunStarting = false;
    if (!state.pendingRun) {
      state.stdinChannel = null;
      state.stdinPending = false;
      restoreTerminalPrompt();
    }
    refreshPrompt();
    updateRunButtons();
  }
}

async function runShellFile(name) {
  if (!shell) {
    toast("The shell is still starting…");
    return;
  }
  const code = state.files.get(name) ?? "";
  showConsole("terminal");
  writeTerminal(` ${name}`, "cmd");
  for (const line of String(code).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    await shell.execute(line);
  }
  writeTerminal("Shell script finished.", "ok");
}

function runHtmlFile(name) {
  const code = state.files.get(name) ?? "";
  const blob = new Blob([code], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    toast("Popup blocked — allow popups for the preview.", "error");
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast("Opened HTML preview.", "ok");
}

function finishRun(data) {
  const seconds = ((data.ms || 0) / 1000).toFixed(2);
  writeTerminal(
    data.ok ? `Process finished in ${seconds}s\n` : `Process exited with errors after ${seconds}s\n`,
    data.ok ? "ok" : "err"
  );

  mergeRunFiles(data.files || {});
  renderTabs();
  renderFileList();
  renderBreadcrumbs();
  scheduleSave();
}
function mergeRunFiles(returned) {
  for (const [name, content] of Object.entries(returned)) {
    if (!state.files.has(name)) {
      state.files.set(name, content);
      if (state.editor) {
        try {
          state.models.get(name)?.dispose();
        } catch {
          /* noop */
        }
      }
      toast(`Python created ${name}`, "ok");
      continue;
    }

    const current = state.files.get(name) ?? "";
    if (current === content) continue;

    const model = state.models.get(name);
    if (model && !model.isDisposed() && state.active === name) {
      const edited = model.getValue();
      if (edited !== current) continue; // user typed during the run — keep their text
      model.setValue(content);
    }
    state.files.set(name, content);
  }

  for (const name of [...state.files.keys()]) {
    if (!(name in returned)) {
      state.files.delete(name);
      state.models.get(name)?.dispose();
      state.models.delete(name);
      state.openTabs = state.openTabs.filter((item) => item !== name);
      if (state.active === name) state.active = state.openTabs[0] || null;
    }
  }

  syncEditor();
}

/* ==========================================================================
 * Console panels
 * ========================================================================== */

function showPanel(name) {
  state.panel = name;

  for (const tab of document.querySelectorAll(".console-tab")) {
    const active = tab.dataset.panel === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  for (const panel of document.querySelectorAll(".panel")) {
    const active = panel.id === `panel-${name}`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  }

  const badge = $(`badge-${name}`);
  if (badge) badge.hidden = true;

  const clearButton = $("btn-clear");
  const clearLabel = "Clear terminal";
  clearButton.title = clearLabel;
  clearButton.setAttribute("aria-label", clearLabel);
  clearButton.hidden = name !== "terminal";

  if (name === "canvas") requestAnimationFrame(fitCanvas);
  scheduleSave();
}

function showConsole(panel = state.panel) {
  dom.app.classList.remove("console-hidden");
  if (!["terminal", "canvas", "window"].includes(panel)) panel = "terminal";
  showPanel(panel);
  if (panel === "terminal") dom.promptInput.focus({ preventScroll: true });
}

for (const tab of document.querySelectorAll(".console-tab")) {
  tab.addEventListener("click", () => {
    dom.app.classList.remove("console-hidden");
    showPanel(tab.dataset.panel);
  });
}

$("btn-hide-console").addEventListener("click", () => {
  dom.app.classList.add("console-hidden");
});

/* ==========================================================================
 * Layout: sidebar, resizer, canvas fit
 * ========================================================================== */

$("btn-sidebar").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 840px)").matches) {
    dom.app.classList.toggle("sidebar-open");
  } else {
    dom.app.classList.toggle("sidebar-hidden");
  }
});

dom.sidebarScrim.addEventListener("click", () => dom.app.classList.remove("sidebar-open"));

function applyConsoleHeight(height) {
  const max = Math.max(140, Math.round(window.innerHeight * 0.72));
  const clamped = Math.max(120, Math.min(max, height));
  state.consoleHeight = clamped;
  dom.app.style.setProperty("--console-h", `${clamped}px`);
}

dom.resizer.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dom.resizer.setPointerCapture(event.pointerId);
  dom.resizer.classList.add("is-dragging");
  const startY = event.clientY;
  const startHeight = dom.console.getBoundingClientRect().height;

  const move = (moveEvent) => {
    applyConsoleHeight(startHeight - (moveEvent.clientY - startY));
  };
  const up = () => {
    dom.resizer.classList.remove("is-dragging");
    dom.resizer.removeEventListener("pointermove", move);
    dom.resizer.removeEventListener("pointerup", up);
    scheduleSave();
  };

  dom.resizer.addEventListener("pointermove", move);
  dom.resizer.addEventListener("pointerup", up);
});

dom.resizer.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    applyConsoleHeight(state.consoleHeight + 24);
    scheduleSave();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    applyConsoleHeight(state.consoleHeight - 24);
    scheduleSave();
  }
});

window.addEventListener("resize", () => requestAnimationFrame(fitCanvas));

/* ==========================================================================
 * New / import / export
 * ========================================================================== */

dom.btnNew.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu(dom.newMenu, dom.btnNew);
});

dom.newMenu.addEventListener("click", async (event) => {
  const template = event.target.closest("[data-template]")?.dataset.template;
  if (!template) return;
  closeMenus();

  const preset = TEMPLATES[template] || TEMPLATES.blank;
  const name = await askText({
    title: template === "blank" ? "New file" : "New file from template",
    label: "File name",
    value: preset.name,
    hint: template === "blank" ? "" : "A new file will be created with a runnable example.",
    confirm: "Create",
  });
  if (name === null) return;
  createFile(name.trim(), template === "blank" ? `# ${name.trim()}\n\n` : preset.content);
});

$("btn-empty-new").addEventListener("click", () => dom.btnNew.click());

dom.btnImport.addEventListener("click", () => dom.fileInput.click());

dom.fileInput.addEventListener("change", async () => {
  const files = [...(dom.fileInput.files || [])];
  dom.fileInput.value = "";
  for (const file of files) {
    try {
      const text = await file.text();
      let name = file.name;
      let counter = 2;
      while (state.files.has(name)) {
        const dot = file.name.lastIndexOf(".");
        name = dot > 0
          ? `${file.name.slice(0, dot)}_${counter}${file.name.slice(dot)}`
          : `${file.name}_${counter}`;
        counter += 1;
      }
      state.files.set(name, text);
      openFile(name);
    } catch {
      toast(`Could not read ${file.name}`, "error");
    }
  }
  renderFileList();
  renderTabs();
  scheduleSave();
});

function downloadFile(name) {
  const content = state.files.get(name) ?? "";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name.split("/").pop() || "file.py";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

dom.btnExport.addEventListener("click", () => {
  if (!state.active) return toast("Open a file first.", "error");
  snapshotActive();
  downloadFile(state.active);
  toast(`Downloaded ${state.active}`, "ok");
});

/* ==========================================================================
 * Run/stop wiring
 * ========================================================================== */

function commitTerminalUsername(value) {
  if (!saveSessionUsername(value)) return false;
  saveSettings();
  applySettings();
  dom.usernameDialog?.close();
  dom.promptInput?.focus();
  return true;
}

dom.usernameForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = normalizeUsername(dom.usernameInput?.value);
  if (!username) {
    dom.usernameInput?.setCustomValidity("Choose 1–32 characters: start with a letter or underscore, then use letters, numbers, dots, underscores, or hyphens.");
    dom.usernameInput?.reportValidity();
    return;
  }
  dom.usernameInput?.setCustomValidity("");
  commitTerminalUsername(username);
});
dom.usernameInput?.addEventListener("input", () => dom.usernameInput?.setCustomValidity(""));
$("username-guest")?.addEventListener("click", () => commitTerminalUsername(DEFAULT_USERNAME));

dom.btnRun.addEventListener("click", runActive);
dom.btnSettings?.addEventListener("click", () => {
  syncSettingsForm();
  dom.settingsDialog?.showModal();
});
dom.settingsForm?.addEventListener("input", (event) => {
  const field = event.target.closest('[data-setting="username"]');
  field?.setCustomValidity("");
});
dom.settingsForm?.addEventListener("change", (event) => {
  const field = event.target.closest("[data-setting]");
  if (!field || !(field.dataset.setting in DEFAULT_SETTINGS)) return;
  const key = field.dataset.setting;
  if (key === "username") {
    const username = normalizeUsername(field.value);
    if (!username) {
      field.setCustomValidity("Use 1–32 characters: start with a letter or underscore, then use letters, numbers, dots, underscores, or hyphens.");
      field.reportValidity();
      return;
    }
    field.setCustomValidity("");
    saveSessionUsername(username);
  } else if (field.type === "checkbox") settings[key] = field.checked;
  else if (field.type === "number") {
    const entered = Number(field.value);
    const value = Number.isFinite(entered) ? entered : Number(DEFAULT_SETTINGS[key]);
    const minimum = field.min === "" ? Number.NEGATIVE_INFINITY : Number(field.min);
    const maximum = field.max === "" ? Number.POSITIVE_INFINITY : Number(field.max);
    settings[key] = Math.min(maximum, Math.max(minimum, value));
    field.value = String(settings[key]);
  } else settings[key] = field.value;
  saveSettings();
  applySettings();
});
dom.settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettings();
  applySettings();
  dom.settingsDialog?.close();
});
$("settings-close")?.addEventListener("click", () => dom.settingsDialog?.close());
$("settings-reset")?.addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
  saveSessionUsername(DEFAULT_USERNAME);
  saveSettings();
  applySettings();
  syncSettingsForm();
  toast("Settings reset", "ok");
});
$("btn-copy-debug")?.addEventListener("click", () => {
  const info = JSON.stringify({ snapshot: window.__pyideDebug.snapshot(), log: window.__pyideDebug.log }, null, 2);
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(info).then(() => toast("Debug info copied.", "ok")).catch(() => toast("Copy failed.", "error"));
  } else {
    const ta = document.createElement("textarea");
    ta.value = info;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Debug info copied.", "ok");
  }
});
dom.statusLanguage?.addEventListener("change", () => {
  if (!state.active) return;
  state.languages[state.active] = dom.statusLanguage.value;
  refreshLanguage();
  scheduleSave();
});
dom.btnDocs?.addEventListener("click", () => {
  const language = languageFor(state.active);
  const url = LANGUAGE_DOCS[language];
  if (url) window.open(url, "_blank", "noopener");
  else toast("No documentation link for this language.", "error");
});
dom.btnBatchPc?.addEventListener("click", () => openBatchPC("cmd"));
dom.batchPcClose?.addEventListener("click", () => dom.batchPcDialog?.close());
dom.batchStart?.addEventListener("click", () => {
  const expanded = dom.batchStart.getAttribute("aria-expanded") === "true";
  dom.batchStartMenu.hidden = expanded;
  dom.batchStart.setAttribute("aria-expanded", String(!expanded));
});
dom.batchPcDialog?.addEventListener("click", (event) => {
  const calculatorButton = event.target.closest("[data-calc-digit], [data-calc-operation], [data-calc-action]");
  if (calculatorButton) {
    handleBatchCalculatorButton(calculatorButton);
    return;
  }
  const appButton = event.target.closest("[data-batch-app]");
  if (appButton) {
    openBatchApp(appButton.dataset.batchApp);
    return;
  }
  if (!event.target.closest("#batch-start, #batch-start-menu")) {
    dom.batchStartMenu.hidden = true;
    dom.batchStart.setAttribute("aria-expanded", "false");
  }
});
dom.batchPcDialog?.addEventListener("close", () => {
  dom.batchStartMenu.hidden = true;
  dom.batchStart?.setAttribute("aria-expanded", "false");
  if (state.batchRunning) state.batchWorker?.postMessage({ type: "stop" });
});
dom.batchCommandForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  runBatchCommand(dom.batchCommandInput.value);
});
dom.batchStop?.addEventListener("click", () => {
  if (!state.batchRunning) return;
  state.batchWorker?.postMessage({ type: "stop" });
  appendBatchOutput("Stop requested.\n", "system");
});
dom.batchCreateScript?.addEventListener("click", createBatchScript);
dom.batchNotepadOpen?.addEventListener("click", () => {
  if (!state.active) {
    toast("Open a file from Files first.");
    openBatchApp("files");
    return;
  }
  const filename = state.active;
  dom.batchPcDialog?.close();
  openFile(filename);
});

dom.btnStop.addEventListener("click", () => {
  if (state.batchRunning && state.batchWorker) {
    state.batchWorker.postMessage({ type: "stop" });
    appendBatchOutput("Stop requested.\n", "system");
    return;
  }
  if (state.jsRunning && state.jsWorker) {
    state.jsWorker.terminate();
    state.jsWorker = null;
    state.jsRunning = false;
    updateRunButtons();
    dom.statusRuntime.textContent = `Python ${state.pyVersion} · WebAssembly`;
    writeTerminal("JavaScript run stopped.", "sys");
  } else {
    stopRuntime("Runtime stopped.");
  }
});
dom.btnRestart.addEventListener("click", () => stopRuntime("Runtime restarted.", { restart: true }));

dom.btnRunMenu.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu(dom.runMenu, dom.btnRunMenu);
});

dom.runMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-run]")?.dataset.run;
  if (!action) return;
  closeMenus();
  if (action === "terminal") focusTerminalInput();
  else runActive();
});

$("btn-clear").addEventListener("click", clearActiveOutput);

/* ==========================================================================
 * Keyboard shortcuts
 * ========================================================================== */

document.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) {
    if (event.key === "Escape") closeMenus();
    if (event.key === "F2" && state.active) {
      event.preventDefault();
      renameFile(state.active);
    }
    return;
  }

  if (event.key.toLowerCase() === "n" && !event.shiftKey) {
    event.preventDefault();
    (async () => {
      const name = await askText({ title: "New file", label: "File name", value: "untitled.txt", confirm: "Create" });
      if (name === null) return;
      createFile(name.trim(), "");
    })();
    return;
  }
  if (event.key.toLowerCase() === "w" && !event.shiftKey) {
    event.preventDefault();
    if (state.active) closeTab(state.active);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    if (!state.openTabs.length) return;
    const delta = event.shiftKey ? -1 : 1;
    const index = state.openTabs.indexOf(state.active);
    const next = (index + delta + state.openTabs.length) % state.openTabs.length;
    const name = state.openTabs[next];
    if (name) edgeActivate(name);
    return;
  }
  if (event.key.toLowerCase() === "m" && event.shiftKey) {
    event.preventDefault();
    pickLanguage();
    return;
  }
  // Ctrl+K M -> select language (VS Code style)
  if (event.key.toLowerCase() === "k" && !event.shiftKey) {
    // wait for M
    const handler = (e) => {
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        pickLanguage();
      }
      document.removeEventListener("keydown", handler);
    };
    document.addEventListener("keydown", handler);
    setTimeout(() => document.removeEventListener("keydown", handler), 2000);
    return;
  }
  if (event.key.toLowerCase() === "s" && !event.shiftKey) {
    event.preventDefault();
    scheduleSave();
    toast("Workspace saved in this browser.", "ok");
    return;
  }
  if (event.key.toLowerCase() === "b" && !event.shiftKey) {
    event.preventDefault();
    $("btn-sidebar").click();
    return;
  }
  if (event.key === "`") {
    event.preventDefault();
    dom.app.classList.toggle("console-hidden");
    return;
  }
  if (event.key === "," && !event.shiftKey) {
    event.preventDefault();
    dom.btnSettings?.click();
    return;
  }
  if (event.key.toLowerCase() === "p" && event.shiftKey) {
    event.preventDefault();
    openPalette();
    return;
  }

  if (event.key === "Enter" && !event.shiftKey && !event.target.closest(".monaco-editor")) {
    event.preventDefault();
    runActive();
  } else if (event.key === "Enter" && event.shiftKey && !event.target.closest(".monaco-editor")) {
    event.preventDefault();
    focusTerminalInput();
  }
});

function quickOpen() {
  const name = window.prompt("Open file:\n" + [...state.files.keys()].join("\n"));
  if (!name) return;
  const trimmed = name.trim();
  if (state.files.has(trimmed)) openFile(trimmed);
  else toast(`${trimmed}: no such file`, "error");
}


/* ==========================================================================
 * Boot
 * ========================================================================== */

/* ==========================================================================
 * Command palette, breadcrumbs, formatting
 * ========================================================================== */

const PALETTE_COMMANDS = [
  { icon: "▶", label: "Run active file", run: () => runActive() },
  { icon: "⌨", label: "Focus terminal input", run: () => focusTerminalInput() },
  { icon: "+", label: "New file", run: () => dom.btnNew.click() },
  { icon: "⚙", label: "Open settings", run: () => dom.btnSettings.click() },
  { icon: "◐", label: "Toggle theme", run: () => { settings.theme = settings.theme === "dark" ? "light" : "dark"; saveSettings(); applySettings(); } },
  { icon: "✨", label: "Format document", run: () => formatDocument() },
  { icon: "🧹", label: "Clear terminal", run: () => clearTerminal() },
  { icon: "↺", label: "Reset workspace", run: () => resetWorkspace() },
  { icon: "📁", label: "Toggle sidebar", run: () => $("btn-sidebar").click() },
  { icon: " “", label: "Toggle console", run: () => dom.app.classList.toggle("console-hidden") },
  { icon: "⬇", label: "Download active file", run: () => dom.btnExport.click() },
  { icon: "🌐", label: "Open language docs", run: () => { const u = LANGUAGE_DOCS[languageFor(state.active)]; if (u) window.open(u, "_blank", "noopener"); } },
];

let paletteIndex = 0;

function renderBreadcrumbs() {
  if (!dom.breadcrumbs) return;
  if (!state.active) {
    dom.breadcrumbs.textContent = "";
    dom.breadcrumbs.hidden = true;
    return;
  }
  dom.breadcrumbs.hidden = false;
  dom.breadcrumbs.textContent = state.active;
}

let langPickerIndex = 0;
let langPickerItems = [];

function renderLangPicker(filter = "") {
  if (!dom.langList) return;
  const q = filter.trim().toLowerCase();
  langPickerItems = Object.entries(LANGUAGE_DEFS)
    .filter(([id, def]) => !q || def.label.toLowerCase().includes(q) || id.includes(q))
    .sort((a, b) => a[1].label.localeCompare(b[1].label));
  dom.langList.replaceChildren();
  langPickerItems.forEach(([id, def], index) => {
    const li = document.createElement("li");
    li.className = `palette-item${index === langPickerIndex ? " is-active" : ""}`;
    const icon = document.createElement("span");
    icon.className = "palette-icon";
    icon.textContent = "•";
    const label = document.createElement("span");
    label.className = "palette-label";
    label.textContent = def.label;
    li.append(icon, label);
    li.addEventListener("click", () => {
      dom.langDialog.close();
      state.languages[state.active] = id;
      refreshLanguage();
      scheduleSave();
      toast(`Language set to ${def.label}.`, "ok");
    });
    dom.langList.append(li);
  });
  if (langPickerIndex >= langPickerItems.length) langPickerIndex = Math.max(0, langPickerItems.length - 1);
}

function pickLanguage() {
  if (!dom.langDialog || !state.active) {
    toast("Open a file first.", "error");
    return;
  }
  langPickerIndex = 0;
  renderLangPicker("");
  if (dom.langFilter) dom.langFilter.value = "";
  dom.langDialog.showModal();
  dom.langFilter?.focus();
}

dom.langFilter?.addEventListener("input", (event) => {
  langPickerIndex = 0;
  renderLangPicker(event.target.value);
});
dom.langFilter?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    langPickerIndex = Math.min(langPickerItems.length - 1, langPickerIndex + 1);
    renderLangPicker(dom.langFilter.value);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    langPickerIndex = Math.max(0, langPickerIndex - 1);
    renderLangPicker(dom.langFilter.value);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const item = langPickerItems[langPickerIndex];
    if (item) {
      dom.langDialog.close();
      state.languages[state.active] = item[0];
      refreshLanguage();
      scheduleSave();
      toast(`Language set to ${item[1].label}.`, "ok");
    }
  }
});
dom.langDialog?.addEventListener("close", () => {});

function openPalette() {
  if (!dom.palette) return;
  dom.paletteInput.value = "";
  paletteIndex = 0;
  renderPalette("");
  dom.palette.showModal();
  dom.paletteInput.focus();
}

function renderPalette(query) {
  if (!dom.paletteList) return;
  const q = query.trim().toLowerCase();
  const items = PALETTE_COMMANDS.filter((command) => !q || command.label.toLowerCase().includes(q));
  dom.paletteList.replaceChildren();
  items.forEach((command, index) => {
    const li = document.createElement("li");
    li.className = `palette-item${index === paletteIndex ? " is-active" : ""}`;
    const icon = document.createElement("span");
    icon.className = "palette-icon";
    icon.textContent = command.icon || "•";
    const label = document.createElement("span");
    label.className = "palette-label";
    label.textContent = command.label;
    li.append(icon, label);
    li.addEventListener("click", () => {
      dom.palette.close();
      command.run();
    });
    dom.paletteList.append(li);
  });
  if (paletteIndex >= items.length) paletteIndex = Math.max(0, items.length - 1);
}

async function loadPrettier() {
  if (window.prettier) return;
  const sources = [
    "https://cdn.jsdelivr.net/npm/prettier@3.3.3/standalone.js",
    "https://cdn.jsdelivr.net/npm/prettier@3.3.3/plugins/babel.js",
    "https://cdn.jsdelivr.net/npm/prettier@3.3.3/plugins/html.js",
    "https://cdn.jsdelivr.net/npm/prettier@3.3.3/plugins/postcss.js",
    "https://cdn.jsdelivr.net/npm/prettier@3.3.3/plugins/markdown.js",
  ];
  await Promise.all(sources.map((src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  })));
}

async function formatDocument() {
  if (!state.active || !state.editor || state.editor.fallback) {
    toast("Open a file in the Monaco editor first.", "error");
    return;
  }
  const language = languageFor(state.active);
  const parserByLanguage = {
    javascript: "babel",
    typescript: "typescript",
    html: "html",
    css: "css",
    json: "json",
    markdown: "markdown",
  };
  const parser = parserByLanguage[language];
  if (!parser) {
    toast(`No formatter for ${languageLabel(language)}.`, "error");
    return;
  }
  try {
    await loadPrettier();
    const plugins = Object.values(window.prettierPlugins || {});
    const output = window.prettier.format(state.editor.getValue(), { parser, plugins });
    state.editor.setValue(output);
    toast("Formatted.", "ok");
  } catch (error) {
    toast(`Format failed: ${error?.message || error}`, "error");
  }
}

// palette wiring
dom.palette?.addEventListener("close", () => {});
dom.paletteInput?.addEventListener("input", (event) => {
  paletteIndex = 0;
  renderPalette(event.target.value);
});
dom.paletteInput?.addEventListener("keydown", (event) => {
  const items = [...(dom.paletteList?.children || [])];
  if (event.key === "ArrowDown") {
    event.preventDefault();
    paletteIndex = Math.min(items.length - 1, paletteIndex + 1);
    renderPalette(dom.paletteInput.value);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    paletteIndex = Math.max(0, paletteIndex - 1);
    renderPalette(dom.paletteInput.value);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const visible = PALETTE_COMMANDS.filter((command) => !dom.paletteInput.value.trim() || command.label.toLowerCase().includes(dom.paletteInput.value.trim().toLowerCase()));
    const command = visible[paletteIndex];
    if (command) {
      dom.palette.close();
      command.run();
    }
  }
});

renderBreadcrumbs();


/* ==========================================================================
 * Language completion providers (IntelliSense dropdowns)
 * ========================================================================== */

const LANGUAGE_COMPLETIONS = {
  javascript: {
    keywords: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","try","catch","finally","throw","new","class","extends","import","export","default","async","await","yield","typeof","instanceof","in","of","null","undefined","true","false","this","super"],
    snippets: [
      { label: "clg", insertText: "console.log(${1});", detail: "console.log" },
      { label: "fn", insertText: "function ${1:name}(${2}) {\n  ${3}\n}", detail: "function" },
      { label: "afn", insertText: "const ${1:name} = (${2}) => {\n  ${3}\n};", detail: "arrow function" },
      { label: "forof", insertText: "for (const ${1:item} of ${2:items}) {\n  ${3}\n}", detail: "for...of" },
      { label: "fori", insertText: "for (let i = 0; i < ${1:n}; i++) {\n  ${2}\n}", detail: "for loop" },
      { label: "trycatch", insertText: "try {\n  ${1}\n} catch (e) {\n  ${2}\n}", detail: "try/catch" },
    ],
  },
  typescript: {
    keywords: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","try","catch","finally","throw","new","class","extends","import","export","default","async","await","yield","typeof","instanceof","in","of","null","undefined","true","false","this","super","interface","type","enum","implements","readonly","private","public","protected","as","keyof","never","unknown","any","void"],
    snippets: [
      { label: "clg", insertText: "console.log(${1});", detail: "console.log" },
      { label: "iface", insertText: "interface ${1:Name} {\n  ${2}\n}", detail: "interface" },
      { label: "type", insertText: "type ${1:Name} = ${2};", detail: "type alias" },
    ],
  },
  c: {
    keywords: ["auto","break","case","char","const","continue","default","do","double","else","enum","extern","float","for","goto","if","int","long","register","return","short","signed","sizeof","static","struct","switch","typedef","union","unsigned","void","volatile","while","#include","#define","#ifdef","#ifndef","#endif","#pragma"],
    snippets: [
      { label: "main", insertText: "int main(void) {\n  ${1}\n  return 0;\n}", detail: "main function" },
      { label: "inc", insertText: "#include <${1:stdio.h}>", detail: "include" },
      { label: "fori", insertText: "for (int i = 0; i < ${1:n}; i++) {\n  ${2}\n}", detail: "for loop" },
      { label: "printf", insertText: "printf(\"${1:%s}\\n\", ${2});", detail: "printf" },
    ],
  },
  cpp: {
    keywords: ["alignas","alignof","and","and_eq","asm","auto","bitand","bitor","bool","break","case","catch","char","char8_t","char16_t","char32_t","class","compl","concept","const","consteval","constexpr","constinit","const_cast","continue","co_await","co_return","co_yield","decltype","default","delete","do","double","dynamic_cast","else","enum","explicit","export","extern","false","float","for","friend","goto","if","inline","int","long","mutable","namespace","new","noexcept","not","not_eq","nullptr","operator","or","or_eq","private","protected","public","register","reinterpret_cast","requires","return","short","signed","sizeof","static","static_assert","static_cast","struct","switch","template","this","thread_local","throw","true","try","typedef","typeid","typename","union","unsigned","using","virtual","void","volatile","wchar_t","while","xor","xor_eq","#include"],
    snippets: [
      { label: "main", insertText: "int main() {\n  ${1}\n  return 0;\n}", detail: "main function" },
      { label: "inc", insertText: "#include <${1:iostream}>", detail: "include" },
      { label: "cout", insertText: "std::cout << ${1} << std::endl;", detail: "cout" },
      { label: "class", insertText: "class ${1:Name} {\npublic:\n  ${2}\n};", detail: "class" },
    ],
  },
  java: {
    keywords: ["abstract","assert","boolean","break","byte","case","catch","char","class","const","continue","default","do","double","else","enum","extends","final","finally","float","for","goto","if","implements","import","instanceof","int","interface","long","native","new","package","private","protected","public","return","short","static","strictfp","super","switch","synchronized","this","throw","throws","transient","try","void","volatile","while"],
    snippets: [
      { label: "main", insertText: "public static void main(String[] args) {\n  ${1}\n}", detail: "main method" },
      { label: "sout", insertText: "System.out.println(${1});", detail: "println" },
      { label: "class", insertText: "public class ${1:Name} {\n  ${2}\n}", detail: "class" },
      { label: "fori", insertText: "for (int i = 0; i < ${1:n}; i++) {\n  ${2}\n}", detail: "for loop" },
    ],
  },
  go: {
    keywords: ["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct","switch","type","var"],
    snippets: [
      { label: "main", insertText: "func main() {\n  ${1}\n}", detail: "main function" },
      { label: "fmt", insertText: "fmt.Println(${1})", detail: "println" },
      { label: "fori", insertText: "for i := 0; i < ${1:n}; i++ {\n  ${2}\n}", detail: "for loop" },
    ],
  },
  rust: {
    keywords: ["as","async","await","break","const","continue","crate","dyn","else","enum","extern","false","fn","for","if","impl","in","let","loop","match","mod","move","mut","pub","ref","return","self","Self","static","struct","super","trait","true","type","unsafe","use","where","while"],
    snippets: [
      { label: "main", insertText: "fn main() {\n  ${1}\n}", detail: "main function" },
      { label: "println", insertText: "println!(\"${1}\");", detail: "println!" },
      { label: "fori", insertText: "for i in 0..${1:n} {\n  ${2}\n}", detail: "for loop" },
    ],
  },
  shell: {
    keywords: ["if","then","else","elif","fi","for","while","do","done","case","esac","function","return","export","local","readonly","unset","shift","trap","source","alias","unalias","echo","printf","cd","pwd","ls","cat","grep","sed","awk","find","xargs","sort","uniq","head","tail","wc","mkdir","rm","cp","mv","chmod","chown","sudo","apt","pip","python","node","git"],
    snippets: [
      { label: "if", insertText: "if [ ${1} ]; then\n  ${2}\nfi", detail: "if statement" },
      { label: "for", insertText: "for i in ${1}; do\n  ${2}\ndone", detail: "for loop" },
      { label: "case", insertText: "case ${1} in\n  ${2})\n    ;;\nesac", detail: "case statement" },
    ],
  },
  batch: {
    keywords: ["@echo","off","echo","set","if","else","for","do","in","goto","call","exit","pause","rem","cls","cd","dir","type","copy","del","erase","move","ren","mkdir","rmdir","start","tasklist","taskkill","ping","ipconfig","systeminfo","title","color","ver","run"],
    snippets: [
      { label: "if", insertText: "if exist \"${1:file.txt}\" (\n  ${2:echo Found}\n)", detail: "if exist block" },
      { label: "for", insertText: "for %%i in (${1:one two three}) do (\n  echo %%i\n)", detail: "for loop" },
      { label: "forl", insertText: "for /L %%i in (1,1,${1:5}) do echo %%i", detail: "numeric loop" },
      { label: "setp", insertText: "set /p ${1:answer}=Enter a value: ", detail: "prompt for input" },
      { label: "seta", insertText: "set /a ${1:count}=0", detail: "integer variable" },
    ],
  },
  html: {
    keywords: [],
    snippets: [
      { label: "html5", insertText: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>${1:Document}</title>\n</head>\n<body>\n  ${2}\n</body>\n</html>", detail: "HTML5 boilerplate" },
      { label: "div", insertText: "<div>${1}</div>", detail: "div" },
      { label: "script", insertText: "<script>\n  ${1}\n</script>", detail: "script" },
      { label: "style", insertText: "<style>\n  ${1}\n</style>", detail: "style" },
    ],
  },
  css: {
    keywords: [],
    snippets: [
      { label: "flex", insertText: "display: flex;\njustify-content: center;\nalign-items: center;", detail: "flex center" },
      { label: "grid", insertText: "display: grid;\ngrid-template-columns: repeat(${1:3}, 1fr);", detail: "grid" },
      { label: "media", insertText: "@media (max-width: ${1:768px}) {\n  ${2}\n}", detail: "media query" },
    ],
  },
  json: {
    keywords: [],
    snippets: [
      { label: "obj", insertText: "{\n  \"${1:key}\": ${2:\"value\"}\n}", detail: "object" },
    ],
  },
  markdown: {
    keywords: [],
    snippets: [
      { label: "code", insertText: "```${1:js}\n${2}\n```", detail: "code block" },
      { label: "link", insertText: "[${1:text}](${2:url})", detail: "link" },
      { label: "table", insertText: "| ${1:Col} | ${2:Col} |\n|---|---|\n| ${3} | ${4} |", detail: "table" },
    ],
  },
  powershell: {
    keywords: ["param","function","filter","class","enum","using","begin","process","end","if","elseif","else","switch","foreach","for","while","do","try","catch","finally","throw","return","break","continue","Write-Output","Write-Host","Get-ChildItem","Get-Content","Set-Content","New-Item","Remove-Item","Get-Process","Where-Object","ForEach-Object","Get-LocalUser","New-LocalUser"],
    snippets: [
      { label: "function", insertText: "function ${1:Verb-Noun} {\n  param(${2})\n  ${3}\n}", detail: "function" },
      { label: "foreach", insertText: "foreach ($${1:item} in $${2:items}) {\n  ${3}\n}", detail: "foreach loop" },
      { label: "try", insertText: "try {\n  ${1}\n} catch {\n  ${2}\n} finally {\n  ${3}\n}", detail: "try/catch/finally" },
    ],
  },
  sql: {
    keywords: ["SELECT","FROM","WHERE","JOIN","LEFT JOIN","RIGHT JOIN","INNER JOIN","GROUP BY","ORDER BY","HAVING","LIMIT","OFFSET","INSERT INTO","VALUES","UPDATE","SET","DELETE FROM","CREATE TABLE","ALTER TABLE","DROP TABLE","WITH","AS","DISTINCT","UNION","CASE","WHEN","THEN","ELSE","END","NULL","PRIMARY KEY","FOREIGN KEY","NOT NULL","AND","OR","IN","BETWEEN","LIKE","COUNT","SUM","AVG","MIN","MAX","ASC","DESC","BEGIN","COMMIT","ROLLBACK"],
    snippets: [
      { label: "select", insertText: "SELECT ${1:column}\nFROM ${2:table}\nWHERE ${3:condition};", detail: "SELECT query" },
      { label: "cte", insertText: "WITH ${1:items} AS (\n  SELECT ${2:column}\n  FROM ${3:table}\n)\nSELECT * FROM ${1:items};", detail: "common table expression" },
      { label: "create-table", insertText: "CREATE TABLE ${1:table_name} (\n  id INTEGER PRIMARY KEY,\n  ${2:column_name} TEXT NOT NULL\n);", detail: "create table" },
    ],
  },
  lua: {
    keywords: ["and","break","do","else","elseif","end","false","for","function","goto","if","in","local","nil","not","or","repeat","return","then","true","until","while","pairs","ipairs","print","require","tostring","type","table","math","string","io"],
    snippets: [
      { label: "function", insertText: "local function ${1:name}(${2})\n  ${3}\nend", detail: "local function" },
      { label: "pairs", insertText: "for ${1:key}, ${2:value} in pairs(${3:table}) do\n  ${4}\nend", detail: "pairs loop" },
      { label: "main", insertText: "local function main()\n  ${1}\nend\n\nmain()", detail: "main function" },
    ],
  },
  php: {
    keywords: ["abstract","and","array","as","break","callable","case","catch","class","clone","const","continue","declare","default","do","echo","else","elseif","empty","endfor","endforeach","endif","endswitch","endwhile","enum","extends","false","final","finally","fn","for","foreach","function","global","if","implements","include","instanceof","interface","match","namespace","new","null","or","private","protected","public","readonly","require","return","static","switch","throw","trait","true","try","use","var","while","yield"],
    snippets: [
      { label: "php", insertText: "<?php\n${1}\n", detail: "PHP opening tag" },
      { label: "function", insertText: "function ${1:name}(${2}) {\n  ${3}\n}", detail: "function" },
      { label: "foreach", insertText: "foreach (${1:$items} as ${2:$item}) {\n  ${3}\n}", detail: "foreach loop" },
    ],
  },
  ruby: {
    keywords: ["alias","and","begin","break","case","class","def","defined?","do","else","elsif","end","ensure","false","for","if","in","module","next","nil","not","or","redo","rescue","retry","return","self","super","then","true","undef","unless","until","when","while","yield","puts","require"],
    snippets: [
      { label: "def", insertText: "def ${1:name}(${2})\n  ${3}\nend", detail: "method" },
      { label: "class", insertText: "class ${1:Name}\n  def initialize(${2})\n    ${3}\n  end\nend", detail: "class" },
      { label: "each", insertText: "${1:items}.each do |${2:item}|\n  ${3}\nend", detail: "each block" },
    ],
  },
  csharp: {
    keywords: ["abstract","as","async","await","base","bool","break","byte","case","catch","char","class","const","continue","decimal","delegate","do","double","else","enum","event","explicit","extern","false","finally","float","for","foreach","if","implicit","in","int","interface","internal","is","lock","namespace","new","null","object","operator","out","override","params","private","protected","public","readonly","ref","return","sealed","static","string","struct","switch","this","throw","true","try","using","var","virtual","void","while","Console.WriteLine"],
    snippets: [
      { label: "main", insertText: "static void Main(string[] args)\n{\n  ${1}\n}", detail: "main method" },
      { label: "cw", insertText: "Console.WriteLine(${1});", detail: "write line" },
      { label: "class", insertText: "public class ${1:Name}\n{\n  ${2}\n}", detail: "class" },
    ],
  },
  yaml: {
    keywords: ["true","false","null","yes","no","on","off"],
    snippets: [
      { label: "list", insertText: "- ${1:item}\n- ${2:item}", detail: "YAML list" },
      { label: "mapping", insertText: "${1:key}:\n  ${2:property}: ${3:value}", detail: "nested mapping" },
    ],
  },
  xml: {
    keywords: ["xml version","encoding","xmlns","xmlns:xsi","xsi:schemaLocation"],
    snippets: [
      { label: "xml", insertText: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<${1:root}>\n  ${2}\n</${1:root}>", detail: "XML document" },
      { label: "element", insertText: "<${1:element}>${2}</${1:element}>", detail: "element" },
    ],
  },
  swift: {
    keywords: ["associatedtype","class","deinit","enum","extension","fileprivate","func","import","init","inout","internal","let","open","operator","private","protocol","public","rethrows","static","struct","subscript","typealias","var","where","while","guard","defer","if","else","for","in","return","throw","try","await","async","print"],
    snippets: [
      { label: "func", insertText: "func ${1:name}(${2})${3: -> Void} {\n  ${4}\n}", detail: "function" },
      { label: "struct", insertText: "struct ${1:Name} {\n  ${2}\n}", detail: "struct" },
      { label: "guard", insertText: "guard ${1:condition} else {\n  return\n}", detail: "guard statement" },
    ],
  },
  kotlin: {
    keywords: ["as","break","class","continue","do","else","false","for","fun","if","in","interface","is","null","object","package","return","super","this","throw","true","try","typealias","typeof","val","var","when","while","suspend","data","sealed","override","println"],
    snippets: [
      { label: "fun", insertText: "fun ${1:name}(${2}): ${3:Unit} {\n  ${4}\n}", detail: "function" },
      { label: "data-class", insertText: "data class ${1:Name}(\n  val ${2:field}: ${3:String}\n)", detail: "data class" },
      { label: "main", insertText: "fun main() {\n  ${1}\n}", detail: "main function" },
    ],
  },
  r: {
    keywords: ["function","if","else","repeat","while","for","in","next","break","TRUE","FALSE","NULL","NA","NaN","Inf","library","require","data.frame","c","list","print","return","apply","lapply","sapply","ggplot"],
    snippets: [
      { label: "function", insertText: "${1:name} <- function(${2}) {\n  ${3}\n}", detail: "function" },
      { label: "data-frame", insertText: "${1:data} <- data.frame(\n  ${2:column} = ${3:value}\n)", detail: "data frame" },
      { label: "pipe", insertText: "${1:data} |>\n  ${2:transform}()", detail: "native pipe" },
    ],
  },
  dart: {
    keywords: ["abstract","as","assert","async","await","break","case","catch","class","const","continue","default","do","else","enum","extends","false","final","finally","for","Function","if","implements","import","in","is","late","library","mixin","new","null","on","part","required","return","sealed","set","static","super","switch","this","throw","true","try","var","void","while","with","yield","print"],
    snippets: [
      { label: "main", insertText: "void main() {\n  ${1}\n}", detail: "main function" },
      { label: "class", insertText: "class ${1:Name} {\n  ${2}\n}", detail: "class" },
      { label: "async", insertText: "Future<${1:void}> ${2:load}() async {\n  ${3}\n}", detail: "async function" },
    ],
  },
  perl: {
    keywords: ["my","our","local","state","sub","package","use","require","if","elsif","else","unless","while","until","for","foreach","given","when","return","last","next","redo","die","eval","print","say","undef","strict","warnings"],
    snippets: [
      { label: "sub", insertText: "sub ${1:name} {\n  my (${2}) = @_;\n  ${3}\n}", detail: "subroutine" },
      { label: "foreach", insertText: "foreach my $${1:item} (@${2:items}) {\n  ${3}\n}", detail: "foreach loop" },
    ],
  },
  scala: {
    keywords: ["abstract","case","catch","class","def","do","else","enum","export","extends","false","final","finally","for","forSome","given","if","implicit","import","lazy","match","new","null","object","override","package","private","protected","return","sealed","super","then","this","throw","trait","true","try","type","val","var","while","yield","println"],
    snippets: [
      { label: "object", insertText: "object ${1:Main} {\n  def main(args: Array[String]): Unit = {\n    ${2}\n  }\n}", detail: "main object" },
      { label: "def", insertText: "def ${1:name}(${2}): ${3:Unit} = {\n  ${4}\n}", detail: "method" },
    ],
  },
  julia: {
    keywords: ["begin","break","catch","const","continue","do","else","elseif","end","export","false","finally","for","function","global","if","import","let","local","macro","module","mutable","nothing","primitive","quote","return","struct","true","try","using","where","while","println"],
    snippets: [
      { label: "function", insertText: "function ${1:name}(${2})\n  ${3}\nend", detail: "function" },
      { label: "for", insertText: "for ${1:item} in ${2:items}\n  ${3}\nend", detail: "for loop" },
    ],
  },
  fsharp: {
    keywords: ["abstract","and","as","assert","base","begin","class","default","delegate","do","done","downcast","downto","elif","else","end","exception","extern","false","finally","for","fun","function","global","if","in","inherit","inline","interface","let","match","member","module","mutable","namespace","new","null","of","open","or","override","private","public","rec","return","static","then","to","true","try","type","use","val","void","when","while","with","yield"],
    snippets: [
      { label: "let-fn", insertText: "let ${1:name} ${2:args} =\n    ${3}", detail: "function binding" },
      { label: "match", insertText: "match ${1:value} with\n| ${2:case} -> ${3}\n| _ -> ${4}", detail: "match expression" },
    ],
  },
  clojure: {
    keywords: ["def","defn","defonce","fn","let","loop","recur","if","when","cond","case","do","quote","var","ns","require","use","map","filter","reduce","println","str","nil","true","false","and","or","not"],
    snippets: [
      { label: "defn", insertText: "(defn ${1:name} [${2:args}]\n  ${3})", detail: "function" },
      { label: "let", insertText: "(let [${1:name} ${2:value}]\n  ${3})", detail: "let binding" },
    ],
  },
  "objective-c": {
    keywords: ["@interface","@implementation","@end","@property","@synthesize","@autoreleasepool","BOOL","YES","NO","nil","self","super","static","const","void","int","float","double","if","else","for","while","return","NSObject","NSString","NSArray","NSDictionary"],
    snippets: [
      { label: "interface", insertText: "@interface ${1:Name} : NSObject\n${2}\n@end", detail: "interface" },
      { label: "implementation", insertText: "@implementation ${1:Name}\n${2}\n@end", detail: "implementation" },
    ],
  },
  pascal: {
    keywords: ["and","array","begin","case","const","div","do","downto","else","end","file","for","function","goto","if","implementation","in","interface","mod","nil","not","object","of","or","packed","procedure","program","record","repeat","set","then","to","type","unit","until","uses","var","while","with","write","writeln"],
    snippets: [
      { label: "program", insertText: "program ${1:HelloWorld};\n\nbegin\n  ${2}\nend.", detail: "program" },
      { label: "procedure", insertText: "procedure ${1:Name};\nbegin\n  ${2}\nend;", detail: "procedure" },
    ],
  },
  coffeescript: {
    keywords: ["and","or","not","is","isnt","if","then","else","unless","until","while","for","in","of","by","when","return","class","extends","super","this","yes","no","on","off","null","undefined","own","new","typeof","instanceof","delete","throw","try","catch","finally"],
    snippets: [
      { label: "function", insertText: "${1:name} = (${2}) ->\n  ${3}", detail: "function" },
      { label: "class", insertText: "class ${1:Name}\n  constructor: (${2}) ->\n    ${3}", detail: "class" },
    ],
  },
  scss: {
    keywords: ["@use","@forward","@import","@mixin","@include","@extend","@function","@return","@if","@else","@for","@each","@while","@media","@at-root","!default","!important"],
    snippets: [
      { label: "mixin", insertText: "@mixin ${1:name}(${2}) {\n  ${3}\n}", detail: "mixin" },
      { label: "media", insertText: "@media (max-width: ${1:768px}) {\n  ${2}\n}", detail: "media query" },
    ],
  },
  less: {
    keywords: ["@import","@media","@keyframes","@supports","@font-face","important","when","and","not","or"],
    snippets: [
      { label: "mixin", insertText: ".${1:mixin}(@${2:value}) {\n  ${3}\n}", detail: "mixin" },
      { label: "media", insertText: "@media (max-width: ${1:768px}) {\n  ${2}\n}", detail: "media query" },
    ],
  },
  dockerfile: {
    keywords: ["FROM","RUN","CMD","LABEL","EXPOSE","ENV","ADD","COPY","ENTRYPOINT","VOLUME","USER","WORKDIR","ARG","ONBUILD","STOPSIGNAL","HEALTHCHECK","SHELL","AS"],
    snippets: [
      { label: "node-image", insertText: "FROM node:${1:22}-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nCMD [\"npm\", \"start\"]", detail: "Node container" },
      { label: "python-image", insertText: "FROM python:${1:3.12}-slim\nWORKDIR /app\nCOPY . .\nCMD [\"python\", \"main.py\"]", detail: "Python container" },
    ],
  },
  graphql: {
    keywords: ["query","mutation","subscription","fragment","on","type","interface","union","enum","input","scalar","schema","directive","implements","extend","ID","String","Int","Float","Boolean"],
    snippets: [
      { label: "query", insertText: "query ${1:Name} {\n  ${2:field}\n}", detail: "query" },
      { label: "mutation", insertText: "mutation ${1:Name}($${2:id}: ID!) {\n  ${3:action}(id: $${2:id})\n}", detail: "mutation" },
      { label: "type", insertText: "type ${1:Name} {\n  id: ID!\n  ${2:field}: ${3:String}\n}", detail: "type definition" },
    ],
  },
  proto: {
    keywords: ["syntax","package","import","option","message","enum","service","rpc","returns","stream","oneof","repeated","optional","required","map","reserved","extensions","string","bytes","bool","int32","int64","uint32","uint64","double","float"],
    snippets: [
      { label: "message", insertText: "message ${1:Name} {\n  ${2:string} ${3:field} = 1;\n}", detail: "message" },
      { label: "service", insertText: "service ${1:Name} {\n  rpc ${2:Call} (${3:Request}) returns (${4:Response});\n}", detail: "service" },
    ],
  },
  hcl: {
    keywords: ["resource","data","variable","output","module","provider","terraform","locals","for_each","count","depends_on","lifecycle","dynamic","required_providers","source","version","true","false","null"],
    snippets: [
      { label: "resource", insertText: "resource \"${1:aws_instance}\" \"${2:example}\" {\n  ${3}\n}", detail: "resource block" },
      { label: "variable", insertText: "variable \"${1:name}\" {\n  type    = ${2:string}\n  default = ${3}\n}", detail: "variable block" },
    ],
  },
  ini: {
    keywords: ["true","false","yes","no","on","off","null"],
    snippets: [
      { label: "section", insertText: "[${1:section}]\n${2:key}=${3:value}", detail: "config section" },
    ],
  },
  toml: {
    keywords: ["true","false","inf","nan"],
    snippets: [
      { label: "section", insertText: "[${1:section}]\n${2:key} = ${3:value}", detail: "TOML section" },
      { label: "array", insertText: "${1:key} = [\n  ${2:value},\n]", detail: "TOML array" },
      { label: "table-array", insertText: "[[${1:items}]]\n${2:name} = \"${3:value}\"", detail: "array of tables" },
    ],
  },
  vb: {
    keywords: ["And","As","Boolean","ByRef","ByVal","Call","Case","Catch","Class","Const","Continue","Dim","Do","Each","Else","ElseIf","End","Enum","Event","Exit","False","Finally","For","Function","Get","If","Imports","In","Interface","Loop","Module","Namespace","New","Next","Nothing","Not","Of","Optional","Overrides","Private","Protected","Public","Return","Select","Shared","String","Structure","Sub","Then","Throw","To","Try","True","Using","While","With","WriteLine"],
    snippets: [
      { label: "sub", insertText: "Public Sub ${1:Name}()\n  ${2}\nEnd Sub", detail: "subroutine" },
      { label: "main", insertText: "Module Program\n  Sub Main()\n    ${1}\n  End Sub\nEnd Module", detail: "main module" },
    ],
  },
  abap: {
    keywords: ["REPORT","DATA","TYPES","CLASS","METHOD","METHODS","FORM","PERFORM","IF","ELSEIF","ELSE","ENDIF","CASE","WHEN","ENDCASE","DO","ENDDO","LOOP","ENDLOOP","SELECT","FROM","WHERE","INTO","TABLE","APPEND","READ TABLE","WRITE","CLEAR","MOVE","CALL FUNCTION","TRY","CATCH","ENDTRY"],
    snippets: [
      { label: "report", insertText: "REPORT ${1:z_report}.\n\nWRITE: / '${2:Hello}'.", detail: "report" },
      { label: "select", insertText: "SELECT ${1:*}\n  FROM ${2:table}\n  INTO TABLE @DATA(${3:result})\n  WHERE ${4:condition}.\nENDSELECT.", detail: "select" },
    ],
  },
};

function registerLanguageCompletions(monaco) {
  for (const [language, data] of Object.entries(LANGUAGE_COMPLETIONS)) {
    const keywords = data.keywords || [];
    const snippets = data.snippets || [];
    if (!keywords.length && !snippets.length) continue;
    monaco.languages.registerCompletionItemProvider(monacoLanguageId(language), {
      triggerCharacters: [".", ">", ":", "#", "<", "/", "$", "%", "@"],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = [];
        for (const keyword of keywords) {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
          });
        }
        for (const snippet of snippets) {
          suggestions.push({
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: snippet.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: snippet.detail,
            range,
          });
        }
        return { suggestions };
      },
    });
  }
}

function boot() {
  dbg("boot");
  loadSettings();
  restoreWorkspace();
  applyConsoleHeight(state.consoleHeight);
  renderFileList();
  renderTabs();
  populateLanguageSelect();
  showPanel(state.panel);

  writeTerminal(
    `Python IDE — client-side runtime (Pyodide ${PYODIDE_VERSION})\n` +
      "Python and JavaScript run locally. Type “help” for shell commands.\n",
    "sys"
  );

  initShell();
  applySettings();
  refreshPrompt();
  initEditor();
  state.runtime = "idle";
  dom.runtime.dataset.state = "idle";
  dom.runtimeText.textContent = "Python runtime · on demand";
  dom.statusRuntime.textContent = "Python · on demand";
  updateRunButtons();
  if (shouldAskForUsername && dom.usernameDialog) {
    dom.usernameDialog.showModal();
    dom.usernameInput?.focus();
  }
}

window.addEventListener("beforeunload", () => {
  snapshotActive();
  saveWorkspace();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

boot();
