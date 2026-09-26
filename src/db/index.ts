import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * D1 + Drizzle クライアントのファクトリ。
 *
 * ⚠ Cloudflare Workers ではバインディング（D1Database オブジェクト）は process.env には
 *    現れない（nodejs_compat が写すのは vars/secrets のみ）。TanStack Start のサーバー
 *    関数からは fetch ハンドラの実 env に直接アクセスできないため、Workers ランタイムが
 *    リクエストごとに提供する `cloudflare:workers` の ambient env を使う（R2バインディングと
 *    同じ問題に対する同じ解決）。引数なしで呼べる: `const db = createDb()`。
 *
 * ドライバは drizzle-orm/d1。対話的トランザクションは持たないが、状態遷移の原子性は
 * 「WHERE ガード付きの単一 UPDATE（楽観的更新）」と `db.batch([...])` で担保する。
 * 例) T1: UPDATE subject_settings SET state='unresponsive' WHERE user_id=? AND state='normal'
 */

type CloudflareEnv = { DB: D1Database };

/** 環境変数の不足など、リクエスト側の問題ではない設定ミス。ルート層で 503 に写す。 */
export class ConfigError extends Error {}

export function createDb() {
  const d1 = (env as unknown as CloudflareEnv).DB;
  if (!d1) {
    throw new ConfigError(
      'D1バインディング(DB)が見つかりません。wrangler.jsonc / wrangler-dev.jsonc の d1_databases を確認してください。',
    );
  }
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
