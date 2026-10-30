# Python IDE — client-side, static

A fully static, VS Code-flavoured IDE that runs in your browser. Python executes through
[Pyodide](https://pyodide.org/) (CPython compiled to WebAssembly) and JavaScript executes in a
throwaway Web Worker. There is **no backend and no build step** — the whole site is plain
HTML, CSS and ES modules, so it deploys straight to Render as a static site.

## Features

- **Monaco editor** (VS Code's editor) with real autocomplete, hover, signature help and
  light/dark themes.
- **Two runnable languages**: Python (Pyodide) and JavaScript (Web Worker). TypeScript,
  HTML, CSS, JSON, Markdown, Shell and PowerShell are first-class editing languages with
  proper language detection and a status-bar language picker.
- **Tkinter / turtle / pygame previews**: tkinter widgets render in a live Window panel,
  turtle and pygame draw on a Canvas panel.
- **A real shell** in the terminal: bash and PowerShell modes, pipes, redirects,
  `&&` / `||` / `;`, globs, variables (`$VAR`, `$?`, `$env:NAME`), aliases, history and
  tab completion. It operates on the same virtual workspace the editor shows.
- **Workspace persistence** in `localStorage` (files, folders, tabs, layout, settings).
- **Settings dialog**: theme, font size, tab size, word wrap, minimap, line numbers,
  quick suggestions, parameter hints, terminal font size and shell mode.
- **Import / export** of files and a full workspace reset.

## Project layout

```
index.html          markup + dialogs
assets/
  app.js            UI, editor, workers, settings, shell wiring
  styles.css        theme variables (dark + light) and layout
  worker.js         classic Web Worker wrapping Pyodide
  js-worker.js      throwaway worker for JavaScript runs
  shell.js          browser-side bash / PowerShell emulator
  shims.py          turtle / tkinter / pygame shims for Pyodide
  completions.js    Python IntelliSense data + providers
```

## Running locally

Any static file server works (the Pyodide worker needs HTTP, not `file://`):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploying to Render

Create a **Static Site** on Render, point it at this repository, and leave the build command
empty. The publish directory is the repository root. No Python/Node runtime is required on
the server.

## Limitations (read this before filing a bug)

- **No real shell**: `bash` and `pwsh` here are a high-fidelity emulator. Pipes, redirects,
  variables, globs, aliases and tab completion work, but there is no native process, no
  `fork`, no real filesystem permissions and no job control. `sleep` is capped at 10s.
- **pygame is a subset**: only the 2D drawing primitives and event loop used by the demos
  are implemented on top of the Canvas panel.
- **tkinter is approximate**: widgets are DOM elements styled to look like Tk; `mainloop()`
  returns immediately and events are delivered through the Window panel.
- **No `input()` blocking**: Python's `input()` raises `EOFError`. Use "Run with input…"
  to feed lines.
- **JavaScript has no DOM**: the JS worker is intentionally isolated.

## License

MIT.
