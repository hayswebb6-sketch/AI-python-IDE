/**
 * JavaScript runner.
 *
 * A fresh worker is created for every run, so a stray `setInterval` or a
 * mutated global cannot leak into the next execution. The worker has no DOM
 * and no app state; it only evaluates the code it is given and reports what
 * the console said.
 */

const AsyncFunction = Object.getPrototypeOf(async function noop() {}).constructor;

const encoder = new TextEncoder();

function formatValue(value, depth = 0, seen = new Set()) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const type = typeof value;
  if (type === "string") return depth === 0 ? value : JSON.stringify(value);
  if (type === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (type === "bigint") return `${value}n`;
  if (type === "boolean") return String(value);
  if (type === "symbol") return value.toString();
  if (type === "function") return `[Function: ${value.name || "anonymous"}]`;

  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Promise) return "Promise { <pending> }";

  if (seen.has(value)) return "[Circular]";
  if (depth > 4) return Array.isArray(value) ? "[Array]" : "[Object]";
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, 100).map((item) => formatValue(item, depth + 1, seen));
      if (value.length > 100) items.push(`... ${value.length - 100} more`);
      return `[ ${items.join(", ")} ]`;
    }

    if (value instanceof Map) {
      const entries = [...value.entries()].slice(0, 50).map(([key, item]) => `${formatValue(key, depth + 1, seen)} => ${formatValue(item, depth + 1, seen)}`);
      return `Map(${value.size}) { ${entries.join(", ")} }`;
    }

    if (value instanceof Set) {
      const items = [...value.values()].slice(0, 50).map((item) => formatValue(item, depth + 1, seen));
      return `Set(${value.size}) { ${items.join(", ")} }`;
    }

    if (ArrayBuffer.isView(value)) {
      return `${value.constructor.name}(${value.length}) [ ${[...value].slice(0, 50).join(", ")} ]`;
    }

    const keys = Object.keys(value);
    const entries = keys.slice(0, 50).map((key) => `${key}: ${formatValue(value[key], depth + 1, seen)}`);
    if (keys.length > 50) entries.push(`... ${keys.length - 50} more`);
    const name = value.constructor && value.constructor.name && value.constructor.name !== "Object"
      ? `${value.constructor.name} `
      : "";
    return `${name}{ ${entries.join(", ")} }`;
  } catch (error) {
    return `[Uninspectable: ${error && error.message ? error.message : "unknown"}]`;
  } finally {
    seen.delete(value);
  }
}

function send(type, text) {
  self.postMessage({ type, text: String(text) });
}

const consoleProxy = {};
for (const method of ["log", "info", "debug", "dir", "table", "trace"]) {
  consoleProxy[method] = (...args) => {
    send("stdout", args.map((value) => (typeof value === "string" ? value : formatValue(value))).join(" ") + "\n");
  };
}
for (const method of ["warn", "error"]) {
  consoleProxy[method] = (...args) => {
    send("stderr", args.map((value) => (typeof value === "string" ? value : formatValue(value))).join(" ") + "\n");
  };
}
consoleProxy.clear = () => send("clear", "");
consoleProxy.assert = (condition, ...args) => {
  if (!condition) {
    send("stderr", `Assertion failed${args.length ? `: ${args.map((value) => formatValue(value)).join(" ")}` : ""}\n`);
  }
};
const timers = new Map();
consoleProxy.count = (() => {
  const counts = new Map();
  return (label = "default") => {
    const next = (counts.get(label) || 0) + 1;
    counts.set(label, next);
    send("stdout", `${label}: ${next}\n`);
  };
})();
consoleProxy.time = (label = "default") => timers.set(label, performance.now());
consoleProxy.timeEnd = (label = "default") => {
  if (!timers.has(label)) {
    send("stderr", `Timer '${label}' does not exist\n`);
    return;
  }
  const elapsed = performance.now() - timers.get(label);
  timers.delete(label);
  send("stdout", `${label}: ${elapsed.toFixed(3)}ms\n`);
};

self.console = consoleProxy;

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type === "ping") {
    self.postMessage({ type: "ready" });
    return;
  }
  if (data.type !== "run") return;

  const started = performance.now();
  try {
    const runner = new AsyncFunction(
      "console",
      `"use strict";\n${String(data.code ?? "")}\n//# sourceURL=workspace/${String(data.filename || "main.js")}`
    );
    const value = await runner(consoleProxy);
    if (value !== undefined) {
      send("result", `${formatValue(value)}\n`);
    }
    self.postMessage({ type: "done", ok: true, ms: performance.now() - started, bytes: encoder.encode(String(data.code ?? "")).length });
  } catch (error) {
    if (error && error.name === "SyntaxError") {
      send("stderr", `${error.name}: ${error.message}\n`);
    } else if (error && error.stack) {
      const lines = String(error.stack).split("\n").slice(0, 8);
      send("stderr", `${lines.join("\n")}\n`);
    } else {
      send("stderr", `Uncaught ${formatValue(error)}\n`);
    }
    self.postMessage({ type: "done", ok: false, ms: performance.now() - started });
  }
});

self.postMessage({ type: "ready" });
