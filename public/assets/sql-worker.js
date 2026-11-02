/**
 * SQL runner using sql.js (SQLite compiled to WebAssembly).
 */
let SQL = null;

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type !== "run") return;

  if (!SQL) {
    try {
      importScripts("https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js");
      SQL = await initSqlJs({
        locateFile: () => "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.wasm",
      });
    } catch (error) {
      self.postMessage({ type: "stderr", text: `Could not load sql.js: ${error && error.message ? error.message : error}\n` });
      self.postMessage({ type: "done", ok: false, ms: 0 });
      return;
    }
  }

  const started = performance.now();
  const db = new SQL.Database();
  const statements = String(data.code || "").trim();
  if (!statements) {
    self.postMessage({ type: "done", ok: true, ms: performance.now() - started });
    return;
  }

  try {
    const results = db.exec(statements);
    if (!results.length) {
      self.postMessage({ type: "stdout", text: "Statement executed successfully.\n" });
    } else {
      for (const result of results) {
        const { columns, values } = result;
        self.postMessage({ type: "stdout", text: columns.join(" | ") + "\n" });
        self.postMessage({ type: "stdout", text: "-".repeat(columns.join(" | ").length) + "\n" });
        for (const row of values) {
          self.postMessage({ type: "stdout", text: row.map((value) => (value === null ? "NULL" : String(value))).join(" | ") + "\n" });
        }
        self.postMessage({ type: "stdout", text: `(${values.length} row${values.length === 1 ? "" : "s"})\n\n` });
      }
    }
    self.postMessage({ type: "done", ok: true, ms: performance.now() - started });
  } catch (error) {
    self.postMessage({ type: "stderr", text: `${error && error.message ? error.message : error}\n` });
    self.postMessage({ type: "done", ok: false, ms: performance.now() - started });
  } finally {
    db.close();
  }
});

self.postMessage({ type: "ready" });
