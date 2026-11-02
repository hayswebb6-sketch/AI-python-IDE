import { auth } from '@/lib/auth'
import { closeRunnerSessions } from '@/lib/runner-service'

const noStore = { 'Cache-Control': 'no-store, max-age=0' }

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return Response.json({ error: 'Sign in to close runner sessions.' }, { status: 401, headers: noStore })
  }

  try {
    await closeRunnerSessions(session.user.id)
    return Response.json({ closed: true }, { headers: noStore })
  } catch {
    console.error('[runner] session cleanup failed')
    return Response.json({ error: 'Runner sessions could not be closed.' }, { status: 500, headers: noStore })
  }
}
