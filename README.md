# PyIDE

PyIDE is a browser-based Python IDE with local Pyodide execution and authenticated remote Bash and PowerShell terminals. The App Router shell, Better Auth session handling, and runner proxy are designed for a Node.js web service on Render.

## Features

- Monaco editor, tabs, workspace files, and browser-side workspace persistence
- Python execution in a Pyodide Web Worker, plus JavaScript, Lua, and SQL workers
- Python IntelliSense for Tkinter, NumPy, pandas, Matplotlib, and standard-library modules
- Authenticated email/password accounts with Better Auth and Neon Postgres
- User-scoped Bash and PowerShell runner sessions
- Workspace snapshot upload before each remote command and file sync back afterward
- Isolated HTML, canvas, and Tk-inspired previews

## Render setup

The included `render.yaml` configures a Node web service with `npm ci`, `npm run build`, `npm start`, and `/api/health` as its health check. Its `sync: false` entries prompt for credentials in Render instead of storing values in the repository.

Set these environment variables on the Render service:

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection URL (use the pooled URL) |
| `BETTER_AUTH_SECRET` | Random session-signing secret, at least 32 characters |
| `LINUX_RUNNER_BASE_URL` | HTTPS base URL for the isolated Linux runner API |
| `LINUX_RUNNER_TOKEN` | Server-only bearer token for the Linux runner |
| `WINDOWS_RUNNER_BASE_URL` | HTTPS base URL for the Windows VM API |
| `WINDOWS_RUNNER_TOKEN` | Server-only bearer token for the Windows runner |

Render provides `RENDER_EXTERNAL_URL` automatically. Set `BETTER_AUTH_URL` only when using a custom canonical domain. Environment variables configured in v0/Vercel do not automatically transfer to Render.

## Runner API contract

The app calls both runner services from its authenticated server route; credentials are never sent to the browser. Each service must isolate sessions, enforce command, output, upload, resource, and single-concurrent-command limits, and expire idle sessions after 24 hours. The app requests session deletion at sign-out.

- `POST /v1/sessions` with `{ runtime, sessionKey, workspaceRoot, idleTimeoutSeconds, maxConcurrentCommands }` returns `{ id, cwd }`.
- `PUT /v1/sessions/:id/workspace` with `{ files: [{ path, content }] }` replaces the complete session workspace.
- `POST /v1/sessions/:id/commands` with `{ command, cwd, timeoutMs }` returns `{ processId }`.
- `GET /v1/sessions/:id/processes/:processId/events?cursor=0` returns `{ events, nextCursor, status, exitCode, cwd }`. Each event is `{ cursor, stream, data }`, where `stream` is `stdout` or `stderr` and `status` is `running`, `completed`, or `failed`.
- `GET /v1/sessions/:id/workspace/changes` returns the full synchronized workspace as `{ files: [{ path, content }], cwd }`.
- `DELETE /v1/sessions/:id` closes the remote session.

The app streams output events to the terminal as they arrive. The Linux image should include `curl` and `wget`; the Windows VM should provide PowerShell and `winget` (with `curl`/`wget` if needed). The Linux service accepts `runtime: "bash"` and uses `/workspace` as its root. The Windows service accepts `runtime: "pwsh"` and uses `C:\workspace`. File paths are relative to the session workspace. Each signed-in user gets a separate session per runtime, and every Neon query is scoped by the authenticated user ID.

## Local development

Install the dependencies with npm, then run the Next.js development server. The editor surface is served from `public/ide.html`; the home page and direct IDE document both require a signed-in session and redirect signed-out visitors to `/sign-in`.

The project uses `DATABASE_URL` and `BETTER_AUTH_SECRET` for auth. Runner APIs are optional for viewing the editor, but their corresponding URL and token must be configured before Bash or PowerShell commands can run.

## License

MIT.
