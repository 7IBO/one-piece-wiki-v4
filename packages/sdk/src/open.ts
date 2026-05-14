/**
 * openDatabase: thin convenience wrapper around bun:sqlite that
 * returns a SqliteLike compatible with the SDK client. Apps that need
 * better-sqlite3 (e.g. Node serverless) can build their own
 * SqliteLike adapter and pass it to createClient directly.
 */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type { Row, SqliteLike } from './client.ts';

export function openDatabase(path: string): SqliteLike {
  const db = new Database(path, { readonly: true });
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        all: (...params: unknown[]): Row[] => stmt.all(...(params as SQLQueryBindings[])) as Row[],
        get: (...params: unknown[]): Row | undefined =>
          (stmt.get(...(params as SQLQueryBindings[])) ?? undefined) as Row | undefined,
      };
    },
    close(): void {
      db.close();
    },
  };
}
