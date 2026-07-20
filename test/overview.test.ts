import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import {
  DEFAULT_DOMAIN_CONFIG,
  recordAppLogout,
  recordSignal,
} from '../src/domain/monitoring';
import { getWatcherOverview } from '../src/domain/queries';
import { hoursAgo, makeTestDb, seedSubject, seedWatcher } from './helpers';

const NOW = new Date('2026-07-20T12:00:00Z');
const cfg = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

describe('見守りの一瞥（/watch/overview の整形。ADR-0006: 表示文はサーバー側）', () => {
  it('通常時: 近況（過去形＋経過時間）と「元気そう」', async () => {
    const subject = await seedSubject(db);
    const watcher = await seedWatcher(db, subject);
    await recordSignal(
      db,
      { subjectUserId: subject, kind: 'meal', occurredAt: hoursAgo(2, NOW) },
      cfg,
    );
    const [row] = await getWatcherOverview(db, watcher, cfg);
    expect(row.name).toBe(subject);
    expect(row.label).toBe('元気そう');
    expect(row.level).toBe('good');
    expect(row.statusText).toBe('約2時間前に食事をしました');
    expect(row.note).toBeNull();
    expect(row.alertText).toBeNull();
  });

  it('「いってきます」は留守を開示しないぼかし表現になる', async () => {
    const subject = await seedSubject(db);
    const watcher = await seedWatcher(db, subject);
    await recordSignal(
      db,
      { subjectUserId: subject, kind: 'outing', occurredAt: hoursAgo(1, NOW) },
      cfg,
    );
    const [row] = await getWatcherOverview(db, watcher, cfg);
    expect(row.statusText).toBe('約1時間前に元気にしていました');
  });

  it('旅行中: 旅行ラベルと「旅行中 · M/D まで」', async () => {
    const until = new Date('2026-07-25T14:59:59Z');
    const subject = await seedSubject(db, {
      lastSignalAt: hoursAgo(3, NOW),
      travelUntil: until,
    });
    const watcher = await seedWatcher(db, subject);
    const [row] = await getWatcherOverview(db, watcher, cfg);
    expect(row.label).toBe('旅行');
    expect(row.statusText).toContain('旅行中');
  });

  it('ログアウト中: 注記が付く', async () => {
    const subject = await seedSubject(db, { lastSignalAt: hoursAgo(1, NOW) });
    const watcher = await seedWatcher(db, subject);
    await recordAppLogout(db, subject, cfg);
    const [row] = await getWatcherOverview(db, watcher, cfg);
    expect(row.note).toContain('ログアウト');
  });

  it('要確認: alertText（経過時間つき）が付き、要確認が先頭に並ぶ', async () => {
    const calm = await seedSubject(db, { lastSignalAt: hoursAgo(1, NOW) });
    const alerted = await seedSubject(db, {
      state: 'watchers_alerted',
      lastSignalAt: hoursAgo(32, NOW),
    });
    const watcherId = await seedWatcher(db, alerted);
    // 同じ見守り者を calm にもつなぐ。
    await db.insert(schema.connections).values({
      subjectUserId: calm,
      otherUserId: watcherId,
      displayName: 'w',
      isWatcher: true,
      watcherStatus: 'accepted',
      watcherLastSeenAt: NOW,
    });
    const rows = await getWatcherOverview(db, watcherId, cfg);
    expect(rows).toHaveLength(2);
    expect(rows[0].subjectUserId).toBe(alerted);
    expect(rows[0].label).toBe('要確認');
    expect(rows[0].alertText).toBe('32時間、応答がありません');
    expect(rows[1].alertText).toBeNull();
  });
});
