/**
 * Python runtime worker.
 *
 * Runs Pyodide (CPython compiled to WebAssembly) off the main thread so that a
 * runaway `while True:` can be killed with `worker.terminate()` instead of
 * freezing the whole tab.
 *
 * The worker owns:
 *   - the interpreter and the in-memory POSIX filesystem
 *   - the turtle / tkinter / pygame shims (assets/shims.py)
 *
 * Everything the user should *see* is posted to the main thread as messages.
 */

/* global loadPyodide */

const PYODIDE_VERSION = "314.0.7";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PROJECT_DIR = "/home/pyodide/project";

let py = null;
let stdinQueue = [];
let running = false;

const post = (message) => self.postMessage(message);

/* -------------------------------------------------------------------------
 * JS bridge used by shims.py
 * ---------------------------------------------------------------------- */

self.ideBridge = {
  emit(kind, json) {
    let payload;
    try {
      payload = JSON.parse(json);
    } catch {
      return;
    }
    post({ type: kind, payload });
  },

  /** Returns the next queued stdin line, or null when the queue is exhausted. */
  stdin() {
    if (!stdinQueue.length) return null;
    return String(stdinQueue.shift());
  },
};

/* Fallback writer in case `setStdout` is unavailable in a future build. */
self.__ideWrite = (text) => post({ type: "stdout", text: String(text) });

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

function boot() {
  post({ type: "status", state: "loading", message: "Downloading Python runtime…", progress: 0.05 });

  try {
    importScripts(`${CDN}pyodide.js`);
  } catch (error) {
    post({ type: "status", state: "error", message: "Could not load Pyodide from the CDN." });
    post({ type: "fatal", text: String(error) });
    return;
  }

  loadPyodide({ indexURL: CDN })
    .then(async (instance) => {
      py = instance;

      const line = (channel) => (text) => {
        const value = String(text);
        post({ type: channel, text: value.endsWith("\n") ? value : `${value}\n` });
      };

      if (typeof py.setStdout === "function") {
        py.setStdout({ batched: line("stdout") });
        py.setStderr({ batched: line("stderr") });
      }
      if (typeof py.setStdin === "function") {
        py.setStdin({ stdin: () => String(self.ideBridge.stdin() ?? "") });
      }

      post({ type: "status", state: "loading", message: "Loading standard library…", progress: 0.55 });

      try {
        await py.loadPackage("micropip");
      } catch {
        /* micropip is optional — `pip install` will report a clear error later */
      }

      post({ type: "status", state: "loading", message: "Installing browser shims…", progress: 0.8 });

      const shimsUrl = new URL("shims.py", self.location.href);
      const response = await fetch(shimsUrl);
      if (!response.ok) throw new Error(`shims.py → HTTP ${response.status}`);
      await py.runPythonAsync(await response.text());

      const version = py.runPython("import sys; sys.version.split()[0]");
      py.FS.mkdirTree(PROJECT_DIR);

      post({
        type: "status",
        state: "ready",
        message: `Python ${version} ready`,
        pythonVersion: String(version),
        pyodideVersion: PYODIDE_VERSION,
      });
    })
    .catch((error) => {
      post({ type: "status", state: "error", message: "Python runtime failed to start." });
      post({ type: "fatal", text: formatError(error) });
    });
}

/* -------------------------------------------------------------------------
 * Filesystem helpers
 * ---------------------------------------------------------------------- */

function ensureDir(path) {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    try {
      if (!py.FS.analyzePath(current).exists) py.FS.mkdir(current);
    } catch {
      /* already exists */
    }
  }
}

function removeTree(path) {
  let stat;
  try {
    stat = py.FS.stat(path);
  } catch {
    return;
  }
  if (py.FS.isDir(stat.mode)) {
    for (const name of py.FS.readdir(path)) {
      if (name === "." || name === "..") continue;
      removeTree(`${path}/${name}`);
    }
    py.FS.rmdir(path);
  } else {
    py.FS.unlink(path);
  }
}

function writeWorkspace(files) {
  ensureDir(PROJECT_DIR);
  for (const name of py.FS.readdir(PROJECT_DIR)) {
    if (name === "." || name === "..") continue;
    removeTree(`${PROJECT_DIR}/${name}`);
  }

  for (const [name, content] of Object.entries(files ?? {})) {
    const safe = String(name).replace(/^\/+/, "");
    if (!safe || safe.includes("..")) continue;
    const full = `${PROJECT_DIR}/${safe}`;
    const parent = full.slice(0, full.lastIndexOf("/"));
    ensureDir(parent);
    py.FS.writeFile(full, String(content ?? ""), { encoding: "utf8" });
  }
}

function readWorkspace() {
  const out = {};

  const walk = (dir, prefix) => {
    let names;
    try {
      names = py.FS.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === "." || name === ".." || name === "__pycache__") continue;
      const full = `${dir}/${name}`;
      const rel = prefix ? `${prefix}/${name}` : name;
      let stat;
      try {
        stat = py.FS.stat(full);
      } catch {
        continue;
      }
      if (py.FS.isDir(stat.mode)) {
        walk(full, rel);
      } else {
        if (/\.pyc$/i.test(name) || stat.size > 2 * 1024 * 1024) continue;
        try {
          out[rel] = py.FS.readFile(full, { encoding: "utf8" });
        } catch {
          /* binary file — skip */
        }
      }
    }
  };

  walk(PROJECT_DIR, "");
  return out;
}

/* -------------------------------------------------------------------------
 * Running user code
 * ---------------------------------------------------------------------- */

const RUNNER = `
import os, runpy, sys

entry = __ide_entry
os.chdir(os.path.dirname(entry) or ".")
if os.getcwd() not in sys.path:
    sys.path.insert(0, os.getcwd())
runpy.run_path(entry, run_name="__main__")
`;

function formatError(error) {
  let text = (error && (error.message || error.toString())) || "Unknown error";
  // Drop the JS stack frames that Pyodide appends to Python tracebacks.
  text = text
    .split("\n")
    .filter((line) => !/^\s+at\s/.test(line))
    .join("\n")
    .trimEnd();
  return `${text}\n`;
}

async function handleRun(message) {
  if (!py) {
    post({ type: "stderr", text: "Python is not ready yet.\n" });
    post({ type: "done", ok: false, ms: 0, files: {} });
    return;
  }

  running = true;
  stdinQueue = Array.isArray(message.stdin) ? message.stdin.map(String) : [];
  post({ type: "run-start", entry: message.entry });

  const started = performance.now();
  let ok = true;

  try {
    py.runPython("__ide_reset()");
    writeWorkspace(message.files);
    py.FS.chdir(PROJECT_DIR);
    py.globals.set("__ide_entry", String(message.entry || "main.py"));

    try {
      await py.loadPackagesFromImports(String(message.code ?? ""), {
        messageCallback: (text) => post({ type: "status", state: "loading", message: String(text) }),
        errorCallback: () => {},
      });
    } catch {
      /* unknown imports are reported by the user's own traceback instead */
    }

    await py.runPythonAsync(RUNNER, { globals: py.globals });
  } catch (error) {
    ok = false;
    post({ type: "stderr", text: formatError(error) });
  }

  try {
    py.runPython("__ide_finish()");
  } catch {
    /* ignore */
  }

  const files = readWorkspace();
  running = false;
  post({
    type: "done",
    ok,
    ms: Math.round(performance.now() - started),
    files,
  });
}

async function handleTkEvent(message) {
  if (!py || running) return;
  try {
    py.globals.set("__ide_evt_target", String(message.target));
    py.globals.set("__ide_evt_id", String(message.id));
    py.globals.set("__ide_evt_value", JSON.stringify(message.value ?? null));
    await py.runPythonAsync(
      "__ide_tk_event(__ide_evt_target, __ide_evt_id, __ide_evt_value)"
    );
  } catch (error) {
    post({ type: "stderr", text: formatError(error) });
  }
}

async function handlePip(message) {
  const packages = Array.isArray(message.packages) ? message.packages : [];
  if (!packages.length) return;

  post({ type: "stdout", text: `\nInstalling ${packages.join(", ")}…\n` });
  try {
    py.globals.set("__ide_pkgs", JSON.stringify(packages));
    await py.runPythonAsync(`
import json, micropip
await micropip.install(json.loads(__ide_pkgs))
`);
    post({ type: "stdout", text: "Package installation finished.\n" });
  } catch (error) {
    post({ type: "stderr", text: formatError(error) });
  }
  post({ type: "pip-done" });
}

/* -------------------------------------------------------------------------
 * Message loop
 * ---------------------------------------------------------------------- */

self.addEventListener("message", (event) => {
  const message = event.data || {};
  switch (message.type) {
    case "run":
      handleRun(message);
      break;
    case "tk-event":
      handleTkEvent(message);
      break;
    case "pip":
      handlePip(message);
      break;
    default:
      break;
  }
});

boot();
