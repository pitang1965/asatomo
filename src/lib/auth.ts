import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { genericOAuth, line } from 'better-auth/plugins/generic-oauth';
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

  // 資格情報が揃っているプロバイダだけ登録する（未設定分の毎リクエスト警告を避ける）。
  const socialProviders: Record<
    string,
    { clientId: string; clientSecret: string }
  > = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET)
    socialProviders.facebook = {
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
    };

  // LINE は資格情報が揃っているときだけ genericOAuth に登録する（未設定分の毎リクエスト
  // 警告を避ける。socialProviders の gating と同方針）。
  const oauthConfig =
    env.LINE_CLIENT_ID && env.LINE_CLIENT_SECRET
      ? [
          // LINE Login（OIDC）。email は id_token から取得するため、LINE Developers 側で
          // Email permission の承認と、コールバック
          //   {BETTER_AUTH_URL}/api/auth/oauth2/callback/line
          // の登録が前提。line() ヘルパーは既定 scope に openid/profile/email を含み、
          // pkce と userinfo(id_token) 取得を面倒みる。
          line({
            providerId: 'line',
            clientId: env.LINE_CLIENT_ID,
            clientSecret: env.LINE_CLIENT_SECRET,
            pkce: true,
          }),
        ]
      : [];

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    socialProviders,
    account: {
      accountLinking: {
        enabled: true,
        // LINE の email は id_token 経由で受け取るが line() ヘルパーは emailVerified:false を
        // 返す。trustedProviders に載せないと、同一 email の既存ユーザーへ紐付けできず
        // account_not_linked になる。accountLinking は必ず account の下に置く
        // （トップレベルだと better-auth に無視される）。
        trustedProviders: ['google', 'facebook', 'line'],
      },
    },
    plugins: [
      // 本人側 Android アプリはセッショントークンを Authorization: Bearer で送る
      // （Cookie 管理はネイティブに不向き）。bearer が無いと getSession はヘッダ経由の
      // トークンを検証できない（src/api/session.ts の前提）。
      bearer(),
      genericOAuth({ config: oauthConfig }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
