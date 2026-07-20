import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import {
  connections,
  deathCertifications,
  deathVotes,
  signals,
  subjectSettings,
  user,
} from '../db/schema';
import {
  countActiveVotes,
  countLivingWatchers,
  type DomainConfig,
  type SignalKind,
} from './monitoring';
import { recentActivityText } from './recent-activity';

/**
 * 読み取り系クエリ（見守りWeb のダッシュボード等）。書き込みはドメイン各所、これは参照専用。
 */

export interface DashboardRow {
  subjectUserId: string;
  name: string;
  state: (typeof subjectSettings.state.enumValues)[number];
  travelUntil: Date | null;
  currentPresence: (typeof subjectSettings.currentPresence.enumValues)[number];
  lastSignalAt: Date | null;
  latestKind: SignalKind | null;
  latestAt: Date | null;
  /** 本人アプリからログアウト中（null 以外）。沈黙の説明として表示する。監視は継続。 */
  appLoggedOutAt: Date | null;
  /** normal 以外＝要確認（エスカレーション中）。 */
  isAlert: boolean;
}

/**
 * ある見守り者が見るダッシュボード。承諾済みで見守っている本人ごとに、状態・近況の材料を返す。
 * アラート中の本人を先頭へ。
 */
export async function getWatcherDashboard(
  db: Db,
  watcherUserId: string,
): Promise<DashboardRow[]> {
  const subs = await db
    .select({
      subjectUserId: connections.subjectUserId,
      name: user.name,
      state: subjectSettings.state,
      travelUntil: subjectSettings.travelUntil,
      currentPresence: subjectSettings.currentPresence,
      lastSignalAt: subjectSettings.lastSignalAt,
      appLoggedOutAt: subjectSettings.appLoggedOutAt,
    })
    .from(connections)
    .innerJoin(user, eq(connections.subjectUserId, user.id))
    .innerJoin(
      subjectSettings,
      eq(connections.subjectUserId, subjectSettings.userId),
    )
    .where(
      and(
        eq(connections.otherUserId, watcherUserId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    );

  const rows: DashboardRow[] = [];
  for (const s of subs) {
    // 最新シグナル（近況の材料）。N は小さい前提の per-subject 取得。
    const [latest] = await db
      .select({ kind: signals.kind, at: signals.occurredAt })
      .from(signals)
      .where(eq(signals.subjectUserId, s.subjectUserId))
      .orderBy(desc(signals.occurredAt))
      .limit(1);
    rows.push({
      ...s,
      latestKind: latest?.kind ?? null,
      latestAt: latest?.at ?? null,
      isAlert: s.state !== 'normal',
    });
  }

  rows.sort((a, b) => Number(b.isAlert) - Number(a.isAlert));
  return rows;
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * 本人アプリの「見守っている人」一瞥（ADR-0006）用の整形済み1行。
 * 表示文はすべてサーバー側で整形し、クライアント（Android / 将来のWeb）は表示するだけ
 * （近況のぼかしルールの二重実装を避ける）。
 */
export interface OverviewRow {
  subjectUserId: string;
  name: string;
  /** 状態ラベル（Webのステータスピルと同一ロジック）。 */
  label: '要確認' | '旅行' | '就寝中' | '元気そう';
  level: 'warn' | 'travel' | 'night' | 'good';
  /** 近況（過去形＋経過時間）または旅行中の一行。 */
  statusText: string;
  /** アプリからログアウト中の注記（null = 表示なし）。 */
  note: string | null;
  /** 要確認時の説明（null = 通常）。非 null なら「無事です」（代理確認）を出してよい。 */
  alertText: string | null;
}

/** ある見守り者の一瞥データ（整形済み）。並びは getWatcherDashboard と同じ（要確認が先頭）。 */
export async function getWatcherOverview(
  db: Db,
  watcherUserId: string,
  config: DomainConfig,
): Promise<OverviewRow[]> {
  const now = config.now ?? new Date();
  const rows = await getWatcherDashboard(db, watcherUserId);
  return rows.map((r) => {
    const traveling = r.travelUntil != null && r.travelUntil > now;
    const hours = r.lastSignalAt
      ? Math.floor((now.getTime() - r.lastSignalAt.getTime()) / 3_600_000)
      : null;
    return {
      subjectUserId: r.subjectUserId,
      name: r.name,
      label: r.isAlert
        ? '要確認'
        : traveling
          ? '旅行'
          : r.currentPresence === 'sleeping'
            ? '就寝中'
            : '元気そう',
      level: r.isAlert
        ? 'warn'
        : traveling
          ? 'travel'
          : r.currentPresence === 'sleeping'
            ? 'night'
            : 'good',
      statusText:
        traveling && r.travelUntil
          ? `旅行中 · ${r.travelUntil.getMonth() + 1}/${r.travelUntil.getDate()} まで`
          : recentActivityText(r.latestKind, r.latestAt, now),
      note: r.appLoggedOutAt
        ? 'スマホアプリからログアウトしています（「元気」が届かない状態です）'
        : null,
      alertText: r.isAlert
        ? hours != null
          ? `${hours}時間、応答がありません`
          : '応答がありません'
        : null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────

export interface SubjectConnection {
  id: string;
  displayName: string;
  isWatcher: boolean;
  externalEmail: string | null;
  passphraseHint: string | null;
}

/** 本人のつながり一覧（最後のメッセージの宛先候補）。 */
export async function getSubjectConnections(
  db: Db,
  subjectUserId: string,
): Promise<SubjectConnection[]> {
  return db
    .select({
      id: connections.id,
      displayName: connections.displayName,
      isWatcher: connections.isWatcher,
      externalEmail: connections.externalEmail,
      passphraseHint: connections.passphraseHint,
    })
    .from(connections)
    .where(eq(connections.subjectUserId, subjectUserId))
    .orderBy(connections.createdAt);
}

// ────────────────────────────────────────────────────────────────────────────

export interface DeathConfirmInfo {
  subjectUserId: string;
  subjectName: string;
  state: (typeof subjectSettings.state.enumValues)[number];
  /** 本人が設定した猶予（h）。 */
  graceHours: number;
  /** 定足数の分母（承諾済み・非休眠の見守り者数）。 */
  livingWatchers: number;
  /** 進行中エピソードの有効票数（エピソードが無ければ 0）。 */
  votesFor: number;
  /** 閲覧者自身の票が生きているか（取り下げ表示用）。 */
  myVoteActive: boolean;
  /** certified_grace のときの猶予期限。 */
  graceUntil: Date | null;
}

/**
 * 死亡確認画面の材料。閲覧者が承諾済み見守り者でなければ null（画面を出さない）。
 * 数字はドメインのクォーラム判定と同じ定義（countLivingWatchers / countActiveVotes）を使う。
 */
export async function getDeathConfirmInfo(
  db: Db,
  subjectUserId: string,
  viewerUserId: string,
  config: DomainConfig,
): Promise<DeathConfirmInfo | null> {
  const [conn] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.subjectUserId, subjectUserId),
        eq(connections.otherUserId, viewerUserId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    )
    .limit(1);
  if (!conn) return null;

  const [subj] = await db
    .select({
      name: user.name,
      state: subjectSettings.state,
      graceHours: subjectSettings.gracePeriodHours,
    })
    .from(subjectSettings)
    .innerJoin(user, eq(subjectSettings.userId, user.id))
    .where(eq(subjectSettings.userId, subjectUserId))
    .limit(1);
  if (!subj) return null;

  const [cert] = await db
    .select({
      id: deathCertifications.id,
      graceUntil: deathCertifications.graceUntil,
    })
    .from(deathCertifications)
    .where(
      and(
        eq(deathCertifications.subjectUserId, subjectUserId),
        eq(deathCertifications.outcome, 'in_progress'),
      ),
    )
    .limit(1);

  const now = config.now ?? new Date();
  const livingWatchers = await countLivingWatchers(
    db,
    subjectUserId,
    now,
    config,
  );
  const votesFor = cert ? await countActiveVotes(db, cert.id) : 0;

  let myVoteActive = false;
  if (cert) {
    const [mine] = await db
      .select({ id: deathVotes.id })
      .from(deathVotes)
      .where(
        and(
          eq(deathVotes.certificationId, cert.id),
          eq(deathVotes.voterUserId, viewerUserId),
          isNull(deathVotes.withdrawnAt),
        ),
      )
      .limit(1);
    myVoteActive = mine !== undefined;
  }

  return {
    subjectUserId,
    subjectName: subj.name,
    state: subj.state,
    graceHours: subj.graceHours,
    livingWatchers,
    votesFor,
    myVoteActive,
    graceUntil: cert?.graceUntil ?? null,
  };
}
