import type { PostHog } from 'posthog-js';
import { useEffect } from 'react';

/**
 * PostHog（プロダクト解析）の共有ラッパー。__root.tsx の初期化コンポーネント
 * <Analytics /> と、各画面のカスタムイベント（track）・ユーザーひも付け（identify）を
 * ここに集約する。
 *
 * 有効化の条件（安否確認という機微なサービスのため保守的）:
 *   - ブラウザである（SSR では動かさない）
 *   - 本番ビルド（import.meta.env.PROD）である
 *   - 公開キー（phc_...）が設定されている
 * いずれかを満たさなければ全 API は no-op。→ 開発者本人のローカル/dev 操作で
 * 本番データを汚さない。posthog-js は動的 import で本番バンドルにだけ載せる。
 *
 * ⚠ track の properties・identify には PII（名前・メール・合言葉・伝言本文など）を
 *    渡さないこと。件数や種別など、非個人情報のみを送る。
 */
const enabled =
  typeof window !== 'undefined' &&
  import.meta.env.PROD &&
  !!import.meta.env.VITE_POSTHOG_KEY;

let instance: Promise<PostHog> | null = null;

function load(): Promise<PostHog> | null {
  if (!enabled) return null;
  if (!instance) {
    instance = import('posthog-js').then(({ default: posthog }) => {
      posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
        api_host:
          import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: 'history_change',
        capture_pageleave: true,
        disable_session_recording: true,
      });
      return posthog;
    });
  }
  return instance;
}

/**
 * カスタムイベントを送る。無効時（dev/SSR）は何もしない。
 * properties は非PIIのみ（件数・種別・provider など）。
 */
export function track(
  event: string,
  properties?: Record<string, unknown>,
): void {
  void load()?.then((posthog) => posthog.capture(event, properties));
}

/**
 * ログイン中のユーザーをひも付ける（以降のイベントが同一人物に紐づく）。
 * 渡すのは安定したユーザーID のみ。名前・メール等の PII は渡さない。
 */
export function identify(userId: string): void {
  void load()?.then((posthog) => posthog.identify(userId));
}

/**
 * PostHog をクライアント側で初期化するだけの薄いコンポーネント。__root.tsx の
 * RootDocument に置く。ページビューは history 変化で自動計測される。
 */
export function Analytics() {
  useEffect(() => {
    load();
  }, []);

  return null;
}
