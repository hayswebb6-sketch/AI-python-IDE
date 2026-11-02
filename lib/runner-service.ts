import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import {
  ClientError,
  Render,
  SandboxCreateWaitError,
  SandboxEndedError,
  TimeoutError,
} from '@renderinc/sdk'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { runnerSessions } from '@/lib/db/schema'
import {
  parseWorkspaceFiles,
  type RunnerFile,
  type RunnerRuntime,
} from '@/lib/runner-contract'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const COMMAND_TIMEOUT_MS = 60_000
const RUNNER_REQUEST_TIMEOUT_MS = 15_000
const MAX_RUNNER_RESPONSE_CHARS = 3_000_000
const MAX_OUTPUT_CHARS = 200_000
const EVENT_POLL_INTERVAL_MS = 350
const RENDER_SANDBOX_WORKSPACE_ROOT = '/workspace'
const RENDER_SANDBOX_CREATE_TIMEOUT_MS = 20_000
const RENDER_SANDBOX_SETUP_TIMEOUT_MS = 15_000
const MAX_SANDBOX_MANIFEST_CHARS = 64_000
const MAX_CWD_LENGTH = 512
const FILE_SYNC_CONCURRENCY = 8

export class RunnerServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly remoteStatus?: number,
  ) {
    super(message)
    this.name = 'RunnerServiceError'
  }
}

type RunnerApiConfig = {
  baseUrl: URL
  token: string
}

type RemoteSession = {
  remoteId: string
  cwd: string
}

type OutputStream = 'stdout' | 'stderr'
type OutputCallback = (stream: OutputStream, data: string) => void

let renderClient: Render | undefined
let renderClientIdentity: string | undefined

function getRenderSandboxClient() {
  const token = process.env.RENDER_API_KEY?.trim()
  const ownerId = process.env.RENDER_WORKSPACE_ID?.trim()
  const sandboxGroupId = process.env.RENDER_SANDBOX_GROUP_ID?.trim()

  if (!token || !ownerId) {
    throw new RunnerServiceError(
      'Render Sandboxes is not configured on this deployment.',
      503,
      'runner_not_configured',
    )
  }

  if (!/^tea-[A-Za-z0-9-]+$/.test(ownerId)) {
    throw new RunnerServiceError(
      'The Render workspace ID is invalid.',
      503,
      'runner_configuration_invalid',
    )
  }

  if (sandboxGroupId && (!sandboxGroupId.startsWith('sbg-') || /[\r\n\0]/.test(sandboxGroupId))) {
    throw new RunnerServiceError(
      'The Render sandbox group ID is invalid.',
      503,
      'runner_configuration_invalid',
    )
  }

  const identity = `${ownerId}:${token}`
  if (!renderClient || renderClientIdentity !== identity) {
    renderClient = new Render({ token, ownerId })
    renderClientIdentity = identity
  }

  return { sandboxes: renderClient.sandboxes, sandboxGroupId: sandboxGroupId || undefined }
}

function windowsRunnerConfig(): RunnerApiConfig {
  const rawBaseUrl = process.env.WINDOWS_RUNNER_BASE_URL
  const token = process.env.WINDOWS_RUNNER_TOKEN
  const runtimeName = 'Windows PowerShell'

  if (!rawBaseUrl || !token) {
    throw new RunnerServiceError(
      `${runtimeName} runner is not configured on this deployment.`,
      503,
      'runner_not_configured',
    )
  }

  let baseUrl: URL
  try {
    baseUrl = new URL(rawBaseUrl)
  } catch {
    throw new RunnerServiceError(
      `${runtimeName} runner URL is invalid.`,
      503,
      'runner_configuration_invalid',
    )
  }

  const privateHost =
    baseUrl.hostname === 'localhost' ||
    baseUrl.hostname === '127.0.0.1' ||
    baseUrl.hostname.endsWith('.internal')

  if (
    !['http:', 'https:'].includes(baseUrl.protocol) ||
    (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:' && !privateHost) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new RunnerServiceError(
      `${runtimeName} runner URL must be a secure service URL.`,
      503,
      'runner_configuration_invalid',
    )
  }

  return { baseUrl, token }
}

async function requestWindowsRunner(
  endpoint: string,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    timeoutMs?: number
  },
): Promise<unknown> {
  const { baseUrl, token } = windowsRunnerConfig()
  const url = new URL(endpoint.replace(/^\/+/, ''), `${baseUrl.toString().replace(/\/+$/, '')}/`)
  const hasBody = options.body !== undefined

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? RUNNER_REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new RunnerServiceError(
      'The remote runner could not be reached.',
      502,
      'runner_unavailable',
    )
  }

  let text: string
  try {
    text = await response.text()
  } catch {
    throw new RunnerServiceError(
      'The remote runner returned an invalid response.',
      502,
      'runner_invalid_response',
    )
  }

  if (text.length > MAX_RUNNER_RESPONSE_CHARS) {
    throw new RunnerServiceError(
      'The remote runner response is too large.',
      502,
      'runner_response_too_large',
    )
  }

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      throw new RunnerServiceError(
        'The remote runner session has expired.',
        502,
        'runner_session_missing',
        response.status,
      )
    }

    throw new RunnerServiceError(
      'The remote runner request failed.',
      502,
      'runner_request_failed',
      response.status,
    )
  }

  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new RunnerServiceError(
      'The remote runner returned invalid JSON.',
      502,
      'runner_invalid_response',
    )
  }
}

function recordFromPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RunnerServiceError(
      'The remote runner returned an invalid response.',
      502,
      'runner_invalid_response',
    )
  }
  return value as Record<string, unknown>
}

function validateOpaqueId(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\r\n\0]/.test(value)) {
    throw new RunnerServiceError(
      `The remote runner returned an invalid ${label}.`,
      502,
      'runner_invalid_id',
    )
  }
  return value
}

function validateWorkingDirectory(value: unknown, runtime: RunnerRuntime) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    throw new RunnerServiceError(
      'The remote runner returned an invalid working directory.',
      502,
      'runner_invalid_cwd',
    )
  }

  const normalized = value.replace(/\\/g, '/')
  const rootPattern = runtime === 'bash' ? /^\/workspace(?:\/|$)/ : /^[a-z]:\/workspace(?:\/|$)/i
  const relative = runtime === 'bash'
    ? normalized.slice('/workspace'.length)
    : normalized.replace(/^[a-z]:\/workspace/i, '')

  if (!rootPattern.test(normalized) || relative.split('/').some((part) => part === '..' || part === '.')) {
    throw new RunnerServiceError(
      'The remote runner returned an invalid working directory.',
      502,
      'runner_invalid_cwd',
    )
  }

  return value
}

function cursorValue(value: unknown, fallback: string) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return fallback
}

async function createRemoteSession(runtime: RunnerRuntime): Promise<RemoteSession> {
  const workspaceRoot = runtime === 'bash' ? '/workspace' : 'C:\\workspace'
  const payload = recordFromPayload(
    await requestRunner(runtime, 'v1/sessions', {
      method: 'POST',
      body: {
        runtime,
        sessionKey: randomUUID(),
        workspaceRoot,
        idleTimeoutSeconds: 86_400,
        maxConcurrentCommands: 1,
      },
    }),
  )

  return {
    remoteId: validateOpaqueId(payload.id, 'session'),
    cwd: validateWorkingDirectory(payload.cwd ?? workspaceRoot, runtime),
  }
}

async function saveSession(userId: string, runtime: RunnerRuntime, remote: RemoteSession) {
  const now = new Date()
  const [session] = await db
    .insert(runnerSessions)
    .values({
      id: randomUUID(),
      userId,
      runtime,
      remoteId: remote.remoteId,
      cwd: remote.cwd,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    })
    .onConflictDoUpdate({
      target: [runnerSessions.userId, runnerSessions.runtime],
      set: {
        id: randomUUID(),
        remoteId: remote.remoteId,
        cwd: remote.cwd,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      },
    })
    .returning()

  if (!session) {
    throw new RunnerServiceError(
      'The runner session could not be saved.',
      500,
      'runner_session_storage_failed',
    )
  }

  return session
}

async function findSession(userId: string, runtime: RunnerRuntime) {
  const [session] = await db
    .select()
    .from(runnerSessions)
    .where(
      and(
        eq(runnerSessions.userId, userId),
        eq(runnerSessions.runtime, runtime),
        gt(runnerSessions.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return session
}

async function pollRunnerProcess(
  runtime: RunnerRuntime,
  sessionPath: string,
  processId: string,
  initialCwd: string,
  onOutput?: OutputCallback,
) {
  const deadline = Date.now() + COMMAND_TIMEOUT_MS + 5_000
  let cursor = '0'
  let outputChars = 0
  let truncationNotified = false
  let cwd = initialCwd

  while (Date.now() < deadline) {
    const query = new URLSearchParams({ cursor })
    const payload = recordFromPayload(
      await requestRunner(
        runtime,
        `${sessionPath}/processes/${encodeURIComponent(processId)}/events?${query.toString()}`,
        { method: 'GET', timeoutMs: 10_000 },
      ),
    )

    if (!Array.isArray(payload.events)) {
      throw new RunnerServiceError(
        'The remote runner returned invalid process events.',
        502,
        'runner_invalid_events',
      )
    }

    for (const value of payload.events) {
      const event = recordFromPayload(value)
      if (
        (event.stream !== 'stdout' && event.stream !== 'stderr') ||
        typeof event.data !== 'string'
      ) {
        throw new RunnerServiceError(
          'The remote runner returned invalid process events.',
          502,
          'runner_invalid_events',
        )
      }

      cursor = cursorValue(event.cursor, cursor)
      const remaining = Math.max(0, MAX_OUTPUT_CHARS - outputChars)
      const data = event.data.slice(0, remaining)
      if (data) {
        outputChars += data.length
        onOutput?.(event.stream, data)
      }
      if (event.data.length > remaining && !truncationNotified) {
        truncationNotified = true
        onOutput?.('stderr', '\n[runner output truncated]\n')
      }
    }

    cursor = cursorValue(payload.nextCursor, cursor)
    if (typeof payload.cwd === 'string') cwd = validateWorkingDirectory(payload.cwd, runtime)

    if (payload.status === 'completed' || payload.status === 'failed') {
      if (!Number.isInteger(payload.exitCode)) {
        throw new RunnerServiceError(
          'The remote runner omitted the process exit code.',
          502,
          'runner_invalid_exit_code',
        )
      }
      return { exitCode: Number(payload.exitCode), cwd }
    }

    if (payload.status !== 'running') {
      throw new RunnerServiceError(
        'The remote runner returned an invalid process status.',
        502,
        'runner_invalid_status',
      )
    }

    await new Promise<void>((resolve) => setTimeout(resolve, EVENT_POLL_INTERVAL_MS))
  }

  throw new RunnerServiceError(
    'The remote command exceeded its time limit.',
    504,
    'runner_timeout',
  )
}

async function executeOnSession(
  userId: string,
  runtime: RunnerRuntime,
  session: typeof runnerSessions.$inferSelect,
  command: string,
  files: RunnerFile[],
  onOutput?: OutputCallback,
) {
  const sessionPath = `v1/sessions/${encodeURIComponent(session.remoteId)}`

  await requestRunner(runtime, `${sessionPath}/workspace`, {
    method: 'PUT',
    body: { files },
    timeoutMs: 20_000,
  })

  const commandPayload = recordFromPayload(
    await requestRunner(runtime, `${sessionPath}/commands`, {
      method: 'POST',
      body: {
        command,
        cwd: session.cwd,
        timeoutMs: COMMAND_TIMEOUT_MS,
      },
      timeoutMs: 15_000,
    }),
  )
  const processId = validateOpaqueId(commandPayload.processId, 'process ID')
  const processResult = await pollRunnerProcess(runtime, sessionPath, processId, session.cwd, onOutput)

  const workspacePayload = recordFromPayload(
    await requestRunner(runtime, `${sessionPath}/workspace/changes`, {
      method: 'GET',
      timeoutMs: 20_000,
    }),
  )

  let syncedFiles: RunnerFile[]
  try {
    syncedFiles = parseWorkspaceFiles(workspacePayload.files)
  } catch {
    throw new RunnerServiceError(
      'The remote runner returned invalid workspace files.',
      502,
      'runner_invalid_files',
    )
  }

  const cwd = validateWorkingDirectory(workspacePayload.cwd ?? processResult.cwd, runtime)
  const now = new Date()

  await db
    .update(runnerSessions)
    .set({
      cwd,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    })
    .where(
      and(
        eq(runnerSessions.id, session.id),
        eq(runnerSessions.userId, userId),
        eq(runnerSessions.runtime, runtime),
      ),
    )

  return { exitCode: processResult.exitCode, cwd, files: syncedFiles }
}

export async function executeRunnerCommand(
  userId: string,
  runtime: RunnerRuntime,
  command: string,
  files: RunnerFile[],
  onOutput?: OutputCallback,
) {
  const session = await findSession(userId, runtime)
  const activeSession = session ?? (await saveSession(userId, runtime, await createRemoteSession(runtime)))

  try {
    return await executeOnSession(userId, runtime, activeSession, command, files, onOutput)
  } catch (error) {
    if (!(error instanceof RunnerServiceError) || error.code !== 'runner_session_missing') {
      throw error
    }

    const replacement = await saveSession(userId, runtime, await createRemoteSession(runtime))
    return executeOnSession(userId, runtime, replacement, command, files, onOutput)
  }
}

export async function closeRunnerSessions(userId: string) {
  const sessions = await db
    .select()
    .from(runnerSessions)
    .where(eq(runnerSessions.userId, userId))

  await Promise.allSettled(
    sessions.map((session) =>
      requestRunner(
        session.runtime,
        `v1/sessions/${encodeURIComponent(session.remoteId)}`,
        { method: 'DELETE', timeoutMs: 5_000 },
      ),
    ),
  )

  await db.delete(runnerSessions).where(eq(runnerSessions.userId, userId))
}
