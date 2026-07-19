import type { AuthEnv } from '../lib/auth';

/**
 * サーバー環境変数。開発は .env（Vite が process.env に載せる値ではなく Node の環境変数）、
 * 本番は Cloudflare Workers のバインディング（nodejs_compat で process.env に写る）を想定。
 * 未設定はここでは落とさず、使う側（createRequestApp）が明確なエラーにする。
 */
export interface ServerEnv extends AuthEnv {
  /**
   * メール送信（Resend）。EMAIL_FROM は検証済みドメイン over40web.club 上のアドレス
   * （例: no-reply@over40web.club）。表示名「アサトモ」は配線側で付す。
   * 未設定なら開発用コンソール出力にフォールバック。
   */
  EMAIL_API_KEY: string;
  EMAIL_FROM: string;
  /** 縮退運転の通報先（cron の operator 通知）。 */
  OPERATOR_EMAIL: string;
  /** 見守りWeb の公開URL（通知文面のリンクに使う）。未設定なら BETTER_AUTH_URL。 */
  WEB_BASE_URL: string;
  /**
   * 開発専用の認証バイパス（Authorization: Bearer <secret>:<userId>）。
   * ⚠ 本番では絶対に設定しない。Android 実験（OAuth 配線前）用。
   */
  DEV_BEARER_SECRET: string;
}

export function getServerEnv(): ServerEnv {
  const e = process.env;
  return {
    DATABASE_URL: e.DATABASE_URL ?? '',
    BETTER_AUTH_SECRET: e.BETTER_AUTH_SECRET ?? '',
    BETTER_AUTH_URL: e.BETTER_AUTH_URL ?? 'http://localhost:3000',
    GOOGLE_CLIENT_ID: e.GOOGLE_CLIENT_ID ?? '',
    GOOGLE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET ?? '',
    FACEBOOK_CLIENT_ID: e.FACEBOOK_CLIENT_ID ?? '',
    FACEBOOK_CLIENT_SECRET: e.FACEBOOK_CLIENT_SECRET ?? '',
    LINE_CLIENT_ID: e.LINE_CLIENT_ID ?? '',
    LINE_CLIENT_SECRET: e.LINE_CLIENT_SECRET ?? '',
    EMAIL_API_KEY: e.EMAIL_API_KEY ?? '',
    EMAIL_FROM: e.EMAIL_FROM ?? '',
    OPERATOR_EMAIL: e.OPERATOR_EMAIL ?? '',
    WEB_BASE_URL: e.WEB_BASE_URL ?? '',
    DEV_BEARER_SECRET: e.DEV_BEARER_SECRET ?? '',
  };
}
