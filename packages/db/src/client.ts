import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDb>['db'];

/** Create a database client. Caller owns the lifecycle and should call close(). */
export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end() };
}

// A lazily-initialised shared singleton for app runtime use.
let shared: ReturnType<typeof createDb> | null = null;
export function db(): Database {
  if (!shared) shared = createDb();
  return shared.db;
}
export async function closeDb(): Promise<void> {
  if (shared) {
    await shared.close();
    shared = null;
  }
}
