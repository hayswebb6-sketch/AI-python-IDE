import { auth } from '@/lib/auth'
import { parseRunnerExecution, RunnerInputError } from '@/lib/runner-contract'
import { executeRunnerCommand, RunnerServiceError } from '@/lib/runner-service'

export const runtime = 'nodejs'
export const maxDuration = 90

const noStore = { 'Cache-Control': 'no-store, max-age=0' }
const MAX_REQUEST_CHARS = 3_000_000

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return Response.json({ error: 'Sign in to use the remote terminal.' }, { status: 401, headers: noStore })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_CHARS) {
    return Response.json({ error: 'Workspace request is too large.' }, { status: 413, headers: noStore })
  }

  let payload: unknown
  try {
    const body = await request.text()
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_CHARS) {
      return Response.json({ error: 'Workspace request is too large.' }, { status: 413, headers: noStore })
    }
    payload = JSON.parse(body) as unknown
  } catch {
    return Response.json({ error: 'Request body is invalid.' }, { status: 400, headers: noStore })
  }

  let input
  try {
    input = parseRunnerExecution(payload)
  } catch (error) {
    if (error instanceof RunnerInputError) {
      return Response.json({ error: error.message }, { status: 400, headers: noStore })
    }
    return Response.json({ error: 'Request body is invalid.' }, { status: 400, headers: noStore })
  }

  try {
    const result = await executeRunnerCommand(
      session.user.id,
      input.runtime,
      input.command,
      input.files,
    )
    return Response.json(result, { headers: noStore })
  } catch (error) {
    if (error instanceof RunnerServiceError) {
      if (error.status >= 500) {
        console.error('[runner] request failed', {
          runtime: input.runtime,
          code: error.code,
          remoteStatus: error.remoteStatus,
        })
      }
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: noStore },
      )
    }

    console.error('[runner] unexpected failure', { runtime: input.runtime })
    return Response.json({ error: 'The remote runner request failed.' }, { status: 502, headers: noStore })
  }
}
