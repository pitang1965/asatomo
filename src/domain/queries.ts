import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { connections, signals, subjectSettings, user } from '../db/schema';
import type { SignalKind } from './monitoring';

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
