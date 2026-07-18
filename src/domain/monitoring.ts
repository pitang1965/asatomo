import { and, count, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  attestations,
  concernFlags,
  connections,
  deathCertifications,
  deathVotes,
  signals,
  subjectSettings,
} from '../db/schema';

/**
 * イベント駆動の状態遷移（タスク#4 / API ハンドラが呼ぶドメイン層）。
 * 時間駆動（T1/T2/T5）は src/cron/monitoring-tick.ts。こちらは不変条件 A/A'/B/D と
 * §4 クォーラム判定を担い、状態機械を完成させる。
 *
 * 方針: ドメイン関数は DB 操作のみ（純粋・テスト可能）。通知は行わず、必要な通知を
 *   結果オブジェクトで返す。HTTP ルート層が Notifier を叩く（cron と対称）。
 * 原子性: WHERE ガード付き UPDATE ... RETURNING（楽観的更新）。競合は空振りで安全。
 */

export interface DomainConfig {
  /** 休眠しきい値（日）。これ以上応答の無い見守り者は定足数の分母から除外。既定14。 */
  dormantDays: number;
  /** 段階1→段階2の遅延（h）。床の計算に使う。既定12。 */
  stage1to2DelayHours: number;
  /** 投票成立の床（段階2からの最低経過h）。既定12。 */
  voteFloorHours: number;
  /** 旅行モードの上限日数（本人でも外せない）。既定30。 */
  travelMaxDays?: number;
  /** テスト用に現在時刻を注入可能。 */
  now?: Date;
}

export const DEFAULT_DOMAIN_CONFIG: DomainConfig = {
  dormantDays: 14,
  stage1to2DelayHours: 12,
  voteFloorHours: 12,
  travelMaxDays: 30,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
type Presence = 'eating' | 'sleeping' | null;

/** 生存シグナルの種別（本人が発する直接証拠）。 */
export type SignalKind = (typeof signals.kind.enumValues)[number];

// ─── 生存シグナル記録（不変条件A） ──────────────────────────────────────────
export async function recordSignal(
  db: Db,
  input: {
    subjectUserId: string;
    kind: SignalKind;
    occurredAt?: Date;
  },
  config: DomainConfig,
): Promise<{ cancelledEpisode: boolean; resumedFromDisclosed: boolean }> {
  const now = config.now ?? new Date();
  const occurredAt = input.occurredAt ?? now;

  const [before] = await db
    .select({ state: subjectSettings.state })
    .from(subjectSettings)
    .where(eq(subjectSettings.userId, input.subjectUserId))
    .limit(1);
  const prevState = before?.state ?? 'normal';

  await db.insert(signals).values({
    subjectUserId: input.subjectUserId,
    kind: input.kind,
    occurredAt,
  });

  const presence: Presence =
    input.kind === 'meal'
      ? 'eating'
      : input.kind === 'sleep'
        ? 'sleeping'
        : null;

  // last_signal_at は前進のみ（古いオフラインキュー分が新しい値を巻き戻さないよう greatest）。
  await db
    .update(subjectSettings)
    .set({
      lastSignalAt: sql`greatest(${subjectSettings.lastSignalAt}, ${occurredAt.toISOString()}::timestamptz)`,
      ...(presence ? { currentPresence: presence, presenceSince: now } : {}),
      updatedAt: now,
    })
    .where(eq(subjectSettings.userId, input.subjectUserId));

  // 不変条件A: 進行中エピソードがあれば即キャンセル。
  const cancelled = await db
    .update(deathCertifications)
    .set({
      outcome: 'cancelled_by_signal',
      cancelReason: `signal:${input.kind}`,
      cancelledAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(deathCertifications.subjectUserId, input.subjectUserId),
        eq(deathCertifications.outcome, 'in_progress'),
      ),
    )
    .returning({ id: deathCertifications.id });

  // 非 normal から normal へ復帰（disclosed 含む。開示は取消不能だが、生きている本人の監視は再開する）。
  await db
    .update(subjectSettings)
    .set({ state: 'normal', stateChangedAt: now, updatedAt: now })
    .where(
      and(
        eq(subjectSettings.userId, input.subjectUserId),
        ne(subjectSettings.state, 'normal'),
      ),
    );

  return {
    cancelledEpisode: cancelled.length > 0,
    resumedFromDisclosed: prevState === 'disclosed',
  };
}

// ─── 死亡投票（T3/T4 + §4クォーラム） ───────────────────────────────────────
export type VoteResult =
  | {
      ok: false;
      reason:
        | 'not_a_watcher'
        | 'no_subject'
        | 'not_alertable'
        | 'no_active_episode';
    }
  | { ok: true; certified: boolean };

export async function castVote(
  db: Db,
  input: { subjectUserId: string; voterUserId: string },
  config: DomainConfig,
): Promise<VoteResult> {
  const now = config.now ?? new Date();

  if (!(await isAcceptedWatcher(db, input.subjectUserId, input.voterUserId)))
    return { ok: false, reason: 'not_a_watcher' };
  await touchWatcher(db, input.subjectUserId, input.voterUserId, now);

  const [subj] = await db
    .select({
      state: subjectSettings.state,
      graceHours: subjectSettings.gracePeriodHours,
    })
    .from(subjectSettings)
    .where(eq(subjectSettings.userId, input.subjectUserId))
    .limit(1);
  if (!subj) return { ok: false, reason: 'no_subject' };
  if (subj.state !== 'watchers_alerted' && subj.state !== 'voting')
    return { ok: false, reason: 'not_alertable' };

  const cert = await getActiveCertification(db, input.subjectUserId);
  if (!cert) return { ok: false, reason: 'no_active_episode' };

  // 最初の1票で watchers_alerted → voting（全見守り者へ投票要請は route 側で通知）。
  if (subj.state === 'watchers_alerted') {
    await db
      .update(subjectSettings)
      .set({ state: 'voting', stateChangedAt: now, updatedAt: now })
      .where(
        and(
          eq(subjectSettings.userId, input.subjectUserId),
          eq(subjectSettings.state, 'watchers_alerted'),
        ),
      );
    await db
      .update(deathCertifications)
      .set({ stage: 'voting', updatedAt: now })
      .where(eq(deathCertifications.id, cert.id));
  }

  // 投票 upsert（過去に取り下げていれば復活）。
  await db
    .insert(deathVotes)
    .values({
      certificationId: cert.id,
      voterUserId: input.voterUserId,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [deathVotes.certificationId, deathVotes.voterUserId],
      set: { withdrawnAt: null, createdAt: now },
    });

  const certified = await evaluateQuorum(
    db,
    input.subjectUserId,
    cert,
    subj.graceHours,
    now,
    config,
  );
  return { ok: true, certified };
}

export async function withdrawVote(
  db: Db,
  input: { subjectUserId: string; voterUserId: string },
  config: DomainConfig,
): Promise<{ ok: boolean; activeVotes: number }> {
  const now = config.now ?? new Date();
  const cert = await getActiveCertification(db, input.subjectUserId);
  if (!cert) return { ok: false, activeVotes: 0 };

  await db
    .update(deathVotes)
    .set({ withdrawnAt: now })
    .where(
      and(
        eq(deathVotes.certificationId, cert.id),
        eq(deathVotes.voterUserId, input.voterUserId),
        isNull(deathVotes.withdrawnAt),
      ),
    );

  const active = await countActiveVotes(db, cert.id);

  // 全票取り下げで定足数割れ → voting を watchers_alerted へ戻す（normal へは飛ばさない。不変条件B）。
  if (active === 0) {
    await db
      .update(subjectSettings)
      .set({ state: 'watchers_alerted', stateChangedAt: now, updatedAt: now })
      .where(
        and(
          eq(subjectSettings.userId, input.subjectUserId),
          eq(subjectSettings.state, 'voting'),
        ),
      );
    await db
      .update(deathCertifications)
      .set({ stage: 'watchers_alerted', updatedAt: now })
      .where(
        and(
          eq(deathCertifications.id, cert.id),
          eq(deathCertifications.outcome, 'in_progress'),
        ),
      );
  }
  return { ok: true, activeVotes: active };
}

// ─── 代理確認（不変条件B / §3） ─────────────────────────────────────────────
export async function attest(
  db: Db,
  input: { subjectUserId: string; attesterUserId: string; note?: string },
  config: DomainConfig,
): Promise<{
  ok: boolean;
  reason?: 'not_a_watcher';
  resolved: boolean;
  notifyWatchers: boolean;
}> {
  const now = config.now ?? new Date();
  if (!(await isAcceptedWatcher(db, input.subjectUserId, input.attesterUserId)))
    return {
      ok: false,
      reason: 'not_a_watcher',
      resolved: false,
      notifyWatchers: false,
    };
  await touchWatcher(db, input.subjectUserId, input.attesterUserId, now);

  const cert = await getActiveCertification(db, input.subjectUserId);
  await db.insert(attestations).values({
    subjectUserId: input.subjectUserId,
    attesterUserId: input.attesterUserId,
    note: input.note ?? null,
    certificationId: cert?.id ?? null,
  });

  // 解決は watchers_alerted かつ有効票ゼロの時のみ（voting 中は自動で警報を消さない。不変条件B）。
  let resolved = false;
  const [subj] = await db
    .select({ state: subjectSettings.state })
    .from(subjectSettings)
    .where(eq(subjectSettings.userId, input.subjectUserId))
    .limit(1);
  if (
    cert &&
    subj?.state === 'watchers_alerted' &&
    (await countActiveVotes(db, cert.id)) === 0
  ) {
    const upd = await db
      .update(deathCertifications)
      .set({
        outcome: 'resolved_by_attestation',
        cancelReason: `attested_by:${input.attesterUserId}`,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(deathCertifications.id, cert.id),
          eq(deathCertifications.outcome, 'in_progress'),
          eq(deathCertifications.stage, 'watchers_alerted'),
        ),
      )
      .returning({ id: deathCertifications.id });
    if (upd.length > 0) {
      // 解決＝normal へ。last_signal_at を確認時刻へ前進（直後の再トリガー防止。§3）。誰が確認したかは attestations に残る。
      await db
        .update(subjectSettings)
        .set({
          state: 'normal',
          stateChangedAt: now,
          lastSignalAt: sql`greatest(${subjectSettings.lastSignalAt}, ${now.toISOString()}::timestamptz)`,
          updatedAt: now,
        })
        .where(eq(subjectSettings.userId, input.subjectUserId));
      resolved = true;
    }
  }
  return { ok: true, resolved, notifyWatchers: true };
}

// ─── 旅行モード（期限付き・上限あり・自動復帰） ─────────────────────────────
export async function setTravelMode(
  db: Db,
  input: { subjectUserId: string; until: Date },
  config: DomainConfig,
): Promise<
  { ok: false; reason: 'past' | 'too_long' } | { ok: true; until: Date }
> {
  const now = config.now ?? new Date();
  if (input.until <= now) return { ok: false, reason: 'past' };
  const maxUntil = new Date(
    now.getTime() + (config.travelMaxDays ?? 30) * DAY_MS,
  );
  if (input.until > maxUntil) return { ok: false, reason: 'too_long' };
  await db
    .update(subjectSettings)
    .set({ travelUntil: input.until, travelStartedAt: now, updatedAt: now })
    .where(eq(subjectSettings.userId, input.subjectUserId));
  return { ok: true, until: input.until };
}

export async function clearTravelMode(
  db: Db,
  subjectUserId: string,
  config: DomainConfig,
): Promise<{ ok: true }> {
  const now = config.now ?? new Date();
  await db
    .update(subjectSettings)
    .set({ travelUntil: null, travelStartedAt: null, updatedAt: now })
    .where(eq(subjectSettings.userId, subjectUserId));
  return { ok: true };
}

// ─── 本人のワンタップ取消（A'） ─────────────────────────────────────────────
export async function cancelBySubject(
  db: Db,
  subjectUserId: string,
  config: DomainConfig,
): Promise<{ ok: boolean; reason?: 'not_in_grace' }> {
  const now = config.now ?? new Date();
  const upd = await db
    .update(deathCertifications)
    .set({
      outcome: 'cancelled_by_subject',
      cancelReason: 'subject_cancel',
      cancelledAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(deathCertifications.subjectUserId, subjectUserId),
        eq(deathCertifications.outcome, 'in_progress'),
        eq(deathCertifications.stage, 'certified_grace'),
      ),
    )
    .returning({ id: deathCertifications.id });
  if (upd.length === 0) return { ok: false, reason: 'not_in_grace' };

  await db
    .update(subjectSettings)
    .set({
      state: 'normal',
      stateChangedAt: now,
      lastSignalAt: sql`greatest(${subjectSettings.lastSignalAt}, ${now.toISOString()}::timestamptz)`,
      updatedAt: now,
    })
    .where(eq(subjectSettings.userId, subjectUserId));
  return { ok: true };
}

// ─── 懸念フラグ（純粋な受取人。状態は変えない） ──────────────────────────────
export async function raiseConcern(
  db: Db,
  input: { subjectUserId: string; connectionId: string; note?: string },
  config: DomainConfig,
): Promise<{
  ok: boolean;
  reason?: 'not_a_connection';
  notifyWatchers: boolean;
}> {
  const now = config.now ?? new Date();
  const [conn] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.id, input.connectionId),
        eq(connections.subjectUserId, input.subjectUserId),
      ),
    )
    .limit(1);
  if (!conn)
    return { ok: false, reason: 'not_a_connection', notifyWatchers: false };

  await db.insert(concernFlags).values({
    subjectUserId: input.subjectUserId,
    raisedByConnectionId: input.connectionId,
    note: input.note ?? null,
    createdAt: now,
  });
  return { ok: true, notifyWatchers: true };
}

// ─── 見守り者2人未満で開示を自動ロック（不変条件D） ──────────────────────────
export async function recomputeDisclosureEnabled(
  db: Db,
  subjectUserId: string,
  config: DomainConfig,
): Promise<{ enabled: boolean; livingWatchers: number; changed: boolean }> {
  const now = config.now ?? new Date();
  const living = await countLivingWatchers(db, subjectUserId, now, config);
  const enabled = living >= 2;
  const upd = await db
    .update(subjectSettings)
    .set({ disclosureEnabled: enabled, updatedAt: now })
    .where(
      and(
        eq(subjectSettings.userId, subjectUserId),
        ne(subjectSettings.disclosureEnabled, enabled),
      ),
    )
    .returning({ userId: subjectSettings.userId });
  // changed が true かつ enabled=false なら route が本人へ「もう1人必要」を通知。
  return { enabled, livingWatchers: living, changed: upd.length > 0 };
}

// ─── §4 クォーラム判定 ──────────────────────────────────────────────────────
async function evaluateQuorum(
  db: Db,
  subjectUserId: string,
  cert: { id: string; startedAt: Date },
  graceHours: number,
  now: Date,
  config: DomainConfig,
): Promise<boolean> {
  const living = await countLivingWatchers(db, subjectUserId, now, config);
  const votes = await countActiveVotes(db, cert.id);

  // 床: 段階2（≒ startedAt + stage1to2Delay）から voteFloor 経過（Cron粒度15分の誤差は無視できる近似）。
  const floorMs =
    (config.stage1to2DelayHours + config.voteFloorHours) * HOUR_MS;
  const floorPassed = now.getTime() - cert.startedAt.getTime() >= floorMs;

  // 2票以上 かつ 生存見守り者の過半数（votes*2 > living）かつ 床経過。
  if (!(votes >= 2 && votes * 2 > living && floorPassed)) return false;

  const graceUntil = new Date(now.getTime() + graceHours * HOUR_MS);
  const upd = await db
    .update(deathCertifications)
    .set({ stage: 'certified_grace', graceUntil, updatedAt: now })
    .where(
      and(
        eq(deathCertifications.id, cert.id),
        eq(deathCertifications.outcome, 'in_progress'),
        eq(deathCertifications.stage, 'voting'),
      ),
    )
    .returning({ id: deathCertifications.id });
  if (upd.length === 0) return false;

  await db
    .update(subjectSettings)
    .set({ state: 'certified_grace', stateChangedAt: now, updatedAt: now })
    .where(eq(subjectSettings.userId, subjectUserId));
  return true;
}

// ─── ヘルパ ─────────────────────────────────────────────────────────────────
async function isAcceptedWatcher(
  db: Db,
  subjectUserId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.subjectUserId, subjectUserId),
        eq(connections.otherUserId, userId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** 見守り者が行動したら watcher_last_seen_at を更新（休眠判定を正確に保つ）。 */
async function touchWatcher(
  db: Db,
  subjectUserId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await db
    .update(connections)
    .set({ watcherLastSeenAt: now, updatedAt: now })
    .where(
      and(
        eq(connections.subjectUserId, subjectUserId),
        eq(connections.otherUserId, userId),
        eq(connections.isWatcher, true),
      ),
    );
}

async function getActiveCertification(
  db: Db,
  subjectUserId: string,
): Promise<{
  id: string;
  startedAt: Date;
  stage: (typeof deathCertifications.stage.enumValues)[number];
} | null> {
  const [row] = await db
    .select({
      id: deathCertifications.id,
      startedAt: deathCertifications.startedAt,
      stage: deathCertifications.stage,
    })
    .from(deathCertifications)
    .where(
      and(
        eq(deathCertifications.subjectUserId, subjectUserId),
        eq(deathCertifications.outcome, 'in_progress'),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function countActiveVotes(
  db: Db,
  certificationId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(deathVotes)
    .where(
      and(
        eq(deathVotes.certificationId, certificationId),
        isNull(deathVotes.withdrawnAt),
      ),
    );
  return row?.n ?? 0;
}

/** 承諾済み かつ 休眠しきい値以内の見守り者数（定足数の分母）。 */
export async function countLivingWatchers(
  db: Db,
  subjectUserId: string,
  now: Date,
  config: DomainConfig,
): Promise<number> {
  const dormantCutoff = new Date(now.getTime() - config.dormantDays * DAY_MS);
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(
      and(
        eq(connections.subjectUserId, subjectUserId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
        isNotNull(connections.watcherLastSeenAt),
        gte(connections.watcherLastSeenAt, dormantCutoff),
      ),
    );
  return row?.n ?? 0;
}
