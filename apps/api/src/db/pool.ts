import pg from 'pg';
import { config } from '../config.js';

const { Pool, types } = pg;

// node-postgres hands back DATE/TIMESTAMP as strings by default in some setups and
// as local-time Dates in others. Blood pressure is inherently a "when did this
// happen" record, so we keep everything as timestamptz and let pg build real Dates.
types.setTypeParser(types.builtins.INT8, (v) => Number.parseInt(v, 10));
types.setTypeParser(types.builtins.NUMERIC, (v) => Number.parseFloat(v));

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_MAX_POOL,
  // Cloud Run freezes idle instances; a short idle timeout avoids handing out
  // sockets Cloud SQL has already dropped.
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  application_name: `measure-pressure-api/${config.APP_ENV}`,
});

pool.on('error', (err) => {
  // An idle client blew up. Log rather than crash - the pool will replace it.
  console.error('[db] idle client error', err);
});

export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Human-readable description of what we are connected to, for startup logs. */
export function describeTarget(): string {
  try {
    const url = new URL(config.DATABASE_URL);
    const socket = url.searchParams.get('host');
    const host = socket ?? url.hostname ?? 'unknown';
    const database = url.pathname.replace(/^\//, '') || 'unknown';
    return `${database} @ ${host}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
