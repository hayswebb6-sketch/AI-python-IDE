import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

function databaseConnectionString() {
  const value = process.env.DATABASE_URL
  if (!value) return undefined

  const connectionString = new URL(value)
  if (connectionString.searchParams.get('sslmode') === 'require') {
    connectionString.searchParams.set('sslmode', 'verify-full')
  }
  return connectionString.toString()
}

export const pool = new Pool({
  connectionString: databaseConnectionString(),
})

export const db = drizzle(pool, { schema })
