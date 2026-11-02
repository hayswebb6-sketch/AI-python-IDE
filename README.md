# Python IDE — browser-based static workspace

A static, browser-hosted IDE for writing and running code locally in the browser. The app is intentionally backend-free and can be served from any static host or local HTTP server.

Python runs in a Pyodide-backed Web Worker using CPython compiled to WebAssembly. JavaScript runs in a separate browser sandbox. The app includes a file explorer, Monaco-style editor, terminal, canvas preview, and Tk-inspired window panel.

This is not a full server-backed IDE. There is no backend, no database, and no build step. The project is plain HTML, CSS, and ES modules.

## What it does

- Monaco-style editor surface with tabs, breadcrumbs, status bar, and file management
- Python execution via Pyodide / WebAssembly
- JavaScript execution in an isolated iframe sandbox
- Shell-style terminal emulation with command history and prompt interactions
- A per-tab terminal username prompt; the alias stays in session storage and is never sent to a server
- Canvas output for turtle / pygame-style drawing
- Tk-inspired widget rendering in a Window panel
- Workspace persistence in localStorage
- Import / export of files
- Theme settings and editor settings persistence
- Language switching and documentation links

## Supported execution modes

- Python: runs through Pyodide
- JavaScript: runs in a fresh browser sandbox and streams console output back to the terminal
- Lua: runs in a dedicated worker
- SQL: runs in a dedicated worker
- Shell scripts: executes through the in-browser shell emulator
- HTML: opens a preview window for generated HTML content

## Project layout

```text
index.html              page structure, dialogs, shell UI
assets/
  app.js                 main app logic, editor, file system, runtime wiring
  shell.js               browser-side shell emulator
  worker.js              Pyodide worker and Python runtime bootstrap
  js-worker.js           JavaScript execution worker
  lua-worker.js          Lua execution worker
  sql-worker.js          SQL execution worker
  shims.py               browser-side shims for turtle / tkinter / pygame
  completions.js         completion metadata for editor IntelliSense
  styles.css             layout and theme styling
sw.js                   service worker cache for static assets
README.md               project documentation
```

## Running locally

Because Pyodide loads browser resources over HTTP, you should not open the app as a `file://` page. Use a local static server instead:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deploying

This project is designed for a static host such as Render, GitHub Pages, Netlify, or any simple web server.

Typical static deployment steps:

- Connect the repository to a static hosting service
- Use the repository root as the publish directory
- Leave the build command blank
- Ensure the site is served from HTTP (not local files)

For a root-based hosting setup, the included service worker is expected to operate from the site root.

## Important limitations

- This is not a real operating-system shell; it is a browser-based shell emulator.
- `bash` / `pwsh` behavior is intentionally approximated and does not provide full native process control.
- There is no real filesystem permission model or real `fork` / `exec` behavior.
- `input()` is not a blocking terminal experience the way a native Python runtime is.
- `pygame` and `tkinter` support are browser approximations rather than full desktop behavior.
- JavaScript execution is intentionally isolated and does not have access to the real DOM.
- The app relies on browser APIs such as `localStorage`, `Worker`, and service workers.

## Browser requirements

This app works best in a modern browser with support for:

- ES modules
- Web Workers
- Canvas / 2D graphics
- localStorage
- iframe sandboxing

## License

MIT.
