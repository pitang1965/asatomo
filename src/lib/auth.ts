import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { createDb } from '../db';
import * as schema from '../db/schema';

/**
 * Better Auth のリクエストごとファクトリ。
 *
 * ⚠ Workers ではバインディングがリクエスト内でのみ有効なため、モジュールレベルで
 *    auth インスタンスを作らない。ハンドラ内で createAuth(env) を呼ぶ。
 *
 * 認証方式（技術メモ）: Google / Facebook は socialProviders、LINE は genericOAuth プラグイン。
 *   Firebase Auth は不採用。Android は Credential Manager で Google ID トークンを取得し、
 *   ソーシャルログインのエンドポイントに渡してセッション確立する。
 *
 * ⚠ auth テーブル（user/session/account/verification）は Better Auth が所有する。
 *   正準スキーマは `npx @better-auth/cli generate` でこの設定から生成し、
 *   src/db/schema.ts のプレースホルダ auth 節を置き換えること（ADR-0003: DB分離のため自前所有）。
 */
export interface AuthEnv {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FACEBOOK_CLIENT_ID: string;
  FACEBOOK_CLIENT_SECRET: string;
  LINE_CLIENT_ID: string;
  LINE_CLIENT_SECRET: string;
}

export function createAuth(env: AuthEnv) {
  const db = createDb(env.DATABASE_URL);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      facebook: {
        clientId: env.FACEBOOK_CLIENT_ID,
        clientSecret: env.FACEBOOK_CLIENT_SECRET,
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: 'line',
            clientId: env.LINE_CLIENT_ID,
            clientSecret: env.LINE_CLIENT_SECRET,
            authorizationUrl: 'https://access.line.me/oauth2/v2.1/authorize',
            tokenUrl: 'https://api.line.me/oauth2/v2.1/token',
            userInfoUrl: 'https://api.line.me/v2/profile',
            scopes: ['profile', 'openid'],
          },
        ],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
