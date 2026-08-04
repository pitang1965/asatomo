/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog 公開キー（phc_...）。未設定なら解析は無効。 */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog の取り込みホスト。US Cloud は https://us.i.posthog.com。 */
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
