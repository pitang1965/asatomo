import type { Db } from '../db';
import type { DomainConfig } from '../domain/monitoring';
import type { Notifications } from '../notify/notifier';

/** ハンドラ層に渡す依存。ルート層がリクエストごとに組み立てる。 */
export interface ApiContext {
  db: Db;
  notify: Notifications;
  config: DomainConfig;
}

/** ハンドラの戻り値。ルート層が HTTP レスポンスへ写す。 */
export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/** 通知など副作用の失敗でリクエスト全体を落とさない。 */
export async function safe(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // 通知失敗は無視（本処理は確定済み）
  }
}
