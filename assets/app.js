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

import { registerPythonIntelliSense } from "./completions.js";
import { createShell } from "./shell.js";

const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";
const STORAGE_KEY = "pyide.workspace.v2";
const SETTINGS_KEY = "pyide.settings.v1";
const SHELL_HISTORY_KEY = "pyide.shell.history.v1";
const SHELL_DIRS_KEY = "pyide.shell.dirs.v1";
const PYODIDE_VERSION = "0.26.4";

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
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (saved[key] !== undefined) settings[key] = saved[key];
      }
    }
  } catch {
    /* corrupted settings — fall back to defaults */
  }
  settings.theme = settings.theme === "light" ? "light" : "dark";
  settings.shell = settings.shell === "pwsh" ? "pwsh" : "bash";
  settings.fontSize = Math.min(24, Math.max(10, Number(settings.fontSize) || DEFAULT_SETTINGS.fontSize));
  settings.terminalFontSize = Math.min(24, Math.max(9, Number(settings.terminalFontSize) || DEFAULT_SETTINGS.terminalFontSize));
  settings.tabSize = [2, 4, 8].includes(Number(settings.tabSize)) ? Number(settings.tabSize) : 4;
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/* ==========================================================================
 * Templates
 * ========================================================================== */

const TEMPLATES = {
  blank: { name: "script.txt", content: "" },
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
    settings,
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
  consoleHeight: 300,
  pyVersion: "3.14.0",
  monaco: null,
  editor: null,
  worker: null,
  jsWorker: null,
  jsRunning: false,
  running: false,
  pendingRun: null,
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

function askText({ title, label, value = "", hint = "", multiline = false, confirm = "OK" }) {
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
    field.value = value;

    const finish = (result) => {
      dom.dialog.removeEventListener("close", onClose);
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

async function askLines(title) {
  const value = await askText({
    title,
    label: "Standard input — one value per line",
    multiline: true,
    hint: "Each line is returned by one input() call. Leave empty to run with no input.",
    confirm: "Run",
  });
  if (value === null) return null;
  return value.split("\n").filter((line, index, all) => !(index === all.length - 1 && line === ""));
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
  c: "https://en.cppreference.com/w/c",
  cpp: "https://en.cppreference.com/w/cpp",
  java: "https://docs.oracle.com/en/java/",
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
  typescript: "https://www.typescriptlang.org/docs/",
};

/* ==========================================================================
 * Runtime (worker)
 * ========================================================================== */

function updateRunButtons() {
  const running = state.runtime === "running" || state.jsRunning;
  const hasActive = Boolean(state.active);
  dom.btnRun.disabled = running || !hasActive;
  dom.btnRunMenu.disabled = running || !hasActive;
  dom.btnStop.disabled = !running;
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

function startWorker() {
  if (state.worker) state.worker.terminate();
  state.worker = new Worker(new URL("assets/worker.js", document.baseURI));

  state.worker.addEventListener("message", onWorkerMessage);
  state.worker.addEventListener("error", (event) => {
    setRuntime("error", "Runtime crashed");
    dbg("worker error", event.message);
    writeTerminal(`Runtime error: ${event.message || "unknown"}`, "err");
  });

  setRuntime("loading", "Starting runtime…");
}

const runtimeReadyResolvers = [];

function ensureRuntime() {
  if (state.runtime === "ready") return Promise.resolve();
  if (state.runtime === "loading" || state.runtime === "idle") {
    if (!state.worker) startWorker();
    return new Promise((resolve) => runtimeReadyResolvers.push(resolve));
  }
  startWorker();
  return new Promise((resolve) => runtimeReadyResolvers.push(resolve));
}

function stopRuntime(reason = "Runtime restarted.") {
  setRuntime("loading", "Restarting runtime…");
  writeTerminal(`\n${reason}`, "sys");
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
  dom.htmlPreview = iframe;
  iframe.className = "html-preview";
  iframe.sandbox = "allow-scripts allow-modals";
  if (!dom.htmlPreview || !dom.htmlPreview.isConnected) {
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
        while (runtimeReadyResolvers.length) runtimeReadyResolvers.shift()();
      } else if (data.state === "error") {
        setRuntime("error", data.message || "Runtime error");
      } else {
        setRuntime("loading", data.message || "Loading…");
      }
      break;
    }

    case "fatal":
      dbg("worker fatal", data.text);
      writeTerminal(data.text || "Fatal runtime error", "err");
      break;

    case "stdout":
      writeTerminal(data.text, "");
      break;

    case "stderr":
      writeTerminal(data.text, "err");
      break;

    case "run-start":
      state.running = true;
      setRuntime("running", "Running…");
      dom.tkStage.replaceChildren();
      dom.tkEmpty.hidden = false;
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
      break;

    case "done":
      state.running = false;
      if (state.pendingRun) {
        state.pendingRun(data.ok);
        state.pendingRun = null;
      }
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

function runActive() {
  if (!state.active) {
    toast("Open a file first.", "error");
    return;
  }
  const language = languageFor(state.active);
  if (language === "python") {
    runFile(state.active, []);
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
  } else if (language === "shell" || language === "batch") {
    runShellFile(state.active);
  } else if (language === "html") {
    runHtmlFile(state.active);
  } else {
    toast(`${languageLabel(language)} files are editing-only — Run supports Python, JavaScript, Shell and HTML preview.`);
  }
}

async function runWithInput() {
  if (!state.active) {
    toast("Open a file first.", "error");
    return;
  }
  if (languageFor(state.active) !== "python") {
    toast("Run with input is only available for Python files.");
    return;
  }
  if (state.runtime !== "ready") {
    toast("The Python runtime is still starting…");
    return;
  }
  const lines = await askLines(`Run ${state.active} with input`);
  if (lines === null) return;
  runFile(state.active, lines);
}

async function runFile(name, stdin, options = {}) {
  const quiet = Boolean(options.quiet);
  if (!state.files.has(name)) return false;
  await ensureRuntime();
  if (state.runtime !== "ready") return false;

  snapshotActive();
  showConsole("terminal");

  const code = state.files.get(name) ?? "";
  if (!quiet) writeTerminal(` python ${name}`, "cmd");

  state.snapshots.set(name, state.files.get(name) ?? "");
  renderTabs();

  return new Promise((resolve) => {
    state.pendingRun = resolve;
    state.worker?.postMessage({
      type: "run",
      entry: name,
      code,
      stdin,
      files: Object.fromEntries(state.files),
    });
  });
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
    if (line.trim()) await shell.execute(line);
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
    data.ok ? `Process finished in ${seconds}s` : `Process exited with errors after ${seconds}s`,
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

dom.btnRun.addEventListener("click", runActive);
dom.btnSettings?.addEventListener("click", () => {
  syncSettingsForm();
  dom.settingsDialog?.showModal();
});
dom.settingsForm?.addEventListener("change", (event) => {
  const field = event.target.closest("[data-setting]");
  if (!field) return;
  const key = field.dataset.setting;
  if (field.type === "checkbox") settings[key] = field.checked;
  else if (field.type === "number") settings[key] = Number(field.value);
  else settings[key] = field.value;
  saveSettings();
  applySettings();
});
dom.settingsForm?.addEventListener("submit", () => {
  saveSettings();
  applySettings();
});
$("settings-reset")?.addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
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
dom.btnStop.addEventListener("click", () => {
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
dom.btnRestart.addEventListener("click", () => stopRuntime("Runtime restarted."));

dom.btnRunMenu.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu(dom.runMenu, dom.btnRunMenu);
});

dom.runMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-run]")?.dataset.run;
  if (!action) return;
  closeMenus();
  if (action === "input") runWithInput();
  else runActive();
});

$("btn-clear").addEventListener("click", clearTerminal);

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
    runWithInput();
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
  { icon: "⌨", label: "Run with input…", run: () => runWithInput() },
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
    keywords: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","try","catch","finally","throw","new","class","extends","import","export"],
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
    keywords: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","try","catch","finally","throw","new","class","extends","import","export"],
    snippets: [
      { label: "clg", insertText: "console.log(${1});", detail: "console.log" },
      { label: "iface", insertText: "interface ${1:Name} {\n  ${2}\n}", detail: "interface" },
      { label: "type", insertText: "type ${1:Name} = ${2};", detail: "type alias" },
    ],
  },
  c: {
    keywords: ["auto","break","case","char","const","continue","default","do","double","else","enum","extern","float","for","goto","if","int","long","register","return","short","signed","sizeof"],
    snippets: [
      { label: "main", insertText: "int main(void) {\n  ${1}\n  return 0;\n}", detail: "main function" },
      { label: "inc", insertText: "#include <${1:stdio.h}>", detail: "include" },
      { label: "fori", insertText: "for (int i = 0; i < ${1:n}; i++) {\n  ${2}\n}", detail: "for loop" },
      { label: "printf", insertText: "printf(\"${1:%s}\\n\", ${2});", detail: "printf" },
    ],
  },
  cpp: {
    keywords: ["alignas","alignof","and","and_eq","asm","auto","bitand","bitor","bool","break","case","catch","char","char8_t","char16_t","char32_t","class","compl","concept","const","consteval"],
    snippets: [
      { label: "main", insertText: "int main() {\n  ${1}\n  return 0;\n}", detail: "main function" },
      { label: "inc", insertText: "#include <${1:iostream}>", detail: "include" },
      { label: "cout", insertText: "std::cout << ${1} << std::endl;", detail: "cout" },
      { label: "class", insertText: "class ${1:Name} {\npublic:\n  ${2}\n};", detail: "class" },
    ],
  },
  java: {
    keywords: ["abstract","assert","boolean","break","byte","case","catch","char","class","const","continue","default","do","double","else","enum","extends","final","finally","float","for","goto"],
    snippets: [
      { label: "main", insertText: "public static void main(String[] args) {\n  ${1}\n}", detail: "main method" },
      { label: "sout", insertText: "System.out.println(${1});", detail: "println" },
      { label: "class", insertText: "public class ${1:Name} {\n  ${2}\n}", detail: "class" },
      { label: "fori", insertText: "for (int i = 0; i < ${1:n}; i++) {\n  ${2}\n}", detail: "for loop" },
    ],
  },
  go: {
    keywords: ["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct"],
    snippets: [
      { label: "main", insertText: "func main() {\n  ${1}\n}", detail: "main function" },
      { label: "fmt", insertText: "fmt.Println(${1})", detail: "println" },
      { label: "fori", insertText: "for i := 0; i < ${1:n}; i++ {\n  ${2}\n}", detail: "for loop" },
    ],
  },
  rust: {
    keywords: ["as","async","await","break","const","continue","crate","dyn","else","enum","extern","false","fn","for","if","impl","in","let","loop","match","mod","move","mut","pub","ref","return"],
    snippets: [
      { label: "main", insertText: "fn main() {\n  ${1}\n}", detail: "main function" },
      { label: "println", insertText: "println!(\"${1}\");", detail: "println!" },
      { label: "fori", insertText: "for i in 0..${1:n} {\n  ${2}\n}", detail: "for loop" },
    ],
  },
  shell: {
    keywords: ["if","then","else","elif","fi","for","while","do","done","case","esac","function","return","export","local","readonly","unset","shift","trap","source","alias","unalias","echo","printf"],
    snippets: [
      { label: "if", insertText: "if [ ${1} ]; then\n  ${2}\nfi", detail: "if statement" },
      { label: "for", insertText: "for i in ${1}; do\n  ${2}\ndone", detail: "for loop" },
      { label: "case", insertText: "case ${1} in\n  ${2})\n    ;;\nesac", detail: "case statement" },
    ],
  },
  bat: {
    keywords: ["@echo","off","echo","set","if","else","for","do","in","goto","call","exit","pause","rem","cls","cd","dir","copy","del","move","mkdir","rmdir","start","taskkill","ping","timeout"],
    snippets: [
      { label: "if", insertText: "if ${1} (\n  ${2}\n)", detail: "if block" },
      { label: "for", insertText: "for %%i in (${1}) do (\n  ${2}\n)", detail: "for loop" },
    ],
  },
  html: {
    keywords: [],
    snippets: [
      { label: "html5", insertText: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>${1}</title>\n</head>\n<body>\n  ${2}\n</body>\n</html>", detail: "HTML5 skeleton" },
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
      { label: "code", insertText: "```\${1:js}\n${2}\n```", detail: "code block" },
      { label: "link", insertText: "[${1:text}](${2:url})", detail: "link" },
      { label: "table", insertText: "| ${1:Col} | ${2:Col} |\n|---|---|\n| ${3} | ${4} |", detail: "table" },
    ],
  },
};

function registerLanguageCompletions(monaco) {
  for (const [language, data] of Object.entries(LANGUAGE_COMPLETIONS)) {
    const keywords = data.keywords || [];
    const snippets = data.snippets || [];
    if (!keywords.length && !snippets.length) continue;
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: [".", ">", ":", "#", "<", "/"],
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
  setTimeout(() => {
    dbg("editor fallback timer fired", { hasEditor: !!state.editor });
    if (!state.editor) {
      dom.editorLoading.hidden = true;
      initFallbackEditor();
      toast("Editor CDN unavailable — using the basic editor.", "error");
    }
  }, 2000);
  state.runtime = "idle";
  dom.runtime.dataset.state = "idle";
  dom.runtimeText.textContent = "Python runtime - runs on demand";
  dom.statusRuntime.textContent = "Python - on demand";
  updateRunButtons();
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
