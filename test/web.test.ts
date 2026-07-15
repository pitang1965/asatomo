import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import { getWatcherDashboard } from '../src/domain/queries';
import { recentActivityText, relativeJa } from '../src/web/recent-activity';
import { hoursAgo, makeTestDb, seedSubject, seedUser } from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');

describe('近況テキスト整形', () => {
  it('過去形＋相対時間（絶対時刻は出さない）', () => {
    expect(recentActivityText('meal', hoursAgo(2, NOW), NOW)).toBe(
      '約2時間前に食事をしました',
    );
    expect(recentActivityText('sleep', hoursAgo(8, NOW), NOW)).toBe(
      '約8時間前に就寝しました',
    );
    expect(recentActivityText('alarm_dismiss', hoursAgo(30, NOW), NOW)).toBe(
      '1日前にアラームを止めました',
    );
  });

  it('直近は「たった今」、活動なしは案内', () => {
    expect(recentActivityText('app_open', NOW, NOW)).toBe(
      'たった今アプリを開きました',
    );
    expect(recentActivityText(null, null, NOW)).toBe('まだ活動がありません');
  });

  it('相対時間のバケット', () => {
    expect(relativeJa(new Date(NOW.getTime() - 90_000), NOW)).toBe('約1分前');
    expect(relativeJa(hoursAgo(3, NOW), NOW)).toBe('約3時間前');
    expect(relativeJa(hoursAgo(50, NOW), NOW)).toBe('2日前');
  });
});

describe('見守りダッシュボード', () => {
  let db: Db;
  beforeEach(async () => {
    db = await makeTestDb();
  });

  async function connectWatcher(subjectId: string, watcherId: string) {
    await db.insert(schema.connections).values({
      subjectUserId: subjectId,
      otherUserId: watcherId,
      displayName: watcherId,
      isWatcher: true,
      watcherStatus: 'accepted',
      watcherLastSeenAt: NOW,
    });
  }

  it('見守っている本人の状態と近況の材料を返す', async () => {
    const watcher = await seedUser(db, 'watcher');
    const s = await seedSubject(db, {
      state: 'normal',
      lastSignalAt: hoursAgo(2, NOW),
    });
    await connectWatcher(s, watcher);
    await db.insert(schema.signals).values({
      subjectUserId: s,
      kind: 'meal',
      occurredAt: hoursAgo(2, NOW),
    });

    const rows = await getWatcherDashboard(db, watcher);
    const row = rows[0];
    if (!row) throw new Error('no row');
    expect(row.latestKind).toBe('meal');
    expect(row.isAlert).toBe(false);
    expect(recentActivityText(row.latestKind, row.latestAt, NOW)).toBe(
      '約2時間前に食事をしました',
    );
  });

  it('アラート中の本人が先頭に来る', async () => {
    const watcher = await seedUser(db, 'watcher');
    const calm = await seedSubject(db, { state: 'normal' });
    const alert = await seedSubject(db, { state: 'watchers_alerted' });
    await connectWatcher(calm, watcher);
    await connectWatcher(alert, watcher);

    const rows = await getWatcherDashboard(db, watcher);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.subjectUserId).toBe(alert);
    expect(rows[0]?.isAlert).toBe(true);
    expect(rows[1]?.isAlert).toBe(false);
  });

  it('承諾していない見守り関係は含めない', async () => {
    const watcher = await seedUser(db, 'watcher');
    const s = await seedSubject(db);
    await db.insert(schema.connections).values({
      subjectUserId: s,
      otherUserId: watcher,
      displayName: 'x',
      isWatcher: true,
      watcherStatus: 'pending',
    });
    const rows = await getWatcherDashboard(db, watcher);
    expect(rows).toHaveLength(0);
  });
});
