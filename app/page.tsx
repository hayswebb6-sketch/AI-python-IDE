import { createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const workspaceScope = createHash('sha256')
    .update(session.user.id)
    .digest('hex')
    .slice(0, 20)

  return (
    <main className="ide-host">
      <iframe
        className="ide-frame"
        src={`/ide.html?workspace=${workspaceScope}`}
        title="Python IDE workspace"
        allow="clipboard-read; clipboard-write"
        referrerPolicy="same-origin"
      />
    </main>
  )
}
