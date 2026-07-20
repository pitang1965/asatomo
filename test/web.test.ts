import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import { castVote, DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import {
  getDeathConfirmInfo,
  getWatcherDashboard,
} from '../src/domain/queries';
import { recentActivityText, relativeJa } from '../src/domain/recent-activity';
import {
  hoursAgo,
  makeTestDb,
  seedCertification,
  seedSubject,
  seedUser,
  seedWatcher,
} from './helpers';

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

describe('死亡確認画面の材料（getDeathConfirmInfo）', () => {
  let db: Db;
  const config = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };
  beforeEach(async () => {
    db = await makeTestDb();
  });

  it('見守り者でない閲覧者には null（画面を出さない）', async () => {
    const s = await seedSubject(db, { state: 'watchers_alerted' });
    const stranger = await seedUser(db, 'stranger');
    expect(await getDeathConfirmInfo(db, s, stranger, config)).toBeNull();
  });

  it('クォーラムの分母・票数・自票の有無を返す', async () => {
    const s = await seedSubject(db, {
      state: 'watchers_alerted',
      stateChangedAt: hoursAgo(20, NOW),
    });
    const w1 = await seedWatcher(db, s, { lastSeenAt: NOW });
    const w2 = await seedWatcher(db, s, { lastSeenAt: NOW });
    await seedCertification(db, s, {
      stage: 'watchers_alerted',
      startedAt: hoursAgo(30, NOW),
    });

    const before = await getDeathConfirmInfo(db, s, w1, config);
    expect(before).toMatchObject({
      livingWatchers: 2,
      votesFor: 0,
      myVoteActive: false,
      state: 'watchers_alerted',
    });

    const vote = await castVote(
      db,
      { subjectUserId: s, voterUserId: w1 },
      config,
    );
    expect(vote.ok).toBe(true);

    const mine = await getDeathConfirmInfo(db, s, w1, config);
    expect(mine).toMatchObject({ votesFor: 1, myVoteActive: true });
    const theirs = await getDeathConfirmInfo(db, s, w2, config);
    expect(theirs).toMatchObject({ votesFor: 1, myVoteActive: false });
  });

  it('休眠中の見守り者は分母に入らない', async () => {
    const s = await seedSubject(db, { state: 'watchers_alerted' });
    const active = await seedWatcher(db, s, { lastSeenAt: NOW });
    await seedWatcher(db, s, { lastSeenAt: hoursAgo(24 * 30, NOW) }); // 休眠
    await seedCertification(db, s, { stage: 'watchers_alerted' });

    const info = await getDeathConfirmInfo(db, s, active, config);
    expect(info?.livingWatchers).toBe(1);
  });
});
