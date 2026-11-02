import { randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { runnerSessions } from '@/lib/db/schema'
import {
  parseWorkspaceFiles,
  type RunnerFile,
  type RunnerRuntime,
} from '@/lib/runner-contract'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const RUNNER_TIMEOUT_MS = 70_000
const MAX_RUNNER_RESPONSE_CHARS = 3_000_000
const MAX_OUTPUT_CHARS = 200_000

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

function runnerConfig(runtime: RunnerRuntime): RunnerApiConfig {
  const prefix = runtime === 'bash' ? 'LINUX' : 'WINDOWS'
  const rawBaseUrl = process.env[`${prefix}_RUNNER_BASE_URL`]
  const token = process.env[`${prefix}_RUNNER_TOKEN`]
  const runtimeName = runtime === 'bash' ? 'Linux Bash' : 'Windows PowerShell'

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

async function requestRunner(
  runtime: RunnerRuntime,
  endpoint: string,
  options: { method: 'GET' | 'POST' | 'PUT'; body?: unknown },
): Promise<unknown> {
  const { baseUrl, token } = runnerConfig(runtime)
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
      signal: AbortSignal.timeout(RUNNER_TIMEOUT_MS),
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
    throw new RunnerServiceError('The remote runner returned an invalid response.', 502, 'runner_invalid_response')
  }

  if (text.length > MAX_RUNNER_RESPONSE_CHARS) {
    throw new RunnerServiceError('The remote runner response is too large.', 502, 'runner_response_too_large')
  }

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      throw new RunnerServiceError('The remote runner session has expired.', 502, 'runner_session_missing', response.status)
    }

    throw new RunnerServiceError('The remote runner request failed.', 502, 'runner_request_failed', response.status)
  }

  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new RunnerServiceError('The remote runner returned invalid JSON.', 502, 'runner_invalid_response')
  }
}

function recordFromPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RunnerServiceError('The remote runner returned an invalid response.', 502, 'runner_invalid_response')
  }
  return value as Record<string, unknown>
}

function validateRemoteId(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\r\n\0]/.test(value)) {
    throw new RunnerServiceError('The remote runner returned an invalid session.', 502, 'runner_invalid_session')
  }
  return value
}

function validateWorkingDirectory(value: unknown, runtime: RunnerRuntime) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    throw new RunnerServiceError('The remote runner returned an invalid working directory.', 502, 'runner_invalid_cwd')
  }

  const normalized = value.replace(/\\/g, '/')
  const rootPattern = runtime === 'bash' ? /^\/workspace(?:\/|$)/ : /^[a-z]:\/workspace(?:\/|$)/i
  const relative = runtime === 'bash'
    ? normalized.slice('/workspace'.length)
    : normalized.replace(/^[a-z]:\/workspace/i, '')

  if (!rootPattern.test(normalized) || relative.split('/').some((part) => part === '..' || part === '.')) {
    throw new RunnerServiceError('The remote runner returned an invalid working directory.', 502, 'runner_invalid_cwd')
  }

  return value
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
      },
    }),
  )

  return {
    remoteId: validateRemoteId(payload.id),
    cwd: validateWorkingDirectory(payload.cwd ?? workspaceRoot, runtime),
  }
}

async function saveSession(
  userId: string,
  runtime: RunnerRuntime,
  remote: RemoteSession,
) {
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
    throw new RunnerServiceError('The runner session could not be saved.', 500, 'runner_session_storage_failed')
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

async function executeOnSession(
  userId: string,
  runtime: RunnerRuntime,
  session: typeof runnerSessions.$inferSelect,
  command: string,
  files: RunnerFile[],
) {
  const sessionPath = `v1/sessions/${encodeURIComponent(session.remoteId)}`

  await requestRunner(runtime, `${sessionPath}/files`, {
    method: 'PUT',
    body: { files },
  })

  const commandPayload = recordFromPayload(
    await requestRunner(runtime, `${sessionPath}/commands`, {
      method: 'POST',
      body: {
        command,
        cwd: session.cwd,
        timeoutMs: 60_000,
      },
    }),
  )

  const workspacePayload = recordFromPayload(
    await requestRunner(runtime, `${sessionPath}/files`, { method: 'GET' }),
  )

  let syncedFiles: RunnerFile[]
  try {
    syncedFiles = parseWorkspaceFiles(workspacePayload.files)
  } catch {
    throw new RunnerServiceError('The remote runner returned invalid workspace files.', 502, 'runner_invalid_files')
  }

  const cwd = validateWorkingDirectory(commandPayload.cwd ?? session.cwd, runtime)
  const stdout = typeof commandPayload.stdout === 'string' ? commandPayload.stdout.slice(0, MAX_OUTPUT_CHARS) : ''
  const stderr = typeof commandPayload.stderr === 'string' ? commandPayload.stderr.slice(0, MAX_OUTPUT_CHARS) : ''
  const exitCode = Number.isInteger(commandPayload.exitCode) ? Number(commandPayload.exitCode) : 1
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

  return { stdout, stderr, exitCode, cwd, files: syncedFiles }
}

export async function executeRunnerCommand(
  userId: string,
  runtime: RunnerRuntime,
  command: string,
  files: RunnerFile[],
) {
  const session = await findSession(userId, runtime)
  const activeSession = session ?? (await saveSession(userId, runtime, await createRemoteSession(runtime)))

  try {
    return await executeOnSession(userId, runtime, activeSession, command, files)
  } catch (error) {
    if (!(error instanceof RunnerServiceError) || error.code !== 'runner_session_missing') {
      throw error
    }

    const replacement = await saveSession(userId, runtime, await createRemoteSession(runtime))
    return executeOnSession(userId, runtime, replacement, command, files)
  }
}
