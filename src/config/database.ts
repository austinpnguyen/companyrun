import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env.js';
import * as schema from '../db/schema.js';

/** Raw postgres.js connection — used by Drizzle internally */
const connection = postgres(env.DATABASE_URL ?? '', {
  max: 10, // connection pool size
  idle_timeout: 20,
  connect_timeout: 10,
});

/** Drizzle ORM instance with full schema type inference */
export const db = drizzle(connection, { schema });

/** Close the database connection pool (for graceful shutdown) */
export async function closeDatabase(): Promise<void> {
  await connection.end();
}
