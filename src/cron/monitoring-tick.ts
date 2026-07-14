import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { deathCertifications, subjectSettings } from '../db/schema';

/**
 * 監視tick（タスク#3 / Cloudflare Cron Triggers・約15分間隔）。
 *
 * 設計書 docs/design/death-certification-flow.md の時間駆動遷移を 1 本の Cron に集約:
 *   優先度 T5 開示 > T2 見守り者アラート > T1 未応答検知（サブリクエスト上限50/呼び出しに配慮）。
 *
 * 原子性は「WHERE ガード付きの単一 UPDATE ... RETURNING」（楽観的更新）で担保。
 * 競合（本人シグナルで別途 normal 化された等）は RETURNING 0 件で安全に空振りする。
 *
 * 通知の実体（FCM / LINE / メール）は関心外。Notifier で分離し、この関数は純粋に保つ。
 *
 * 使い方（Cloudflare Worker）:
 *   export default {
 *     async scheduled(_event, env, ctx) {
 *       const db = createDb(env.DATABASE_URL);
 *       ctx.waitUntil(runMonitoringTick(db, notifier, { stage1to2DelayHours: 12, batchLimit: 20 }));
 *     },
 *   };
 */

export interface Notifier {
  /** T1: 段階1。本人へプッシュ再通知（未応答）。 */
  notifySubjectUnresponsive(subjectUserId: string): Promise<void>;
  /** T2: 段階2。見守り者へ「連絡してみて」（LINE/メール）。 */
  notifyWatchersAlert(subjectUserId: string): Promise<void>;
  /** T5: 開示。受取人へ通知し復号可能化する。 */
  discloseMessages(
    subjectUserId: string,
    certificationId: string,
  ): Promise<void>;
  /** Neon 障害時: 運営者へ「監視tickが劣化」を直送（安全システムを沈黙させない）。 */
  notifyOperatorDegraded(error: unknown): Promise<void>;
}

export interface TickConfig {
  /** 段階1→段階2の遅延（既定12h）。 */
  stage1to2DelayHours: number;
  /** 1 tick で各遷移が処理する最大件数（サブリクエスト上限対策）。 */
  batchLimit: number;
  /** テスト用に現在時刻を注入可能。既定は実時刻。 */
  now?: Date;
  /** DB 接続のリトライ回数（コールドスタート吸収）。既定3。 */
  retries?: number;
}

export interface TickResult {
  disclosed: number;
  watchersAlerted: number;
  unresponsive: number;
  /** Neon 不通でリトライも尽き、運営者へ直送した場合 true。 */
  degraded: boolean;
}

export async function runMonitoringTick(
  db: Db,
  notifier: Notifier,
  config: TickConfig,
): Promise<TickResult> {
  const now = config.now ?? new Date();
  const result: TickResult = {
    disclosed: 0,
    watchersAlerted: 0,
    unresponsive: 0,
    degraded: false,
  };

  try {
    // 優先度順（クリティカルなものから）。各段は DB 接続をリトライで包む。
    result.disclosed = await withRetry(
      () => processDisclosures(db, notifier, now, config),
      config,
    );
    result.watchersAlerted = await withRetry(
      () => processWatcherAlerts(db, notifier, now, config),
      config,
    );
    result.unresponsive = await withRetry(
      () => processUnresponsive(db, notifier, now, config),
      config,
    );
  } catch (error) {
    // Neon 不通などでリトライ尽き → 運営者へ直送（沈黙より通知）。
    result.degraded = true;
    await safe(() => notifier.notifyOperatorDegraded(error));
  }

  return result;
}

// ─── T5: certified_grace → disclosed（猶予期限超過） ─────────────────────────
async function processDisclosures(
  db: Db,
  notifier: Notifier,
  now: Date,
  config: TickConfig,
): Promise<number> {
  const due = await db
    .select({
      id: deathCertifications.id,
      subjectUserId: deathCertifications.subjectUserId,
    })
    .from(deathCertifications)
    .where(
      and(
        eq(deathCertifications.outcome, 'in_progress'),
        eq(deathCertifications.stage, 'certified_grace'),
        isNotNull(deathCertifications.graceUntil),
        lte(deathCertifications.graceUntil, now),
      ),
    )
    .limit(config.batchLimit);

  let count = 0;
  for (const row of due) {
    // ガード: まだ in_progress かつ certified_grace の時だけ開示（本人取消との競合を排除）。
    const updated = await db
      .update(deathCertifications)
      .set({ outcome: 'disclosed', disclosedAt: now, updatedAt: now })
      .where(
        and(
          eq(deathCertifications.id, row.id),
          eq(deathCertifications.outcome, 'in_progress'),
          eq(deathCertifications.stage, 'certified_grace'),
        ),
      )
      .returning({ id: deathCertifications.id });

    if (updated.length === 0) continue; // 競合で先に取消/開示済み

    await db
      .update(subjectSettings)
      .set({ state: 'disclosed', stateChangedAt: now, updatedAt: now })
      .where(eq(subjectSettings.userId, row.subjectUserId));

    // 開示は不可逆（不変条件C）。通知失敗は握りつぶさず、要ハードニング（下記 NOTE）。
    await safe(() => notifier.discloseMessages(row.subjectUserId, row.id));
    count += 1;
  }
  return count;
}

// ─── T2: unresponsive → watchers_alerted（段階1→2遅延超過） ──────────────────
async function processWatcherAlerts(
  db: Db,
  notifier: Notifier,
  now: Date,
  config: TickConfig,
): Promise<number> {
  const delayed = await db
    .select({ userId: subjectSettings.userId })
    .from(subjectSettings)
    .where(
      and(
        eq(subjectSettings.state, 'unresponsive'),
        sql`${subjectSettings.stateChangedAt} + (${config.stage1to2DelayHours} * interval '1 hour') <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .limit(config.batchLimit);

  let count = 0;
  for (const row of delayed) {
    const updated = await db
      .update(subjectSettings)
      .set({ state: 'watchers_alerted', stateChangedAt: now, updatedAt: now })
      .where(
        and(
          eq(subjectSettings.userId, row.userId),
          eq(subjectSettings.state, 'unresponsive'),
        ),
      )
      .returning({ userId: subjectSettings.userId });

    if (updated.length === 0) continue; // 本人シグナル等で先に normal 化

    // エピソードの stage も進める。
    await db
      .update(deathCertifications)
      .set({ stage: 'watchers_alerted', updatedAt: now })
      .where(
        and(
          eq(deathCertifications.subjectUserId, row.userId),
          eq(deathCertifications.outcome, 'in_progress'),
        ),
      );

    await safe(() => notifier.notifyWatchersAlert(row.userId));
    count += 1;
  }
  return count;
}

// ─── T1: normal → unresponsive（判定窓超過・旅行モード外） ────────────────────
async function processUnresponsive(
  db: Db,
  notifier: Notifier,
  now: Date,
  config: TickConfig,
): Promise<number> {
  const nowIso = sql`${now.toISOString()}::timestamptz`;
  const candidates = await db
    .select({ userId: subjectSettings.userId })
    .from(subjectSettings)
    .where(
      and(
        eq(subjectSettings.state, 'normal'),
        // 旅行モード外（未設定 or 期限切れ）
        or(
          sql`${subjectSettings.travelUntil} is null`,
          lte(subjectSettings.travelUntil, now),
        ),
        // 一度もシグナルが無い本人は判定対象にしない（基準時刻が無い）
        isNotNull(subjectSettings.lastSignalAt),
        sql`${subjectSettings.lastSignalAt} + (${subjectSettings.detectionWindowHours} * interval '1 hour') < ${nowIso}`,
      ),
    )
    .limit(config.batchLimit);

  let count = 0;
  for (const row of candidates) {
    const updated = await db
      .update(subjectSettings)
      .set({ state: 'unresponsive', stateChangedAt: now, updatedAt: now })
      .where(
        and(
          eq(subjectSettings.userId, row.userId),
          eq(subjectSettings.state, 'normal'),
        ),
      )
      .returning({ userId: subjectSettings.userId });

    if (updated.length === 0) continue; // 競合で先に別状態へ

    // エピソードを open（本人につき in_progress は 1 本 = 部分ユニークが保証）。
    // 稀な競合で重複した場合はユニーク違反 → 握りつぶして続行。
    await safe(() =>
      db.insert(deathCertifications).values({
        subjectUserId: row.userId,
        stage: 'unresponsive',
        startedAt: now,
      }),
    );

    await safe(() => notifier.notifySubjectUnresponsive(row.userId));
    count += 1;
  }
  return count;
}

// ─── ヘルパ ─────────────────────────────────────────────────────────────────

/** DB 操作をバックオフ付きでリトライ（Neon コールドスタート 500ms〜2s を吸収）。 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: TickConfig,
): Promise<T> {
  const attempts = config.retries ?? 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(200 * 2 ** i);
    }
  }
  throw lastError;
}

/**
 * 通知等の副作用を握りつぶす。DB 状態は既に確定しているため、通知失敗で tick 全体を
 * 落とさない。
 *
 * NOTE(ハードニング): 状態が進んだ後に通知が失われると、次 tick では状態が既に進んで
 *   いるため再送されない（特に T2 見守り者アラート・T5 開示の欠落は安全上重い）。
 *   将来は「通知アウトボックス」（送信予定を永続化し、別ワーカーが再送保証）を導入する。
 */
async function safe(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // 意図的に無視（上記 NOTE 参照）
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
