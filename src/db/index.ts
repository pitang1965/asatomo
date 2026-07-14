import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Neon + Drizzle クライアントのファクトリ。
 *
 * ⚠ Cloudflare Workers ではバインディング（env）はリクエストハンドラ内でのみ有効。
 *    モジュールレベルで初期化してはいけない（ADR/技術メモ）。必ずリクエストごとに呼ぶ:
 *
 *      const db = createDb(env.DATABASE_URL);
 *
 * ドライバは neon-http（HTTP・serverless向き・軽量）。対話的トランザクションは持たないが、
 * 状態遷移の原子性は「WHERE ガード付きの単一 UPDATE（楽観的更新）」と `db.batch([...])` で担保する。
 * 例) T1: UPDATE subject_settings SET state='unresponsive' WHERE user_id=? AND state='normal'
 */
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
