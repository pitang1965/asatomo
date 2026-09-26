import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import { createAuth } from '../src/lib/auth';

/**
 * `npx @better-auth/cli generate` 専用の設定。スキーマ生成だけが目的で、実クエリは
 * 投げない。素の Node 実行（Workers ランタイム外）なので createDb() のambient
 * `cloudflare:workers` は解決できない — createAuth の第2引数に、実クエリを発行しない
 * 使い捨ての in-memory better-sqlite3 DB を明示的に渡してスキーマ内省だけ可能にする。
 * 生成結果を src/db/schema.ts の auth 節（プレースホルダ）に反映する。
 */
const dummyDb = drizzle(new Database(':memory:'), { schema }) as unknown as Db;

export const auth = createAuth(
  {
    BETTER_AUTH_SECRET: 'cli-schema-generation-only',
    BETTER_AUTH_URL: 'http://localhost:3000',
    GOOGLE_CLIENT_ID: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    FACEBOOK_CLIENT_ID: 'x',
    FACEBOOK_CLIENT_SECRET: 'x',
    LINE_CLIENT_ID: 'x',
    LINE_CLIENT_SECRET: 'x',
  },
  dummyDb,
);
