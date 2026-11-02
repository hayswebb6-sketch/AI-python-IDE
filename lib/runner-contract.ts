export type RunnerRuntime = 'bash' | 'pwsh'

export type RunnerFile = {
  path: string
  content: string
}

export type RunnerExecutionInput = {
  runtime: RunnerRuntime
  command: string
  files: RunnerFile[]
}

export class RunnerInputError extends Error {}

export const MAX_RUNNER_FILES = 100
export const MAX_RUNNER_FILE_BYTES = 512_000
export const MAX_RUNNER_WORKSPACE_BYTES = 2_000_000
export const MAX_RUNNER_COMMAND_LENGTH = 8_192

export function parseWorkspaceFiles(value: unknown): RunnerFile[] {
  if (!Array.isArray(value) || value.length > MAX_RUNNER_FILES) {
    throw new RunnerInputError('Workspace file list is invalid.')
  }

  const encoder = new TextEncoder()
  const seenPaths = new Set<string>()
  let workspaceBytes = 0

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new RunnerInputError('Workspace file entry is invalid.')
    }

    const candidate = entry as Record<string, unknown>
    const path = normalizeWorkspacePath(candidate.path)
    if (seenPaths.has(path)) throw new RunnerInputError('Workspace paths must be unique.')
    seenPaths.add(path)

    if (typeof candidate.content !== 'string') {
      throw new RunnerInputError('Workspace file contents are invalid.')
    }

    const bytes = encoder.encode(candidate.content).byteLength
    if (bytes > MAX_RUNNER_FILE_BYTES) {
      throw new RunnerInputError('A workspace file is too large to sync.')
    }

    workspaceBytes += bytes
    if (workspaceBytes > MAX_RUNNER_WORKSPACE_BYTES) {
      throw new RunnerInputError('The workspace is too large to sync.')
    }

    return { path, content: candidate.content }
  })
}

export function parseRunnerExecution(value: unknown): RunnerExecutionInput {
  if (!value || typeof value !== 'object') {
    throw new RunnerInputError('Request body is invalid.')
  }

  const candidate = value as Record<string, unknown>
  if (candidate.runtime !== 'bash' && candidate.runtime !== 'pwsh') {
    throw new RunnerInputError('Choose Bash or PowerShell.')
  }

  if (
    typeof candidate.command !== 'string' ||
    !candidate.command.trim() ||
    candidate.command.length > MAX_RUNNER_COMMAND_LENGTH
  ) {
    throw new RunnerInputError('Command is empty or too long.')
  }

  return {
    runtime: candidate.runtime,
    command: candidate.command,
    files: parseWorkspaceFiles(candidate.files),
  }
}

function normalizeWorkspacePath(value: unknown) {
  if (typeof value !== 'string') {
    throw new RunnerInputError('Workspace path is invalid.')
  }

  const path = value.replace(/\\/g, '/')
  const segments = path.split('/')
  if (
    !path ||
    path.length > 240 ||
    path.startsWith('/') ||
    /^[a-z]:/i.test(path) ||
    path.includes('\0') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new RunnerInputError('Workspace path is invalid.')
  }

  return segments.join('/')
}
