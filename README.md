# PyIDE

PyIDE is a browser-based Python IDE with local Pyodide execution and authenticated remote Bash and PowerShell terminals. The App Router shell, Better Auth session handling, and runner proxy are designed for a Node.js web service on Render.

## Features

- Monaco editor, tabs, workspace files, and browser-side workspace persistence
- Python execution in a Pyodide Web Worker, plus JavaScript, Lua, and SQL workers
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

The app calls both runner services from its authenticated server route; runner credentials are never sent to the browser. Each runner service must isolate sessions, enforce its own command/resource limits, and implement the same JSON API:

- `POST /v1/sessions` with `{ runtime, sessionKey, workspaceRoot }` returns `{ id, cwd }`.
- `PUT /v1/sessions/:id/files` with `{ files: [{ path, content }] }` replaces the session workspace snapshot.
- `POST /v1/sessions/:id/commands` with `{ command, cwd, timeoutMs }` returns `{ stdout, stderr, exitCode, cwd }`.
- `GET /v1/sessions/:id/files` returns the full synchronized workspace as `{ files: [{ path, content }] }`.

The Linux service accepts `runtime: "bash"` and uses `/workspace` as its root. The Windows service accepts `runtime: "pwsh"` and uses `C:\workspace`. File paths are relative to the session workspace. The app uses one remote session per signed-in user and runtime, and scopes every Neon lookup by the authenticated user ID.

## Local development

Install the dependencies with npm, then run the Next.js development server. The existing editor surface is served from `public/ide.html`; the protected app route redirects signed-out visitors to `/sign-in`.

The project uses `DATABASE_URL` and `BETTER_AUTH_SECRET` for auth. Runner APIs are optional for viewing the editor, but their corresponding URL and token must be configured before Bash or PowerShell commands can run.

## License

MIT.
