import { createDb, type Database } from '@redline/db';

declare global {
  // eslint-disable-next-line no-var
  var __redlineDb: ReturnType<typeof createDb> | undefined;
}

/** Single shared DB handle across hot reloads in dev. */
function handle() {
  if (!globalThis.__redlineDb) {
    globalThis.__redlineDb = createDb(process.env.DATABASE_URL ?? 'postgresql://manu@localhost:5432/redline');
  }
  return globalThis.__redlineDb;
}

export function db(): Database {
  return handle().db;
}
