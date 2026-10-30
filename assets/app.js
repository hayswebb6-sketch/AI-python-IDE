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
const STORAGE_KEY = "pyide.workspace.v1";
const SETTINGS_KEY = "pyide.settings.v1";
const SHELL_HISTORY_KEY = "pyide.shell.history.v1";
const SHELL_DIRS_KEY = "pyide.shell.dirs.v1";
const PYODIDE_VERSION = "314.0.7";

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

const WELCOME = `"""Welcome to the Python IDE.

Everything runs locally in your browser (CPython compiled to WebAssembly).
Nothing is uploaded and there is no server.

Press  Ctrl+Enter  to run this file.
"""

import sys

print(f"Hello from Python {sys.version.split()[0]}!")
print("Edit this file, then press Run.")

squares = [n ** 2 for n in range(1, 11)]
print("First ten squares:", squares)
`;

const TURTLE_DEMO = `"""Turtle graphics — rendered on the Canvas panel."""

import turtle

t = turtle.Turtle()
t.speed(0)
t.pensize(3)

colors = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f87171"]
for i in range(120):
    t.color(colors[i % len(colors)])
    t.forward(i * 1.6)
    t.left(59)

t.hideturtle()
print("Drew 120 segments.")
`;

const TKINTER_DEMO = `"""Tkinter — rendered in the Window panel. Events really work."""

import tkinter as tk

count = 0

root = tk.Tk()
root.title("Tkinter counter")
root.geometry("340x200")

label = tk.Label(root, text="Clicks: 0", font=("Segoe UI", 14))
label.pack(pady=(20, 10))

def increment():
    global count
    count += 1
    label.config(text=f"Clicks: {count}")

button = tk.Button(root, text="Click me", command=increment)
button.pack()

root.mainloop()
`;

const PYGAME_DEMO = `"""Pygame — a small subset is drawn on the Canvas panel."""

import math
import pygame

pygame.init()
screen = pygame.display.set_mode((640, 400))
pygame.display.set_caption("Pygame canvas")
clock = pygame.time.Clock()

for frame in range(120):
    screen.fill((10, 16, 28))

    for i in range(24):
        angle = i * (math.tau / 24) + frame * 0.05
        x = 320 + math.cos(angle) * (60 + i * 4)
        y = 200 + math.sin(angle) * (60 + i * 4)
        pygame.draw.circle(screen, (56, 189, 248), (int(x), int(y)), 4)

    pygame.draw.line(screen, (167, 139, 250), (40, 360), (600, 360), 3)
    clock.tick(60)

print("Pygame scene finished.")
`;

const FILES_DEMO = `"""The virtual filesystem lives in the browser (Pyodide MEMFS)."""

import json
import os
import random

payload = {"value": random.randint(100, 999), "files": []}

with open("output.json", "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)

with open("notes.txt", "w", encoding="utf-8") as handle:
    handle.write("Written by Python, saved back into the workspace.\\n")

print("cwd:", os.getcwd())
print("files:", sorted(name for name in os.listdir(".") if not name.startswith(".")))
print("output.json ->", open("output.json", encoding="utf-8").read())
`;

const JAVASCRIPT_DEMO = `// JavaScript runs in a fresh Web Worker on every Run.
// It has the real language — console, timers, top-level await — but no DOM.

const squares = Array.from({ length: 10 }, (_, i) => (i + 1) ** 2);
console.log("First ten squares:", squares);

const user = { name: "Ada", language: "JavaScript", year: 2026 };
console.log(user);
console.log("Sum:", squares.reduce((total, n) => total + n, 0));

await new Promise((resolve) => setTimeout(resolve, 250));
console.log("Finished after a short pause.");
`;

const HTML_DEMO = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello from the Python IDE</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0c111b;
      color: #dbe3f4;
      font: 16px/1.6 system-ui, sans-serif;
    }
    .card {
      padding: 32px 40px;
      border: 1px solid #22304a;
      border-radius: 16px;
      background: #111827;
      box-shadow: 0 24px 60px #0008;
    }
    h1 { margin: 0 0 8px; color: #38bdf8; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Hello, browser.</h1>
    <p>HTML and CSS are editing-only languages here. Press Run only for Python and JavaScript.</p>
  </main>
</body>
</html>
`;

const TEMPLATES = {
  turtle: { name: "turtle_art.py", content: TURTLE_DEMO },
  tkinter: { name: "tkinter_app.py", content: TKINTER_DEMO },
  pygame: { name: "pygame_scene.py", content: PYGAME_DEMO },
  files: { name: "files_demo.py", content: FILES_DEMO },
  javascript: { name: "hello.js", content: JAVASCRIPT_DEMO },
  html: { name: "page.html", content: HTML_DEMO },
  blank: { name: "script.py", content: "# New file\n\n" },
};

/* ==========================================================================
 * DOM
 * ========================================================================== */

const $ = (id) => document.getElementById(id);

const dom = {
  app: $("app"),
  runtime: $("runtime"),
  runtimeText: $("runtime-text"),
  statusRuntime: $("status-runtime"),
  statusCursor: $("status-cursor"),
  statusLanguage: $("status-language"),
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

  settingsDialog: $("settings-dialog"),
  settingsForm: $("settings-form"),

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
    state.files.set("main.py", WELCOME);
    state.files.set("turtle_art.py", TURTLE_DEMO);
    state.files.set("tkinter_app.py", TKINTER_DEMO);
    state.files.set("hello.js", JAVASCRIPT_DEMO);
    state.files.set("page.html", HTML_DEMO);
    state.openTabs = ["main.py"];
    state.active = "main.py";
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

const LANGUAGE_DEFS = {
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

const EXTENSION_LANGUAGE = {
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
  yml: "plaintext",
  yaml: "plaintext",
  toml: "plaintext",
};

function languageFor(name) {
  if (!name) return "plaintext";
  if (state.languages[name]) return state.languages[name];
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return EXTENSION_LANGUAGE[extension] || "plaintext";
}

function languageLabel(id) {
  return LANGUAGE_DEFS[id]?.label || "Plain Text";
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
    if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
  }
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
  state.files.set("main.py", WELCOME);
  state.files.set("turtle_art.py", TURTLE_DEMO);
  state.files.set("tkinter_app.py", TKINTER_DEMO);
  state.files.set("hello.js", JAVASCRIPT_DEMO);
  state.files.set("page.html", HTML_DEMO);
  state.openTabs = ["main.py"];
  state.active = "main.py";
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

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "icon");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-file");
    icon.append(use);

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

    tab.innerHTML = `<svg class="icon"><use href="#i-file"/></svg>`;
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
    { token: "comment", foreground: "6b7896", fontStyle: "italic" },
    { token: "keyword", foreground: "c084fc" },
    { token: "string", foreground: "86efac" },
    { token: "number", foreground: "fbbf24" },
    { token: "regexp", foreground: "fca5a5" },
    { token: "type", foreground: "7dd3fc" },
    { token: "function", foreground: "93c5fd" },
    { token: "variable", foreground: "dbe3f4" },
    { token: "constant", foreground: "f9a8d4" },
    { token: "delimiter", foreground: "94a3b8" },
  ],
  colors: {
    "editor.background": "#0c111b",
    "editor.foreground": "#dbe3f4",
    "editorLineNumber.foreground": "#2f3b55",
    "editorLineNumber.activeForeground": "#7c8db3",
    "editorCursor.foreground": "#38bdf8",
    "editor.selectionBackground": "#1e3a5f",
    "editor.inactiveSelectionBackground": "#16283f",
    "editor.lineHighlightBackground": "#101827",
    "editorIndentGuide.background1": "#1a2437",
    "editorIndentGuide.activeBackground1": "#2b3a5e",
    "editorWidget.background": "#131a2a",
    "editorWidget.border": "#2b3a5e",
    "editorSuggestWidget.background": "#131a2a",
    "editorSuggestWidget.selectedBackground": "#1d2b45",
    "scrollbarSlider.background": "#26314980",
    "scrollbarSlider.hoverBackground": "#33415faa",
    "minimap.background": "#0c111b",
  },
};

const LIGHT_THEME = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8a94a6", fontStyle: "italic" },
    { token: "keyword", foreground: "7c3aed" },
    { token: "string", foreground: "15803d" },
    { token: "number", foreground: "b45309" },
    { token: "regexp", foreground: "be123c" },
    { token: "type", foreground: "0369a1" },
    { token: "function", foreground: "1d4ed8" },
    { token: "variable", foreground: "1e293b" },
    { token: "constant", foreground: "be185d" },
    { token: "delimiter", foreground: "64748b" },
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
  const source = `self.MonacoEnvironment = { baseUrl: '${MONACO_CDN}/' };\nimportScripts('${MONACO_CDN}/${path}');`;
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

function loadMonaco() {
  return new Promise((resolve, reject) => {
    if (!window.require) {
      reject(new Error("Monaco loader missing"));
      return;
    }

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
    window.require(["vs/editor/editor.main"], () => resolve(window.monaco), reject);
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
    languageFor(name),
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

async function initEditor() {
  try {
    const monaco = await loadMonaco();
    state.monaco = monaco;

    monaco.editor.defineTheme("pyide", THEME);
    monaco.editor.defineTheme("pyide-light", LIGHT_THEME);
    registerCompletions(monaco);

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
      suggestOnTriggerCharacters: true,
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
    });

    state.editor.onDidChangeCursorPosition((event) => {
      dom.statusCursor.textContent = `Ln ${event.position.lineNumber}, Col ${event.position.column}`;
    });

    state.editor.onDidChangeModel(() => updateStatusLanguage());

    state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runActive());
    state.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => runWithInput()
    );

    dom.editorLoading.hidden = true;
    syncEditor();
  } catch (error) {
    dom.editorLoading.hidden = true;
    initFallbackEditor();
    toast("Editor CDN unavailable — using the basic editor.", "error");
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
  const area = document.createElement("textarea");
  area.spellcheck = false;
  area.style.cssText = [
    "position:absolute", "inset:0", "width:100%", "height:100%",
    "border:0", "outline:none", "resize:none", "padding:14px",
    "background:var(--editor-bg)", "color:var(--text)",
    `font:${settings.fontSize}px/1.6 'JetBrains Mono', monospace`, "white-space:pre-wrap",
  ].join(";");
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

function writeTerminal(text, kind = "") {
  if (text === undefined || text === null) return;
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

function clearTerminal() {
  dom.terminal.replaceChildren();
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
  const parts = shell.promptParts();
  if (dom.promptPath) dom.promptPath.textContent = parts.path;
  if (dom.promptSigil) dom.promptSigil.textContent = parts.sigil;
  dom.promptInput.placeholder = shell.mode === "pwsh"
    ? "Type a PowerShell command — try “help”"
    : "Type a bash command — try “help”";
  dom.promptInput.title = shell.promptText();
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
      if (state.runtime !== "ready") {
        writeTerminal("python: the Python runtime is still starting", "err");
        return false;
      }
      return runFile(key, lines, { quiet: true });
    },
    runJavaScript: async (key) => runJavaScript(key, { quiet: true }),
    pip: async (packages) => {
      if (state.runtime !== "ready" && state.runtime !== "running") {
        writeTerminal("pip: the Python runtime is still starting", "err");
        return false;
      }
      state.worker?.postMessage({ type: "pip", packages });
      return true;
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

dom.promptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const line = dom.promptInput.value;
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
});

dom.promptInput.addEventListener("keydown", (event) => {
  if (!shell) return;
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
    if (!dom.promptInput.selectionStart && !dom.promptInput.selectionEnd && !dom.promptInput.value) return;
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
    writeTerminal(`Runtime error: ${event.message || "unknown"}`, "err");
  });

  setRuntime("loading", "Starting runtime…");
}

function stopRuntime(reason = "Runtime restarted.") {
  startWorker();
  setRuntime("loading", "Restarting runtime…");
  writeTerminal(`\n${reason}`, "sys");
}

function runJavaScript(name, options = {}) {
  const quiet = Boolean(options.quiet);
  if (!state.files.has(name)) return Promise.resolve(false);

  const code = (state.active === name && state.editor && !state.editor.fallback)
    ? state.editor.getValue()
    : (state.files.get(name) ?? "");
  state.files.set(name, code);

  if (!quiet) writeTerminal(` node ${name}`, "cmd");
  showConsole("terminal");

  if (state.jsWorker) {
    state.jsWorker.terminate();
    state.jsWorker = null;
  }

  state.jsRunning = true;
  updateRunButtons();
  dom.statusRuntime.textContent = "JavaScript · Web Worker";

  const worker = new Worker(new URL("assets/js-worker.js", document.baseURI));
  state.jsWorker = worker;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      state.jsRunning = false;
      if (state.jsWorker === worker) state.jsWorker = null;
      try { worker.terminate(); } catch { /* ignore */ }
      updateRunButtons();
      dom.statusRuntime.textContent = `Python ${state.pyVersion} · WebAssembly`;
      resolve(Boolean(ok));
    };

    worker.onmessage = ({ data }) => {
      switch (data.type) {
        case "stdout":
          writeTerminal(data.text, "");
          break;
        case "stderr":
          writeTerminal(data.text, "err");
          break;
        case "result":
          writeTerminal(data.text, "ok");
          break;
        case "clear":
          clearTerminal();
          break;
        case "done": {
          const seconds = ((data.ms || 0) / 1000).toFixed(2);
          writeTerminal(
            data.ok
              ? `Process finished in ${seconds}s`
              : `Process exited with errors after ${seconds}s`,
            data.ok ? "ok" : "err"
          );
          finish(data.ok);
          break;
        }
        default:
          break;
      }
    };

    worker.onerror = (event) => {
      writeTerminal(`JavaScript worker error: ${event.message || "unknown"}`, "err");
      finish(false);
    };

    worker.postMessage({ type: "run", code, filename: name });
  });
}

function onWorkerMessage({ data }) {
  switch (data.type) {
    case "status": {
      if (data.state === "ready") {
        state.pyVersion = data.pythonVersion || state.pyVersion;
        dom.statusRuntime.textContent = `Python ${state.pyVersion} · Pyodide ${PYODIDE_VERSION}`;
        setRuntime("ready", data.message || `Python ${state.pyVersion} ready`);
      } else if (data.state === "error") {
        setRuntime("error", data.message || "Runtime error");
      } else {
        setRuntime("loading", data.message || "Loading…");
      }
      break;
    }

    case "fatal":
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

function runActive() {
  if (!state.active) {
    toast("Open a file first.", "error");
    return;
  }
  const language = languageFor(state.active);
  if (language === "python") {
    if (state.runtime !== "ready") {
      toast(state.runtime === "running" ? "Already running." : "The Python runtime is still starting…");
      return;
    }
    runFile(state.active, []);
  } else if (language === "javascript") {
    if (state.jsRunning) {
      toast("Already running.");
      return;
    }
    runJavaScript(state.active);
  } else {
    toast(`${languageLabel(language)} files are editing-only — Run supports Python and JavaScript.`);
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

function runFile(name, stdin, options = {}) {
  const quiet = Boolean(options.quiet);
  if (state.runtime !== "ready") return Promise.resolve(false);
  if (!state.files.has(name)) return Promise.resolve(false);

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

function finishRun(data) {
  const seconds = ((data.ms || 0) / 1000).toFixed(2);
  writeTerminal(
    data.ok ? `Process finished in ${seconds}s` : `Process exited with errors after ${seconds}s`,
    data.ok ? "ok" : "err"
  );

  mergeRunFiles(data.files || {});
  renderTabs();
  renderFileList();
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
dom.statusLanguage?.addEventListener("change", () => {
  if (!state.active) return;
  state.languages[state.active] = dom.statusLanguage.value;
  refreshLanguage();
  scheduleSave();
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
    return;
  }

  // Monaco handles Ctrl+Enter itself when focused; this covers the rest of the app.
  if (event.key === "Enter" && !event.shiftKey && !event.target.closest(".monaco-editor")) {
    event.preventDefault();
    runActive();
  } else if (event.key === "Enter" && event.shiftKey && !event.target.closest(".monaco-editor")) {
    event.preventDefault();
    runWithInput();
  } else if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    scheduleSave();
    toast("Workspace saved in this browser.", "ok");
  } else if (event.key.toLowerCase() === "b") {
    event.preventDefault();
    $("btn-sidebar").click();
  } else if (event.key === ",") {
    event.preventDefault();
    dom.btnSettings?.click();
  } else if (event.key === "`") {
    event.preventDefault();
    dom.app.classList.toggle("console-hidden");
  }
});

/* ==========================================================================
 * Boot
 * ========================================================================== */

function boot() {
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
  startWorker();
}

window.addEventListener("beforeunload", () => {
  snapshotActive();
  saveWorkspace();
});

boot();
