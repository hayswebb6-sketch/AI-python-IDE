import { auth } from '@/lib/auth'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (session?.user) return NextResponse.next()

  const signInUrl = request.nextUrl.clone()
  signInUrl.pathname = '/sign-in'
  signInUrl.search = ''
  return NextResponse.redirect(signInUrl)
}

export const config = {
  matcher: ['/ide.html'],
}
