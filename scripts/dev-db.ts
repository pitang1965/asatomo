import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config as loadDotenv } from 'dotenv';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';

/**
 * 開発スクリプトの共有ユーティリティ（環境変数の読み込み・ローカルD1接続）。
 *
 * 方針（nafuda と同じ file-per-env・staging なし）:
 *   サーバーランタイムのシークレットは `.dev.vars`（Miniflare/wrangler標準、vite.config.ts の
 *   cloudflareプラグインが本体アプリへ流し込むのと同じファイル）。dev スクリプトも同じ値を
 *   見るようこれだけを読む。本番マイグレーションは `npm run db:migrate:prod` だけが行う。
 */

/** .dev.vars を process.env に読み込む（既存値は上書きしない＝シェル指定が優先）。 */
export function loadEnv(): void {
  loadDotenv({ path: '.dev.vars' });
}

const LOCAL_D1_DIR = path.join(
  '.wrangler',
  'state',
  'v3',
  'd1',
  'miniflare-D1DatabaseObject',
);

/**
 * ローカル開発用D1（Miniflareがディスクに永続化するSQLiteファイル）へ直結する。
 * ネットワーク・APIトークン不要で、構造的に本番へは触れない（本番を指す接続情報自体が
 * 存在しない）。`npm run dev` か `npm run db:migrate` を一度実行済みであることが前提。
 */
export function getLocalD1Db(): Db {
  const notFound = new Error(
    `ローカルD1のSQLiteファイルが見つかりません（${LOCAL_D1_DIR}）。先に \`npm run dev\` か \`npm run db:migrate\` を一度実行してください。`,
  );
  if (!existsSync(LOCAL_D1_DIR)) throw notFound;

  // metadata.sqlite はMiniflare自身のカタログ管理用で、実データベースではない。
  const files = readdirSync(LOCAL_D1_DIR).filter(
    (f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite',
  );
  if (files.length === 0) throw notFound;
  if (files.length > 1) {
    throw new Error(
      `ローカルD1のSQLiteファイルが複数見つかりました（${LOCAL_D1_DIR}）。` +
        `.wrangler/state を削除して db:migrate をやり直してください: ${files.join(', ')}`,
    );
  }

  const client = new Database(path.join(LOCAL_D1_DIR, files[0]));
  return drizzle(client, { schema }) as unknown as Db;
}
