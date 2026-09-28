import { defineCloudflareOptions } from '@sentry/cloudflare';

/**
 * Sentry（エラー監視）のオプション。vite.config.ts / vite.cloudflare.config.ts の
 * sentryCloudflareVitePlugin がこのファイル（worker.ts と同じディレクトリ）を自動検出し、
 * ビルド時に worker.ts の default export を Sentry.withSentry() でラップする
 * （worker.ts 自体の変更は不要）。
 *
 * SENTRY_DSN は wrangler.jsonc の vars にのみ設定し、wrangler-dev.jsonc には設定しない。
 * ローカル開発では未設定 → dsn: undefined で SDK が自動的に無効化される
 * （LINE/Facebook プロバイダを資格情報の有無で有効化する既存方針 src/lib/auth.ts と同じ考え方）。
 *
 * トレーシング・セッションリプレイは未設定（安否確認という機微なサービスのため、
 * まずはエラー捕捉だけに絞る。PostHog と同じ保守的な方針 src/web/analytics.tsx）。
 */
export default defineCloudflareOptions((env) => ({
  dsn: env.SENTRY_DSN,
}));
