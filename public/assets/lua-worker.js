/**
 * Lua runner using fengari-web.
 */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "run") return;

  const started = performance.now();
  let restore = () => {};

  try {
    if (!self.fengari) {
      importScripts("https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js");
    }
    if (!self.fengari || typeof self.fengari.load !== "function") {
      throw new Error("fengari-web did not load correctly");
    }

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = (...args) => self.postMessage({ type: "stdout", text: args.map((value) => (value === null || value === undefined ? "nil" : String(value))).join("\t") + "\n" });
    console.warn = console.log;
    console.error = (...args) => self.postMessage({ type: "stderr", text: args.map((value) => (value === null || value === undefined ? "nil" : String(value))).join("\t") + "\n" });
    restore = () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };

    const fn = self.fengari.load(String(data.code || ""), "main.lua");
    const result = typeof fn === "function" ? fn() : undefined;
    if (result !== undefined && result !== null) {
      self.postMessage({ type: "stdout", text: String(result) + "\n" });
    }
    self.postMessage({ type: "done", ok: true, ms: performance.now() - started });
  } catch (error) {
    self.postMessage({ type: "stderr", text: `${error && error.message ? error.message : error}\n` });
    self.postMessage({ type: "done", ok: false, ms: performance.now() - started });
  } finally {
    restore();
  }
});

self.postMessage({ type: "ready" });
