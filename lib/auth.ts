import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

function toOrigin(value?: string) {
  if (!value) return undefined

  try {
    const url = value.includes('://') ? value : `https://${value}`
    return new URL(url).origin
  } catch {
    return undefined
  }
}

function uniqueOrigins(values: Array<string | undefined>) {
  return [...new Set(values.map(toOrigin).filter((origin): origin is string => Boolean(origin)))]
}

const isDevelopment = process.env.NODE_ENV === 'development'
const baseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  process.env.V0_RUNTIME_URL

const trustedOrigins = isDevelopment
  ? uniqueOrigins([
      'http://localhost:3000',
      process.env.BETTER_AUTH_URL,
      process.env.V0_RUNTIME_URL,
      process.env.V0_DEV_APP_URL,
      process.env.V0_BUILD_URL,
      process.env.V0_SANDBOX_URL,
    ])
  : uniqueOrigins([
      process.env.BETTER_AUTH_URL,
      process.env.RENDER_EXTERNAL_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ])

export const auth = betterAuth({
  database: pool,
  baseURL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins,
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  ...(process.env.NODE_ENV === 'development'
    ? {
        // The v0 preview is cross-site framed, so the auth cookie must be usable there.
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
