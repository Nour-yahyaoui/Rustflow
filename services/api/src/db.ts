import { readFile } from "node:fs/promises";
import pg from "pg";
export interface QueryResult<T> {
  rows: T[];
  rowCount: number | null;
}
export interface Connection {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}
export interface Database extends Connection {
  transaction<T>(fn: (connection: Connection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function database(url: string): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", () => console.error("Idle PostgreSQL connection failed"));
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ) => pool.query<T>(sql, values),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await fn(client);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export async function migrate(db: Database) {
  const sql = await readFile(
    new URL("../../../database/migrations/001_cloud.sql", import.meta.url),
    "utf8",
  );
  await db.transaction(async (connection) => {
    await connection.query("SELECT pg_advisory_xact_lock(7246219)");
    await connection.query(sql);
  });
}
